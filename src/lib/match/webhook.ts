/**
 * LINE webhook 裡屬於「買方配對」的那幾句 —— 由 /api/line/webhook 在記錄完訊息之後呼叫
 *
 * 只接手三種訊息，其餘一律回 false 讓原本的流程（收件匣、AI 客服）繼續：
 *   1. 含預約編號「BK-XXXXXX」→ 這是買方從 /match 預約完被導過來送的。綁定 LINE、回確認卡、通知你。
 *   2. 「我的預約」→ 列出他的預約與狀態。
 *   3. 「找房」「配對」這種單一關鍵字 → 回配對頁入口卡。
 *      刻意只認**整句就是關鍵字**的訊息；「我想找房子在沙鹿…」這種真的在問的話留給你本人回。
 *
 * 這三種都是交易性的回覆，不受 config/line-bot.ts 的 BOT_ENABLED 管 ——
 * 買方送了預約編號卻沒收到確認，比機器人多講一句話嚴重得多。
 * 回過的內容也寫進 line_bot_message，收件匣才看得到「系統回了什麼」。
 */
import { MATCH, VIEWING_STATUS } from "@/config/match";
import { saveMessage } from "@/lib/line-bot/store";
import { pushMessages, replyMessages, text, viewingConfirmFlex, welcomeFlex } from "./line";
import { getListing, getViewingByCode, listViewingsByLine, updateViewing, upsertBuyer } from "./store";

const CODE_RE = /BK-[A-Z0-9]{6}/i;
const MENU_RE = /^(找房|配對|開始配對|我要找房|預約看屋)$/;

export async function handleMatchTextMessage(params: {
  userId: string;
  text: string;
  replyToken: string;
  displayName: string | null;
}): Promise<boolean> {
  const message = params.text.trim();

  const code = message.match(CODE_RE)?.[0]?.toUpperCase();
  if (code) {
    await linkViewing(code, params);
    return true;
  }

  if (/^我的預約$/.test(message)) {
    await replyMyViewings(params);
    return true;
  }

  if (MENU_RE.test(message)) {
    await replyMessages(params.replyToken, [welcomeFlex()]);
    await saveMessage(params.userId, "assistant", "［系統］配對頁入口卡", "bot");
    return true;
  }

  return false;
}

async function linkViewing(code: string, { userId, replyToken, displayName }: { userId: string; replyToken: string; displayName: string | null }): Promise<void> {
  const viewing = await getViewingByCode(code);
  if (!viewing) {
    const msg = `找不到預約編號 ${code}，請確認後再試一次，或直接留言告訴我們想看的物件。`;
    await replyMessages(replyToken, [text(msg)]);
    await saveMessage(userId, "assistant", msg, "bot");
    return;
  }

  const listing = await getListing(viewing.listingId);
  const buyer = await upsertBuyer({ id: viewing.buyerId, lineUserId: userId, displayName, name: viewing.name, phone: viewing.phone, followed: true });
  const firstLink = viewing.lineUserId !== userId;
  const updated = await updateViewing(viewing.id, {
    lineUserId: userId,
    buyerId: buyer.id,
    linked: true,
    status: viewing.status === "pending" ? "linked" : viewing.status,
  });

  await replyMessages(replyToken, [
    viewingConfirmFlex(updated ?? viewing, listing),
    text("已完成綁定 ✅ 專員會盡快與您聯繫確認看屋時間。"),
  ]);
  await saveMessage(userId, "assistant", `［系統］預約確認卡 ${code}（${listing?.title ?? viewing.listingId}／${viewing.preferredAt}）`, "bot");

  // 建立預約時已經完整通知過你了（/api/match/viewing），這裡只補一句「他綁好 LINE 了」，
  // 讓你知道可以直接在官方帳號聊天室找到他。
  if (firstLink) {
    const who = displayName ? `${displayName}（${viewing.name}）` : viewing.name;
    for (const uid of MATCH.agentLineUserIds) {
      await pushMessages(uid, [text(`✅ ${code} 買方已綁定 LINE：${who}\n${listing?.title ?? viewing.listingId}｜${viewing.preferredAt || "時間待安排"}`)]);
    }
  }
}

async function replyMyViewings({ userId, replyToken }: { userId: string; replyToken: string }): Promise<void> {
  const list = await listViewingsByLine(userId, 5);
  let msg: string;
  if (!list.length) {
    msg = "目前沒有預約紀錄。輸入「找房」可以開始配對物件喔！";
  } else {
    const rows: string[] = [];
    for (const v of list) {
      const listing = await getListing(v.listingId);
      rows.push(`• ${v.code}｜${listing?.title ?? v.listingId}\n  ${v.preferredAt || "時間待安排"}｜${VIEWING_STATUS[v.status] ?? v.status}`);
    }
    msg = `您的預約：\n${rows.join("\n")}`;
  }
  await replyMessages(replyToken, [text(msg)]);
  await saveMessage(userId, "assistant", msg, "bot");
}

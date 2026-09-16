/**
 * LINE webhook 裡屬於「買方配對」的那幾句 —— 由 /api/line/webhook 在記錄完訊息之後呼叫
 *
 * 只接手三種訊息，其餘一律回 false 讓原本的流程（收件匣、AI 客服）繼續：
 *   1. 含預約編號「BK-XXXXXX」→ 這是買方從 /match 預約完被導過來送的。綁定 LINE、回確認卡、通知你。
 *   2. 「我的預約」→ 列出他的預約與狀態。
 *   3. 「找房」「配對」這種單一關鍵字 → 回配對頁入口卡。
 *   4. 「修改條件」→ 同一張卡，但先顯示他目前的條件，按鈕字樣改成「重新設定條件」。
 *   5. 「停止通知」／「恢復通知」→ 開關新物件推播（不影響預約看屋的確認訊息）。
 *      刻意只認**整句就是關鍵字**的訊息；「我想找房子在沙鹿…」這種真的在問的話留給你本人回。
 *
 * 第 3、4 種會順手用 LINE userId 建立／找出 match_buyer 並簽一個識別碼放進連結 ——
 * 這樣買方**不必等到預約**就綁得到人，換手機重填條件也不會變成兩筆（見 lib/match/token.ts）。
 *
 * 這三種都是交易性的回覆，不受 config/line-bot.ts 的 BOT_ENABLED 管 ——
 * 買方送了預約編號卻沒收到確認，比機器人多講一句話嚴重得多。
 * 回過的內容也寫進 line_bot_message，收件匣才看得到「系統回了什麼」。
 */
import { MATCH, VIEWING_STATUS } from "@/config/match";
import { saveMessage } from "@/lib/line-bot/store";
import { pushMessages, replyMessages, text, viewingConfirmFlex, welcomeFlex } from "./line";
import { describePreference } from "./matcher";
import { getListing, getViewingByCode, listViewingsByLine, setBuyerFlagsByLine, updateViewing, upsertBuyer } from "./store";
import { createBuyerToken } from "./token";

type Ctx = { userId: string; text: string; replyToken: string; displayName: string | null };

const CODE_RE = /BK-[A-Z0-9]{6}/i;
const MENU_RE = /^(找房|配對|開始配對|我要找房|預約看屋)$/;
const EDIT_RE = /^(修改條件|更改條件|改條件|更新條件|修改需求|重新配對|重設條件)$/;
const STOP_RE = /^(停止通知|取消通知|不要通知|停止推播|退出配對)$/;
const RESUME_RE = /^(恢復通知|開啟通知|繼續通知|重新通知)$/;

export async function handleMatchTextMessage(params: Ctx): Promise<boolean> {
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

  if (MENU_RE.test(message) || EDIT_RE.test(message)) {
    await replyMatchEntry(params, EDIT_RE.test(message));
    return true;
  }

  if (STOP_RE.test(message) || RESUME_RE.test(message)) {
    await switchNotify(params, RESUME_RE.test(message));
    return true;
  }

  return false;
}

/**
 * 回配對頁入口卡。
 *
 * 這裡用 LINE userId 建立／找出買方（upsertBuyer 的 uq_match_buyer_line 保證同一個人只有一筆），
 * 再簽一個識別碼放進連結。他在網頁填的條件會直接寫回這一筆 ——
 * **不必等他預約看屋才綁得到人**，也不會因為換手機而分裂成兩筆。
 * 拿不到識別碼（資料庫掛了、沒設簽章密鑰）照樣把卡發出去，只是連結不認人。
 */
async function replyMatchEntry({ userId, replyToken, displayName }: Ctx, editing: boolean): Promise<void> {
  let token: string | null = null;
  let summary: string | null = null;
  try {
    const buyer = await upsertBuyer({ lineUserId: userId, displayName, followed: true });
    token = createBuyerToken(buyer.id);
    summary = buyer.preference ? describePreference(buyer.preference) : null;
  } catch (e) {
    console.error("[match/webhook] 取買方識別碼失敗（照樣回入口卡）:", e);
  }
  await replyMessages(replyToken, [welcomeFlex({ token, summary, mode: editing ? "edit" : "new" })]);
  await saveMessage(userId, "assistant", editing ? "［系統］更新條件入口卡" : "［系統］配對頁入口卡", "bot");
}

/**
 * 開關新物件推播。只動 notify，不動 followed ——
 * 「我不想一直收到新物件」跟「我封鎖了這個帳號」是兩件事，後台要分得出來。
 * 預約看屋的確認、你手動改狀態的通知都不受這個開關影響。
 */
async function switchNotify({ userId, replyToken }: Ctx, on: boolean): Promise<void> {
  let msg: string;
  try {
    const buyer = await setBuyerFlagsByLine(userId, { notify: on });
    if (!buyer) {
      msg = "您目前還沒有設定購屋條件，所以不會收到新物件通知。輸入「找房」就可以開始配對。";
    } else {
      msg = on
        ? "已重新開啟新物件通知 🔔\n有符合您條件的物件進來時會第一時間通知您。"
        : "已停止新物件通知 🔕\n需要時輸入「恢復通知」就會再開啟；您的預約看屋確認訊息不受影響。";
    }
  } catch (e) {
    console.error("[match/webhook] 切換通知失敗:", e);
    msg = "系統忙碌中，請稍後再試一次，或直接在此留言告訴我們。";
  }
  await replyMessages(replyToken, [text(msg)]);
  await saveMessage(userId, "assistant", msg, "bot");
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

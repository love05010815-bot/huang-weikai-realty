/**
 * LINE 客服機器人 webhook —— 客戶訊息的入口
 *
 * 這支網址要填進 LINE Developers Console：
 *   https://weikaihouse.com/api/line/webhook
 *
 * 流程與它為什麼長這樣：
 *   1. 先讀「原始 body 字串」驗簽 —— 沒驗簽等於開放全世界燒你的 API 費用。
 *   2. 驗過就「立刻回 200」，AI 的部分丟進 after() 在背景做。
 *      LINE 等不到快速回應會判定失敗並重送同一則訊息，客戶就會收到兩次一樣的回覆。
 *   3. 背景跑完再用 replyToken 回覆客戶（reply 不計費，push 才計費）。
 */
import { after } from "next/server";
import {
  BOT_ENABLED,
  FALLBACK_MESSAGE,
  HANDOFF_KEYWORDS,
  HANDOFF_MESSAGE,
  HISTORY_LIMIT,
  RATE_LIMIT_PER_MINUTE,
  WELCOME_MESSAGE,
} from "@/config/line-bot";
import { generateReply } from "@/lib/line-bot/ai";
import {
  getLineBotSecret,
  getProfileName,
  replyMessage,
  showLoading,
} from "@/lib/line-bot/client";
import { notifyHandoffRequest } from "@/lib/line-bot/notify";
import { verifyLineSignature } from "@/lib/line-bot/signature";
import {
  countRecentUserMessages,
  getHistory,
  saveMessage,
  touchUser,
} from "@/lib/line-bot/store";

// Prisma 與 node:crypto 都需要 Node runtime，不能跑在 Edge
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// after() 的背景工作也算在函式執行時間內，要留夠時間給 AI 回應
export const maxDuration = 60;

type LineEvent = {
  type: string;
  replyToken?: string;
  source?: { type?: string; userId?: string };
  message?: { type?: string; text?: string };
};

export async function POST(req: Request) {
  const secret = getLineBotSecret();
  if (!secret) {
    console.error("[line-bot] 缺 LINE_BOT_CHANNEL_SECRET，webhook 無法驗證");
    // 回 200 避免 LINE 判定 webhook 掛掉而不停重試
    return new Response("not configured", { status: 200 });
  }

  // ⚠️ 必須是原始字串。先 json() 再 stringify 會改變空白與鍵序，簽章一定對不上
  const rawBody = await req.text();
  const signature = req.headers.get("x-line-signature");

  if (!verifyLineSignature(rawBody, signature, secret)) {
    console.error("[line-bot] 簽章驗證失敗，已拒絕");
    return new Response("invalid signature", { status: 401 });
  }

  let events: LineEvent[] = [];
  try {
    events = (JSON.parse(rawBody)?.events ?? []) as LineEvent[];
  } catch {
    return new Response("bad json", { status: 200 });
  }

  // Console 上按「Verify」時會送一包空的 events，這是正常的
  if (events.length === 0) {
    return new Response("ok", { status: 200 });
  }

  // 先回 200 給 LINE，實際工作丟到背景。這是這支路由最關鍵的一行
  after(async () => {
    for (const event of events) {
      try {
        await handleEvent(event);
      } catch (e) {
        console.error("[line-bot] 事件處理失敗:", e);
      }
    }
  });

  return new Response("ok", { status: 200 });
}

async function handleEvent(event: LineEvent): Promise<void> {
  const userId = event.source?.userId;

  // 只處理 1 對 1 私訊。群組訊息直接忽略（機器人被拉進群也不會亂講話）
  if (event.source?.type !== "user" || !userId) return;

  // 新朋友加好友 —— 回罐頭歡迎詞，不經過 AI，零成本零風險
  if (event.type === "follow") {
    const displayName = await getProfileName(userId);
    await touchUser(userId, displayName);
    if (event.replyToken) {
      await replyMessage(event.replyToken, WELCOME_MESSAGE);
    }
    return;
  }

  if (event.type !== "message") return;

  // 貼圖、照片、語音等非文字訊息：給個回應就好，不要丟給 AI
  if (event.message?.type !== "text") {
    if (event.replyToken) {
      await replyMessage(
        event.replyToken,
        "我目前只看得懂文字訊息 🙏 麻煩您打字告訴我，或直接來電。",
      );
    }
    return;
  }

  const text = (event.message.text || "").trim();
  const replyToken = event.replyToken;
  if (!text || !replyToken) return;

  const displayName = await getProfileName(userId);
  const user = await touchUser(userId, displayName);

  // 一律先記下客戶說了什麼 —— 就算機器人不回，你也要看得到客戶問過什麼
  await saveMessage(userId, "user", text);

  // 你已在後台接手這個客戶，機器人閉嘴不要插話
  if (user.muted) return;

  if (!BOT_ENABLED) return;

  // 客戶明講要找真人 → 直接給聯絡方式，不要讓機器人擋在中間
  if (HANDOFF_KEYWORDS.some((kw) => text.includes(kw))) {
    await replyMessage(replyToken, HANDOFF_MESSAGE);
    await saveMessage(userId, "assistant", HANDOFF_MESSAGE);
    // 客戶要真人＝急事或客訴，立刻通知本人。
    // 放在回覆之後，通知管道出問題也不會害客戶收不到回應。
    await notifyHandoffRequest({ displayName, lineUserId: userId, message: text });
    return;
  }

  // 還沒設 AI 金鑰 → 只記錄、完全不回話。
  //
  // 這跟「AI 呼叫失敗」是兩件事，不能共用保底訊息：
  //   沒設金鑰   = 系統還沒準備好。此時安靜讓 LINE 內建的自動回應去接客戶，
  //                客戶體驗跟機器人上線前一模一樣，不會莫名收到兩則訊息。
  //   呼叫失敗   = 暫時性問題（限流、網路），那才需要保底訊息避免已讀不回。
  //
  // 對話仍然完整記錄，所以這段期間客戶問了什麼，你在 /admin/line 都看得到。
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("[line-bot] 未設 ANTHROPIC_API_KEY，只記錄訊息不回覆");
    return;
  }

  // 洗版防護。超過就安靜不回，避免有人連續灌訊息燒你的 API 費用
  const recent = await countRecentUserMessages(userId);
  if (recent > RATE_LIMIT_PER_MINUTE) {
    console.warn(`[line-bot] ${userId} 一分鐘內 ${recent} 則，已略過`);
    return;
  }

  // 讓客戶看到「輸入中…」，AI 想幾秒才不會像已讀不回
  await showLoading(userId);

  // 取歷史時要排除剛剛存進去的那一則，否則會重複出現在對話裡
  const history = (await getHistory(userId, HISTORY_LIMIT + 1)).slice(0, -1);

  const result = await generateReply(history, text);
  const reply = result.ok ? result.text : FALLBACK_MESSAGE;

  const sent = await replyMessage(replyToken, reply);
  if (sent && result.ok) {
    await saveMessage(userId, "assistant", reply);
  }
}

/** 給你自己開瀏覽器確認這支路由活著用的。LINE 不會打 GET。 */
export async function GET() {
  return Response.json({
    ok: true,
    service: "line-bot-webhook",
    configured: Boolean(getLineBotSecret() && process.env.LINE_BOT_ACCESS_TOKEN),
    aiConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    botEnabled: BOT_ENABLED,
  });
}

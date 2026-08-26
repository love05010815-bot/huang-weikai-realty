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
  getLineBotToken,
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
  message?: {
    /** text / image / video / audio / file / sticker / location */
    type?: string;
    /** 抓媒體內容要用它跟 LINE 換（見 /api/admin/line/media/[messageId]） */
    id?: string;
    text?: string;
    fileName?: string;
    title?: string;
    address?: string;
  };
};

/**
 * 非文字訊息記進對話記錄時，content 要寫什麼。
 *
 * ⚠️ 一定要是**人看得懂的字**，不能存空字串或 JSON ——
 *    收件匣、清單預覽、AI 歷史全都直接讀 content，存怪東西每一處都要特判。
 */
function describeNonText(m: NonNullable<LineEvent["message"]>): string {
  switch (m.type) {
    case "image":
      return "［照片］";
    case "video":
      return "［影片］";
    case "audio":
      return "［語音訊息］";
    case "file":
      return m.fileName ? `［檔案］${m.fileName}` : "［檔案］";
    case "sticker":
      // ⚠️ LINE 只給 packageId／stickerId，**貼圖的圖片本身抓不到**（官方文件明講），
      //    所以這裡永遠只能是文字，不要花時間找那個 API。
      return "［貼圖］";
    case "location":
      return `［位置］${[m.title, m.address].filter(Boolean).join(" ") || ""}`.trim();
    default:
      return `［${m.type || "未知訊息"}］`;
  }
}

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
  //
  // 🔴 2026-08-21：這裡原本沒看 BOT_ENABLED，所以總開關關著時「加好友」還是會被
  //    機器人打招呼 —— 跟 config 註解寫的「false = 完全不回應」不符。總開關要是
  //    擋不住所有出口，它就不是總開關。現在關著只認人、不出聲。
  if (event.type === "follow") {
    const displayName = await getProfileName(userId);
    await touchUser(userId, displayName);
    if (BOT_ENABLED && event.replyToken) {
      await replyMessage(event.replyToken, WELCOME_MESSAGE);
    }
    return;
  }

  if (event.type !== "message") return;

  // 貼圖、照片、語音等非文字訊息：**先記下來**，再決定要不要回。
  //
  // 🔴 2026-08-26 修正：這裡原本在 saveMessage 之前就 return，所以客戶傳照片給你，
  //    資料庫**完全沒有那筆記錄** —— 收件匣看不到、待回數不會加、你根本不知道
  //    有人傳了東西。等於直接漏接客戶。不丟給 AI 是對的（它讀不懂圖），
  //    但「不丟給 AI」跟「不記錄」是兩件事。
  if (event.message?.type !== "text") {
    if (event.message) {
      const displayName = await getProfileName(userId);
      await touchUser(userId, displayName);
      await saveMessage(userId, "user", describeNonText(event.message), null, {
        msgType: event.message.type ?? null,
        // 貼圖與位置沒有內容可以抓，不用留 id
        mediaId:
          event.message.type === "image" ||
          event.message.type === "video" ||
          event.message.type === "audio" ||
          event.message.type === "file"
            ? (event.message.id ?? null)
            : null,
      });
    }
    if (BOT_ENABLED && event.replyToken) {
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

/**
 * 給你自己開瀏覽器確認這支路由活著用的。LINE 不會打 GET。
 *
 * 加 `?whoami=1` 會多問 LINE「這個權杖屬於哪個官方帳號、聊天功能開著沒」。
 *
 * 這一項存在的理由（2026-08-25）：系統擁有者在手機上看不到某位客戶的訊息，
 * 但資料庫確實收到了。分不出是「看錯帳號」還是「LINE 的聊天功能根本關著」——
 * 後者代表**客戶傳的訊息他手機永遠看不到**，那是會漏掉生意的等級。
 * `chatMode` 就是答案："chat" = 手機看得到；"bot" = 只進 webhook，手機看不到。
 *
 * 🔴 **basicId 與 premiumId 一定要一起看。**
 *    LINE 的付費客製 ID（premiumId，這裡是 @a8865）是**加在原帳號上的別名**，
 *    系統當初配的 basicId（@leu5704h）不會消失，兩個指向**同一個帳號**。
 *    2026-08-26 我只印 basicId 就斷言「官網寫的跟系統連的不是同一個帳號」——
 *    那是沒查證的推斷，害系統擁有者以為客戶訊息進不來。**少印一個欄位就足以得出相反的結論。**
 *
 * ⚠️ 只回帳號的公開資訊（兩個 ID 都會出現在官方帳號的公開頁面上）與兩個模式字串，
 *    **不回權杖、不回密鑰、不回任何客戶資料**。
 */
export async function GET(req: Request) {
  const base = {
    ok: true,
    service: "line-bot-webhook",
    configured: Boolean(getLineBotSecret() && process.env.LINE_BOT_ACCESS_TOKEN),
    aiConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    botEnabled: BOT_ENABLED,
  };

  const params = new URL(req.url).searchParams;

  /**
   * `?probe=media` 自我檢測「取媒體內容」那條路。
   *
   * 存在的理由（2026-08-26）：`/api/admin/line/media/…` 是**擋登入**的，
   * 所以我沒辦法自己觸發它，每查一次都要請系統擁有者去重新整理一次頁面。
   * 抓圖回 401 時這樣一來一往太慢。
   *
   * 🔒 三道限制，缺一不可：
   *   1. **不收外面給的 messageId** —— 只用資料庫裡我們自己最新的那一筆。
   *      收參數的話這裡就變成一個可以拿來探測訊息是否存在的公開工具。
   *   2. **只回狀態碼與 LINE 的錯誤訊息，永遠不回內容一個 byte。**
   *   3. 成功時只回「拿到幾 KB、什麼型別」，不回圖。
   */
  if (params.get("probe") === "media") {
    const token = getLineBotToken();
    if (!token) return Response.json({ ...base, probe: { error: "沒有 LINE_BOT_ACCESS_TOKEN" } });
    try {
      const { db } = await import("@/lib/db");
      const rows = await db.$queryRawUnsafe<{ media_id: string; created_at: Date }[]>(
        `SELECT media_id, created_at FROM line_bot_message
          WHERE media_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
      );
      const mediaId = rows[0]?.media_id;
      if (!mediaId) return Response.json({ ...base, probe: { error: "資料庫裡還沒有任何媒體訊息" } });

      const r = await fetch(`https://api-data.line.me/v2/bot/message/${mediaId}/content`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!r.ok) {
        const text = await r.text().catch(() => "");
        return Response.json({
          ...base,
          probe: { status: r.status, lineSays: text.slice(0, 300) },
        });
      }
      const buf = await r.arrayBuffer();
      return Response.json({
        ...base,
        probe: {
          status: 200,
          contentType: r.headers.get("content-type"),
          kb: Math.round(buf.byteLength / 1024),
        },
      });
    } catch (e) {
      return Response.json({
        ...base,
        probe: { error: e instanceof Error ? e.message : String(e) },
      });
    }
  }

  if (params.get("whoami") !== "1") return Response.json(base);

  const token = process.env.LINE_BOT_ACCESS_TOKEN;
  if (!token) return Response.json({ ...base, whoami: { error: "沒有 LINE_BOT_ACCESS_TOKEN" } });

  try {
    const res = await fetch("https://api.line.me/v2/bot/info", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const d = (await res.json()) as Record<string, unknown>;
    return Response.json({
      ...base,
      whoami: res.ok
        ? {
            // 系統配的原始 ID
            basicId: d.basicId,
            // 花錢買的客製 ID（同一個帳號的別名，官網對外寫的就是這個）
            premiumId: d.premiumId ?? null,
            displayName: d.displayName,
            // "chat" = 官方帳號 App／管理後台看得到客戶訊息
            // "bot"  = 訊息只送到 webhook，手機聊天列表**不會出現**
            chatMode: d.chatMode,
            markAsReadMode: d.markAsReadMode,
            // 權杖值本身**絕對不回**，只回兩個布林：長度是否被前後空白污染、
            // 以及它是不是 v2.1 的 JWT 格式。抓媒體那支回 401 時，
            // 這兩個能排除掉「貼值時多帶了換行」這個很難查的可能。
            tokenHasStraySpace: token !== token.trim(),
            tokenLooksJwt: token.split(".").length === 3,
          }
        : { status: res.status, error: String(d.message ?? "查詢失敗") },
    });
  } catch (e) {
    return Response.json({ ...base, whoami: { error: e instanceof Error ? e.message : String(e) } });
  }
}

/**
 * LINE Messaging API 客戶端 —— 只負責「把話送出去」
 *
 * ⚠️ 環境變數刻意用 LINE_BOT_ 前綴，不要跟這兩組搞混：
 *    - ABIN_LINE_CHANNEL_ID / SECRET → 房仲日常 bot(@mrbin)，用來推新預約通知到你的 admin 群
 *    - LINE_BOT_ACCESS_TOKEN / SECRET → 這一支，你的官方帳號 @a8865 的客服機器人
 *    兩者是不同的 LINE channel，token 互不通用，混用會 401。
 */

const LINE_API = "https://api.line.me/v2/bot";

/** LINE 單則文字訊息上限 5000 字，超過整包會被退。留點餘裕切在 4800。 */
const MAX_TEXT_LENGTH = 4800;

export function getLineBotToken(): string | null {
  return process.env.LINE_BOT_ACCESS_TOKEN || null;
}

export function getLineBotSecret(): string | null {
  return process.env.LINE_BOT_CHANNEL_SECRET || null;
}

function truncate(text: string): string {
  if (text.length <= MAX_TEXT_LENGTH) return text;
  return text.slice(0, MAX_TEXT_LENGTH - 1) + "…";
}

/**
 * 用 replyToken 回覆客戶。
 *
 * replyToken 的規矩（踩過才知道痛）：
 *   - 一個 token 只能用一次，重複用回 400
 *   - 有效期很短（官方沒給死數字，實務上約 1 分鐘），逾時回 400
 *   - 免費（不計入官方帳號的訊息額度），push 才要錢 —— 能用 reply 就別用 push
 */
export async function replyMessage(replyToken: string, text: string): Promise<boolean> {
  const token = getLineBotToken();
  if (!token) {
    console.error("[line-bot] 缺 LINE_BOT_ACCESS_TOKEN，無法回覆");
    return false;
  }

  try {
    const res = await fetch(`${LINE_API}/message/reply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        replyToken,
        messages: [{ type: "text", text: truncate(text) }],
      }),
    });

    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 300);
      console.error("[line-bot] reply 失敗", res.status, body);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[line-bot] reply 例外:", e);
    return false;
  }
}

/**
 * 主動推訊息給某個使用者（不需 replyToken，但會計入官方帳號的免費訊息額度）。
 * 只在 reply token 已過期或已用掉時才退而求其次用這個。
 */
export async function pushMessage(userId: string, text: string): Promise<boolean> {
  const token = getLineBotToken();
  if (!token) return false;

  try {
    const res = await fetch(`${LINE_API}/message/push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: userId,
        messages: [{ type: "text", text: truncate(text) }],
      }),
    });

    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 300);
      console.error("[line-bot] push 失敗", res.status, body);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[line-bot] push 例外:", e);
    return false;
  }
}

/**
 * 顯示「輸入中…」的載入動畫（最多 60 秒，需為 5 的倍數）。
 * AI 要想幾秒，有這個客戶才知道機器人在動而不是已讀不回。
 * 失敗不影響主流程，所以不回傳結果、也不 throw。
 */
export async function showLoading(userId: string, seconds = 15): Promise<void> {
  const token = getLineBotToken();
  if (!token) return;

  try {
    await fetch(`${LINE_API}/chat/loading/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        chatId: userId,
        loadingSeconds: Math.min(60, Math.max(5, Math.round(seconds / 5) * 5)),
      }),
    });
  } catch {
    // 動畫失敗無所謂，不要因此中斷回覆
  }
}

/** 取客戶在 LINE 上的顯示名稱，純粹讓你在後台看紀錄時知道是誰。失敗回 null 不影響對話。 */
export async function getProfileName(userId: string): Promise<string | null> {
  const token = getLineBotToken();
  if (!token) return null;

  try {
    const res = await fetch(`${LINE_API}/profile/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { displayName?: string };
    return data.displayName || null;
  } catch {
    return null;
  }
}

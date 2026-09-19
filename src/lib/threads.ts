/**
 * 🧵 Threads（脆）留言 —— 抓進後台收件匣，並且直接在後台回。
 *
 * 🔴 **Threads 跟 Facebook／Instagram 是兩套東西，不能共用**，這是最容易搞錯的一點：
 *    ・網域不同：`graph.threads.net`，不是 `graph.facebook.com`
 *    ・App 金鑰不同：Threads API 在 App 後台有自己的「Threads App ID／密鑰」，
 *      跟 `META_APP_ID` 那組**不一定是同一個數字**，所以另開兩個環境變數
 *    ・token 不同：粉專 token 對 Threads 完全無效，要自己跑一次授權
 *    ・授權網址不同：`https://threads.net/oauth/authorize`
 *
 * 啟用前提（一次性，都在 developers.facebook.com）：
 *   1. 用現有的 App 或新建一個，加入「Threads API」使用案例
 *   2. 在 Threads API →「設定」裡，把 {BASE}/api/admin/threads/callback
 *      填進「重新導向回呼網址」（Threads 只收 https，localhost 不行）
 *   3. 同一頁的 Threads App ID／密鑰設成環境變數 THREADS_APP_ID / THREADS_APP_SECRET
 *   4. 到 /admin/inbox 按「綁定 Threads」授權（要用**那個脆帳號**登入）
 *
 * 🔑 token 只有兩層（比 Meta 簡單，但有個陷阱）：
 *    授權拿到「短期 token」（1 小時）→ 換「長期 token」（60 天）。
 *    **長期 token 會過期**，沒有像粉專 token 那種永久的東西 ——
 *    所以每次抓留言前順手看一眼，剩不到 10 天就自動續（`refresh_access_token`）。
 *    他只要偶爾開一下收件匣就會一直續下去；真的放著 60 天沒開才會斷，
 *    斷了畫面會講「要重新綁定」，不會靜靜變成沒留言。
 *
 * 📊 一次抓幾則：最近 10 篇貼文，每篇再打一次 conversation。
 *    也就是一次載入 11 個 API 呼叫。Threads 的額度以「曝光數」算，這個量遠遠用不完；
 *    但別把 10 改大 —— 那是每次開後台都會打的次數。
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { getConfig, setConfig } from "@/lib/google-calendar";
import type { InboxComment, InboxReply, PlatformFetch } from "@/lib/inbox-types";

const GRAPH = "https://graph.threads.net/v1.0";
/** 換 token 的端點不在 v1.0 底下，是根目錄 —— 這是 Threads API 跟 Graph 不一樣的地方 */
const OAUTH = "https://graph.threads.net";
const AUTHORIZE = "https://threads.net/oauth/authorize";

const APP_ID = process.env.THREADS_APP_ID || "";
const APP_SECRET = process.env.THREADS_APP_SECRET || "";
const BASE_URL = process.env.APPOINTMENT_BASE_URL || "https://example.com";

export const THREADS_REDIRECT_URI = `${BASE_URL}/api/admin/threads/callback`;

/**
 * 要的權限：
 *   threads_basic            讀自己的帳號與貼文（沒有它什麼都不能做）
 *   threads_read_replies     讀別人留在你貼文底下的回覆
 *   threads_manage_replies   回覆／管理留言
 *   threads_content_publish  發文 —— **回覆在 Threads 也算發文**，少了它回不出去
 */
const SCOPES = [
  "threads_basic",
  "threads_read_replies",
  "threads_manage_replies",
  "threads_content_publish",
].join(",");

const TOKEN_KEY = "threads_token";
const USER_ID_KEY = "threads_user_id";
const USERNAME_KEY = "threads_username";
/** 長期 token 的到期時間（ISO）。用來決定要不要自動續 */
const EXPIRES_KEY = "threads_token_expires";

/** 最近幾篇貼文會被掃留言。改大之前先看檔頭那段「一次抓幾則」 */
const POST_SCAN = 10;
/** 每篇貼文最多拉幾則回覆 */
const REPLY_LIMIT = 25;
/** 剩幾天以內就自動續 token */
const REFRESH_WHEN_DAYS_LEFT = 10;

export function isThreadsConfigured(): boolean {
  return Boolean(APP_ID && APP_SECRET);
}

export async function isThreadsBound(): Promise<boolean> {
  if (!isThreadsConfigured()) return false;
  return Boolean(await getConfig(TOKEN_KEY));
}

export async function getBoundThreads(): Promise<{
  userId: string | null;
  username: string | null;
  expiresAt: string | null;
} | null> {
  if (!isThreadsConfigured()) return null;
  const [token, userId, username, expiresAt] = await Promise.all([
    getConfig(TOKEN_KEY),
    getConfig(USER_ID_KEY),
    getConfig(USERNAME_KEY),
    getConfig(EXPIRES_KEY),
  ]);
  if (!token) return null;
  return { userId, username, expiresAt };
}

export function getThreadsAuthUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: APP_ID,
    redirect_uri: THREADS_REDIRECT_URI,
    scope: SCOPES,
    response_type: "code",
    state,
  });
  return `${AUTHORIZE}?${p}`;
}

type GraphError = { error?: { message?: string; type?: string; code?: number }; error_message?: string };

/** 把 Threads 的錯誤訊息讀出來。讀不到就回狀態碼，不要回空字串（畫面會變成「有問題」但沒說哪裡問題）。 */
async function readError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as GraphError;
    const msg = j.error?.message || j.error_message;
    if (msg) return `${msg}（HTTP ${res.status}）`;
  } catch {
    /* 不是 JSON 就算了 */
  }
  return `Threads API 回 HTTP ${res.status}`;
}

// ---------------------------------------------------------------- 綁定

/**
 * 剃掉 Threads 導回來的 code 屁股那個 `#_`（Meta 自己加的）。
 *
 * ⚠️ 不剃掉會換不到 token，而且錯誤訊息只說「code 無效」，不會告訴你多了兩個字。
 * 抽成獨立函式是為了能用 `npm run check:threads` 驗到。
 */
export function cleanAuthCode(raw: string): string {
  return raw.replace(/#_+$/, "");
}

/** 授權碼 → 可以長期用的 token。 */
export async function exchangeThreadsCode(
  rawCode: string,
): Promise<{ ok: boolean; error?: string; username?: string }> {
  const code = cleanAuthCode(rawCode);
  try {
    // 1. code → 短期 token（這一支是 POST，而且吃 form-urlencoded，不是查詢字串）
    const shortRes = await fetch(`${OAUTH}/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: APP_ID,
        client_secret: APP_SECRET,
        grant_type: "authorization_code",
        redirect_uri: THREADS_REDIRECT_URI,
        code,
      }),
      cache: "no-store",
    });
    if (!shortRes.ok) return { ok: false, error: await readError(shortRes) };
    const short = (await shortRes.json()) as { access_token?: string; user_id?: string | number };
    if (!short.access_token) return { ok: false, error: "Threads 沒有回傳 access token" };

    // 2. 短期 → 長期（60 天）
    const longRes = await fetch(
      `${OAUTH}/access_token?${new URLSearchParams({
        grant_type: "th_exchange_token",
        client_secret: APP_SECRET,
        access_token: short.access_token,
      })}`,
      { cache: "no-store" },
    );
    if (!longRes.ok) return { ok: false, error: await readError(longRes) };
    const long = (await longRes.json()) as { access_token?: string; expires_in?: number };
    if (!long.access_token) return { ok: false, error: "換長期 token 失敗" };

    // 3. 問一下這是誰（顯示用，也順便確認 token 真的能用）
    const meRes = await fetch(
      `${GRAPH}/me?${new URLSearchParams({
        fields: "id,username",
        access_token: long.access_token,
      })}`,
      { cache: "no-store" },
    );
    if (!meRes.ok) return { ok: false, error: await readError(meRes) };
    const me = (await meRes.json()) as { id?: string; username?: string };

    await saveToken(long.access_token, long.expires_in);
    await Promise.all([
      setConfig(USER_ID_KEY, me.id || String(short.user_id ?? "")),
      setConfig(USERNAME_KEY, me.username || null),
    ]);

    return { ok: true, username: me.username };
  } catch (e) {
    console.error("[threads] exchangeCode 例外:", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function saveToken(token: string, expiresIn?: number): Promise<void> {
  // 沒給 expires_in 就當 60 天（文件上的預設），寧可早一點去續也不要算成永不過期
  const seconds = typeof expiresIn === "number" && expiresIn > 0 ? expiresIn : 60 * 24 * 3600;
  const expiresAt = new Date(Date.now() + seconds * 1000).toISOString();
  await Promise.all([setConfig(TOKEN_KEY, token), setConfig(EXPIRES_KEY, expiresAt)]);
}

/**
 * 快到期就自動續一次。回傳現在該用的 token（續失敗就回舊的，讓呼叫端照樣去試）。
 *
 * ⚠️ Threads 規定 token 必須「至少 24 小時前發的」才能續。剛綁完就續會被拒，
 *    所以這裡只在剩 10 天以內才動手 —— 那時候一定超過 24 小時了。
 */
async function ensureFreshToken(token: string): Promise<string> {
  const expiresAt = await getConfig(EXPIRES_KEY);
  if (!expiresAt) return token;

  const msLeft = Date.parse(expiresAt) - Date.now();
  if (Number.isNaN(msLeft)) return token;
  if (msLeft > REFRESH_WHEN_DAYS_LEFT * 24 * 3600 * 1000) return token;

  try {
    const res = await fetch(
      `${OAUTH}/refresh_access_token?${new URLSearchParams({
        grant_type: "th_refresh_token",
        access_token: token,
      })}`,
      { cache: "no-store" },
    );
    if (!res.ok) {
      console.error("[threads] 續 token 失敗:", await readError(res));
      return token;
    }
    const j = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!j.access_token) return token;
    await saveToken(j.access_token, j.expires_in);
    return j.access_token;
  } catch (e) {
    console.error("[threads] 續 token 例外:", e);
    return token;
  }
}

/**
 * 驗 Meta 送來的 `signed_request`（解除授權／刪除資料兩個回呼都用這個）。
 *
 * 格式是 `<簽章>.<內容>`，兩段都是 base64url；簽章是用 **Threads App 密鑰**
 * 對「內容那一段的原始字串」做 HMAC-SHA256。
 *
 * 🔴 這兩個回呼**沒有登入牆**（Meta 的伺服器來敲，不是人來按），
 *    所以簽章就是唯一的門 —— 驗不過一律拒絕，寧可讓 Meta 重試也不要讓陌生人
 *    打一下就把他的綁定清掉。
 * ⚠️ 比對用 timingSafeEqual，不要用 `===`。
 */
export function verifyThreadsSignedRequest(
  signed: string,
): { ok: boolean; userId?: string; error?: string } {
  if (!APP_SECRET) return { ok: false, error: "沒有設定 THREADS_APP_SECRET" };
  const parts = (signed || "").split(".");
  if (parts.length !== 2) return { ok: false, error: "signed_request 格式不對" };

  const [sigPart, payloadPart] = parts;
  try {
    const expected = createHmac("sha256", APP_SECRET).update(payloadPart).digest();
    const got = Buffer.from(sigPart, "base64url");
    if (got.length !== expected.length || !timingSafeEqual(got, expected)) {
      return { ok: false, error: "簽章不符" };
    }
    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as {
      algorithm?: string;
      user_id?: string | number;
    };
    if ((payload.algorithm || "").toUpperCase() !== "HMAC-SHA256") {
      return { ok: false, error: `不支援的簽章演算法：${payload.algorithm}` };
    }
    return { ok: true, userId: payload.user_id == null ? undefined : String(payload.user_id) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 解除授權／刪除資料的回呼真正要做的事：**確認是同一個人**再清掉綁定。
 *
 * 為什麼要比對 user id：signed_request 驗得過只代表「這是這個 App 發的」，
 * 不代表講的是我們綁的那一個帳號。不比對的話，別的 Threads 帳號的事件也會
 * 把他的綁定清掉 —— 而且清掉之後畫面只會說「未綁定」，看不出是被誰清的。
 */
export async function forgetThreadsUser(
  userId: string | undefined,
): Promise<{ cleared: boolean; reason?: string }> {
  const stored = await getConfig(USER_ID_KEY);
  if (!stored) return { cleared: false, reason: "本來就沒有綁定" };
  if (userId && userId !== stored) {
    return { cleared: false, reason: "事件講的不是目前綁定的帳號" };
  }
  await unbindThreads();
  return { cleared: true };
}

/** 解除綁定。只刪 threads_* 四個 key，不碰 Meta、YouTube、日曆。 */
export async function unbindThreads(): Promise<void> {
  await Promise.all([
    setConfig(TOKEN_KEY, null),
    setConfig(USER_ID_KEY, null),
    setConfig(USERNAME_KEY, null),
    setConfig(EXPIRES_KEY, null),
  ]);
}

// ---------------------------------------------------------------- 讀留言

export type ThreadsPost = {
  id: string;
  text?: string;
  permalink?: string;
  timestamp?: string;
};

export type ThreadsReply = {
  id: string;
  text?: string;
  username?: string;
  permalink?: string;
  timestamp?: string;
  /** 這則回覆掛在誰底下（貼文本身，或另一則回覆） */
  replied_to?: { id?: string } | null;
  /** 這則是不是我自己回的 */
  is_reply_owned_by_me?: boolean;
  /** 被我隱藏的留言不用再出現在待回清單裡 */
  hide_status?: string;
};

/** 貼文內文擷取一小段當「這則留言掛在哪」的提示 */
function contextOf(text: string | undefined, max = 60): string | null {
  const t = (text || "").trim().replace(/\s+/g, " ");
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/**
 * 一篇貼文的對話串 → 收件匣的留言清單。**純函式，沒有網路也沒有資料庫**，
 * 所以 `npm run check:threads` 可以拿假資料整組驗。
 *
 * Threads 的 conversation 回的是**一整串攤平的回覆**，我自己回的也混在裡面，
 * 所以要自己分兩件事：
 *   ① 哪幾則是別人問的（＝收件匣要列出來的「留言」）
 *   ② 我回過哪幾則（掛回去，決定「已回覆」）
 * 靠 `replied_to.id` 認父子關係；`is_reply_owned_by_me` 認自己人，
 * 這個欄位偶爾不回傳，所以再用使用者名稱比對當備援。
 */
export function toInboxComments(
  post: ThreadsPost,
  replies: ThreadsReply[],
  me: string,
): InboxComment[] {
  const isMine = (r: ThreadsReply) =>
    r.is_reply_owned_by_me === true || (Boolean(me) && r.username === me);

  /** 我自己回的，依「回在誰底下」歸戶 */
  const mine = new Map<string, ThreadsReply[]>();
  for (const r of replies) {
    if (!isMine(r)) continue;
    const parent = r.replied_to?.id || post.id;
    const list = mine.get(parent) || [];
    list.push(r);
    mine.set(parent, list);
  }

  const out: InboxComment[] = [];
  for (const r of replies) {
    if (isMine(r)) continue;
    // 被我隱藏的留言等於處理過了，不要再出現在待回清單
    if (r.hide_status === "HIDDEN") continue;

    const myReplies: InboxReply[] = (mine.get(r.id) || []).map((m) => ({
      author: m.username ? `@${m.username}` : "（我）",
      text: m.text || "",
      publishedAt: m.timestamp || "",
      byOwner: true,
    }));

    out.push({
      platform: "threads",
      id: r.id,
      author: r.username ? `@${r.username}` : "（不明）",
      authorImage: null,
      text: r.text || "",
      publishedAt: r.timestamp || "",
      permalink: r.permalink || post.permalink || null,
      context: contextOf(post.text),
      answeredByOwner: myReplies.length > 0,
      replies: myReplies,
    });
  }
  return out;
}

export async function fetchThreadsComments(limit = POST_SCAN): Promise<PlatformFetch> {
  const base: PlatformFetch = {
    platform: "threads",
    bound: false,
    comments: [],
    error: null,
    accountName: null,
  };
  if (!isThreadsConfigured()) return base;

  const stored = await getConfig(TOKEN_KEY);
  if (!stored) return base;

  base.bound = true;
  const bound = await getBoundThreads();
  base.accountName = bound?.username ? `@${bound.username}` : (bound?.userId ?? null);

  const token = await ensureFreshToken(stored);
  const me = bound?.username || "";

  try {
    // 1. 最近幾篇貼文
    const postsRes = await fetch(
      `${GRAPH}/me/threads?${new URLSearchParams({
        fields: "id,text,permalink,timestamp",
        limit: String(Math.min(25, Math.max(1, limit))),
        access_token: token,
      })}`,
      { cache: "no-store" },
    );
    if (!postsRes.ok) {
      base.error = await readError(postsRes);
      return base;
    }
    const posts = ((await postsRes.json()) as { data?: ThreadsPost[] }).data || [];

    // 2. 每篇各拉一次對話串（含別人的回覆與我自己的回覆）
    const conversations = await Promise.all(
      posts.map(async (post) => {
        const res = await fetch(
          `${GRAPH}/${encodeURIComponent(post.id)}/conversation?${new URLSearchParams({
            fields:
              "id,text,username,permalink,timestamp,replied_to,is_reply_owned_by_me,hide_status",
            limit: String(REPLY_LIMIT),
            access_token: token,
          })}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          // 單篇失敗不能拖垮整個平台 —— 常見原因是那篇沒有任何回覆
          return { post, replies: [] as ThreadsReply[] };
        }
        const j = (await res.json()) as { data?: ThreadsReply[] };
        return { post, replies: j.data || [] };
      }),
    );

    base.comments = conversations.flatMap(({ post, replies }) =>
      replies.length === 0 ? [] : toInboxComments(post, replies, me),
    );
    return base;
  } catch (e) {
    console.error("[threads] 抓留言例外:", e);
    base.error = e instanceof Error ? e.message : String(e);
    return base;
  }
}

// ---------------------------------------------------------------- 回覆

/**
 * 回覆一則 Threads 留言。
 *
 * ⚠️ **Threads 的回覆要分兩步**，跟 FB／IG 一次 POST 就好完全不同：
 *    ① 先建一個「草稿容器」（帶 reply_to_id）→ 拿到 creation_id
 *    ② 再 publish 那個 creation_id，這時候才真的貼出去
 *    只做第一步不會報錯，但**留言永遠不會出現** —— 這正是這個專案最常見的那種靜默失效。
 */
export async function replyThreadsComment(
  commentId: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  const stored = await getConfig(TOKEN_KEY);
  if (!stored) return { ok: false, error: "還沒綁定 Threads" };

  const userId = await getConfig(USER_ID_KEY);
  if (!userId) return { ok: false, error: "沒有 Threads 使用者 id，請重新綁定一次" };

  try {
    const token = await ensureFreshToken(stored);

    // ① 建容器
    const createRes = await fetch(
      `${GRAPH}/${encodeURIComponent(userId)}/threads?${new URLSearchParams({
        media_type: "TEXT",
        text,
        reply_to_id: commentId,
        access_token: token,
      })}`,
      { method: "POST", cache: "no-store" },
    );
    if (!createRes.ok) return { ok: false, error: await readError(createRes) };
    const created = (await createRes.json()) as { id?: string };
    if (!created.id) return { ok: false, error: "Threads 沒有回傳草稿編號" };

    // ② 發佈
    const pubRes = await fetch(
      `${GRAPH}/${encodeURIComponent(userId)}/threads_publish?${new URLSearchParams({
        creation_id: created.id,
        access_token: token,
      })}`,
      { method: "POST", cache: "no-store" },
    );
    if (!pubRes.ok) return { ok: false, error: await readError(pubRes) };

    return { ok: true };
  } catch (e) {
    console.error("[threads] 回留言例外:", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 📺 YouTube 留言收件匣 —— 把頻道上的客戶留言收進後台，並且直接在後台回。
 *
 * 這是「影音平台留言統一收進一個網站回覆」的第二個平台（第一個是 LINE，在 /admin/line）。
 *
 * ⚠️ 刻意跟 Google 日曆用**完全獨立的授權綁定**：
 *     日曆的 refresh token 存 `google_refresh_token`，這裡存 `youtube_refresh_token`，
 *     callback 網址也不同。理由 —— 日曆是已經在跑的功能，接 YouTube 不值得
 *     為了少一個路由去動它的授權流程。哪天 YouTube 授權出事，日曆完全不受影響。
 *
 * 啟用前提（一次性，兩步）：
 *   1. Google Cloud Console 該 OAuth client 加 redirect URI：{BASE}/api/admin/youtube/callback
 *   2. 到 /admin/inbox 點「綁定 YouTube」→ 用**擁有該頻道的 Google 帳號**授權
 *
 * 📊 配額：YouTube Data API 每天 10,000 單位。讀留言 1 單位／次，回留言 50 單位／則。
 *    以這個頻道的量，一天用不到 200 單位。
 */
import { getConfig, setConfig } from "@/lib/google-calendar";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const YT_API = "https://www.googleapis.com/youtube/v3";

// 沿用同一組 OAuth client（同一個 Google Cloud 專案），只是 redirect URI 與 scope 不同
const CLIENT_ID = process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.AUTH_GOOGLE_ID || "";
const CLIENT_SECRET = process.env.GOOGLE_CALENDAR_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET || "";
const BASE_URL = process.env.APPOINTMENT_BASE_URL || "https://example.com";

export const YOUTUBE_REDIRECT_URI = `${BASE_URL}/api/admin/youtube/callback`;

/**
 * force-ssl 是「讀留言 ＋ 回留言」都需要的那一個。
 * readonly 不夠 —— 它讀得到但回不了，綁完才發現要重綁一次很浪費。
 */
const SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";

const REFRESH_KEY = "youtube_refresh_token";
const CHANNEL_ID_KEY = "youtube_channel_id";
const CHANNEL_TITLE_KEY = "youtube_channel_title";

export function isYoutubeConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

export async function isYoutubeBound(): Promise<boolean> {
  if (!isYoutubeConfigured()) return false;
  return Boolean(await getConfig(REFRESH_KEY));
}

/**
 * 綁定時記下來的頻道。
 *
 * 🔴 **有 token 但沒存到頻道時，會現場補問一次並存起來（自我修復）。**
 *    2026-08-23 踩到的情況：授權成功、token 存好了，但當下 YouTube Data API
 *    在 Google Cloud 專案裡沒啟用，所以查頻道失敗 —— 結果變成
 *    「isYoutubeBound() 說綁好了，但收件匣說找不到頻道」的半殘狀態。
 *    有了這段，之後只要把 API 啟用起來，**不用重新授權**，下次進頁面就自己好。
 */
export async function getBoundChannel(): Promise<{ id: string; title: string } | null> {
  const [id, title] = await Promise.all([getConfig(CHANNEL_ID_KEY), getConfig(CHANNEL_TITLE_KEY)]);
  if (id) return { id, title: title || id };

  if (!(await getConfig(REFRESH_KEY))) return null;
  const { channel } = await fetchMyChannel();
  if (!channel) return null;
  await Promise.all([
    setConfig(CHANNEL_ID_KEY, channel.id),
    setConfig(CHANNEL_TITLE_KEY, channel.title),
  ]);
  return channel;
}

// ---------------------------------------------------------------- OAuth

export function getYoutubeAuthUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: YOUTUBE_REDIRECT_URI,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent", // 強制每次都給 refresh token
    state,
  });
  return `${AUTH_URL}?${p.toString()}`;
}

/** 用 authorization code 換 refresh token 存 DB，順便記下綁到哪個頻道。 */
export async function exchangeYoutubeCode(code: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: YOUTUBE_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 300);
      console.error("[youtube] code 換 token 失敗:", body);
      return { ok: false, error: "Google 不接受這次授權，請再試一次" };
    }
    const d = (await res.json()) as { refresh_token?: string };
    if (!d.refresh_token) {
      return { ok: false, error: "Google 沒有回傳 refresh token（可能是重複授權），請到帳戶權限移除後重綁" };
    }

    await setConfig(REFRESH_KEY, d.refresh_token);
    accessTokenCache = null;

    // 綁完立刻確認這個帳號到底有沒有頻道 —— 有問題現在講，
    // 比等你進收件匣看到一片空白、以為是系統壞掉好得多。
    //
    // ⚠️ 查頻道失敗**不刪 token**：授權本身是成功的，token 是好的。
    //    留著，等問題（例如 API 沒啟用）排除後 getBoundChannel() 會自己補上頻道，
    //    不用再跑一次授權。錯誤訊息把 Google 的原話帶出去，不要自己編原因。
    const { channel, error } = await fetchMyChannel();
    if (!channel) {
      return {
        ok: false,
        error: `授權成功，但抓不到你的頻道資料：${error || "原因不明"}`,
      };
    }
    await setConfig(CHANNEL_ID_KEY, channel.id);
    await setConfig(CHANNEL_TITLE_KEY, channel.title);
    return { ok: true };
  } catch (e) {
    console.error("[youtube] exchangeCode 例外:", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 解除綁定：只刪這三個 key，不碰日曆的 token。 */
export async function unbindYoutube(): Promise<void> {
  await Promise.all([
    setConfig(REFRESH_KEY, null),
    setConfig(CHANNEL_ID_KEY, null),
    setConfig(CHANNEL_TITLE_KEY, null),
  ]);
  accessTokenCache = null;
}

// ---------------------------------------------------------------- access token

let accessTokenCache: { token: string; exp: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  if (accessTokenCache && accessTokenCache.exp > Date.now() + 60_000) return accessTokenCache.token;
  const refresh = await getConfig(REFRESH_KEY);
  if (!refresh || !isYoutubeConfigured()) return null;

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refresh,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) {
      console.error("[youtube] refresh 失敗:", (await res.text()).slice(0, 200));
      return null;
    }
    const d = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!d.access_token) return null;
    accessTokenCache = {
      token: d.access_token,
      exp: Date.now() + (d.expires_in ?? 3600) * 1000,
    };
    return d.access_token;
  } catch (e) {
    console.error("[youtube] refresh 例外:", e);
    return null;
  }
}

// ---------------------------------------------------------------- API

type ChannelInfo = { id: string; title: string };

/**
 * 問 Google「我是誰的頻道」。
 *
 * 🔴 2026-08-23：這裡原本失敗一律回 null，呼叫端就只好猜一個原因說
 *    「找不到頻道，請改用擁有頻道的帳號授權」—— 結果真正的原因是
 *    **Google Cloud 專案沒有啟用 YouTube Data API v3**（每次呼叫都 403），
 *    使用者被這句話帶去懷疑自己的 YouTube 帳號，白花時間。
 *
 *    教訓：把下游的錯誤吞掉、自己編一個看似合理的原因，比直接說「不知道」更糟。
 *    現在一律把 Google 的原話帶出去 —— 它的訊息裡就有啟用 API 的連結。
 */
async function fetchMyChannel(): Promise<{ channel: ChannelInfo | null; error: string | null }> {
  const token = await getAccessToken();
  if (!token) return { channel: null, error: "拿不到 access token，授權可能已失效，請重新綁定" };
  try {
    const res = await fetch(`${YT_API}/channels?part=snippet&mine=true`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      let msg = `YouTube 回 ${res.status}`;
      try {
        const parsed = JSON.parse(body) as { error?: { message?: string } };
        if (parsed.error?.message) msg = parsed.error.message;
      } catch {
        /* 不是 JSON 就用預設訊息 */
      }
      return { channel: null, error: msg };
    }
    const d = (await res.json()) as { items?: Array<{ id: string; snippet?: { title?: string } }> };
    const item = d.items?.[0];
    if (!item) {
      // 這才是真正的「沒有頻道」。多半是授權時選到個人帳號、
      // 但頻道其實掛在品牌帳戶底下 —— 授權畫面的帳號選擇器要選那個品牌帳戶。
      return {
        channel: null,
        error:
          "這個 Google 帳號底下沒有 YouTube 頻道。如果頻道是「品牌帳戶」，授權時的帳號選擇畫面要改選那個品牌帳戶。",
      };
    }
    return { channel: { id: item.id, title: item.snippet?.title || item.id }, error: null };
  } catch (e) {
    return { channel: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export type YoutubeComment = {
  /** 頂層留言的 id，回覆時當 parentId 用 */
  id: string;
  author: string;
  authorChannelId: string | null;
  authorImage: string | null;
  text: string;
  publishedAt: string;
  likeCount: number;
  /** 這則留言在哪支影片底下（頻道首頁留言沒有） */
  videoId: string | null;
  /** 這串已經有幾則回覆 */
  replyCount: number;
  /** 你（頻道主）已經回過了 —— 從實際的回覆內容判斷，不是資料庫旗標 */
  answeredByOwner: boolean;
  /** 已有的回覆，由舊到新 */
  replies: Array<{ author: string; text: string; publishedAt: string; byOwner: boolean }>;
};

type ThreadResource = {
  snippet?: {
    videoId?: string;
    totalReplyCount?: number;
    topLevelComment?: {
      id?: string;
      snippet?: {
        authorDisplayName?: string;
        authorProfileImageUrl?: string;
        authorChannelId?: { value?: string };
        textOriginal?: string;
        textDisplay?: string;
        publishedAt?: string;
        likeCount?: number;
      };
    };
  };
  replies?: {
    comments?: Array<{
      snippet?: {
        authorDisplayName?: string;
        authorChannelId?: { value?: string };
        textOriginal?: string;
        textDisplay?: string;
        publishedAt?: string;
      };
    }>;
  };
};

export type CommentFetchResult =
  | { ok: true; comments: YoutubeComment[] }
  | { ok: false; error: string };

/**
 * 抓頻道底下所有影片的留言（最新的排前面）。
 *
 * 用 `allThreadsRelatedToChannelId` 一次拿全頻道，不用先列影片再一支一支查 ——
 * 後者在有 N 支影片時要 N+1 次呼叫，配額燒得快而且慢。
 *
 * 🔴 「我回過了沒」是比對回覆裡的 authorChannelId 跟你自己的頻道 id 算出來的，
 *    **不是資料庫旗標**。所以你在 YouTube App 裡回的也算數，兩邊不會打架。
 */
export async function listChannelComments(maxResults = 50): Promise<CommentFetchResult> {
  const token = await getAccessToken();
  if (!token) return { ok: false, error: "還沒綁定 YouTube，或授權已失效（請重新綁定）" };

  const channel = await getBoundChannel();
  if (!channel) {
    // 到這裡代表 token 在、但頻道問不到。把 Google 的原話帶出去 ——
    // 「請重新綁定」是錯的建議，重綁一百次也解決不了 API 沒啟用這種問題。
    const { error } = await fetchMyChannel();
    return { ok: false, error: `抓不到你的頻道資料：${error || "原因不明"}` };
  }

  const params = new URLSearchParams({
    part: "snippet,replies",
    allThreadsRelatedToChannelId: channel.id,
    maxResults: String(Math.min(100, Math.max(1, maxResults))),
    order: "time",
    textFormat: "plainText",
  });

  try {
    const res = await fetch(`${YT_API}/commentThreads?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 400);
      console.error("[youtube] 取留言失敗", res.status, body);
      // 403 幾乎都是配額用完或權限不足，講白比丟原始 JSON 有用
      if (res.status === 403) {
        return { ok: false, error: "YouTube 拒絕（多半是今日配額用完，或授權的帳號不是頻道擁有者）" };
      }
      return { ok: false, error: `YouTube 回 ${res.status}` };
    }

    const d = (await res.json()) as { items?: ThreadResource[] };
    const comments: YoutubeComment[] = (d.items || []).map((item) => {
      const top = item.snippet?.topLevelComment;
      const s = top?.snippet;
      const replies = (item.replies?.comments || []).map((c) => ({
        author: c.snippet?.authorDisplayName || "（不明）",
        text: c.snippet?.textOriginal || c.snippet?.textDisplay || "",
        publishedAt: c.snippet?.publishedAt || "",
        byOwner: c.snippet?.authorChannelId?.value === channel.id,
      }));
      // API 回的 replies 由新到舊，畫面上要由舊到新才像對話
      replies.reverse();

      return {
        id: top?.id || "",
        author: s?.authorDisplayName || "（不明）",
        authorChannelId: s?.authorChannelId?.value || null,
        authorImage: s?.authorProfileImageUrl || null,
        text: s?.textOriginal || s?.textDisplay || "",
        publishedAt: s?.publishedAt || "",
        likeCount: Number(s?.likeCount ?? 0),
        videoId: item.snippet?.videoId || null,
        replyCount: Number(item.snippet?.totalReplyCount ?? 0),
        answeredByOwner: replies.some((r) => r.byOwner),
        replies,
      };
    });

    // 自己留在自己頻道上的留言不算「客戶留言」，濾掉免得收件匣看起來很忙
    return { ok: true, comments: comments.filter((c) => c.id && c.authorChannelId !== channel.id) };
  } catch (e) {
    console.error("[youtube] 取留言例外:", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 回覆某一則留言。parentId 是頂層留言的 id。 */
export async function replyToComment(parentId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const token = await getAccessToken();
  if (!token) return { ok: false, error: "還沒綁定 YouTube，或授權已失效" };

  try {
    const res = await fetch(`${YT_API}/comments?part=snippet`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ snippet: { parentId, textOriginal: text } }),
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 400);
      console.error("[youtube] 回留言失敗", res.status, body);
      if (res.status === 403) {
        return { ok: false, error: "YouTube 拒絕（配額用完，或這支影片關閉了留言）" };
      }
      if (res.status === 404) {
        return { ok: false, error: "這則留言已經不在了（多半是被刪掉）" };
      }
      return { ok: false, error: `YouTube 回 ${res.status}，沒有送出` };
    }
    return { ok: true };
  } catch (e) {
    console.error("[youtube] 回留言例外:", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

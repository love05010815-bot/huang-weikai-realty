/**
 * 📘 Meta（Facebook 粉專 ＋ Instagram）留言 —— 抓進後台，並且直接在後台回。
 *
 * ⚠️ 2026-08-21 更正先前的評估：接自己的粉專與 IG **不需要送 App Review**。
 *    Meta 的審核（Advanced Access）是給「要服務別人的使用者」的 App；
 *    你用自己建的 App、管自己有管理員權限的粉專，走 Standard Access 就夠。
 *    先前寫「要等一到兩週審核」是把公開上架的門檻套到自用場景上，是錯的。
 *
 * 啟用前提（一次性，四步，都在 developers.facebook.com）：
 *   1. 建一個 App（類型選「企業」）
 *   2. 加入「Facebook 登入」產品，把 {BASE}/api/admin/meta/callback 填進
 *      「有效的 OAuth 重新導向 URI」
 *   3. 把 App ID / App 密鑰設成環境變數 META_APP_ID / META_APP_SECRET
 *   4. 到 /admin/inbox 按「綁定 Facebook / Instagram」授權
 *
 * 📷 IG 要抓得到留言，那個 IG 帳號必須是**專業帳號**且**連到這個粉專**。
 *    沒連的話 FB 部分照樣會動，IG 那半會回「找不到連結的 IG 帳號」。
 *
 * 🔑 token 的三層關係（這是 Meta 最容易搞混的地方）：
 *    授權拿到的是「短期使用者 token」（約 1 小時）
 *      → 換成「長期使用者 token」（約 60 天）
 *        → 用它去換「粉專 token」——**粉專 token 不會過期**，只要你沒改密碼、
 *           沒撤銷授權。所以真正要存起來長期用的是粉專 token。
 */
import { getConfig, setConfig } from "@/lib/google-calendar";
import type { InboxComment, InboxReply, PlatformFetch } from "@/lib/inbox-types";

const GRAPH = "https://graph.facebook.com/v21.0";
const DIALOG = "https://www.facebook.com/v21.0/dialog/oauth";

const APP_ID = process.env.META_APP_ID || "";
const APP_SECRET = process.env.META_APP_SECRET || "";
const BASE_URL = process.env.APPOINTMENT_BASE_URL || "https://example.com";

export const META_REDIRECT_URI = `${BASE_URL}/api/admin/meta/callback`;

/**
 * 要的權限。少一個就有一半功能不會動：
 *   pages_show_list          列出你管理的粉專
 *   pages_read_engagement    讀粉專貼文與留言
 *   pages_manage_engagement  回覆／管理留言
 *   instagram_basic          讀 IG 帳號與貼文
 *   instagram_manage_comments 讀 IG 留言、回 IG 留言
 */
const SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  // 🔴 2026-08-23 補上。這一個才是「讀**別人**留在你粉專上的內容」——
  //    pages_read_engagement 只涵蓋粉專自己發的貼文與追蹤者資料，
  //    客戶的留言是 user-generated content，少了這個會抓到空的留言陣列，
  //    而且不會報錯（貼文照樣拿得到，comments 就是空的）。
  "pages_read_user_content",
  "pages_manage_engagement",
  "instagram_basic",
  "instagram_manage_comments",
].join(",");

const PAGE_TOKEN_KEY = "meta_page_token";
const PAGE_ID_KEY = "meta_page_id";
const PAGE_NAME_KEY = "meta_page_name";
const IG_ID_KEY = "meta_ig_user_id";
const IG_NAME_KEY = "meta_ig_username";

export function isMetaConfigured(): boolean {
  return Boolean(APP_ID && APP_SECRET);
}

export async function isMetaBound(): Promise<boolean> {
  if (!isMetaConfigured()) return false;
  return Boolean(await getConfig(PAGE_TOKEN_KEY));
}

export async function getBoundMeta(): Promise<{
  pageId: string;
  pageName: string;
  igUserId: string | null;
  igUsername: string | null;
} | null> {
  const [pageId, pageName, igId, igName] = await Promise.all([
    getConfig(PAGE_ID_KEY),
    getConfig(PAGE_NAME_KEY),
    getConfig(IG_ID_KEY),
    getConfig(IG_NAME_KEY),
  ]);
  if (!pageId) return null;
  return {
    pageId,
    pageName: pageName || pageId,
    igUserId: igId || null,
    igUsername: igName || null,
  };
}

// ---------------------------------------------------------------- OAuth

/**
 * 商家專用 Facebook 登入的「設定編號」。
 *
 * 🔴 2026-08-24 為什麼需要這個：這個 App 的使用案例是「管理粉絲專頁的所有內容」，
 *    Meta 不讓它同時加「使用 Facebook 登入」（建立時那一項是灰的），
 *    所以它只有**商家專用 Facebook 登入（Facebook Login for Business）**。
 *
 *    那套流程**不吃 `scope` 參數，改吃 `config_id`** —— 權限是在後台的「設定」裡
 *    先勾好，授權網址只帶那個設定的編號。用傳統的 `scope` 去打，Meta 會回一個
 *    **誤導性的錯誤**：「這個網址的網域未包含在應用程式的網域中」，
 *    害人一直去查網域（實測 app_domains、website_url、redirect_uri 三者完全吻合仍然報這個）。
 *
 * 沒設這個環境變數時會退回傳統 `scope` 流程 —— 一般（非商家版）的 App 仍然可用。
 */
const LOGIN_CONFIG_ID = process.env.META_LOGIN_CONFIG_ID || "";

export function isMetaBusinessLogin(): boolean {
  return Boolean(LOGIN_CONFIG_ID);
}

export function getMetaAuthUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: APP_ID,
    redirect_uri: META_REDIRECT_URI,
    response_type: "code",
    state,
  });
  if (LOGIN_CONFIG_ID) {
    // 商家版：權限已經在後台那個設定裡勾好，這裡只帶編號，不能再帶 scope
    p.set("config_id", LOGIN_CONFIG_ID);
  } else {
    p.set("scope", SCOPES);
  }
  return `${DIALOG}?${p.toString()}`;
}

type GraphError = { error?: { message?: string; type?: string; code?: number } };

/** Meta 的錯誤訊息藏在 error.message，直接吐原始 JSON 沒人看得懂。 */
async function readGraphError(res: Response): Promise<string> {
  try {
    const d = (await res.json()) as GraphError;
    return d.error?.message || `Meta 回 ${res.status}`;
  } catch {
    return `Meta 回 ${res.status}`;
  }
}

/**
 * 授權碼 → 粉專 token，整條走完存起來。
 *
 * 這裡一次做完三步（短期→長期→粉專），因為中間那兩個 token 我們都不留 ——
 * 存了也只是多兩個會過期的東西要管。
 */
export async function exchangeMetaCode(
  code: string,
): Promise<{ ok: boolean; error?: string; pageName?: string }> {
  try {
    // 1. code → 短期使用者 token
    const shortRes = await fetch(
      `${GRAPH}/oauth/access_token?${new URLSearchParams({
        client_id: APP_ID,
        client_secret: APP_SECRET,
        redirect_uri: META_REDIRECT_URI,
        code,
      })}`,
      { cache: "no-store" },
    );
    if (!shortRes.ok) return { ok: false, error: await readGraphError(shortRes) };
    const shortToken = ((await shortRes.json()) as { access_token?: string }).access_token;
    if (!shortToken) return { ok: false, error: "Meta 沒有回傳 access token" };

    // 2. 短期 → 長期使用者 token（約 60 天）
    const longRes = await fetch(
      `${GRAPH}/oauth/access_token?${new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: APP_ID,
        client_secret: APP_SECRET,
        fb_exchange_token: shortToken,
      })}`,
      { cache: "no-store" },
    );
    if (!longRes.ok) return { ok: false, error: await readGraphError(longRes) };
    const longToken = ((await longRes.json()) as { access_token?: string }).access_token;
    if (!longToken) return { ok: false, error: "換長期 token 失敗" };

    // 3. 長期使用者 token → 粉專清單（含各自的粉專 token，不會過期）
    const pagesRes = await fetch(
      `${GRAPH}/me/accounts?${new URLSearchParams({
        fields: "id,name,access_token,instagram_business_account{id,username}",
        access_token: longToken,
      })}`,
      { cache: "no-store" },
    );
    if (!pagesRes.ok) return { ok: false, error: await readGraphError(pagesRes) };
    const pages = (await pagesRes.json()) as {
      data?: Array<{
        id: string;
        name?: string;
        access_token?: string;
        instagram_business_account?: { id?: string; username?: string };
      }>;
    };

    const page = pages.data?.[0];
    if (!page?.access_token) {
      return {
        ok: false,
        error:
          "這個帳號底下找不到你有管理權限的粉專。請確認授權時有勾選粉專，且你是該粉專的管理員。",
      };
    }

    await Promise.all([
      setConfig(PAGE_TOKEN_KEY, page.access_token),
      setConfig(PAGE_ID_KEY, page.id),
      setConfig(PAGE_NAME_KEY, page.name || page.id),
      setConfig(IG_ID_KEY, page.instagram_business_account?.id || null),
      setConfig(IG_NAME_KEY, page.instagram_business_account?.username || null),
    ]);

    return { ok: true, pageName: page.name || page.id };
  } catch (e) {
    console.error("[meta] exchangeCode 例外:", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 解除綁定。只刪 meta_* 五個 key。 */
/**
 * 直接問 Meta：「這個 App 登記了哪些網域？」
 *
 * 為什麼需要這支（2026-08-24）：綁定一直卡在「無法載入網址 —— 網域未包含在應用程式的網域中」，
 * 但「應用程式網域」到底存進去沒有，**從外面完全看不出來** ——
 * 只能請系統擁有者去 Meta 後台看一眼再截圖回報，而那個欄位偏偏會「看起來存了其實沒存」。
 * 有了這支，一行 curl 就能斷定，不用再靠截圖來回。
 *
 * 🔴 用的是 app access token（`{app_id}|{app_secret}`）。
 *    **絕對不要把那個 token 或 app secret 放進回傳值** —— 這支的輸出是公開可讀的。
 *    只回網域清單與 App 名稱，那些本來就會出現在 OAuth 錯誤訊息裡，不是機密。
 */
export async function fetchAppDomains(): Promise<{
  ok: boolean;
  appDomains?: string[];
  appName?: string;
  websiteUrl?: string | null;
  /** 程式實際送給 Meta 的 redirect_uri —— 對不上 appDomains 就是這裡出問題 */
  redirectUri?: string;
  /** APPOINTMENT_BASE_URL 的實際值（公開網址，不是機密） */
  baseUrl?: string;
  appId?: string;
  businessLogin?: boolean;
  error?: string;
}> {
  // 這幾項就算沒設 App 也該回報 —— 「送出去的網址長什麼樣」是診斷的核心，
  // 不能因為前面某個條件不成立就整包不回。
  const shape = {
    redirectUri: META_REDIRECT_URI,
    baseUrl: BASE_URL,
    appId: APP_ID ? APP_ID : "(未設)",
    /** true = 走商家版（帶 config_id）；false = 走傳統 scope 流程 */
    businessLogin: isMetaBusinessLogin(),
  };
  if (!isMetaConfigured()) {
    return { ok: false, error: "META_APP_ID / META_APP_SECRET 沒設定", ...shape };
  }
  try {
    const params = new URLSearchParams({
      fields: "app_domains,name,website_url",
      access_token: `${APP_ID}|${APP_SECRET}`,
    });
    const res = await fetch(`${GRAPH}/${APP_ID}?${params}`, { cache: "no-store" });
    if (!res.ok) return { ok: false, error: await readGraphError(res), ...shape };
    const d = (await res.json()) as {
      app_domains?: string[];
      name?: string;
      website_url?: string;
    };
    return {
      ok: true,
      appDomains: d.app_domains ?? [],
      appName: d.name,
      websiteUrl: d.website_url ?? null,
      ...shape,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), ...shape };
  }
}

export async function unbindMeta(): Promise<void> {
  await Promise.all([
    setConfig(PAGE_TOKEN_KEY, null),
    setConfig(PAGE_ID_KEY, null),
    setConfig(PAGE_NAME_KEY, null),
    setConfig(IG_ID_KEY, null),
    setConfig(IG_NAME_KEY, null),
  ]);
}

// ---------------------------------------------------------------- Facebook 留言

type FbComment = {
  id: string;
  message?: string;
  created_time?: string;
  permalink_url?: string;
  from?: { id?: string; name?: string };
  comments?: { data?: FbComment[] };
};

type FbPost = {
  id: string;
  message?: string;
  created_time?: string;
  permalink_url?: string;
  comments?: { data?: FbComment[] };
};

/** 貼文內容太長，當「這則留言掛在哪」的提示只要開頭一句 */
function contextOf(text: string | undefined, max = 60): string | null {
  if (!text) return null;
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

export async function fetchFacebookComments(limit = 25): Promise<PlatformFetch> {
  const base: PlatformFetch = {
    platform: "facebook",
    bound: false,
    comments: [],
    error: null,
    accountName: null,
  };
  if (!isMetaConfigured()) return base;

  const [token, bound] = await Promise.all([getConfig(PAGE_TOKEN_KEY), getBoundMeta()]);
  if (!token || !bound) return base;
  base.bound = true;
  base.accountName = bound.pageName;

  try {
    // 一次把貼文與底下的留言、留言的回覆一起要回來 —— 分開打會變成 N+1 次請求
    const params = new URLSearchParams({
      fields: `id,message,created_time,permalink_url,comments.limit(25){id,message,created_time,permalink_url,from,comments.limit(10){id,message,created_time,from}}`,
      limit: String(Math.min(50, Math.max(1, limit))),
      access_token: token,
    });
    const res = await fetch(`${GRAPH}/${bound.pageId}/posts?${params}`, { cache: "no-store" });
    if (!res.ok) {
      base.error = await readGraphError(res);
      return base;
    }

    const d = (await res.json()) as { data?: FbPost[] };
    const out: InboxComment[] = [];

    for (const post of d.data || []) {
      for (const c of post.comments?.data || []) {
        // 自己在自己粉專上的留言不算客戶留言
        if (c.from?.id === bound.pageId) continue;

        const replies: InboxReply[] = (c.comments?.data || []).map((r) => ({
          author: r.from?.name || "（不明）",
          text: r.message || "",
          publishedAt: r.created_time || "",
          byOwner: r.from?.id === bound.pageId,
        }));

        out.push({
          platform: "facebook",
          id: c.id,
          author: c.from?.name || "（不明）",
          authorImage: null, // 粉專留言者的頭像要另外的權限，沒有就不顯示，不要放破圖
          text: c.message || "",
          publishedAt: c.created_time || "",
          permalink: c.permalink_url || post.permalink_url || null,
          context: contextOf(post.message),
          answeredByOwner: replies.some((r) => r.byOwner),
          replies,
        });
      }
    }

    base.comments = out;
    return base;
  } catch (e) {
    console.error("[meta] 抓 FB 留言例外:", e);
    base.error = e instanceof Error ? e.message : String(e);
    return base;
  }
}

// ---------------------------------------------------------------- Instagram 留言

type IgComment = {
  id: string;
  text?: string;
  timestamp?: string;
  username?: string;
  replies?: { data?: IgComment[] };
};

type IgMedia = {
  id: string;
  caption?: string;
  permalink?: string;
  comments?: { data?: IgComment[] };
};

export async function fetchInstagramComments(limit = 25): Promise<PlatformFetch> {
  const base: PlatformFetch = {
    platform: "instagram",
    bound: false,
    comments: [],
    error: null,
    accountName: null,
  };
  if (!isMetaConfigured()) return base;

  const [token, bound] = await Promise.all([getConfig(PAGE_TOKEN_KEY), getBoundMeta()]);
  if (!token || !bound) return base;

  // 粉專綁了但沒連 IG：這不是錯誤，是還沒設定。講清楚差別，
  // 不然你會以為 IG 壞掉，其實是 IG 帳號還沒轉專業帳號或沒連粉專。
  if (!bound.igUserId) {
    base.bound = true;
    base.error =
      // 🔴 2026-08-25：這句原本斷言「粉專沒有連結的 IG 專業帳號」，但那是**沒查證的推測**。
      //    Meta 對 instagram_business_account 這個欄位，「沒權限」與「真的沒連」**都是回 200
      //    並且直接省略欄位**，從回應分不出是哪一種（實測 connected_instagram_account 也一樣）。
      //    講死一個原因會害人往錯的方向修 —— 這一輪已經被 Meta 的誤導訊息坑過兩次了，
      //    自己不要再製造第三個。兩種可能都列出來，並把「先查哪一個」講清楚。
      "抓不到這個粉專連結的 Instagram 帳號。兩種可能，Meta 的回應分不出是哪一種：" +
      "①【比較常見】這個 Meta App 沒有加 Instagram 的使用案例，所以授權時根本沒要到 IG 權限 —— " +
      "到 developers.facebook.com 該 App 加「管理 Instagram 的訊息和內容」，再回來重新綁定一次。" +
      "② IG 帳號還不是專業帳號、或沒有連到這個粉專 —— 到 Meta Business Suite 確認。" +
      "建議先查 ①。";
    return base;
  }

  base.bound = true;
  base.accountName = bound.igUsername ? `@${bound.igUsername}` : bound.igUserId;

  try {
    const params = new URLSearchParams({
      fields: `id,caption,permalink,comments.limit(25){id,text,timestamp,username,replies.limit(10){id,text,timestamp,username}}`,
      limit: String(Math.min(50, Math.max(1, limit))),
      access_token: token,
    });
    const res = await fetch(`${GRAPH}/${bound.igUserId}/media?${params}`, { cache: "no-store" });
    if (!res.ok) {
      base.error = await readGraphError(res);
      return base;
    }

    const d = (await res.json()) as { data?: IgMedia[] };
    const me = bound.igUsername || "";
    const out: InboxComment[] = [];

    for (const media of d.data || []) {
      for (const c of media.comments?.data || []) {
        // IG 的留言只給 username，所以用 username 比對「這是不是我自己留的」
        if (me && c.username === me) continue;

        const replies: InboxReply[] = (c.replies?.data || []).map((r) => ({
          author: r.username || "（不明）",
          text: r.text || "",
          publishedAt: r.timestamp || "",
          byOwner: Boolean(me) && r.username === me,
        }));

        out.push({
          platform: "instagram",
          id: c.id,
          author: c.username ? `@${c.username}` : "（不明）",
          authorImage: null,
          text: c.text || "",
          publishedAt: c.timestamp || "",
          permalink: media.permalink || null,
          context: contextOf(media.caption),
          answeredByOwner: replies.some((r) => r.byOwner),
          replies,
        });
      }
    }

    base.comments = out;
    return base;
  } catch (e) {
    console.error("[meta] 抓 IG 留言例外:", e);
    base.error = e instanceof Error ? e.message : String(e);
    return base;
  }
}

// ---------------------------------------------------------------- 回覆

/**
 * 回覆 FB 或 IG 的留言。
 *
 * 兩邊的端點剛好一樣好用：對留言 id POST 一個子留言就是回覆。
 * 差別只在欄位名（FB 用 message，IG 用 message 也通）。
 */
export async function replyMetaComment(
  commentId: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  const token = await getConfig(PAGE_TOKEN_KEY);
  if (!token) return { ok: false, error: "還沒綁定 Facebook／Instagram" };

  try {
    const res = await fetch(`${GRAPH}/${encodeURIComponent(commentId)}/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, access_token: token }),
    });

    // IG 用 /replies，FB 的留言則是對 comment id 直接 POST /comments。
    // 先試 /replies，被拒再退回 /comments —— 兩種 id 在外觀上分不出來，
    // 與其猜錯不如兩條都走過，反正失敗的那次不會產生任何留言。
    if (res.ok) return { ok: true };

    const fallback = await fetch(`${GRAPH}/${encodeURIComponent(commentId)}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, access_token: token }),
    });
    if (fallback.ok) return { ok: true };

    return { ok: false, error: await readGraphError(fallback) };
  } catch (e) {
    console.error("[meta] 回留言例外:", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

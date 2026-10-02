/**
 * ❤️ 我的最愛／瀏覽足跡 —— 前後端共用的小規則（純函式，沒有任何相依，client 與 server 都能 import）
 *
 * 2026-10-02 系統擁有者：「客戶在建案地圖或精選好案看到喜歡的建案，可以在我的網站裡面
 * 加到我的最愛，以及他瀏覽過的足跡」。
 *
 * ## 存在哪裡：客戶自己的瀏覽器（localStorage），不進資料庫
 *
 * 這個網站的客戶**沒有登入**（後台登入是他自己用的；LINE 那條買方識別碼只在 /match 流程裡）。
 * 沒有身分就沒有地方存，所以收藏跟足跡都放在客戶的瀏覽器裡 —— 跟 /map 的「加入比較」同一個做法。
 *   ・好處：零個資、不用建表、不用同意條款、馬上能用
 *   ・代價：**換手機、換瀏覽器、清除瀏覽資料就沒了**。頁面上有講，不要假裝它是雲端。
 * 哪天要跨裝置，就是把這份清單綁到 /match 那條簽章過的買方識別碼（?k=）上，資料結構不用改。
 *
 * ## 收藏的是什麼
 *
 *   project  /map 上的建案（static 資料 port-projects.ts，key ＝ 建案 id，例：changhong-tianqing）
 *   listing  精選好案（資料庫 listing 表，key ＝ slug，有自己的頁 /listings/<slug>）
 *
 * ⚠️ 地圖上的「在售物件」（map_listing）**刻意不收**：它沒有自己的頁、成交就下架，
 *    而且 /map 已經有「加入比較」在管它。客戶收藏的是建案，回來時看到的是那個建案
 *    「現在」有哪些在售物件（收藏頁現查），比收藏一戶已經賣掉的更有用。
 *
 * ## 為什麼每一筆都存標題，不只存 key
 *
 * 收藏頁打開要**立刻**有東西看（API 還在跑的那一秒不能是空白），
 * 而且已經被刪掉的物件、改過名的建案，足跡裡還是要認得出「那天看的是什麼」。
 * 標題是「收藏當下的快照」，頁面拿到最新資料會蓋掉它；拿不到就顯示快照並說明。
 *
 * 瀏覽器那一側的讀寫在 `app/_ui/favorites/store.ts`，這裡只有不碰 window 的規則，
 * 所以 `npm run check:favorites` 能用假資料把每一條都跑過。
 */

export const SAVED_KINDS = ["project", "listing"] as const;
export type SavedKind = (typeof SAVED_KINDS)[number];

/** 收藏清單與足跡共用的一筆 */
export type SavedItem = {
  kind: SavedKind;
  /** project ＝ 建案 id；listing ＝ slug */
  key: string;
  /** 收藏／瀏覽當下的名稱快照 */
  title: string;
  /** 第二行：建案是「建商・區域」，精選好案是「區域」 */
  sub: string;
  /** 加入或瀏覽的時間（ms）。清單一律新的在前 */
  at: number;
};

/** 收藏上限。一個人真的在挑的建案不會超過這個數，超過就是在囤 */
export const FAV_MAX = 100;
/** 足跡上限。只是「我上次看了什麼」，太長反而找不到 */
export const TRAIL_MAX = 60;

export const FAV_STORAGE_KEY = "weikai.favorites.v1";
export const TRAIL_STORAGE_KEY = "weikai.trail.v1";

export const FAVORITES_HREF = "/favorites";

/** 文字快照的長度上限（字元，不是 UTF-16 單位，所以不會把 emoji 切一半） */
const TITLE_MAX = 120;
const SUB_MAX = 80;

/** 兩種 key 長什麼樣。不合的直接丟掉 —— 這些 key 會被拿去查資料，不能讓人塞怪東西 */
const KEY_RE: Record<SavedKind, RegExp> = {
  project: /^[a-z0-9_-]{1,80}$/i,
  listing: /^[a-z0-9-]{1,120}$/,
};

export function isSavedKind(value: unknown): value is SavedKind {
  return typeof value === "string" && (SAVED_KINDS as readonly string[]).includes(value);
}

/** 照「字元」截斷（Array.from 以 code point 切），emoji 不會被切成半個 */
function clip(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const chars = Array.from(value.trim());
  return chars.length > max ? chars.slice(0, max).join("") : chars.join("");
}

/**
 * 把 localStorage 裡讀出來的一筆整理成合法的 SavedItem；不合法回 null。
 * 存進去的東西是客戶瀏覽器裡的，可能被改過、可能是舊版格式 —— 一律當不可信輸入。
 */
export function sanitizeItem(raw: unknown): SavedItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isSavedKind(r.kind)) return null;
  const key = typeof r.key === "string" ? r.key.trim() : "";
  if (!KEY_RE[r.kind].test(key)) return null;
  const at = typeof r.at === "number" && Number.isFinite(r.at) && r.at >= 0 ? Math.floor(r.at) : 0;
  return {
    kind: r.kind,
    key: r.kind === "listing" ? key.toLowerCase() : key,
    title: clip(r.title, TITLE_MAX),
    sub: clip(r.sub, SUB_MAX),
    at,
  };
}

/** 同一件東西？（kind＋key 都一樣） */
export function sameItem(item: SavedItem, kind: SavedKind, key: string): boolean {
  return item.kind === kind && item.key === key;
}

/**
 * 整份清單從 JSON 讀回來：壞的筆丟掉、重複的只留第一筆（清單是新的在前，所以留的是最新那筆）、
 * 超過上限的尾巴砍掉。永遠回新陣列。
 */
export function parseSaved(raw: unknown, max: number): SavedItem[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedItem[] = [];
  for (const entry of raw) {
    const item = sanitizeItem(entry);
    if (!item || out.some((x) => sameItem(x, item.kind, item.key))) continue;
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

/** 放到最前面；本來就在清單裡的先拿掉再放（＝「移到最上面」）；超過上限砍尾巴 */
export function pushTop(list: SavedItem[], item: SavedItem, max: number): SavedItem[] {
  const rest = list.filter((x) => !sameItem(x, item.kind, item.key));
  return [item, ...rest].slice(0, max);
}

export function removeSaved(list: SavedItem[], kind: SavedKind, key: string): SavedItem[] {
  return list.filter((x) => !sameItem(x, kind, key));
}

/**
 * 收藏鈕按一下：在清單裡 → 拿掉（added=false）；不在 → 放到最前面（added=true）。
 * `now` 可以傳進來，測試才能固定時間。
 */
export function toggleSaved(
  list: SavedItem[],
  item: Omit<SavedItem, "at">,
  max: number,
  now = Date.now(),
): { list: SavedItem[]; added: boolean } {
  if (list.some((x) => sameItem(x, item.kind, item.key))) {
    return { list: removeSaved(list, item.kind, item.key), added: false };
  }
  return { list: pushTop(list, { ...item, at: now }, max), added: true };
}

/**
 * 網址 `?p=a,b,c` / `?l=x,y` → 去重、只留長得像那種 key 的、最多 max 個。
 * 亂打的東西直接丟掉，不會進資料庫查詢（跟 /map/compare 的 parseCompareIds 同一個原則）。
 */
export function parseKeyList(raw: string | null | undefined, kind: SavedKind, max: number): string[] {
  const out: string[] = [];
  for (const piece of (raw ?? "").split(/[,\s]+/)) {
    const key = kind === "listing" ? piece.trim().toLowerCase() : piece.trim();
    if (!key || !KEY_RE[kind].test(key) || out.includes(key)) continue;
    out.push(key);
    if (out.length >= max) break;
  }
  return out;
}

// ---------------------------------------------------------------- 收藏頁跟 API 之間的資料形狀

/** 建案「現在」的樣子：static 資料＋他在這個建案目前有幾件在售 */
export type ProjectCard = {
  kind: "project";
  key: string;
  name: string;
  builder: string;
  /** 已經換成顯示用的中文（「梧棲區」「鹿寮萬家福商圈」） */
  area: string;
  /** 已經換成顯示用的中文（「預售中」「新成屋」…） */
  status: string;
  completion: string;
  units: number | null;
  /** 他目前在這個建案的在售物件數。查不到資料庫就是 0，不報錯 */
  mine: number;
};

/** 精選好案「現在」的樣子。找不到那戶（後台整筆刪掉）就不會出現在回應裡 */
export type ListingCard = {
  kind: "listing";
  key: string;
  area: string;
  title: string;
  /** 封面照，已經解析成可以直接放進 img src 的網址；沒照片 null */
  cover: string | null;
  /** 售價（萬）。已下架或抓不到 → null */
  price: number | null;
  status: "active" | "sold";
};

export type FavoritesPayload = {
  ok: true;
  projects: Record<string, ProjectCard>;
  listings: Record<string, ListingCard>;
};

/** 收藏頁查 API 用的網址。沒有任何 key 時回 null（不用打） */
export function favoritesApiHref(items: SavedItem[]): string | null {
  const p = [...new Set(items.filter((x) => x.kind === "project").map((x) => x.key))];
  const l = [...new Set(items.filter((x) => x.kind === "listing").map((x) => x.key))];
  if (p.length === 0 && l.length === 0) return null;
  const params = new URLSearchParams();
  if (p.length) params.set("p", p.join(","));
  if (l.length) params.set("l", l.join(","));
  return `/api/favorites?${params.toString()}`;
}

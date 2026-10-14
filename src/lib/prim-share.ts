/**
 * 🔗 太平洋新系統（PRIM）的「物件分享」連結 —— `https://prim.pacific.com.tw/s/<代碼>`
 *
 * 2026-10-14 系統擁有者：「這個新增物件的地方因為愛屋改版了，之後會換到這裡 https://prim.pacific.com.tw/s/LV5rC5XJ」。
 *
 * ## 分享頁本身讀不到東西，要打它的 API
 * 分享頁是 Next.js，物件資料全靠前端 JS 載入 —— HTML 跟 RSC payload 裡**沒有**案號、價格、地址
 * （2026-10-14 實測 45KB 的頁面裡「總價」「坪」「地址」零次），所以不能像愛屋型錄那樣抓 HTML 讀字。
 * 它的前端打的是一支**公開、不用登入**的 JSON API（從它的 JS chunk 讀出來的），這裡直接用那支：
 *
 *   GET https://prim.pacific.com.tw/api/prim/v1/app/public/house-share/<代碼>
 *   200 → { status:"success", data:{ share_code, total, items:[{
 *            obj_no:"S2862747", obj_name:"「禾盛晶綻」關連工業區旁輕屋齡2房+平車",
 *            price:"5980000.00"（元）, address_short:"臺中市梧棲區自強一街"（只到路名）,
 *            ping:"30.129000", room:"2.0", living:"2.0", bathroom:"1.0",
 *            complete_date:"2019-01-30", cover_photo:"https://pacblob.blob.core.windows.net/prim-public/…jpg",
 *            sell_rent:1, case_type:7, is_joint_sale:false }],
 *            has_unavailable_items:false, agent:{ …經紀人資料… } } }
 *   404 → { status:"error", data:null, message:"找不到此分享連結" }
 *          （分享頁上客戶看到的是「分享已失效」；它的前端把 404 與 410 都當「這份推薦已更新」）
 *
 * 🔴 **`obj_no` 就是太平洋官網的 S 編號 ＝ 我們 `match_listing` 的主鍵**（官網 API 每 30 分鐘同步進來）。
 *    分享 API 沒給的樓層／車位／座標／愛屋編號，拿 S 編號去 `match_listing` 查就有 ——
 *    那段在 `lib/prim-facts.ts` 與 `actions/map-listings.ts`。**這支檔刻意不碰資料庫**，
 *    因為 `lib/houseol-price.ts` 要 import 它，而那支檔被 client component 拿去用 `formatWan`。
 *
 * ⚠️ 一條分享連結可以包好幾筆物件（`total`）。後台要帶入的是「一筆」，多筆的分享連結一定要他指定是哪一筆，
 *    **不要自作主張拿第一筆** —— 掛錯客戶會在地圖上看到別間房子，而且不會報錯。
 * ⚠️ `agent` 裡有手機與證號，**不要存、不要往外傳**（repo 是公開的，見 learning_public_repo_no_pii）。
 * ⚠️ 判定「客戶還點得開嗎」跟愛屋同一條（見 lib/map-listing-check.ts）：只有 API 明講找不到才是 `gone`；
 *    200 但長相不對、或它自己標了「有物件已下架」→ `unknown`，不是 live、也不是 gone。
 */
import type { HouseolFacts } from "@/lib/houseol-facts";
import type { LinkCheck } from "@/lib/map-listing-check";

/** 只認這個網域；`prim.pacific.com.tw.evil.com` 這種一律不算 */
const PRIM_HOST = /^prim\.pacific\.com\.tw$/i;
/** 分享代碼長相：實測 8 碼英數（LV5rC5XJ）。範圍放寬到 6～32 碼，太短太長都不算 */
const SHARE_PATH = /^\/s\/([A-Za-z0-9]{6,32})\/?$/;
export const PRIM_API_BASE = "https://prim.pacific.com.tw/api/prim/v1/app/public/house-share";

/** 分享連結 → 代碼。不是 prim 的分享連結回 null */
export function primShareCode(href: string): string | null {
  let u: URL;
  try {
    u = new URL(String(href ?? "").trim());
  } catch {
    return null;
  }
  if (!(u.protocol === "https:" || u.protocol === "http:")) return null;
  if (!PRIM_HOST.test(u.hostname)) return null;
  const m = u.pathname.match(SHARE_PATH);
  return m ? m[1] : null;
}

/** 代碼 → 客戶看的分享頁網址（存進「物件資訊」那顆按鈕的就是這個） */
export function primShareUrl(code: string): string {
  return `https://prim.pacific.com.tw/s/${encodeURIComponent(code)}`;
}

export function primApiUrl(code: string): string {
  return `${PRIM_API_BASE}/${encodeURIComponent(code)}`;
}

export type PrimShareItem = {
  /** 太平洋官網 S 編號（＝ match_listing 主鍵） */
  objNo: string;
  title: string;
  /** 總價（萬）。API 給的是元，這裡換成萬、一位小數 */
  price: number | null;
  /** 只到路名，例「臺中市梧棲區自強一街」 */
  addressShort: string;
  /** 登記坪數 */
  ping: number | null;
  rooms: number | null;
  halls: number | null;
  baths: number | null;
  /** 完工日 "2019-01-30"；沒有就 null */
  completeDate: string | null;
  coverPhoto: string | null;
  /** sell_rent 2 是出租 */
  isRent: boolean;
};

export type PrimShare = {
  code: string;
  /** API 說這條分享包幾筆 */
  total: number;
  items: PrimShareItem[];
  /** API 自己標的「裡面有物件已下架」 */
  hasUnavailable: boolean;
};

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** 元 → 萬（一位小數）。合理範圍 50 萬～10 億，超出的多半是欄位對錯了，寧可不顯示 */
function yuanToWan(v: unknown): number | null {
  const yuan = num(v);
  if (yuan === null || yuan < 500_000 || yuan > 1_000_000_000) return null;
  return Math.round(yuan / 1000) / 10;
}

/** 分享 API 的 JSON → 乾淨的物件。長相不對回 null（呼叫端要當 unknown，不是當空的） */
export function parsePrimShare(body: unknown): PrimShare | null {
  const b = body as { status?: unknown; data?: unknown } | null;
  if (!b || typeof b !== "object" || b.status !== "success" || !b.data || typeof b.data !== "object") return null;
  const d = b.data as { share_code?: unknown; total?: unknown; items?: unknown; has_unavailable_items?: unknown };
  if (!Array.isArray(d.items)) return null;

  const items: PrimShareItem[] = [];
  for (const raw of d.items) {
    if (!raw || typeof raw !== "object") continue;
    const it = raw as Record<string, unknown>;
    const objNo = String(it.obj_no ?? "")
      .trim()
      .toUpperCase();
    // S 編號長相 S2862747；沒有編號的那一筆對不回官網資料，直接跳過
    if (!/^S\d{5,}$/.test(objNo)) continue;
    const cover = String(it.cover_photo ?? "").trim();
    const complete = String(it.complete_date ?? "").trim();
    items.push({
      objNo,
      title: String(it.obj_name ?? "").trim(),
      price: yuanToWan(it.price),
      addressShort: String(it.address_short ?? "").trim(),
      ping: num(it.ping),
      rooms: num(it.room),
      halls: num(it.living),
      baths: num(it.bathroom),
      completeDate: /^\d{4}-\d{2}-\d{2}/.test(complete) ? complete.slice(0, 10) : null,
      coverPhoto: /^https?:\/\//.test(cover) ? cover : null,
      isRent: Number(it.sell_rent) === 2,
    });
  }
  const total = num(d.total);
  return {
    code: String(d.share_code ?? "").trim(),
    total: total !== null && total >= 0 ? total : items.length,
    items,
    hasUnavailable: d.has_unavailable_items === true,
  };
}

/**
 * 「客戶點這條分享連結還看得到東西嗎」—— 純函式，給 lib/map-listing-check.ts 用。
 *
 * ⚠️ 只有 API 明講找不到（404／410）才是 `gone`。其餘一律 `unknown`：
 *    判錯一次 gone 就是叫他把還在賣的物件下架（見 learning_dead_link_returns_200）。
 */
export function classifyPrimShare(status: number, body: unknown): LinkCheck {
  if (status === 404 || status === 410) {
    return { state: "gone", note: "太平洋分享頁回「找不到此分享連結」—— 客戶點進去會看到「分享已失效」" };
  }
  if (status !== 200) return { state: "unknown", note: `太平洋分享 API 回應 ${status}` };
  const share = parsePrimShare(body);
  if (!share) return { state: "unknown", note: "太平洋分享 API 回的東西認不得（可能改版了），去點一次看看" };
  if (share.items.length === 0) return { state: "gone", note: "這條分享連結裡已經沒有任何物件" };
  if (share.hasUnavailable) {
    return { state: "unknown", note: `分享頁標示裡面有物件已下架（共 ${share.total} 筆），去點一次看看是不是這一間` };
  }
  return { state: "live", note: share.total > 1 ? `這條分享連結包 ${share.total} 筆物件` : "" };
}

const UA = "Mozilla/5.0 (compatible; weikaihouse.com/1.0; +https://weikaihouse.com)";

export type PrimFetch = { ok: true; share: PrimShare; check: LinkCheck } | { ok: false; check: LinkCheck };

/**
 * 真的去打一次分享 API。
 * - `revalidate` 有給就走 Next 的 data cache（售價、比較表用，一小時內同一條只打一次）；
 *   沒給就 no-store（連結檢查要看現在的狀態）。
 * - 失敗一律回 `ok:false` ＋ 一個 `unknown`／`gone` 的 check，**永遠不 throw**。
 */
export async function fetchPrimShare(code: string, opts: { timeoutMs?: number; revalidate?: number } = {}): Promise<PrimFetch> {
  const timeoutMs = opts.timeoutMs ?? 10000;
  try {
    const res = await fetch(primApiUrl(code), {
      headers: { "user-agent": UA, accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      ...(opts.revalidate ? { next: { revalidate: opts.revalidate } } : { cache: "no-store" as const }),
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    const check = classifyPrimShare(res.status, body);
    const share = res.status === 200 ? parsePrimShare(body) : null;
    return share ? { ok: true, share, check } : { ok: false, check };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      check: {
        state: "unknown",
        note: /timeout|abort/i.test(msg) ? `太平洋分享 API ${Math.round(timeoutMs / 1000)} 秒沒回應` : `連不上太平洋分享 API：${msg.slice(0, 80)}`,
      },
    };
  }
}

// ---------------------------------------------------------------- 顯示用的小工具

/** 「「禾盛晶綻」關連工業區旁…」→「禾盛晶綻」。標題開頭沒有引號就空字串 */
export function communityFromTitle(title: string): string {
  const m = String(title ?? "")
    .trim()
    .match(/^[「『【]([^」』】]{2,20})[」』】]/);
  return m ? m[1].trim() : "";
}

/** 完工日 → 屋齡（年，一位小數）。沒完工日或還沒完工回 null */
export function primAgeYears(completeDate: string | null, now: Date = new Date()): number | null {
  if (!completeDate) return null;
  const t = Date.parse(`${completeDate}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  const years = (now.getTime() - t) / (365.25 * 86400000);
  if (years < 0) return null;
  return Math.round(years * 10) / 10;
}

/** 「臺中市梧棲區自強一街」→「梧棲區自強一街」：地址欄只給後台自己認，縣市是多餘的 */
export function stripCity(address: string): string {
  return String(address ?? "")
    .trim()
    .replace(/^[臺台]中市/, "");
}

/**
 * 帶進「賣點」欄的一行規格。分享 API 沒有的（型態、樓層、車位、屋齡的現成數字）由呼叫端從
 * `match_listing` 補進 `extra`；補不到就不寫，**不要用猜的**。
 */
export function primPoints(
  it: PrimShareItem,
  extra: { kind?: string | null; floor?: string | null; hasParking?: boolean | null; ageYears?: number | null } = {},
): string[] {
  const age = extra.ageYears ?? primAgeYears(it.completeDate);
  const spec = [
    extra.kind || "",
    it.rooms !== null ? `${it.rooms}房${it.halls ?? 0}廳${it.baths ?? 0}衛` : "",
    it.ping !== null ? `登記 ${it.ping} 坪` : "",
    extra.floor ? `${extra.floor} 樓` : "",
    age !== null ? (age < 1 ? "屋齡未滿 1 年" : `屋齡 ${age} 年`) : "",
    extra.hasParking ? "含車位" : "",
    it.price !== null ? `總價 ${it.price} 萬` : "",
  ].filter(Boolean);
  return spec.length ? [spec.join("｜")] : [];
}

// ---------------------------------------------------------------- 比較表的九格

/** 「6/15」→ { level:"6", total:15 }；「1-3/3」「B1/14」左邊照原文。認不得 → null */
function parseFloor(raw: string | null | undefined): HouseolFacts["floor"] {
  const m = String(raw ?? "")
    .trim()
    .match(/^(\S+?)\s*\/\s*(\d+)$/);
  return m ? { level: m[1], total: Number(m[2]) } : null;
}

/** 官網同步表（match_listing）那一筆裡，比較表會用到的幾欄 */
export type PrimMatchExtra = { floor?: string | null; features?: string[] | null; type?: string | null; age?: number | null };

/**
 * 分享 API 的一筆 ＋ 官網同步表那一筆 → 比較表的九格。純函式，給 lib/prim-facts.ts 與測試用。
 * - 車位：官網有資料才回答（`features` 有「車位」→ 有、沒有 → 無）；沒官網資料 → null（「型錄未載」），不要猜成「無」。
 * - 屋齡：官網算好的數字優先；沒有就留 null，畫面會拿完工日自己算（formatAge）。
 * - 公設比／主＋附屬／含車位坪：兩邊都沒有，一律 null。
 */
export function primFactsFrom(it: PrimShareItem, m: PrimMatchExtra | null): HouseolFacts {
  const features = m?.features ?? null;
  const parkType = features?.includes("平面車位") ? "平面" : features?.includes("機械車位") ? "機械" : "";
  const facts: HouseolFacts = {
    price: it.price,
    community: communityFromTitle(it.title) || null,
    floorRaw: m?.floor?.trim() ? m.floor.trim() : null,
    floor: parseFloor(m?.floor),
    regPing: it.ping,
    parkPing: null,
    mainPing: null,
    attPing: null,
    mainAttPing: null,
    layout: it.rooms !== null ? { room: it.rooms, hall: it.halls ?? 0, bath: it.baths ?? 0 } : null,
    parking: features ? { has: features.includes("車位"), type: parkType } : null,
    publicRatio: null,
    completion: it.completeDate ? it.completeDate.replace(/-/g, "/") : null,
    age: m?.age != null && m.age > 0 ? `${m.age} 年` : null,
    kind: m?.type?.trim() ? m.type.trim() : null,
    fieldCount: 0,
  };
  facts.fieldCount = [facts.price, facts.community, facts.floor, facts.regPing, facts.layout, facts.parking, facts.completion, facts.age, facts.kind].filter(
    (v) => v !== null,
  ).length;
  return facts;
}

/**
 * 🔑 租屋快搜（2026-10-26 系統擁有者：「在這個配對裡面增加租屋的物件，一樣從太平洋官網抓取以下店別的物件，
 * 但不導入外部連結，直接在我的網站裡產出物件資料（跟買賣物件相同，但不用作貸款試算）」）
 *
 * 租屋跟買賣走同一張 match_listing（deal 欄：sale／rent）、同一支官網查詢 API（Type 2 是租）、同一套評分引擎 ——
 * 只是價格的單位是「元／月」，多一個「出租型態」（官網的 rentTypeName：整層(棟)住家／獨立套房／店面商辦…，存在 usage_type）。
 * 這裡是純函式：整理查詢條件、把物件清單變成表單選項、跑配對。不碰資料庫、不碰網路，check:match 直接載來測。
 *
 * 跟買方配對刻意不一樣的地方：
 *   ・租屋查詢**不存成買方條件、不推播** —— 買方條件的預算是「萬」、租金是「元」，混在同一筆會把買方的新物件通知弄壞
 *     （沒填預算的買方會收到一堆租屋）。租屋物件只在 /match 的租屋模式與 /rent/<編號> 出現。
 *   ・結果卡沒有「算月付金」（他說的「不用作貸款試算」）；「看這戶」進站內的 /rent/<編號>，不外連官網。
 *
 * ⚠️ 這個檔刻意不 import 任何 "@/..." 的東西：scripts/check-match.mjs 用 node 直接載它跑測試。
 */
import { rankListings, type MatchableListing, type Ranked } from "./matcher";

export type Deal = "sale" | "rent";

/** 租金上限／下限的選項（元／月）。海線六家店的出租物件 2026-10-26 實測 4,000～550,000、中位數 22,000 */
export const RENT_TIERS = [5000, 8000, 10000, 12000, 15000, 20000, 25000, 30000, 40000, 50000, 80000, 100000, 150000] as const;

/** 26000 → 「26,000 元／月」 */
export function formatRent(n: number): string {
  return `${Math.round(Number(n) || 0).toLocaleString("zh-TW")} 元／月`;
}

/** 買賣寫「萬」、出租寫「元／月」—— 卡片、預約、LINE 通知都用這一個，別各寫各的 */
export function formatDealPrice(price: number, deal: Deal | string | null | undefined): string {
  return deal === "rent" ? formatRent(price) : `${Number(price).toLocaleString("zh-TW")} 萬`;
}

export type RentQuery = {
  city: string;
  districts: string[];
  /** 元／月，0 = 不限 */
  rentMin: number;
  rentMax: number;
  /** 4 = 「4 房以上」；空 = 不限 */
  roomsList: number[];
  /** 型態（電梯大樓／透天厝／店面…），空 = 不限 */
  types: string[];
  /** 出租型態（整層(棟)住家／獨立套房／店面商辦…），空 = 不限 */
  rentTypes: string[];
  /** 坪，0 = 不限 */
  sizeMin: number;
  sizeMax: number;
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

const strList = (v: unknown, max: number): string[] =>
  Array.isArray(v) ? [...new Set(v.map((s) => String(s).trim()).filter(Boolean))].slice(0, max) : [];

/** 把前端送來的任何東西整理成合法的查詢（缺欄位、型別不對、上下限顛倒都不會炸） */
export function normalizeRentQuery(input: unknown): RentQuery {
  const p = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  let rentMin = num(p.rentMin);
  let rentMax = num(p.rentMax);
  if (rentMin && rentMax && rentMax < rentMin) [rentMin, rentMax] = [rentMax, rentMin];
  let sizeMin = num(p.sizeMin);
  let sizeMax = num(p.sizeMax);
  if (sizeMin && sizeMax && sizeMax < sizeMin) [sizeMin, sizeMax] = [sizeMax, sizeMin];
  const roomsRaw = Array.isArray(p.roomsList) ? p.roomsList : [];
  const roomsList = [...new Set(roomsRaw.map((v) => Math.trunc(Number(v))).filter((v) => v >= 1 && v <= 4))].sort((a, b) => a - b);
  return {
    city: String(p.city ?? "")
      .trim()
      .slice(0, 16),
    districts: strList(p.districts, 20),
    rentMin,
    rentMax,
    roomsList,
    types: strList(p.types, 10),
    rentTypes: strList(p.rentTypes, 10),
    sizeMin,
    sizeMax,
  };
}

export type RentMetaListing = { city: string; district: string; type: string; usageType: string };

export type RentMeta = {
  cities: { city: string; districts: string[] }[];
  types: string[];
  rentTypes: string[];
  tiers: readonly number[];
  /** 目前出租中的總數 */
  total: number;
};

/** 表單選項從「目前出租中的物件」整理出來（多的排前面）；一筆都沒有就是空清單，表單至少還能「不限」 */
export function rentMeta(listings: RentMetaListing[]): RentMeta {
  const ranked = (keys: string[]): string[] => {
    const m = new Map<string, number>();
    for (const k of keys) if (k) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  };
  const byCity = new Map<string, string[]>();
  for (const l of listings) {
    if (!l.city) continue;
    if (!byCity.has(l.city)) byCity.set(l.city, []);
    byCity.get(l.city)!.push(l.district);
  }
  return {
    cities: [...byCity].sort((a, b) => b[1].length - a[1].length).map(([city, ds]) => ({ city, districts: ranked(ds) })),
    types: ranked(listings.map((l) => l.type)),
    rentTypes: ranked(listings.map((l) => l.usageType)),
    tiers: RENT_TIERS,
    total: listings.length,
  };
}

export type RentSearchable = MatchableListing & { id: string; price: number; usageType: string };

/**
 * 跑配對。租金下限與出租型態先篩掉（評分引擎沒有這兩項），其餘（區域、租金上限＝預算、房數、坪數、型態）交給 rankListings ——
 * 所以結果卡上的「配對度」「符合／不符」跟買賣用的是同一套說法，而且一樣**不符合的不列出來**。
 * 排序：分數高的在前、同分租金低的在前（rankListings 本來的規則）。
 */
export function searchRentals<T extends RentSearchable>(
  queryInput: unknown,
  listings: T[],
  { limit = 40 }: { limit?: number } = {},
): { matched: number; matches: Ranked<T>[]; summary: string } {
  const q = normalizeRentQuery(queryInput);
  const pool = listings.filter((l) => (q.rentMin ? l.price >= q.rentMin : true) && (q.rentTypes.length ? q.rentTypes.includes(l.usageType) : true));
  const pref = { city: q.city, districts: q.districts, budgetMax: q.rentMax, roomsList: q.roomsList, sizeMin: q.sizeMin, sizeMax: q.sizeMax, types: q.types };
  const ranked = rankListings(pref, pool, { limit: pool.length || 1 });
  return { matched: ranked.length, matches: ranked.slice(0, limit), summary: describeRentQuery(q) };
}

/** 把查詢濃縮成一行中文（結果頁上面那一行） */
export function describeRentQuery(input: unknown): string {
  const q = normalizeRentQuery(input);
  const money = (n: number) => n.toLocaleString("zh-TW");
  const parts: string[] = [];
  if (q.districts.length) parts.push(`${q.city}${q.districts.join("/")}`);
  else if (q.city) parts.push(q.city);
  if (q.rentMin && q.rentMax) parts.push(`租金 ${money(q.rentMin)}–${money(q.rentMax)} 元`);
  else if (q.rentMax) parts.push(`租金 ${money(q.rentMax)} 元內`);
  else if (q.rentMin) parts.push(`租金 ${money(q.rentMin)} 元起`);
  if (q.roomsList.length) parts.push(q.roomsList.map((r) => (r >= 4 ? "4 房以上" : `${r} 房`)).join("/"));
  if (q.rentTypes.length) parts.push(q.rentTypes.join("/"));
  if (q.types.length) parts.push(q.types.join("/"));
  if (q.sizeMin || q.sizeMax) parts.push(`${q.sizeMin || "不限"}–${q.sizeMax || "不限"} 坪`);
  return parts.join(" · ") || "不限條件";
}

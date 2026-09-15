/**
 * 買方條件 × 物件 的配對評分引擎 —— 純函式，不碰資料庫、不碰網路
 *
 * 加權總分 100。買方沒填的項目視為「不限」直接給滿分；有填才比對。
 * 每一筆物件都會回 reasons（符合）與 misses（不符）的中文說明，前台直接顯示給買方，
 * 讓「為什麼推薦這間」看得見 —— 客戶信任分數的前提是看得懂分數怎麼來的。
 *
 * ⚠️ 這個檔刻意不 import 任何 "@/..." 的東西：scripts/check-match.mjs 用 node 直接載它跑測試。
 */

export const WEIGHTS = {
  district: 28, // 區域
  budget: 24, // 預算
  rooms: 14, // 房數
  size: 14, // 坪數
  type: 10, // 類型
  age: 4, // 屋齡
  features: 6, // 其他需求（車位、電梯、近捷運…）
} as const;

/** 指定縣市時，其他縣市的物件最高只能拿這個分數（不會被推薦、也不會自動推播） */
export const OTHER_CITY_CAP = 45;

export type Preference = {
  city: string;
  districts: string[];
  /** 萬元，0 = 不限 */
  budgetMax: number;
  /** 0 = 不限 */
  rooms: number;
  /** 坪，0 = 不限 */
  sizeMin: number;
  sizeMax: number;
  types: string[];
  /** 年，0 = 不限 */
  maxAge: number;
  features: string[];
};

/** 評分需要的物件欄位（match_listing 的一部分） */
export type MatchableListing = {
  city: string;
  district: string;
  price: number;
  rooms: number;
  size: number;
  type: string;
  age: number;
  features: string[];
};

export type ScoreResult = { score: number; reasons: string[]; misses: string[] };

const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const strList = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean);
  if (typeof v === "string" && v.trim()) return v.split(/[,，、\s]+/).map((s) => s.trim()).filter(Boolean);
  return [];
};

/** 把前端送來的任何東西整理成合法的 Preference（缺欄位、型別不對都不會炸） */
export function normalizePreference(input: unknown): Preference {
  const p = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return {
    city: String(p.city ?? "").trim().slice(0, 16),
    districts: strList(p.districts).slice(0, 20),
    budgetMax: num(p.budgetMax),
    rooms: num(p.rooms),
    sizeMin: num(p.sizeMin),
    sizeMax: num(p.sizeMax),
    types: strList(p.types).slice(0, 10),
    maxAge: num(p.maxAge),
    features: strList(p.features).slice(0, 10),
  };
}

const pct = (ratio: number) => `${Math.round((ratio - 1) * 100)}%`;

export function scoreListing(prefInput: Preference | unknown, listing: MatchableListing): ScoreResult {
  const pref = normalizePreference(prefInput);
  let score = 0;
  const reasons: string[] = [];
  const misses: string[] = [];

  // 區域
  if (pref.districts.length) {
    if (pref.districts.includes(listing.district)) {
      score += WEIGHTS.district;
      reasons.push(`區域符合（${listing.district}）`);
    } else if (pref.city && listing.city === pref.city) {
      score += Math.round(WEIGHTS.district * 0.4);
      misses.push(`同縣市但不在指定行政區（${listing.district}）`);
    } else misses.push(`區域不符（${listing.city}${listing.district}）`);
  } else if (pref.city) {
    if (listing.city === pref.city) {
      score += WEIGHTS.district;
      reasons.push(`縣市符合（${listing.city}）`);
    } else misses.push(`縣市不符（${listing.city}）`);
  } else score += WEIGHTS.district;

  // 預算
  if (pref.budgetMax > 0) {
    const ratio = listing.price / pref.budgetMax;
    if (ratio <= 1) {
      score += WEIGHTS.budget;
      reasons.push("價格在預算內");
    } else if (ratio <= 1.1) {
      score += Math.round(WEIGHTS.budget * 0.6);
      misses.push(`略高於預算 ${pct(ratio)}`);
    } else if (ratio <= 1.2) {
      score += Math.round(WEIGHTS.budget * 0.25);
      misses.push(`高於預算 ${pct(ratio)}`);
    } else misses.push(`超出預算 ${pct(ratio)}`);
  } else score += WEIGHTS.budget;

  // 房數
  if (pref.rooms > 0) {
    const diff = Math.abs(num(listing.rooms) - pref.rooms);
    if (diff === 0) {
      score += WEIGHTS.rooms;
      reasons.push(`房數符合（${listing.rooms} 房）`);
    } else if (diff === 1) {
      score += Math.round(WEIGHTS.rooms * 0.5);
      misses.push(`房數差 1 房（${listing.rooms} 房）`);
    } else misses.push(`房數不符（${listing.rooms} 房）`);
  } else score += WEIGHTS.rooms;

  // 坪數
  if (pref.sizeMin > 0 || pref.sizeMax > 0) {
    const lo = pref.sizeMin || 0;
    const hi = pref.sizeMax || Infinity;
    const s = num(listing.size);
    if (s >= lo && s <= hi) {
      score += WEIGHTS.size;
      reasons.push(`坪數符合（${listing.size} 坪）`);
    } else if (s >= lo * 0.85 && s <= hi * 1.15) {
      score += Math.round(WEIGHTS.size * 0.5);
      misses.push(`坪數略有出入（${listing.size} 坪）`);
    } else misses.push(`坪數不符（${listing.size} 坪）`);
  } else score += WEIGHTS.size;

  // 類型
  if (pref.types.length) {
    if (pref.types.includes(listing.type)) {
      score += WEIGHTS.type;
      reasons.push(`類型符合（${listing.type}）`);
    } else misses.push(`類型不符（${listing.type}）`);
  } else score += WEIGHTS.type;

  // 屋齡
  if (pref.maxAge > 0) {
    const age = num(listing.age);
    if (age <= pref.maxAge) {
      score += WEIGHTS.age;
      reasons.push(age < 1 ? "新成屋" : `屋齡 ${age} 年符合`);
    } else if (age <= pref.maxAge + 5) {
      score += Math.round(WEIGHTS.age * 0.5);
      misses.push(`屋齡略高（${age} 年）`);
    } else misses.push(`屋齡過高（${age} 年）`);
  } else score += WEIGHTS.age;

  // 其他需求：按符合比例給分
  if (pref.features.length) {
    const has = listing.features || [];
    const have = pref.features.filter((f) => has.includes(f));
    const lack = pref.features.filter((f) => !has.includes(f));
    score += Math.round((WEIGHTS.features * have.length) / pref.features.length);
    if (have.length) reasons.push(`具備需求：${have.join("、")}`);
    if (lack.length) misses.push(`缺少：${lack.join("、")}`);
  } else score += WEIGHTS.features;

  // 硬性規則：有指定縣市但物件在其他縣市 → 封頂，不會被推薦、也不會自動推播
  if (pref.city && listing.city !== pref.city) score = Math.min(score, OTHER_CITY_CAP);

  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons, misses };
}

export type Ranked<T> = { listing: T } & ScoreResult;

/** 對一批物件評分並排序（分數高→低，同分價格低者優先） */
export function rankListings<T extends MatchableListing>(
  pref: Preference | unknown,
  listings: T[],
  { threshold = 0, limit = 50 }: { threshold?: number; limit?: number } = {},
): Ranked<T>[] {
  return listings
    .map((listing) => ({ listing, ...scoreListing(pref, listing) }))
    .filter((m) => m.score >= threshold)
    .sort((a, b) => b.score - a.score || a.listing.price - b.listing.price)
    .slice(0, limit);
}

/** 把條件濃縮成一行中文，畫面摘要與 LINE 訊息共用 */
export function describePreference(prefInput: Preference | unknown): string {
  const p = normalizePreference(prefInput);
  const parts: string[] = [];
  if (p.districts.length) parts.push(`${p.city}${p.districts.join("/")}`);
  else if (p.city) parts.push(p.city);
  if (p.budgetMax) parts.push(`預算 ${p.budgetMax.toLocaleString("zh-TW")} 萬內`);
  if (p.rooms) parts.push(`${p.rooms} 房`);
  if (p.sizeMin || p.sizeMax) parts.push(`${p.sizeMin || "不限"}–${p.sizeMax || "不限"} 坪`);
  if (p.types.length) parts.push(p.types.join("/"));
  if (p.maxAge) parts.push(`屋齡 ${p.maxAge} 年內`);
  if (p.features.length) parts.push(p.features.join("、"));
  return parts.join(" · ") || "不限條件";
}

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
  district: 26, // 區域
  budget: 22, // 預算
  rooms: 12, // 房數
  size: 12, // 建物坪數
  type: 10, // 類型（買方有指定土地類別時，這 10 分拆一半給類別）
  age: 4, // 屋齡
  features: 5, // 其他需求（平面車位、電梯、近捷運…）
  floor: 5, // 希望樓層
  landSize: 4, // 土地坪數
} as const;

/**
 * 希望樓層的級距（2026-09-18 他指定的四段）。邊界兩邊都含 ——
 * 10 樓同時算「5–10 樓」也算「10–15 樓」，買方選哪一段都看得到它。
 */
export const FLOOR_RANGES: Record<string, { min: number; max: number; label: string }> = {
  low: { min: 1, max: 5, label: "5 樓以下" },
  mid: { min: 5, max: 10, label: "5–10 樓" },
  high: { min: 10, max: 15, label: "10–15 樓" },
  top: { min: 15, max: Infinity, label: "15 樓以上" },
};

/**
 * 屋齡級距（2026-09-18 他指定的五段）。跟樓層一樣是**真的區間**：
 * 選「5–10 年」時新成屋不會出現，這跟舊的「幾年以內」語意不同。
 *
 * ⚠️ 20–30 年這一段他沒有列，所以目前選不到；要補就在這裡加一行，
 *    表單與 meta API 會自己跟著長出來。
 */
export const AGE_RANGES: Record<string, { min: number; max: number; label: string }> = {
  a0: { min: 0, max: 5, label: "0–5 年" },
  a5: { min: 5, max: 10, label: "5–10 年" },
  a10: { min: 10, max: 15, label: "10–15 年" },
  a15: { min: 15, max: 20, label: "15–20 年" },
  a30: { min: 30, max: Infinity, label: "30 年以上" },
};

/** 土地類別的四個選項（只有買方勾了「土地」才會用到） */
export const LAND_CATEGORIES = ["農地", "建地", "農建地", "商業地"] as const;

/**
 * 「14/15」→ 14；「1-4/4」→ 1（透天從最低那層算）；「/」或空 → 0（店網沒給，例如土地）
 */
export function floorOf(floor: string | null | undefined): number {
  const head = String(floor ?? "").split("/")[0];
  const m = head.match(/\d+/);
  return m ? Number(m[0]) : 0;
}

/**
 * 店網的「類別」→ 四個土地類別之一，對不上回空字串。
 *
 * 實際值長這樣：土地:農地／土地:建地／土地:住宅用地／土地:農建地／土地:商業地／
 * 土地:農牧用地／土地:其他。**農建地要先判斷**，不然「農建地」會被「農」先接走。
 */
export function landCategoryOf(usageType: string | null | undefined): string {
  const u = String(usageType ?? "");
  if (!u.includes("土地")) return "";
  if (u.includes("農建")) return "農建地";
  if (u.includes("商業")) return "商業地";
  if (u.includes("建地") || u.includes("住宅用地") || u.includes("建築")) return "建地";
  if (u.includes("農")) return "農地";
  return "";
}

/**
 * 買方勾的需求，物件算不算符合。
 *
 * 店網只給一個「車位」標籤，平面／機械要從標題猜（海線幾乎都寫「平車」，
 * 目前 278 筆裡沒有一筆寫機械）。所以：買方要「平面車位」時，物件標「平面車位」
 * 或只標「車位」都算符合；要「機械車位」則物件必須明講，不能拿「車位」湊 ——
 * 少推薦好過推錯。
 */
function featureSatisfied(want: string, has: string[]): boolean {
  if (has.includes(want)) return true;
  if (want === "平面車位") return has.includes("車位") && !has.includes("機械車位");
  return false;
}

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
  /** 屋齡級距，AGE_RANGES 的 key；"" = 不限。2026-09-18 起表單送的是這個 */
  ageRange: string;
  /**
   * 年，0 = 不限。**舊欄位**：2026-09-18 之前表單送的是「幾年以內」。
   * 資料庫裡還有買方存著它，所以評分仍然認 —— 沒有 ageRange 時才會用到。
   */
  maxAge: number;
  features: string[];
  /** 希望樓層，FLOOR_RANGES 的 key；"" = 不限 */
  floor: string;
  /** 土地坪數，坪，0 = 不限 */
  landMin: number;
  landMax: number;
  /** 土地類別（農地／建地／農建地／商業地）；只有勾了「土地」的買方才會有 */
  landCategories: string[];
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
  /** 店網原字串，例如「14/15」「1-4/4」；空的代表沒有樓層（土地） */
  floor: string;
  landSize: number;
  /** 店網的「類別」，例如「住家」「土地:農地」 */
  usageType: string;
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
    ageRange: AGE_RANGES[String(p.ageRange ?? "")] ? String(p.ageRange) : "",
    maxAge: num(p.maxAge),
    features: strList(p.features).slice(0, 10),
    floor: FLOOR_RANGES[String(p.floor ?? "")] ? String(p.floor) : "",
    landMin: num(p.landMin),
    landMax: num(p.landMax),
    landCategories: strList(p.landCategories)
      .filter((c) => (LAND_CATEGORIES as readonly string[]).includes(c))
      .slice(0, 4),
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

  // 類型。買方指定了土地類別時，這 10 分拆成一半類型、一半類別 ——
  // 他要的是「農地」，一塊建地就算同樣是土地也不該拿滿分。
  const wantCategory = pref.landCategories.length > 0;
  const typeWeight = wantCategory ? Math.round(WEIGHTS.type / 2) : WEIGHTS.type;
  if (pref.types.length) {
    if (pref.types.includes(listing.type)) {
      score += typeWeight;
      reasons.push(`類型符合（${listing.type}）`);
    } else misses.push(`類型不符（${listing.type}）`);
  } else score += typeWeight;

  if (wantCategory) {
    const cat = landCategoryOf(listing.usageType);
    if (cat && pref.landCategories.includes(cat)) {
      score += WEIGHTS.type - typeWeight;
      reasons.push(`土地類別符合（${cat}）`);
    } else misses.push(cat ? `土地類別不符（${cat}）` : "不是土地物件");
  }

  // 屋齡。兩套規則並存：
  //   ageRange → 真的區間（現在的表單），選 5–10 年時新成屋不算符合
  //   maxAge   → 幾年以內（2026-09-18 之前存下來的買方條件），不接著認的話他們的條件會靜靜失效
  // 店網沒給屋齡時 age 會是 0（土地那些），那是「資料沒有」不是「屋齡 0」——
  // 真的新成屋在解析時記成 0.5，兩者分得開。
  const listingAge = num(listing.age);
  if (pref.ageRange) {
    const r = AGE_RANGES[pref.ageRange];
    if (listingAge <= 0) {
      score += Math.round(WEIGHTS.age * 0.5);
      misses.push("沒有屋齡資料");
    } else if (listingAge >= r.min && listingAge <= r.max) {
      score += WEIGHTS.age;
      reasons.push(listingAge < 1 ? `新成屋（${r.label}）` : `屋齡 ${listingAge} 年符合`);
    } else misses.push(`屋齡不符（${listingAge} 年）`);
  } else if (pref.maxAge > 0) {
    if (listingAge <= pref.maxAge) {
      score += WEIGHTS.age;
      reasons.push(listingAge < 1 ? "新成屋" : `屋齡 ${listingAge} 年符合`);
    } else if (listingAge <= pref.maxAge + 5) {
      score += Math.round(WEIGHTS.age * 0.5);
      misses.push(`屋齡略高（${listingAge} 年）`);
    } else misses.push(`屋齡過高（${listingAge} 年）`);
  } else score += WEIGHTS.age;

  // 希望樓層。店網沒給樓層的（土地那 20 筆是「/」）不硬扣到 0，給一半 ——
  // 那是「資料沒有」不是「不符合」，兩件事混在一起會把整批土地洗掉。
  if (pref.floor) {
    const range = FLOOR_RANGES[pref.floor];
    const f = floorOf(listing.floor);
    if (f <= 0) {
      score += Math.round(WEIGHTS.floor * 0.5);
      misses.push("沒有樓層資料");
    } else if (f >= range.min && f <= range.max) {
      score += WEIGHTS.floor;
      reasons.push(`樓層符合（${f} 樓）`);
    } else misses.push(`樓層不符（${f} 樓）`);
  } else score += WEIGHTS.floor;

  // 土地坪數。跟建物坪數同一套寬容度（差 15% 以內給一半）。
  if (pref.landMin > 0 || pref.landMax > 0) {
    const lo = pref.landMin || 0;
    const hi = pref.landMax || Infinity;
    const s = num(listing.landSize);
    if (s > 0 && s >= lo && s <= hi) {
      score += WEIGHTS.landSize;
      reasons.push(`土地坪數符合（${s} 坪）`);
    } else if (s > 0 && s >= lo * 0.85 && s <= hi * 1.15) {
      score += Math.round(WEIGHTS.landSize * 0.5);
      misses.push(`土地坪數略有出入（${s} 坪）`);
    } else misses.push(s > 0 ? `土地坪數不符（${s} 坪）` : "沒有土地坪數資料");
  } else score += WEIGHTS.landSize;

  // 其他需求：按符合比例給分
  if (pref.features.length) {
    const has = listing.features || [];
    const have = pref.features.filter((f) => featureSatisfied(f, has));
    const lack = pref.features.filter((f) => !featureSatisfied(f, has));
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
  if (p.ageRange && AGE_RANGES[p.ageRange]) parts.push(`屋齡 ${AGE_RANGES[p.ageRange].label}`);
  else if (p.maxAge) parts.push(`屋齡 ${p.maxAge} 年內`);
  if (p.floor && FLOOR_RANGES[p.floor]) parts.push(FLOOR_RANGES[p.floor].label);
  if (p.landMin || p.landMax) parts.push(`地坪 ${p.landMin || "不限"}–${p.landMax || "不限"} 坪`);
  if (p.landCategories.length) parts.push(p.landCategories.join("/"));
  if (p.features.length) parts.push(p.features.join("、"));
  return parts.join(" · ") || "不限條件";
}

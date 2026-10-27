/**
 * 購屋條件表單的狀態與換算 —— 買方自己填的 /match 跟後台「代客建檔」共用。
 *
 * 表單裡的數字欄位用**字串**存（輸入框要能留白，不能顯示 0），送 API 前用 toApiPreference() 轉成數字；
 * 從資料庫讀回來的條件用 toPrefState() 轉回表單狀態。兩個方向都在這裡，加欄位改這一處。
 *
 * ⚠️ 這個檔不能 import 任何伺服器端的東西（prisma、config…）：兩個 client component 都載它，
 *    scripts/check-match.mjs 也直接用 node 跑它。型別 import 沒關係，編譯時會被拿掉。
 */
import type { MatchMetaPayload } from "@/lib/match/meta";

/** /api/match/meta 回的選項（後台是伺服器端直接算好塞進來，同一個形狀） */
export type MatchMeta = MatchMetaPayload;

/** 資料庫存的購屋條件（GET /api/match/me?k=… 回的、後台讀出來的） */
export type ApiPreference = {
  /** 買房／租屋（2026-10-26）。租屋：budgetMax 是元／月、types 是出租型態。舊資料沒有這欄 → 買房 */
  deal?: "sale" | "rent";
  city?: string;
  districts?: string[];
  budgetMax?: number;
  /** 2026-09-25 起的可複選房數。4 = 「4 房以上」 */
  roomsList?: number[];
  /** 之前的單選房數，資料庫裡還有舊買方存著，只在沒有 roomsList 時當備援 */
  rooms?: number;
  sizeMin?: number;
  sizeMax?: number;
  types?: string[];
  /** 屋齡區間（年），0 = 不限。2026-10-02 起表單送的是這兩個 */
  ageMin?: number;
  ageMax?: number;
  /** 2026-09-18～10-02 的固定五段（a0…a30），舊買方還存著；進表單時轉成上下限 */
  ageRange?: string;
  /** 2026-09-18 之前存的舊欄位「幾年以內」；進表單時轉成上限 */
  maxAge?: number;
  features?: string[];
  floor?: string;
  landMin?: number;
  landMax?: number;
  landCategories?: string[];
};

/** 表單狀態。數字欄位是字串，空字串 = 不限 */
export type PrefState = {
  /** 買房／租屋（2026-10-26）。租屋：budgetMax 是元／月；types 跟買房同一組型態（2026-10-27 起） */
  deal: "sale" | "rent";
  city: string;
  districts: string[];
  budgetMax: string;
  /** 可複選；空陣列 = 不限。4 代表「4 房以上」 */
  roomsList: number[];
  sizeMin: string;
  sizeMax: string;
  types: string[];
  /** 屋齡區間（年）；空字串 = 不限 */
  ageMin: string;
  ageMax: string;
  features: string[];
  floor: string;
  landMin: string;
  landMax: string;
  landCategories: string[];
};

export const EMPTY_PREF: PrefState = {
  deal: "sale",
  city: "",
  districts: [],
  budgetMax: "",
  roomsList: [],
  sizeMin: "",
  sizeMax: "",
  types: [],
  ageMin: "",
  ageMax: "",
  features: [],
  floor: "",
  landMin: "",
  landMax: "",
  landCategories: [],
};

/** 土地專屬的欄位只有勾了「土地」才出現，也只有那時候才送出去 */
export const LAND_TYPE = "土地";

/** 讀不到 /api/match/meta 時房數還是給得出來（不靠資料庫），其餘留空讓表單至少能用「不限」配對 */
export const ROOMS_FALLBACK = [
  { value: 1, label: "1 房" },
  { value: 2, label: "2 房" },
  { value: 3, label: "3 房" },
  { value: 4, label: "4 房以上" },
];

/** 讀不到 /api/match/meta 時屋齡的兩個下拉還是給得出來（跟 matcher 的 AGE_OPTIONS 同一份數字） */
export const AGES_FALLBACK = [1, 3, 5, 10, 15, 20, 25, 30, 40, 50].map((y) => ({ value: y, label: `${y} 年` }));

export const EMPTY_META: MatchMeta = {
  cities: [],
  rooms: ROOMS_FALLBACK,
  types: [],
  features: [],
  floors: [],
  ages: AGES_FALLBACK,
  landCategories: [],
  threshold: 60,
  addFriendUrl: "",
};

export function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

/** 勾／取消類型。取消「土地」時順手把土地專屬的欄位清空，不然藏起來的值還會跟著送出去。 */
export function toggleTypeIn(p: PrefState, t: string): PrefState {
  const types = toggle(p.types, t);
  if (t === LAND_TYPE && !types.includes(LAND_TYPE)) {
    return { ...p, types, landCategories: [], landMin: "", landMax: "" };
  }
  return { ...p, types };
}

export const wantsLand = (p: PrefState): boolean => p.types.includes(LAND_TYPE);

/**
 * 切換買房／租屋（2026-10-26）。預算單位不同（萬 vs 元／月），切換時清掉，免得帶著錯的單位送出去；
 * 土地類別／地坪那組也清（租屋沒有這組，欄位藏起來）。「類型」兩邊同一組（2026-10-27 起），勾好的留著。
 */
export function setDealIn(p: PrefState, deal: "sale" | "rent"): PrefState {
  if (p.deal === deal) return p;
  return { ...p, deal, budgetMax: "", landCategories: [], landMin: "", landMax: "" };
}

/** 2026-09-18～10-02 的固定五段，舊買方的條件還存著這些 key；進表單時換成上下限（0 = 不限） */
const LEGACY_AGE_RANGES: Record<string, [number, number]> = { a0: [0, 5], a5: [5, 10], a10: [10, 15], a15: [15, 20], a30: [30, 0] };

/** 資料庫的屋齡條件 → 表單的兩個下拉。新格式直接用；舊的 ageRange／maxAge 轉過來，不然他回來改條件會看到空白 */
function agePrefState(p: ApiPreference): { ageMin: string; ageMax: string } {
  const numText = (v: number | undefined) => (Number(v) > 0 ? String(v) : "");
  if (Number(p.ageMin) > 0 || Number(p.ageMax) > 0) return { ageMin: numText(p.ageMin), ageMax: numText(p.ageMax) };
  const legacy = typeof p.ageRange === "string" ? LEGACY_AGE_RANGES[p.ageRange] : undefined;
  if (legacy) return { ageMin: numText(legacy[0]), ageMax: numText(legacy[1]) };
  return { ageMin: "", ageMax: numText(p.maxAge) };
}

/** 資料庫存的條件 → 表單狀態。0 代表「不限」，輸入框要留白而不是顯示 0。 */
export function toPrefState(p: ApiPreference | null | undefined): PrefState {
  if (!p) return EMPTY_PREF;
  const numText = (v: number | undefined) => (Number(v) > 0 ? String(v) : "");
  const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const roomsList = Array.isArray(p.roomsList) ? p.roomsList.map(Number).filter((n) => n >= 1 && n <= 4) : [];
  return {
    deal: p.deal === "rent" ? "rent" : "sale",
    city: p.city ?? "",
    districts: strList(p.districts),
    budgetMax: numText(p.budgetMax),
    // 舊買方存的是單選的 rooms，轉成清單，不然他回來改條件會看到空白
    roomsList: roomsList.length ? roomsList : Number(p.rooms) > 0 ? [Math.min(4, Math.trunc(Number(p.rooms)))] : [],
    sizeMin: numText(p.sizeMin),
    sizeMax: numText(p.sizeMax),
    types: strList(p.types),
    ...agePrefState(p),
    features: strList(p.features),
    floor: typeof p.floor === "string" ? p.floor : "",
    landMin: numText(p.landMin),
    landMax: numText(p.landMax),
    landCategories: strList(p.landCategories),
  };
}

/** 表單狀態 → 要送給 /api/match/search 或存進資料庫的條件 */
export function toApiPreference(p: PrefState): Required<ApiPreference> {
  // 租屋（2026-10-26）不看屋齡、樓層、其他需求：欄位藏起來了，值不能跟著送（店官網 type=rent 吃到 ageMin 會整批排除）
  const rent = p.deal === "rent";
  // 土地類別／地坪只有買房勾了「土地」才送：租屋那組欄位藏起來（出租物件的 usageType 是出租型態，沒有農地建地那種細分）
  const land = wantsLand(p) && !rent;
  return {
    deal: p.deal,
    city: p.city,
    districts: p.districts,
    budgetMax: Number(p.budgetMax) || 0,
    roomsList: p.roomsList,
    // 舊欄位歸零：表單已經改成清單，存著舊值會讓 normalizePreference 在清單是空的時候又把它撿回來
    rooms: 0,
    sizeMin: Number(p.sizeMin) || 0,
    sizeMax: Number(p.sizeMax) || 0,
    types: p.types,
    ageMin: rent ? 0 : Number(p.ageMin) || 0,
    ageMax: rent ? 0 : Number(p.ageMax) || 0,
    // 舊欄位歸零：表單已經改成上下限，之前存的五段／「幾年以內」就不該再跟著跑
    ageRange: "",
    maxAge: 0,
    features: rent ? [] : p.features,
    floor: rent ? "" : p.floor,
    // 沒勾土地就不送土地條件 —— 欄位藏起來了，值還跟著跑會變成看不見的篩選器
    landMin: land ? Number(p.landMin) || 0 : 0,
    landMax: land ? Number(p.landMax) || 0 : 0,
    landCategories: land ? p.landCategories : [],
  };
}

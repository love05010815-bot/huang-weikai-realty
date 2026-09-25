/**
 * /match 表單的選項 —— /api/match/meta（買方那邊）跟後台「代客建檔」的表單共用這一份。
 *
 * 兩邊一定要是同一份：他在後台幫客戶勾的選項，跟客戶自己點開連結看到的必須一模一樣，
 * 不然條件存進去、客戶那邊卻顯示不出來。
 * 縣市／行政區是從在售物件整理的；資料庫連不上就回空清單，表單至少還能用「不限」配對。
 */
import { MATCH, MATCH_FEATURES, MATCH_TYPES } from "@/config/match";
import { addFriendUrl } from "./line";
import { AGE_RANGES, FLOOR_RANGES, LAND_CATEGORIES, ROOM_OPTIONS } from "./matcher";
import { getMatchMeta } from "./store";

export type MatchMetaPayload = {
  cities: { city: string; districts: string[] }[];
  /** 房數選項，value 4 = 「4 房以上」 */
  rooms: { value: number; label: string }[];
  types: readonly string[];
  features: readonly string[];
  floors: { value: string; label: string }[];
  ages: { value: string; label: string }[];
  landCategories: readonly string[];
  threshold: number;
  addFriendUrl: string;
};

export async function buildMatchMeta(): Promise<MatchMetaPayload> {
  const base = {
    rooms: ROOM_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    types: MATCH_TYPES,
    features: MATCH_FEATURES,
    floors: Object.entries(FLOOR_RANGES).map(([value, r]) => ({ value, label: r.label })),
    ages: Object.entries(AGE_RANGES).map(([value, r]) => ({ value, label: r.label })),
    landCategories: LAND_CATEGORIES,
    threshold: MATCH.threshold,
    addFriendUrl: addFriendUrl(),
  };
  try {
    const { cities } = await getMatchMeta();
    return { ...base, cities };
  } catch (e) {
    console.error("[match/meta] 讀不到縣市清單:", e);
    return { ...base, cities: [] };
  }
}

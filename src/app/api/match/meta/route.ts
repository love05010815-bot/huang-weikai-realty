/**
 * /match 表單的選項：縣市／行政區（從在售物件整理）、類型、需求、樓層、土地類別、推薦門檻、加好友連結。
 *
 * 房數、樓層、屋齡、土地類別直接從 matcher 的 ROOM_OPTIONS／FLOOR_RANGES／AGE_RANGES／LAND_CATEGORIES 產生 ——
 * 級距的定義只有一份，表單上的字跟算分用的數字不會各自漂走。
 * 公開端點，不含任何個資。資料庫連不上就回空的縣市清單，表單至少還能用「不限」配對。
 */
import { NextResponse } from "next/server";
import { MATCH, MATCH_FEATURES, MATCH_TYPES } from "@/config/match";
import { addFriendUrl } from "@/lib/match/line";
import { AGE_RANGES, FLOOR_RANGES, LAND_CATEGORIES, ROOM_OPTIONS } from "@/lib/match/matcher";
import { getMatchMeta } from "@/lib/match/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const floors = Object.entries(FLOOR_RANGES).map(([value, r]) => ({ value, label: r.label }));
  const ages = Object.entries(AGE_RANGES).map(([value, r]) => ({ value, label: r.label }));
  const base = {
    rooms: ROOM_OPTIONS,
    types: MATCH_TYPES,
    features: MATCH_FEATURES,
    floors,
    ages,
    landCategories: LAND_CATEGORIES,
    threshold: MATCH.threshold,
    addFriendUrl: addFriendUrl(),
  };
  try {
    const { cities } = await getMatchMeta();
    return NextResponse.json({ ...base, cities });
  } catch (e) {
    console.error("[match/meta] 讀不到縣市清單:", e);
    return NextResponse.json({ ...base, cities: [] });
  }
}

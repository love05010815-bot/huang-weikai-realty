/**
 * /match 表單的選項：縣市／行政區（從在售物件整理）、類型、需求、推薦門檻、加好友連結。
 * 公開端點，不含任何個資。資料庫連不上就回空的縣市清單，表單至少還能用「不限」配對。
 */
import { NextResponse } from "next/server";
import { MATCH, MATCH_FEATURES, MATCH_TYPES } from "@/config/match";
import { addFriendUrl } from "@/lib/match/line";
import { getMatchMeta } from "@/lib/match/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const base = { types: MATCH_TYPES, features: MATCH_FEATURES, threshold: MATCH.threshold, addFriendUrl: addFriendUrl() };
  try {
    const { cities } = await getMatchMeta();
    return NextResponse.json({ ...base, cities });
  } catch (e) {
    console.error("[match/meta] 讀不到縣市清單:", e);
    return NextResponse.json({ ...base, cities: [] });
  }
}

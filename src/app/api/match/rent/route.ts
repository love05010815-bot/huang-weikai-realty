/**
 * 🔑 租屋快搜的 API（2026-10-26）—— GET 給表單選項，POST 跑配對；都只看 deal='rent' 的物件。
 *
 * 跟 /api/match/search 不一樣：**不存買方條件、不推播、不綁買方編號**，純查詢。理由見 lib/match/rent.ts 檔頭
 * （買方條件的預算是「萬」、租金是「元」，混在同一筆會把買方的新物件通知弄壞）。
 * 結果的形狀跟 /api/match/search 一樣（MatchApp 的結果頁兩種都吃），多一個 deal:"rent"。
 */
import { NextRequest, NextResponse } from "next/server";
import { MATCH } from "@/config/match";
import { ROOM_OPTIONS } from "@/lib/match/matcher";
import { publicListing } from "@/lib/match/public";
import { rentMeta, searchRentals } from "@/lib/match/rent";
import { listAvailableListings } from "@/lib/match/store";

export const dynamic = "force-dynamic";

/** 畫面只鋪前 40 張卡（跟買賣的 SEARCH_SHOW_MAX 同一個數字） */
const SHOW_MAX = 40;

export async function GET() {
  try {
    const rentals = await listAvailableListings("rent");
    return NextResponse.json({ ...rentMeta(rentals), rooms: ROOM_OPTIONS.map((o) => ({ value: o.value, label: o.label })) });
  } catch (e) {
    console.error("[match/rent] 讀不到出租物件:", e);
    return NextResponse.json({ error: "目前無法讀取物件，請稍後再試" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  try {
    const rentals = await listAvailableListings("rent");
    const r = searchRentals(body, rentals, { limit: SHOW_MAX });
    return NextResponse.json({
      deal: "rent",
      buyerId: null,
      summary: r.summary,
      threshold: MATCH.threshold,
      total: rentals.length,
      matched: r.matched,
      matches: r.matches.map((m) => ({
        ...publicListing(m.listing),
        score: m.score,
        reasons: m.reasons,
        misses: m.misses,
        recommended: m.score >= MATCH.threshold,
      })),
    });
  } catch (e) {
    console.error("[match/rent] 配對失敗:", e);
    return NextResponse.json({ error: "目前無法讀取物件，請稍後再試" }, { status: 503 });
  }
}

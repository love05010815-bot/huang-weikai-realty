/**
 * 全部在售物件（公開欄位、照片只留第一張）—— 給 /match 客人頁的「好案配對找房」一次抓整池、在瀏覽器裡篩。
 *
 * 2026-10-06 他說「客人看到的配對找房改用梧棲店官網的好案配對」：店頭官網那套是整包 listings.json
 * 抓下來在瀏覽器裡即時篩，客人每點一個條件馬上變，不用等伺服器。這裡照做，只是資料用自己的庫
 * （太平洋官網海線七家店＋愛屋店網，每 30 分鐘同步）。配對規則在瀏覽器裡跑 lib/match/matcher.ts 同一份。
 *
 * 公開端點、不含任何個資。快取 10 分鐘（同步本來就 30 分鐘一輪），過期後先給舊的再背景更新。
 */
import { NextResponse } from "next/server";
import { browseListing } from "@/lib/match/public";
import { listAvailableListings } from "@/lib/match/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const listings = await listAvailableListings();
    return NextResponse.json(
      { total: listings.length, listings: listings.map(browseListing) },
      { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" } },
    );
  } catch (e) {
    console.error("[match/listings] 讀取失敗:", e);
    return NextResponse.json({ error: "目前無法讀取物件，請稍後再試" }, { status: 503 });
  }
}

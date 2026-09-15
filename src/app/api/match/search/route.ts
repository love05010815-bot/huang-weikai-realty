/**
 * 自動配對：買方條件 → 依分數排序的在售物件
 *
 * 同時把條件存成一筆 match_buyer（回 buyerId 讓瀏覽器記住），之後新物件同步進來才推得到他。
 * 條件存不進去也照樣回配對結果 —— 配對是主要目的，存條件只是順手。
 */
import { NextRequest, NextResponse } from "next/server";
import { MATCH } from "@/config/match";
import { describePreference, normalizePreference, rankListings } from "@/lib/match/matcher";
import { publicListing } from "@/lib/match/public";
import { listAvailableListings, upsertBuyer } from "@/lib/match/store";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function POST(req: NextRequest) {
  let body: { preference?: unknown; buyerId?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const preference = normalizePreference(body.preference ?? body);
  const wantedBuyerId = typeof body.buyerId === "string" && UUID_RE.test(body.buyerId) ? body.buyerId : null;

  let buyerId: string | null = null;
  try {
    const buyer = await upsertBuyer({ id: wantedBuyerId, preference });
    buyerId = buyer.id;
  } catch (e) {
    console.error("[match/search] 買方條件存檔失敗（照樣配對）:", e);
  }

  try {
    const listings = await listAvailableListings();
    const ranked = rankListings(preference, listings, { limit: 40 });
    return NextResponse.json({
      buyerId,
      summary: describePreference(preference),
      threshold: MATCH.threshold,
      total: listings.length,
      matches: ranked.map((m) => ({
        ...publicListing(m.listing),
        score: m.score,
        reasons: m.reasons,
        misses: m.misses,
        recommended: m.score >= MATCH.threshold,
      })),
    });
  } catch (e) {
    console.error("[match/search] 配對失敗:", e);
    return NextResponse.json({ error: "目前無法讀取物件，請稍後再試" }, { status: 503 });
  }
}

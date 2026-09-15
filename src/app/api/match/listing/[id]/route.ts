/**
 * 單一在售物件（給 /match?book=物件編號 這種從 LINE 卡片點進來的入口用）。
 * 已下架的回 404 —— 買方從舊訊息點進來要看得到「這戶已經沒有了」，而不是預約到一戶不存在的房子。
 */
import { NextRequest, NextResponse } from "next/server";
import { publicListing } from "@/lib/match/public";
import { getListing } from "@/lib/match/store";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return NextResponse.json({ error: "找不到物件" }, { status: 404 });
  try {
    const listing = await getListing(id);
    if (!listing || listing.status !== "available") return NextResponse.json({ error: "這個物件已經下架或成交了" }, { status: 404 });
    return NextResponse.json(publicListing(listing));
  } catch (e) {
    console.error("[match/listing] 讀取失敗:", e);
    return NextResponse.json({ error: "目前無法讀取物件，請稍後再試" }, { status: 503 });
  }
}

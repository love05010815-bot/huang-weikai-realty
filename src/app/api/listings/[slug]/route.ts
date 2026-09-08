/**
 * GET /api/listings/<slug> —— 給預約表單用的「這是哪一戶」。
 *
 * /card/booking 是靜態頁，表單是客戶端元件；帶 `?listing=<slug>` 進來時它打這支拿
 * 區域＋標題，顯示「您詢問的物件」並寫進備註。只回這三個公開欄位，不回照片與連結。
 * 含已下架的 —— 客戶從舊網址進來也要對得上是哪戶（status 一起回，表單可以提醒已下架）。
 */
import { NextResponse } from "next/server";
import { getListingBySlug } from "@/lib/listings";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const clean = String(slug || "")
    .trim()
    .toLowerCase()
    .slice(0, 120);
  if (!/^[a-z0-9-]+$/.test(clean)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const found = await getListingBySlug(clean, { withPrice: false });
  if (!found.listing) {
    return NextResponse.json({ ok: false }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json(
    {
      ok: true,
      slug: found.listing.slug,
      area: found.listing.area,
      title: found.listing.title,
      status: found.status,
    },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } },
  );
}

/**
 * 同事版「591 刊登助手」外掛的「貼太平洋連結就帶入」：授權碼代替 Google 登入，其餘跟 /api/admin/post591/pacific 一模一樣。
 *   POST { key, installId, version, input }  → { ok:true, caseId, sourceUrl, fromOfficial, listing } 或 { ok:false, reason?, error }
 * 門在 lib/fb-ext-auth.ts（限流＋verifyLicense＋CORS，跟 FB 同事版同一套、同一張 ext_license 表），邏輯在 lib/pacific-listing.ts。
 * 外掛那邊是背景程式（tools/post591-extension/background.js 的 p591:pacific）來打，來源 chrome-extension://，所以 CORS 一定要開。
 */
import { NextRequest, NextResponse } from "next/server";
import { fbExtAuth, fbExtJson, fbExtOptions } from "@/lib/fb-ext-auth";
import { loadPacificListing, toPost591 } from "@/lib/pacific-listing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function OPTIONS() {
  return fbExtOptions();
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 一個 IP 一分鐘 30 次：一戶帶一次，同一間店幾個同事一起用也夠
  const a = await fbExtAuth(req, "post591-ext:pacific", 30);
  if (!a.ok) return a.res;
  const input = String(a.body.input ?? "").slice(0, 500);
  const got = await loadPacificListing(input);
  if (!got.ok) return fbExtJson({ ok: false, error: got.error }, 400);
  const d = got.data;
  return fbExtJson({ ok: true, caseId: d.houseolId || d.saleId, sourceUrl: d.linkHref, fromOfficial: d.fromOfficial, listing: toPost591(d) });
}

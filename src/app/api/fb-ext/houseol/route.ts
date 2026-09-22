/**
 * 同事版「FB 社團廣告助手」的「從愛屋帶入」：授權碼代替 Google 登入，其餘跟 /api/admin/fb/houseol 一模一樣。
 *   POST { key, installId, version, input }  → { ok, caseId, draft, photos } 或 { ok:false, reason?, error }
 * 門在 lib/fb-ext-auth.ts（限流＋verifyLicense＋CORS），邏輯在 lib/fb-ad-import.ts。
 */
import { NextRequest, NextResponse } from "next/server";
import { importAdFromHouseol } from "@/lib/fb-ad-import";
import { fbExtAuth, fbExtJson, fbExtOptions } from "@/lib/fb-ext-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function OPTIONS() {
  return fbExtOptions();
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 一個 IP 一分鐘 30 次：一戶帶一次，同一間店幾個同事一起用也夠
  const a = await fbExtAuth(req, "fb-ext:houseol", 30);
  if (!a.ok) return a.res;
  const r = await importAdFromHouseol(a.body.input);
  return fbExtJson(r.body, r.status);
}

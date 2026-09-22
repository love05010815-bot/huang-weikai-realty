/**
 * 同事版「FB 社團廣告助手」的「帶入型錄照片」：授權碼代替 Google 登入，其餘跟 /api/admin/fb/houseol-photo 一模一樣。
 *   POST { key, installId, version, url }  → { ok, dataUrl, bytes } 或 { ok:false, reason?, error }
 * 一張一個請求（一次抓完會超時）；伺服器只當代理不存圖。
 */
import { NextRequest, NextResponse } from "next/server";
import { proxyHouseolPhoto } from "@/lib/fb-ad-import";
import { fbExtAuth, fbExtJson, fbExtOptions } from "@/lib/fb-ext-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function OPTIONS() {
  return fbExtOptions();
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 一戶最多帶 10 張，一分鐘 120 次夠幾個同事同時帶
  const a = await fbExtAuth(req, "fb-ext:photo", 120);
  if (!a.ok) return a.res;
  const r = await proxyHouseolPhoto(a.body.url);
  return fbExtJson(r.body, r.status);
}

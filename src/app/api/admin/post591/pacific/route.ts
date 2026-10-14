/**
 * 591 刊登助手「貼太平洋連結就帶入」（2026-10-14 他說「FB 社團／591 都換掉」）。
 *
 *   POST { input }  → { ok:true, caseId, sourceUrl, fromOfficial, listing }  或 { ok:false, error }
 *
 * `listing` 就是 lib/post591-parser.ts 的 Listing —— 跟頁面上貼型錄文字解析出來的同一個型別，
 * 頁面拿到直接走 derive／buildRows／buildPayload，對應規則一行不用改。
 *
 * 🔴 為什麼走伺服器：分享頁本身讀不到東西，要打分享 API ＋ 官網單筆 API（要帶 token）＋ 資料庫的完整門牌，
 *    這三樣都不該在瀏覽器裡做。外掛那條「抓愛屋型錄頁」照舊在瀏覽器（它要帶愛屋的登入 cookie）。
 * 🔴 先擋權限：這支可以被直接 POST。同事版走 /api/post591-ext/pacific（授權碼）。
 */
import { NextRequest, NextResponse } from "next/server";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import { loadPacificListing, toPost591 } from "@/lib/pacific-listing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// 分享 API ＋ 官網兩支 ＋ 資料庫，實測約 3 秒；留寬免得冷啟動被砍
export const maxDuration = 30;

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ ok: false, error: "權限不足" }, { status: 403 });
  }
  let input = "";
  try {
    input = String(((await req.json()) as { input?: unknown }).input ?? "").slice(0, 500);
  } catch {
    return NextResponse.json({ ok: false, error: "讀不到你貼的連結" }, { status: 400 });
  }
  const got = await loadPacificListing(input);
  if (!got.ok) return NextResponse.json({ ok: false, error: got.error }, { status: 400 });
  const d = got.data;
  return NextResponse.json({ ok: true, caseId: d.houseolId || d.saleId, sourceUrl: d.linkHref, fromOfficial: d.fromOfficial, listing: toPost591(d) });
}

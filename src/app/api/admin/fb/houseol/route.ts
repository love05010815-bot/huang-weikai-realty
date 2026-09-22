/**
 * 貼一條愛屋連結（或案號）→ 讀公開電子型錄 → 回一份 FB 社團廣告草稿。
 * 給 `/admin/fb` 的「廣告文案」用（他 2026-09-18 要的「由愛屋連結自動導入」）。
 *
 * 🔴 **先擋權限**：這支可以被直接 POST，「畫面上沒有按鈕」不等於外面叫不到。
 * 邏輯在 `lib/fb-ad-import.ts`（同事版外掛走 /api/fb-ext/houseol，用授權碼而不是 Google 登入，叫的是同一支）。
 *
 * ⚠️ 為什麼是 API 路由不是 server action：`/admin/fb` 整頁是 client component
 *    （操作介面全在瀏覽器、資料存 IndexedDB），沒有地方掛 server action。
 */
import { NextRequest, NextResponse } from "next/server";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import { importAdFromHouseol } from "@/lib/fb-ad-import";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// 抓一頁型錄，lib 裡自己有 8 秒逾時；留寬一點免得冷啟動被砍
export const maxDuration = 30;

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ ok: false, error: "權限不足" }, { status: 403 });
  }
  let input: unknown = "";
  try {
    input = ((await req.json()) as { input?: unknown }).input;
  } catch {
    return NextResponse.json({ ok: false, error: "讀不到你貼的連結" }, { status: 400 });
  }
  const r = await importAdFromHouseol(input);
  return NextResponse.json(r.body, { status: r.status });
}

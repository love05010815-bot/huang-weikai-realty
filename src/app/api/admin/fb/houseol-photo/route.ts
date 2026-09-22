/**
 * 把愛屋型錄上的**一張**照片抓回來，直接回 dataURL 給瀏覽器。
 * 給 `/admin/fb` 的「帶入型錄照片」用，瀏覽器端一張一張打過來。
 *
 * ## 🔴 為什麼不共用 `/api/admin/map-listings/houseol-photo`
 * 那支會把圖壓成 WebP **存進 Vercel Blob**（因為地圖物件存在資料庫，圖要有公開網址）。
 * FB 廣告這條線的規矩相反：**廣告內容與圖片只留在使用者自己的瀏覽器（IndexedDB），不進 DB、不進 Blob**。
 * 所以這支只當「借過一手」的代理（邏輯在 `lib/fb-ad-import.ts`，同事版走 /api/fb-ext/houseol-photo 叫同一支）。
 *
 * 🔴 先擋權限：這支可以被直接 POST，「畫面上沒有按鈕」不等於外面叫不到。
 */
import { NextRequest, NextResponse } from "next/server";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import { proxyHouseolPhoto } from "@/lib/fb-ad-import";

export const dynamic = "force-dynamic";
// Buffer / base64 要 node runtime
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ ok: false, error: "權限不足" }, { status: 403 });
  }
  let url: unknown = "";
  try {
    url = ((await req.json()) as { url?: unknown }).url;
  } catch {
    return NextResponse.json({ ok: false, error: "讀不到圖片網址" }, { status: 400 });
  }
  const r = await proxyHouseolPhoto(url);
  return NextResponse.json(r.body, { status: r.status });
}

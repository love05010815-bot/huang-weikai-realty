/**
 * 把愛屋型錄上的**一張**照片抓回來，直接回 dataURL 給瀏覽器。
 * 給 `/admin/fb` 的「帶入型錄照片」用，瀏覽器端一張一張打過來。
 *
 * ## 🔴 為什麼不共用 `/api/admin/map-listings/houseol-photo`
 * 那支會把圖壓成 WebP **存進 Vercel Blob**（因為地圖物件存在資料庫，圖要有公開網址）。
 * FB 廣告這條線的規矩相反：**廣告內容與圖片只留在他自己的瀏覽器（IndexedDB），不進 DB、不進 Blob**。
 * 所以這支只當「借過一手」的代理：伺服器抓回來 → 回 base64 → 瀏覽器自己縮圖存 IndexedDB，
 * 伺服器上不留任何東西。
 *
 * ## 為什麼要繞伺服器
 * 瀏覽器直接抓 hq.houseol.com.tw 的圖會被 CORS 擋；就算用 <img> 畫進 canvas 也會污染 canvas，
 * toDataURL() 會直接丟例外。所以必須由伺服器代抓。
 *
 * ## 安全
 * ・先擋權限：這支可以被直接 POST，「畫面上沒有按鈕」不等於外面叫不到。
 * ・網址只准 houseol.com.tw（`isHouseolPhotoUrl`）：url 是瀏覽器端傳來的，
 *   不擋就是開一個「叫伺服器去打任意網址」的洞（SSRF）。
 * ・回應一定是圖片、而且有大小上限，不然這支會變成免費的檔案中轉站。
 */
import { NextRequest, NextResponse } from "next/server";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import { isHouseolPhotoUrl } from "@/lib/houseol-catalog";

export const dynamic = "force-dynamic";
// Buffer / base64 要 node runtime
export const runtime = "nodejs";
export const maxDuration = 30;

/** 型錄照片實測約 100KB。留 12MB 上限純粹是別讓這支變成中轉站 */
const MAX_BYTES = 12_000_000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ ok: false, error: "權限不足" }, { status: 403 });
  }

  let url = "";
  try {
    url = String(((await req.json()) as { url?: unknown }).url ?? "");
  } catch {
    return NextResponse.json({ ok: false, error: "讀不到圖片網址" }, { status: 400 });
  }
  if (!isHouseolPhotoUrl(url)) {
    return NextResponse.json({ ok: false, error: "這不是愛屋的圖片網址" }, { status: 400 });
  }

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000), cache: "no-store" });
    if (!res.ok) return NextResponse.json({ ok: false, error: `愛屋回應 ${res.status}` }, { status: 502 });

    const type = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
    if (!type.startsWith("image/")) {
      return NextResponse.json({ ok: false, error: `這個網址回的不是圖片（${type}）` }, { status: 400 });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.byteLength) return NextResponse.json({ ok: false, error: "抓回來是空的" }, { status: 502 });
    if (buf.byteLength > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: `這張太大（${Math.round(buf.byteLength / 1024)}KB）` }, { status: 413 });
    }

    return NextResponse.json({ ok: true, dataUrl: `data:${type};base64,${buf.toString("base64")}`, bytes: buf.byteLength });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: /timeout|abort/i.test(msg) ? "愛屋太久沒回應" : `抓不到這張：${msg}` }, { status: 502 });
  }
}

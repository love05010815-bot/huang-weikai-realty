/**
 * 把愛屋型錄上的**一張**照片抓下來、壓成 WebP、存進 Blob，回可以直接放進表單的網址。
 * 給 `/admin/map-listings` 的「帶入 N 張」用，瀏覽器端一張一張打過來。
 *
 * ## 🔴 為什麼是 API 路由，不是 server action（2026-09-17 踩過才搬過來的）
 * 這段本來寫成 server action、跑在 `/admin/map-listings` 那個頁面路由上，線上一按就噴：
 *   `Could not load the "sharp" module … libvips-cpp.so.8.18.3: cannot open shared object file`
 * 原因是 sharp 的原生檔要靠 Vercel 的 file tracing 帶進**那一支函式**的 bundle，
 * 而頁面路由的 server action 沒被帶到（`next.config.ts` 的 `outputFileTracingIncludes`
 * 當時只點名了 `/api/admin/listings/photo`）。
 * **API 路由這條路是驗證過會動的**（`/api/health?img=1` 與上傳照片那支都在跑），
 * 所以照抄那個形狀：`runtime = "nodejs"` ＋ 在 next.config 裡點名帶原生檔。
 * ⚠️ 以後任何要用 sharp 的新功能，都放 API 路由、並記得去 next.config 補一條。
 *
 * ## 安全
 * ・先擋權限：這支可以被直接 POST，「畫面上沒有按鈕」不等於外面叫不到。
 * ・網址只准 houseol.com.tw：url 是瀏覽器端傳來的，不擋就是開一個
 *   「叫伺服器去打任意網址」的洞（SSRF）。
 */
import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import { isHouseolPhotoUrl } from "@/lib/houseol-catalog";
import { uploadListingPhoto } from "@/lib/listing-photos";

export const dynamic = "force-dynamic";
// sharp 是原生模組，跑不了 edge runtime
export const runtime = "nodejs";
// 抓圖＋壓縮＋上傳 Blob，實測一張約 1～3 秒（慢的是上傳）。留寬一點免得被砍。
export const maxDuration = 60;

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ ok: false, error: "權限不足" }, { status: 403 });
  }

  let url = "";
  try {
    url = String(((await req.json()) as { url?: unknown }).url ?? "");
  } catch {
    return NextResponse.json({ ok: false, error: "讀不到要帶入的網址" }, { status: 400 });
  }
  if (!isHouseolPhotoUrl(url)) {
    return NextResponse.json({ ok: false, error: "這不是愛屋的圖片網址" }, { status: 400 });
  }

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `愛屋回應 ${res.status}` }, { status: 502 });
    }
    const type = res.headers.get("content-type") ?? "image/jpeg";
    if (!type.startsWith("image/")) {
      return NextResponse.json({ ok: false, error: `這個網址回的不是圖片（${type}）` }, { status: 400 });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const name = url.split("/").pop() || "houseol.jpg";

    try {
      const uploaded = await uploadListingPhoto(new File([buf], name, { type }));
      return NextResponse.json({ ok: true, url: uploaded.url });
    } catch (e) {
      // sharp 載不起來時的退路。型錄照片本來就只有 800×600、100KB 上下，
      // 原圖直傳完全夠用 —— 與其整個功能不能用，不如存原圖。
      // ⚠️ **但要講出來**（回 degraded），不要默默降級：sharp 壞掉代表他自己手動上傳
      //    照片那條路也壞了，那是要修的，不能被這裡的退路蓋掉。
      if (!isSharpLoadError(e)) throw e;
      if (buf.byteLength > RAW_MAX_BYTES) {
        return NextResponse.json(
          { ok: false, error: `圖片處理模組壞了，原圖又太大（${Math.round(buf.byteLength / 1024)}KB）` },
          { status: 500 },
        );
      }
      const blob = await put(`listings/${randomUUID().replace(/-/g, "")}${extFor(type)}`, buf, {
        access: "public",
        contentType: type,
        cacheControlMaxAge: 60 * 60 * 24 * 365,
        addRandomSuffix: false,
      });
      return NextResponse.json({ ok: true, url: blob.url, degraded: "圖片處理模組壞了，存的是原圖（沒壓縮）" });
    }
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/** 單張原圖直傳的上限。型錄照片實測 45～105KB，2MB 已經很寬鬆 */
const RAW_MAX_BYTES = 2 * 1024 * 1024;

/** 是不是「sharp 這個原生模組載不起來」那一類錯誤 */
function isSharpLoadError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /sharp|libvips|ERR_DLOPEN_FAILED|shared object file/i.test(msg);
}

function extFor(type: string): string {
  if (type.includes("png")) return ".png";
  if (type.includes("webp")) return ".webp";
  if (type.includes("gif")) return ".gif";
  return ".jpg";
}

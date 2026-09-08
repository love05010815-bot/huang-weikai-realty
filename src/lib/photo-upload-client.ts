/**
 * 📷 後台上傳照片的瀏覽器端：先縮小，再一張一張送
 *
 * 兩個後台共用（`/admin/listings` 精選好案、`/admin/map-listings` 地圖物件），
 * 兩邊都是打同一支 API `/api/admin/listings/photo`。
 *
 * 🔴 為什麼一定要有這支（2026-09-08）：
 *    **Vercel 的 serverless 函式對「整個請求」有 4.5MB 的硬上限**，超過就回
 *    `413 FUNCTION_PAYLOAD_TOO_LARGE`，**我們的程式一行都不會執行到** ——
 *    所以 `listing-photos.ts` 裡寫的「單張上限 20MB」在線上根本輪不到它把關。
 *    手機直出的照片一張 3～8MB，後台又是「選幾張就一次全部送出」，
 *    選兩張就爆掉，畫面上只會看到一個看不懂的錯誤。實測：4MB 的請求進得到程式
 *    （回 403 權限不足），4.5MB 就被平台擋掉。
 *
 *    修法是在瀏覽器先解碼、縮到 1600px、壓成 WebP 再送 —— 一張通常只剩
 *    150～400KB，順便讓 4G 上傳快很多。伺服器端的 sharp 照舊會再處理一次
 *    （轉正、縮圖、壓 WebP），這裡只是先把體積降下來，**不是取代它**。
 *
 * ⚠️ 壓不了就回原檔（HEIC 之類瀏覽器解不開的格式），讓伺服器端去處理；
 *    真的太大就由呼叫端擋下來並告訴使用者，不要送出去換一個天書錯誤。
 */

/** 單次請求的安全線。平台是 4.5MB，抓 4MB 留給表單邊界與其他欄位。 */
export const UPLOAD_REQUEST_LIMIT = 4 * 1024 * 1024;

/** 跟伺服器端 `listing-photos.ts` 的 MAX_WIDTH 一致，先壓到這個寬度 */
const MAX_WIDTH = 1600;

/** 瀏覽器端的 WebP 品質。伺服器端是 0.82，這裡留高一點，免得壓兩次糊掉。 */
const WEBP_QUALITY = 0.85;

/** 小於這個大小就不動它 —— 已經夠小，多壓一次只是多一次失真 */
const SKIP_BELOW_BYTES = 600 * 1024;

/**
 * 解碼成 bitmap。`imageOrientation: "from-image"` 是照 EXIF 轉正 ——
 * 手機拍的照片方向寫在 EXIF 裡，不轉正的話畫進 canvas 會躺下來。
 */
async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // 舊瀏覽器不吃第二個參數，退回沒有選項的版本
    return await createImageBitmap(file);
  }
}

function toWebpName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "") || "photo";
  return `${base}.webp`;
}

/**
 * 回一張「可以安心送出去」的照片。
 * 壓得動就回壓過的 WebP，壓不動（格式瀏覽器不認、canvas 被擋）就原封不動回原檔。
 */
export async function precompressPhoto(file: File): Promise<File> {
  if (file.size <= SKIP_BELOW_BYTES) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await decode(file);
  } catch {
    return file; // HEIC 等瀏覽器解不開的格式：交給伺服器端的 sharp
  }

  try {
    const scale = Math.min(1, MAX_WIDTH / bitmap.width);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", WEBP_QUALITY)
    );
    // 壓不出來、或壓完反而更大（原本就是壓得很好的小圖）就用原檔
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], toWebpName(file.name), { type: "image/webp" });
  } finally {
    bitmap.close();
  }
}

/** 給畫面用的檔案大小字串 */
export function formatBytes(n: number): string {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.round(n / 1024)}KB`;
}

export type UploadOutcome = {
  /** 成功上傳的照片網址，順序跟選擇的順序一致 */
  urls: string[];
  failed: { name: string; error: string }[];
};

/**
 * 一張一張上傳。
 *
 * 🔴 **不要改回「一次送全部」** —— 平台的 4.5MB 上限是算「整個請求」的，
 *    一次送八張必爆。一張一張送還有兩個好處：某一張壞掉不會拖垮其他張、
 *    畫面可以回報「第幾張／共幾張」。
 */
export async function uploadPhotos(
  files: File[],
  onProgress?: (done: number, total: number) => void
): Promise<UploadOutcome> {
  const urls: string[] = [];
  const failed: { name: string; error: string }[] = [];

  for (let i = 0; i < files.length; i++) {
    const original = files[i];
    const name = original.name || "未命名";
    onProgress?.(i, files.length);
    try {
      const prepared = await precompressPhoto(original);
      if (prepared.size > UPLOAD_REQUEST_LIMIT) {
        failed.push({
          name,
          error: `${formatBytes(prepared.size)}，超過單張上限 ${formatBytes(UPLOAD_REQUEST_LIMIT)}`,
        });
        continue;
      }

      const body = new FormData();
      body.append("file", prepared);
      const res = await fetch("/api/admin/listings/photo", { method: "POST", body });

      // ⚠️ 413 之類是平台擋的，回的是純文字不是 JSON —— 直接 res.json() 會噴
      //    「Unexpected token」那種看不懂的錯誤，使用者只會覺得「照片讀取不了」
      let data: {
        uploaded?: { url: string }[];
        failed?: { name: string; error: string }[];
        error?: string;
      } | null = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok) {
        failed.push({
          name,
          error:
            data?.error ??
            (res.status === 413
              ? `檔案太大，伺服器直接擋掉（單張上限 ${formatBytes(UPLOAD_REQUEST_LIMIT)}）`
              : `上傳失敗（${res.status}）`),
        });
        continue;
      }

      const url = data?.uploaded?.[0]?.url;
      if (url) urls.push(url);
      else failed.push({ name, error: data?.failed?.[0]?.error ?? "伺服器沒有回傳網址" });
    } catch (e) {
      failed.push({ name, error: e instanceof Error ? e.message : String(e) });
    } finally {
      // ⚠️ 放 finally 不是放迴圈尾巴 —— 上面每個 continue 都會跳過迴圈尾巴，
      //    那樣某一張失敗時進度就停在原地不動了
      onProgress?.(i + 1, files.length);
    }
  }

  return { urls, failed };
}

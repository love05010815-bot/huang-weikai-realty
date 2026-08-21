/**
 * 📷 精選好案的照片儲存層
 *
 * 2026-08-21 起後台可以直接從電腦上傳照片，不用再把圖檔加進 repo 部署一次。
 *
 * 🔴 為什麼不是存進 `public/listings/`：
 *    Vercel 線上的檔案系統是**唯讀**的，只有部署當下寫得進去。
 *    伺服器跑起來之後對 `public/` 寫檔一定失敗，所以照片必須放外部儲存。
 *    這裡用 Vercel Blob（store `listings-photos`，public 讀取、有 CDN）。
 *
 * 資料庫的 `photos` 欄位存的是**可以直接放進 img src 的字串**，有三種型態：
 *   1. `https://….public.blob.vercel-storage.com/…`  ← 後台上傳的（現在的主流）
 *   2. `/listings/xxx.jpg`                           ← repo 裡的舊檔
 *   3. `xxx.jpg`                                     ← 更舊的裸檔名，等同 2
 * 三種都要能顯示，所以讀的那一側一律先過 `resolvePhotoSrc()`。
 */
import { del, put } from "@vercel/blob";
import sharp from "sharp";
import { isBlobUrl } from "@/lib/photo-src";

export { isBlobUrl, photoDisplayName, resolvePhotoSrc } from "@/lib/photo-src";

/** 上傳前的原始檔上限。手機直出的照片通常 3～8MB，20MB 夠寬鬆又擋得住誤傳影片。 */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/**
 * 存進 Blob 前一律縮到這個寬度以內。
 *
 * 卡片實際顯示才 344px 寬，2 倍給高解析螢幕就是 688px；
 * 1600 已經遠遠夠用，留餘裕給之後可能加的燈箱大圖。
 */
const MAX_WIDTH = 1600;

/** WebP 品質。82 在照片上肉眼看不出差異，檔案大約是原圖的五分之一。 */
const WEBP_QUALITY = 82;

/** 允許的副檔名，純粹用來給使用者比較好懂的錯誤訊息；真正的把關是下面的 sharp 解碼。 */
const FRIENDLY_TYPES = "JPG、PNG、WebP、HEIC";

export type UploadResult = { url: string; bytes: number; width: number; height: number };

/**
 * 把使用者上傳的圖片壓縮成 WebP 並存進 Blob，回可直接顯示的網址。
 *
 * 刻意**不信任**瀏覽器送來的 MIME type 與副檔名 —— 那兩個都是使用者可以隨便寫的。
 * 真正的驗證是「sharp 解得開嗎」：解得開就是圖片，解不開就退回去。
 */
export async function uploadListingPhoto(file: File): Promise<UploadResult> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`檔案太大（${formatMB(file.size)}），單張上限 ${formatMB(MAX_UPLOAD_BYTES)}`);
  }
  if (file.size === 0) throw new Error("檔案是空的");

  const input = Buffer.from(await file.arrayBuffer());

  let output: Buffer;
  let width = 0;
  let height = 0;
  try {
    const pipeline = sharp(input)
      // 手機拍的照片方向是寫在 EXIF 裡的，不轉正的話後台看起來是正的、
      // 存成 WebP 之後會躺下來。rotate() 不帶參數就是「照 EXIF 轉正」。
      .rotate()
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY });

    const result = await pipeline.toBuffer({ resolveWithObject: true });
    output = result.data;
    width = result.info.width;
    height = result.info.height;
  } catch {
    throw new Error(`這個檔案不是看得懂的圖片，請用 ${FRIENDLY_TYPES}`);
  }

  // 檔名用亂數而不是原檔名：① 中文檔名進網址會被編碼，容易出事
  // ② 兩個物件各上傳一張 IMG_1234.jpg 不會互相蓋掉
  // ③ 網址猜不到，別人不能靠列舉檔名把所有照片撈走
  const name = `listings/${randomName()}.webp`;

  const blob = await put(name, output, {
    access: "public",
    contentType: "image/webp",
    // 內容不會變（改圖等於換一個亂數檔名），所以讓 CDN 與瀏覽器放心長期快取
    cacheControlMaxAge: 60 * 60 * 24 * 365,
  });

  return { url: blob.url, bytes: output.byteLength, width, height };
}

/**
 * 從 Blob 刪掉一張照片。
 *
 * 🔴 只刪 Blob 上的東西。`/listings/xxx.jpg` 那種 repo 裡的舊檔一律跳過 ——
 *    那些是版控裡的檔案，不歸這裡管，硬刪只會噴錯。
 *    刪不掉也不要讓整個存檔失敗：照片沒清乾淨只是佔一點空間，
 *    但存檔失敗會讓使用者以為物件沒改到。
 */
export async function deleteListingPhoto(url: string): Promise<void> {
  if (!isBlobUrl(url)) return;
  try {
    await del(url);
  } catch {
    // 吞掉：可能是已經被刪過、或 token 暫時有問題，都不該擋住使用者存檔
  }
}

function randomName(): string {
  // crypto.randomUUID 在 Node 18+ 是全域的，不用 import
  return crypto.randomUUID().replace(/-/g, "");
}

function formatMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/**
 * 照片網址的解析 —— 純函式，沒有任何相依。
 *
 * 刻意獨立成一支檔案，不放進 `lib/listing-photos.ts`：那支有 `sharp` 與
 * `@vercel/blob`，都是伺服器端的東西。前台的 PhotoCarousel 是 client component，
 * 從那支拿函式會把原生模組整包拖進瀏覽器 bundle。
 *
 * 資料庫 `photos` 欄位裡可能出現三種型態，這裡統一成可以直接放進 img src 的字串：
 *   1. `https://….public.blob.vercel-storage.com/…`  後台上傳的
 *   2. `/listings/xxx.jpg`                            repo 裡的舊檔
 *   3. `xxx.jpg`                                      更舊的裸檔名
 */

/** 把資料庫裡的值轉成可以直接放進 img src 的網址。 */
export function resolvePhotoSrc(value: string): string {
  const v = value.trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v) || v.startsWith("/")) return v;
  return `/listings/${v}`;
}

/** 是不是我們自己 Blob store 上的網址（決定刪不刪得動） */
export function isBlobUrl(value: string): boolean {
  return /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//i.test(value);
}

/** 給後台顯示用的短名字。Blob 網址很長，整條列出來會把版面撐爆。 */
export function photoDisplayName(value: string): string {
  const v = value.trim();
  if (!v) return "";
  try {
    const path = /^https?:\/\//i.test(v) ? new URL(v).pathname : v;
    return path.split("/").filter(Boolean).pop() || v;
  } catch {
    return v;
  }
}

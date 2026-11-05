/**
 * 「從愛屋帶入」的共用核心 —— 後台（/api/admin/fb/*，Google 登入）與同事版外掛（/api/fb-ext/*，授權碼）
 * 兩條路都叫這裡，只有「誰可以叫」不一樣。
 *
 * 🔴 這裡不做權限：呼叫端一定要先擋（後台看 isCurrentUserAdmin、同事版看 verifyLicense）。
 * 🔴 網址只准 houseol.com.tw 與太平洋（分享連結／官網物件頁／S 編號，2026-10-14 他說「FB 社團／591 都換掉」）：
 *    input／url 都是瀏覽器端傳來的，不擋就是開一個「叫伺服器去打任意網址」的洞（SSRF）。
 *    型錄那條擋在 lib/houseol-catalog.ts 的 resolveCaseId，照片那條擋在 isHouseolPhotoUrl。
 * 🔴 圖片只當代理回 base64，伺服器不存（FB 廣告的圖只留在使用者自己的瀏覽器）。
 */
import { buildAdDraft, fetchCatalog, isHouseolPhotoUrl, type AdDraft } from "@/lib/houseol-catalog";
import { loadPacificListing, toCatalog } from "@/lib/pacific-listing";
import { isPacificInput } from "@/lib/prim-share";

export type ImportReply = {
  status: number;
  body:
    | {
        ok: true;
        caseId: string;
        draft: AdDraft;
        photos: string[];
        /** 照片清單沒抓到（官網照片 API 沒回應等）的原因；畫面要講出來、叫他再按一次，不要當「這戶沒照片」 */
        photoNote?: string;
      }
    | { ok: false; error: string };
};
export type PhotoReply = { status: number; body: { ok: true; dataUrl: string; bytes: number } | { ok: false; error: string } };

/** 貼的連結／案號 → 廣告草稿＋型錄照片網址（照片本身另外一張一張抓，一次抓完會超時） */
export async function importAdFromHouseol(rawInput: unknown): Promise<ImportReply> {
  const input = String(rawInput ?? "").slice(0, 500);
  // 🟦 太平洋的分享連結／官網物件頁／S 編號：走官網單筆 API（lib/pacific-listing.ts），再套同一支 buildAdDraft ——
  //    廣告格式、「讀不到就列 missing」的規矩跟愛屋一字不差
  if (isPacificInput(input)) {
    const pac = await loadPacificListing(input);
    if (!pac.ok) return { status: 400, body: { ok: false, error: pac.error } };
    const l = toCatalog(pac.data);
    return { status: 200, body: { ok: true, caseId: l.caseId, draft: buildAdDraft(l), photos: l.photos, ...(pac.data.photoNote ? { photoNote: pac.data.photoNote } : {}) } };
  }
  const got = await fetchCatalog(input);
  if (!got.ok) return { status: 400, body: { ok: false, error: got.error } };
  return { status: 200, body: { ok: true, caseId: got.listing.caseId, draft: buildAdDraft(got.listing), photos: got.listing.photos } };
}

/** 型錄照片實測約 100KB。留 12MB 上限純粹是別讓這支變成中轉站 */
const MAX_PHOTO_BYTES = 12_000_000;

/**
 * 抓一張型錄照片回 dataURL（瀏覽器直接抓會被 CORS 擋、畫進 canvas 還會污染，所以借伺服器過一手）。
 * 圖床沒回應、5xx、抓回來是空的 → 隔一下再試一次（2026-11-05「導入照片會異常」那次順手加的，跟照片清單同一個道理）。
 */
export async function proxyHouseolPhoto(rawUrl: unknown): Promise<PhotoReply> {
  const url = String(rawUrl ?? "");
  if (!isHouseolPhotoUrl(url)) return { status: 400, body: { ok: false, error: "這不是愛屋或太平洋新系統的圖片網址" } };
  let last: PhotoReply = { status: 502, body: { ok: false, error: "抓不到這張" } };
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000), cache: "no-store" });
      if (!res.ok) {
        last = { status: 502, body: { ok: false, error: `圖片來源回應 ${res.status}` } };
        if (res.status < 500 && res.status !== 429) return last; // 404／403 這種再試也一樣
      } else {
        const type = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
        if (!type.startsWith("image/")) return { status: 400, body: { ok: false, error: `這個網址回的不是圖片（${type}）` } };
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.byteLength > MAX_PHOTO_BYTES) return { status: 413, body: { ok: false, error: `這張太大（${Math.round(buf.byteLength / 1024)}KB）` } };
        if (buf.byteLength) return { status: 200, body: { ok: true, dataUrl: `data:${type};base64,${buf.toString("base64")}`, bytes: buf.byteLength } };
        last = { status: 502, body: { ok: false, error: "抓回來是空的" } };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      last = { status: 502, body: { ok: false, error: /timeout|abort/i.test(msg) ? "圖片來源太久沒回應" : `抓不到這張：${msg}` } };
    }
    if (attempt === 1) await new Promise((r) => setTimeout(r, 400));
  }
  return last;
}

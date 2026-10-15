/**
 * 🏢 太平洋官網的「單筆物件」API —— 給 FB 社團廣告、591 刊登助手、地圖物件後台的「貼連結帶入」用
 *
 *   GET https://www.pacific.com.tw/api/ObjectAPI/GetObjectDetail/<S 編號>    → 一筆物件的全部欄位
 *   GET https://www.pacific.com.tw/api/ObjectAPI/GetObjectPicture/<S 編號>   → 照片清單（type 1 照片、3 影片、4 QR）
 *
 * 2026-10-14 實測：不帶 Authorization 回 401；帶官網列表頁上那個公開的 `baseAuthorization`（跟 lib/match/pacific-fetch.ts
 * 的 SearchMapObject 同一把、每個訪客拿到的都一樣）就 200。這裡把那把快取一小時，401 時重抓一次再試。
 *
 * 🔴 回應裡有經紀人姓名、手機、認證人姓名 —— 進來第一件事就是 `sanitizeDetail()` 只挑欄位，
 *    原始 JSON 不往外傳、不印 log。
 * ⚠️ 一律回 `{ ok:false, error }`、不 throw：三個工具都要把原因印在按鈕旁邊讓他看。
 */
import { getPacificAuth } from "@/lib/match/pacific-fetch";
import { sanitizeDetail, type PacificDetail } from "@/lib/pacific-map";
import { PACIFIC_SALE_ID } from "@/lib/prim-share";

const SITE = "https://www.pacific.com.tw";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

let authCache: { value: string; at: number } | null = null;

async function auth(force = false): Promise<string> {
  if (!force && authCache && Date.now() - authCache.at < 3600_000) return authCache.value;
  const value = await getPacificAuth();
  authCache = { value, at: Date.now() };
  return value;
}

async function getJson(path: string, timeoutMs: number): Promise<{ status: number; body: unknown }> {
  const call = async (token: string) =>
    fetch(`${SITE}/api/ObjectAPI/${path}`, {
      headers: {
        Accept: "application/json, text/plain, */*",
        Authorization: token,
        "User-Agent": UA,
        Referer: `${SITE}/Object/ObjectDetail/`,
      },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  let res = await call(await auth());
  // 那把 token 哪天換了：重抓一次再試一次，不要直接報錯
  if (res.status === 401) res = await call(await auth(true));
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

export type PacificObject = { ok: true; detail: PacificDetail; photos: string[] } | { ok: false; error: string };

/** 一筆物件：欄位＋照片。照片抓不到不算失敗（空陣列），欄位抓不到才是 */
export async function fetchPacificObject(saleIdRaw: string, timeoutMs = 10000): Promise<PacificObject> {
  const saleId = String(saleIdRaw ?? "")
    .trim()
    .toUpperCase();
  if (!PACIFIC_SALE_ID.test(saleId)) return { ok: false, error: `這不是太平洋官網的物件編號：${saleIdRaw}` };

  let detailRes: { status: number; body: unknown };
  try {
    detailRes = await getJson(`GetObjectDetail/${encodeURIComponent(saleId)}`, timeoutMs);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: /timeout|abort/i.test(msg) ? `官網 ${Math.round(timeoutMs / 1000)} 秒沒回應` : `連不上太平洋官網：${msg.slice(0, 80)}` };
  }
  if (detailRes.status === 404) return { ok: false, error: `官網找不到 ${saleId}（可能已下架）` };
  if (detailRes.status !== 200) return { ok: false, error: `官網回應 ${detailRes.status}` };
  const detail = sanitizeDetail(detailRes.body);
  if (!detail) return { ok: false, error: `官網回的東西認不得（${saleId}），官網可能改版了` };

  const photos: string[] = [];
  try {
    const pic = await getJson(`GetObjectPicture/${encodeURIComponent(saleId)}`, timeoutMs);
    if (pic.status === 200 && Array.isArray(pic.body)) {
      const rows = (pic.body as Record<string, unknown>[])
        .filter((p) => p && Number(p.type) === 1 && /^https?:\/\//.test(String(p.sysFileName ?? "")))
        .map((p, i) => ({ url: String(p.sysFileName), sort: Number(p.sort ?? 9999), i }))
        .sort((a, b) => a.sort - b.sort || a.i - b.i);
      for (const r of rows) if (!photos.some((u) => u.toLowerCase() === r.url.toLowerCase())) photos.push(r.url);
    }
  } catch {
    // 照片抓不到就沒照片，欄位照樣帶
  }
  return { ok: true, detail, photos };
}

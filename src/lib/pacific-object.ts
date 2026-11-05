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
/** 同一瞬間兩個請求（欄位＋照片並行）都發現沒 token 時，只去官網抓一次 */
let authInflight: Promise<string> | null = null;

async function auth(force = false): Promise<string> {
  if (!force && authCache && Date.now() - authCache.at < 3600_000) return authCache.value;
  if (!authInflight) {
    authInflight = getPacificAuth()
      .then((value) => {
        authCache = { value, at: Date.now() };
        return value;
      })
      .finally(() => {
        authInflight = null;
      });
  }
  return authInflight;
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
      // ⚠️ 刻意不寫 cache:"no-store"。Next 15 起 fetch 預設本來就不快取（每次呼叫都真的打官網），
      //    但明寫 no-store 會把「呼叫它的頁面」整個變成動態渲染 —— 單戶頁 /listings/<slug> 2026-10-20
      //    就是這樣失去 ISR 快取、每次點進去都現算 2～4 秒（x-vercel-cache 永遠 MISS）。
      //    後台工具與同步排程是 server action／route handler，預設一樣不快取，行為不變。
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

export type PacificObject =
  | {
      ok: true;
      detail: PacificDetail;
      photos: string[];
      /** 照片清單沒抓到的原因（兩次都失敗）；抓到了（就算官網真的 0 張）是 null。呼叫端要講給人看，不要默默當「沒有照片」 */
      photoError: string | null;
    }
  | { ok: false; error: string };

/**
 * 照片清單：失敗（沒回應、非 200、回的不是陣列）就隔一下再試一次。
 * 2026-11-05 他回報「導入照片會異常」：同一個編號連續帶入，其中一次照片回來 0 張、其餘 6 張——官網這支偶爾不回，
 * 以前直接當「這一戶沒有照片」，他看起來就是時好時壞。試兩次還不行就把原因帶回去，讓畫面說「再按一次」。
 */
async function fetchPictures(saleId: string, timeoutMs: number): Promise<{ rows: Record<string, unknown>[] } | { error: string }> {
  let last = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await getJson(`GetObjectPicture/${encodeURIComponent(saleId)}`, timeoutMs);
      if (res.status === 200 && Array.isArray(res.body)) return { rows: res.body as Record<string, unknown>[] };
      last = res.status === 200 ? "官網照片清單回的東西認不得" : `官網照片清單回應 ${res.status}`;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      last = /timeout|abort/i.test(msg) ? `官網照片清單 ${Math.round(timeoutMs / 1000)} 秒沒回應` : `連不上官網照片清單：${msg.slice(0, 60)}`;
    }
    if (attempt === 1) await new Promise((r) => setTimeout(r, 400));
  }
  return { error: `${last}（試了兩次）` };
}

/** 一筆物件：欄位＋照片。照片抓不到不算失敗（空陣列＋photoError 說原因），欄位抓不到才是 */
export async function fetchPacificObject(saleIdRaw: string, timeoutMs = 10000): Promise<PacificObject> {
  const saleId = String(saleIdRaw ?? "")
    .trim()
    .toUpperCase();
  if (!PACIFIC_SALE_ID.test(saleId)) return { ok: false, error: `這不是太平洋官網的物件編號：${saleIdRaw}` };

  // 欄位與照片兩支 API 同時打（單戶頁等的是這兩個加起來的時間）；照片抓不到不算失敗，但要說原因
  const [detailOutcome, pics] = await Promise.all([
    getJson(`GetObjectDetail/${encodeURIComponent(saleId)}`, timeoutMs).then(
      (value) => ({ status: "fulfilled" as const, value }),
      (reason: unknown) => ({ status: "rejected" as const, reason }),
    ),
    fetchPictures(saleId, timeoutMs),
  ]);
  if (detailOutcome.status === "rejected") {
    const e = detailOutcome.reason;
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: /timeout|abort/i.test(msg) ? `官網 ${Math.round(timeoutMs / 1000)} 秒沒回應` : `連不上太平洋官網：${msg.slice(0, 80)}` };
  }
  const detailRes = detailOutcome.value;
  if (detailRes.status === 404) return { ok: false, error: `官網找不到 ${saleId}（可能已下架）` };
  if (detailRes.status !== 200) return { ok: false, error: `官網回應 ${detailRes.status}` };
  const detail = sanitizeDetail(detailRes.body);
  // 官網對不存在的編號也回 200＋空物件（2026-11-05 實測未上架的 P0002225），不是改版
  if (!detail) return { ok: false, error: `官網沒有 ${saleId} 這筆（可能還沒上架、或已下架）` };

  const photos: string[] = [];
  if ("rows" in pics) {
    const rows = pics.rows
      .filter((p) => p && Number(p.type) === 1 && /^https?:\/\//.test(String(p.sysFileName ?? "")))
      .map((p, i) => ({ url: String(p.sysFileName), sort: Number(p.sort ?? 9999), i }))
      .sort((a, b) => a.sort - b.sort || a.i - b.i);
    for (const r of rows) if (!photos.some((u) => u.toLowerCase() === r.url.toLowerCase())) photos.push(r.url);
  }
  return { ok: true, detail, photos, photoError: "rows" in pics ? null : pics.error };
}

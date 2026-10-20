/**
 * 🔀 /map 物件比較 —— 前後端共用的小規則（純函式，沒有任何相依，client 與 server 都能 import）
 *
 * 客戶在 /map 的在售物件卡片按「＋ 比較」勾起來，浮在畫面底下的比較列按「開始比較」
 * 開新分頁 `/map/compare?ids=<id>,<id>…`。id 就是 map_listing 的 id（UUID）。
 */

/** 最多比幾件。四件是桌機一排放得下、手機左右滑還看得懂的上限 */
export const COMPARE_MAX = 4;

/** 至少幾件才有「比較」的意義 */
export const COMPARE_MIN = 2;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 太平洋官網 S／P 編號（match_listing 主鍵）。2026-10-20 起建案地圖的「＋ 比較」勾的是這個 */
const SALE_ID_RE = /^[SP]\d{5,}$/i;

/** 這個 id 是官網物件（S 編號）還是後台地圖物件（UUID） */
export function isSaleId(id: string): boolean {
  return SALE_ID_RE.test(String(id ?? "").trim());
}

/**
 * 網址 `?ids=a,b,c`（或重複的 `?ids=a&ids=b`）→ 去重、只留長得像 map_listing id（UUID）或官網 S 編號的、最多 COMPARE_MAX 個。
 * 亂打的東西直接丟掉，不會進資料庫查詢。UUID 一律小寫、S 編號一律大寫（兩張表主鍵就是這樣存的）。
 */
export function parseCompareIds(raw: string | string[] | undefined | null): string[] {
  const joined = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  const out: string[] = [];
  for (const piece of joined.split(/[,\s]+/)) {
    const t = piece.trim();
    const id = SALE_ID_RE.test(t) ? t.toUpperCase() : t.toLowerCase();
    if (!(UUID_RE.test(id) || SALE_ID_RE.test(id)) || out.includes(id)) continue;
    out.push(id);
    if (out.length >= COMPARE_MAX) break;
  }
  return out;
}

/** 比較頁的網址。id 只有 0-9a-f 與連字號，不用 encode */
export function compareHref(ids: string[]): string {
  return `/map/compare?ids=${ids.join(",")}`;
}

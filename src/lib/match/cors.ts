/**
 * 跨站呼叫配對 API —— 只開給店頭官網
 *
 * 2026-10-05 他說「把同事版的物件配對改這個官網內的配對給客人連結」：同事的客人收到的
 * 不再是 weikaihouse.com/match，而是店頭官網 https://pacifi-realtor-wuchi.vercel.app/?b=<識別碼>#match。
 * 店頭官網是**靜態站**（單一 index.html，沒有後端），所以那一頁只能從客人的瀏覽器直接打這裡要資料。
 * 瀏覽器對「別的網域」會先問准不准（CORS），不回允許標頭就整個擋掉。
 *
 * 規矩：
 *   ① 來源寫死在下面這份名單裡，不聽 Origin 標頭自己說的話；
 *   ② 不開 Access-Control-Allow-Credentials —— 這幾支認的是網址裡簽章過的買方識別碼（lib/match/token.ts），
 *      不是登入 cookie。沒有 cookie 跟著跑，就沒有「別的網站借客人的登入狀態」這種事；
 *   ③ 只開 /api/match/brief（讀自己的配對結果）與 /api/match/viewing（送預約）這兩支。
 *      後台、同事管理、推播那些一律不開。
 */

/** 准許跨站打配對 API 的來源。日後店頭官網換成自有網域，就在這裡多加一行 */
const ALLOWED_ORIGINS = new Set<string>([
  "https://pacifi-realtor-wuchi.vercel.app", // 太平洋房屋 梧棲新市鎮旗艦加盟店 官網（另一個 Vercel 專案）
]);

/** 這個來源在名單裡嗎 */
export function corsOriginAllowed(origin: string | null | undefined): boolean {
  return typeof origin === "string" && ALLOWED_ORIGINS.has(origin);
}

/**
 * 回應要加的 CORS 標頭。來源不在名單裡就只回 Vary（等於不允許，瀏覽器那邊自己擋）。
 * methods 要把 OPTIONS 一起寫進去，瀏覽器的預檢才過。
 */
export function corsHeaders(
  origin: string | null | undefined,
  methods = "GET,OPTIONS",
): Record<string, string> {
  if (!corsOriginAllowed(origin)) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": String(origin),
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

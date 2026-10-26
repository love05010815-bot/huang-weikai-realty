/**
 * 🔑 租屋（2026-10-26 系統擁有者：「在這個配對裡面增加租屋的物件，一樣從太平洋官網抓取以下店別的物件，
 * 但不導入外部連結，直接在我的網站裡產出物件資料（跟買賣物件相同，但不用作貸款試算）」；同日下午再拍板
 * 「代客建檔的連結裡也要做一個區分是要買屋還是租的」）。
 *
 * 租屋跟買賣走同一張 match_listing（deal 欄：sale／rent）、同一支官網查詢 API（Type 2 是租）、同一套評分引擎、
 * 同一張條件表單（Preference.deal；lib/match/matcher.ts）—— 只是價格的單位是「元／月」，「類型」是出租型態
 * （官網的 rentTypeName，存在 usage_type；選項在 config/match.ts 的 RENT_TYPES），不看屋齡樓層車位。
 * 這裡只剩價格的寫法；純函式，check:match 直接載來測。
 */

export type Deal = "sale" | "rent";

/** 26000 → 「26,000 元／月」 */
export function formatRent(n: number): string {
  return `${Math.round(Number(n) || 0).toLocaleString("zh-TW")} 元／月`;
}

/** 買賣寫「萬」、出租寫「元／月」—— 卡片、預約、LINE 通知都用這一個，別各寫各的 */
export function formatDealPrice(price: number, deal: Deal | string | null | undefined): string {
  return deal === "rent" ? formatRent(price) : `${Number(price).toLocaleString("zh-TW")} 萬`;
}

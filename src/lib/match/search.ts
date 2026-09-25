/**
 * 「一組條件 → 配對結果」的本體。三個地方共用，結果的形狀只有這一份：
 *   - /api/match/search        買方在 /match 按「開始配對」
 *   - /match?k=…&go=1 的頁面   專員傳給客戶的專屬連結：**伺服器端先配好、跟著 HTML 一起送**，
 *                              客戶點開第一眼就是物件，不會先看到一張空表單（2026-09-27 他反映等 5 秒會誤會要重填）
 *   - lib/match/intake.ts      專員在後台／手機看這位買方目前符合幾間
 *
 * 這裡不存任何東西、不看權限；誰叫它、要不要順手把條件存起來，由呼叫端決定。
 */
import { MATCH } from "@/config/match";
import { describePreference, rankListings, type Preference } from "./matcher";
import { publicListing } from "./public";
import { listAvailableListings } from "./store";

/** 畫面只鋪前 40 張卡：再多手機滑不完、圖也重。matched 另外回真的有幾間符合 */
export const SEARCH_SHOW_MAX = 40;

export type PublicMatch = ReturnType<typeof publicListing> & {
  score: number;
  reasons: string[];
  misses: string[];
  recommended: boolean;
};

export type SearchPayload = {
  buyerId: string | null;
  summary: string;
  threshold: number;
  /** 目前在售總數 */
  total: number;
  /** 符合條件的總數；matches 只有前 SEARCH_SHOW_MAX 筆 */
  matched: number;
  matches: PublicMatch[];
};

export async function runMatchSearch(preference: Preference, buyerId: string | null): Promise<SearchPayload> {
  const listings = await listAvailableListings();
  // 先全部配完才知道「真的有幾間符合」—— 40 間跟 99 間在畫面上不能長得一模一樣
  const ranked = rankListings(preference, listings, { limit: listings.length || 1 });
  return {
    buyerId,
    summary: describePreference(preference),
    threshold: MATCH.threshold,
    total: listings.length,
    matched: ranked.length,
    matches: ranked.slice(0, SEARCH_SHOW_MAX).map((m) => ({
      ...publicListing(m.listing),
      score: m.score,
      reasons: m.reasons,
      misses: m.misses,
      recommended: m.score >= MATCH.threshold,
    })),
  };
}

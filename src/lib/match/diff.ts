/**
 * 同步前後的比對 —— 純函式，不碰資料庫、不碰網路
 *
 * 目前只有一件事：找出「價格跟上次同步不一樣」的物件，拿去發價格異動通知。
 *
 * ⚠️ 這段最容易安靜地出錯：愛屋改版或解析壞掉時價格會變成 0，
 *    如果把 0 當成「降到 0 萬」，全店物件都會被判定降價、一次把幾百則錯誤推播送出去。
 *    所以兩邊的價格都必須 > 0 才算數。上限保護在 lib/match/sync.ts（maxPriceChangesPerSync）。
 *
 * ⚠️ 這個檔刻意不 import 任何 "@/..." 的東西：scripts/check-match.mjs 用 node 直接載它跑測試。
 */

/** 同步前的快照值（見 store.ts 的 getListingSnapshot） */
export type Snapshot = { status: string; price: number };

export type PriceChange<T> = {
  listing: T;
  /** 同步前的價格（萬） */
  priceFrom: number;
};

/**
 * 找出價格有異動的物件。
 *
 * 不算異動的情況：
 *   - 這次才第一次出現（那是新物件，走新物件通知）
 *   - 上次是 hidden（已下架又上架，價格比較沒有意義）
 *   - 任一邊的價格不是正數（多半是解析失敗）
 *   - 價格一樣
 */
export function detectPriceChanges<T extends { id: string; price: number }>(
  before: Map<string, Snapshot>,
  now: T[],
): PriceChange<T>[] {
  const out: PriceChange<T>[] = [];
  for (const listing of now) {
    const prev = before.get(listing.id);
    if (!prev || prev.status !== "available") continue;
    if (!(prev.price > 0) || !(listing.price > 0)) continue;
    if (prev.price === listing.price) continue;
    out.push({ listing, priceFrom: prev.price });
  }
  return out;
}

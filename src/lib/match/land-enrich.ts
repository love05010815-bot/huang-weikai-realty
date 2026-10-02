/**
 * 土地的類別改用愛屋抓（2026-10-02 他說「那把土地改用愛屋抓取」）
 *
 * 太平洋官網的土地只寫「土地」，農地／建地分不出來，買方指定土地類別時就配不到。
 * 愛屋店網的**物件頁**有寫（「型態/類別 土地 /土地:農地」「使用分區 一般農業區」「地坪 876.94 坪」），
 * 而且不限本店：海線七家店在愛屋的代碼都是 H229，別家店的 S 編號用梧棲店的 storeid 一樣讀得到（實測）。
 *
 * 做法：庫裡每一筆在售的土地，第一次看到就去讀一次它的愛屋物件頁，把類別、地坪、使用分區、愛屋編號補進去，
 * 記下 houseol_checked_at；之後官網再同步也不會把補好的蓋掉（store.ts 的 upsert 用 houseol_checked_at 擋）。
 * 什麼時候跑：兩個來源都不到期的那一次 keep-warm（每 30 分鐘至少有一次），一次最多 20 筆；
 * 後台「立即同步」會多跑一次（最多 60 筆）。讀不到（404、頁面沒有那一格）也記 checked，不再重試；
 * 網路錯誤就不記，下次再試。
 */
import { MATCH } from "@/config/match";
import { parseHouseolDetail } from "./houseol-parse";
import { countLandPending, listLandToEnrich, saveLandDetail } from "./store";

const SITE = "https://www.houseol.com.tw";
const UA = "Mozilla/5.0 (compatible; weikaihouse-match-sync/1.0)";

export type LandEnrichSummary = {
  /** 這次讀了幾頁 */
  checked: number;
  /** 讀到類別、寫進去的 */
  enriched: number;
  /** 愛屋沒有這一筆（404 或頁面沒有那一格） */
  notFound: number;
  /** 網路錯誤，下次再試 */
  failed: number;
  /** 還剩幾筆沒查 */
  pending: number;
};

/** 愛屋物件頁的網址。店碼是七家店共用的 H229，storeid 用梧棲店的就讀得到 */
export function houseolDetailUrl(saleId: string): string {
  return `${SITE}/sell_item/${MATCH.houseolStoreCode}-${encodeURIComponent(saleId)}/?storeid=${encodeURIComponent(MATCH.houseolStoreId)}`;
}

export async function enrichLandFromHouseol({
  budgetMs = 30_000,
  limit = 20,
  concurrency = 4,
}: { budgetMs?: number; limit?: number; concurrency?: number } = {}): Promise<LandEnrichSummary> {
  const startedAt = Date.now();
  const todo = await listLandToEnrich(limit);
  let checked = 0;
  let enriched = 0;
  let notFound = 0;
  let failed = 0;

  for (let i = 0; i < todo.length; i += concurrency) {
    if (Date.now() - startedAt > budgetMs) break;
    const batch = todo.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async ({ id }) => {
        try {
          const res = await fetch(houseolDetailUrl(id), { headers: { "User-Agent": UA }, cache: "no-store" });
          if (res.status === 404) {
            await saveLandDetail(id, null);
            checked++;
            notFound++;
            return;
          }
          if (!res.ok) throw new Error(`回應 ${res.status}`);
          const detail = parseHouseolDetail(await res.text());
          if (!detail) {
            await saveLandDetail(id, null);
            checked++;
            notFound++;
            return;
          }
          await saveLandDetail(id, detail);
          checked++;
          enriched++;
        } catch (e) {
          failed++;
          console.error(`[match/land] ${id} 讀愛屋物件頁失敗:`, e);
        }
      }),
    );
  }

  const pending = await countLandPending();
  return { checked, enriched, notFound, failed, pending };
}

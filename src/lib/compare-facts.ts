/**
 * 📋 「物件介紹」連結 → 比較表要的九個欄位（HouseolFacts）—— 伺服器專用（抓網路、查資料庫）
 *
 * /map/compare（地圖在售物件）與 /favorites/compare（收藏的精選好案）都從這裡拿；
 * 「這顆連結是愛屋型錄還是太平洋分享連結」只在這裡判斷一次 ——
 * 2026-10-15 太平洋 P 編號那次就是同一條規則在三個地方各寫一份、各壞各的，不要再複製。
 *
 *   ・愛屋型錄 es.houseol.com.tw/…No=AA…        → 抓 HTML 解析（lib/houseol-facts.ts）
 *   ・太平洋分享連結 prim.pacific.com.tw/s/<代碼> → 分享 API＋官網同步表（lib/prim-facts.ts）
 *   ・其他（591、官網物件頁、後台沒填）          → null，畫面整欄「—」並說明「不是型錄連結」
 *
 * 兩條路都「抓不到就 null、永遠不 throw」，四戶並行抓、一戶掛了其他戶照常。
 * 快取跟卡片售價同一份（Next data cache 一小時），比較頁多開幾次不會多打對方網站。
 */
import { fetchHouseolFacts, type HouseolFacts } from "@/lib/houseol-facts";
import { houseolCaseId } from "@/lib/houseol-price";
import { fetchPacificFacts, fetchPrimFacts } from "@/lib/prim-facts";
import { pacificSaleIdFrom, primShareCode } from "@/lib/prim-share";

/**
 * 這顆連結認得出是型錄（愛屋）、太平洋分享連結、或官網物件頁 —— 九項抓得到才有意義；false 時畫面要跟客戶講清楚。
 * 官網物件頁是 2026-10-20 加的：建案地圖改列官網在售物件之後，「＋ 比較」勾的是 S 編號。
 */
export function isCatalogHref(href: string | null | undefined): boolean {
  if (!href) return false;
  return Boolean(primShareCode(href) || houseolCaseId(href) || pacificSaleIdFrom(href));
}

/** 連結 → 九個欄位。不是型錄連結、抓不到 → null；永遠不 throw */
export async function fetchCompareFacts(href: string | null | undefined): Promise<HouseolFacts | null> {
  if (!href) return null;
  if (primShareCode(href)) return fetchPrimFacts(href);
  if (houseolCaseId(href)) return fetchHouseolFacts(href);
  if (pacificSaleIdFrom(href)) return fetchPacificFacts(href);
  return null;
}

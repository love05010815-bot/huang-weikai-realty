/**
 * /favorites/compare —— 收藏的精選好案比較表
 *
 * 2026-10-20 系統擁有者：「客戶在我的最愛裡面的物件也設置一個可以比較的表及按鈕」。
 * 收藏頁（/favorites）精選好案那一列按「＋ 比較」勾起來、畫面底下的比較列按「開始比較」開到這裡，
 * 跟 /map/compare 同一張九項表（開價／建案名／屋齡／樓層樓高／登記坪數／主＋附屬坪數／格局／車位／公設比）：
 * 畫面共用 app/map/compare/CompareView.tsx，九項一樣從各戶「物件資訊」那顆連結現抓（lib/compare-facts.ts）。
 *
 * 網址：`/favorites/compare?l=<slug>,<slug>…`（最多 COMPARE_MAX 件；slug 就是 /listings/<slug> 那個）。
 *   ・slug 亂打、格式不對 → 直接丟掉，不進資料庫（parseCompareSlugs）
 *   ・已下架、整筆被刪的 → 略過，其他戶照比，頁面上說明「有 N 件已下架」
 *   ・一件都沒有 → 空狀態，引導回 /favorites 去勾
 *
 * 建案名那列：精選好案沒有掛建案（它跟 /map 的在售物件是兩套資料），拿後台填的 area 欄「行政區・建案名」拆。
 * 不走 getPublicListings()：那支會把全部上架物件的售價抓一輪，這裡只要勾的那幾戶（售價就在型錄那份裡）。
 */
import type { Metadata } from "next";
import type { Listing } from "@/config/listings";
import { OWNER } from "@/config/owner";
import { fetchCompareFacts, isCatalogHref } from "@/lib/compare-facts";
import { parseCompareSlugs, splitListingArea } from "@/lib/favorites";
import { getListingBySlug } from "@/lib/listings";
import CompareView, { type CompareEntry } from "@/app/map/compare/CompareView";

/** 網址帶 slug、每次都查資料庫 —— 這頁本來就是動態的；型錄那層自己有一小時快取 */
export const dynamic = "force-dynamic";

/** 四戶型錄各 6 秒逾時並行抓，再加資料庫；預設的 function 時限不留餘裕 */
export const maxDuration = 25;

export const metadata: Metadata = {
  title: `物件比較｜我的最愛精選好案並排對照｜${OWNER.name}`,
  description: "把收藏的物件放在一起看：開價、建案、屋齡、樓層、登記坪數與主＋附屬坪數、格局、車位、公設比一次對照。",
  // 網址帶 slug、內容隨勾選組合變 —— 不給 Google 收錄，免得同一批物件被當成一堆重複頁
  robots: { index: false, follow: true },
};

type Search = { l?: string | string[] };

export default async function FavoritesComparePage({ searchParams }: { searchParams: Promise<Search> }) {
  const { l } = await searchParams;
  const slugs = parseCompareSlugs(l);

  // 一戶一戶查（最多 COMPARE_MAX 戶）：照網址順序排，已下架／刪掉的略過。不抓售價 —— 售價跟九項一起從型錄來
  const active: Listing[] = [];
  for (const slug of slugs) {
    const found = await getListingBySlug(slug, { withPrice: false });
    if (found.listing && found.status === "active") active.push(found.listing);
  }

  // 型錄並行抓：一戶抓不到就那一戶 null（整欄顯示「—」），其他戶照常；fetchCompareFacts 永遠不 throw
  const entries: CompareEntry[] = await Promise.all(
    active.map(async (item) => {
      const href = item.link?.href ?? null;
      const area = splitListingArea(item.area);
      return {
        listing: { id: item.slug, title: item.title, photos: item.photos, linkHref: href },
        project: area.name ? { name: area.name, area: area.district } : null,
        facts: await fetchCompareFacts(href),
        catalogLink: isCatalogHref(href),
      };
    }),
  );

  return <CompareView source="favorites" entries={entries} dropped={slugs.length - entries.length} />;
}

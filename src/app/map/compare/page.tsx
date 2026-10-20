/**
 * /map/compare —— 我的在售物件比較表
 *
 * 2026-09-10 系統擁有者指定：客戶在「海線建案一覽」（/map）點我在賣的物件「＋ 比較」，
 * 到這一頁把 開價／建案名／屋齡／樓層樓高／登記坪數／主＋附屬坪數／格局／車位有無／公設比
 * （第五列原本是主建物坪數，2026-09-11 系統擁有者改成登記坪數）
 * 九項並排對照。**九項全部從各戶「物件介紹」那顆連結現抓**（愛屋型錄或太平洋分享連結，
 * 判斷與抓取都在 lib/compare-facts.ts），不在資料庫、後台沒欄位 —— 跟卡片售價同一條資料線、同一個一小時快取。
 *
 * 網址：`/map/compare?ids=<map_listing id>,<id>…`（最多 COMPARE_MAX 件）。
 *   ・id 亂打、不是 UUID → 直接丟掉，不進資料庫
 *   ・已下架、找不到的 → 略過，其他戶照比，頁面上說明「有 N 件已下架」
 *   ・一件都沒有 → 空狀態，引導回 /map 去勾
 *
 * 這個檔只做「讀網址＋查資料庫＋抓型錄」，畫面在 CompareView.tsx（2026-10-20 起跟 /favorites/compare 共用）。
 */
import type { Metadata } from "next";
import { OWNER } from "@/config/owner";
import { AREA_LABEL, PROJECTS } from "@/data/port-projects";
import { fetchCompareFacts, isCatalogHref } from "@/lib/compare-facts";
import { isSaleId, parseCompareIds } from "@/lib/map-compare";
import { getPublicMapListingsByIds } from "@/lib/map-listings";
import { getListings } from "@/lib/match/store";
import { pacificDetailUrl } from "@/lib/prim-share";
import { attributeListing } from "@/lib/project-inventory";
import { INVENTORY_INDEX, sourceFromListing } from "@/lib/project-inventory-data";
import CompareView, { type CompareEntry } from "./CompareView";

/** 網址帶 ids、每次都查資料庫 —— 這頁本來就是動態的；型錄那層自己有一小時快取 */
export const dynamic = "force-dynamic";

/** 四戶型錄各 6 秒逾時並行抓，再加資料庫；預設的 function 時限不留餘裕 */
export const maxDuration = 25;

export const metadata: Metadata = {
  title: `物件比較｜台中海線在售物件並排對照｜${OWNER.name}`,
  description: "把在意的條件放在一起看：開價、建案、屋齡、樓層、登記坪數與主＋附屬坪數、格局、車位、公設比一次對照。",
  // 網址帶 ids、內容隨勾選組合變 —— 不給 Google 收錄，免得同一批物件被當成一堆重複頁
  robots: { index: false, follow: true },
};

type Search = { ids?: string | string[] };

export default async function ComparePage({ searchParams }: { searchParams: Promise<Search> }) {
  const { ids: raw } = await searchParams;
  const ids = parseCompareIds(raw);
  // 2026-10-20 起建案地圖勾的是官網物件（S 編號，match_listing）；舊連結裡的 UUID（後台地圖物件）照樣認
  const uuidIds = ids.filter((id) => !isSaleId(id));
  const saleIds = ids.filter(isSaleId);
  const rows = uuidIds.length > 0 ? await getPublicMapListingsByIds(uuidIds) : [];
  const units = saleIds.length > 0 ? (await getListings(saleIds)).filter((u) => u.status === "available") : [];

  // 型錄並行抓：一戶抓不到就那一戶 null（整欄顯示「—」），其他戶照常；fetchCompareFacts 永遠不 throw
  const built = await Promise.all([
    ...rows.map(async (row): Promise<CompareEntry> => {
      const project = PROJECTS.find((p) => p.id === row.projectId) ?? null;
      return {
        listing: { id: row.id, title: row.title, photos: row.photos, linkHref: row.linkHref },
        project: project ? { name: project.name, area: AREA_LABEL[project.area] } : null,
        facts: await fetchCompareFacts(row.linkHref),
        catalogLink: isCatalogHref(row.linkHref),
      };
    }),
    ...units.map(async (u): Promise<CompareEntry> => {
      // 建案照地圖同一套規則對（標題案名／座標最近），九項從官網單筆 API 來
      const hit = attributeListing(INVENTORY_INDEX, sourceFromListing(u));
      const project = hit ? (PROJECTS.find((p) => p.id === hit.projectId) ?? null) : null;
      const href = pacificDetailUrl(u.id);
      return {
        listing: { id: u.id, title: u.title, photos: u.images.slice(0, 1), linkHref: href },
        project: project ? { name: project.name, area: AREA_LABEL[project.area] } : null,
        facts: await fetchCompareFacts(href),
        catalogLink: true,
      };
    }),
  ]);
  // 照客戶勾的順序排
  const byId = new Map(built.map((e) => [e.listing.id, e]));
  const entries = ids.map((id) => byId.get(id)).filter((e): e is CompareEntry => e !== undefined);

  return <CompareView source="map" entries={entries} dropped={ids.length - entries.length} />;
}

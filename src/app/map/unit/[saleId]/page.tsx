/**
 * /map/unit/[saleId] —— 太平洋官網在售物件的站內單戶頁（2026-10-20）
 *
 * 建案地圖的詳情面板從 2026-10-20 起會自動列出太平洋官網在那個建案的在售物件（lib/project-inventory*.ts），
 * 客戶點其中一戶就來這裡 —— 不外連官網（跟當天「精選好案／地圖物件都不導去外部網站」的拍板一致）。
 * 版面、資料邏輯跟精選好案與地圖物件的單戶頁**同一份**（`ListingView` ＋ `lib/listing-detail.ts` ＋ `lib/listing-facts.ts`），
 * 只差網址、麵包屑、回哪裡、預約去哪、不能收藏。
 *
 * 資料：`match_listing`（官網同步表）那一筆 → S 編號 → 官網單筆 API（Data Cache 一小時）。
 *   ・照片用官網的全部（match_listing 只存封面一張）；官網讀不到就只剩那張封面。
 *   ・售價以同步表為準（每 30 分鐘更新），沒有才退回官網單筆。
 *   ・已下架（同步表 hidden）不 404：客戶從舊連結進來看到「已下架」＋回建案；整筆不在表裡才 404。
 *   ・「預約看這戶」進 /match?book=<S 編號>：自動配對那一頁的預約表單（BK 編號、綁 LINE 收確認）。
 *
 * 🔴 **noindex**：這些是整個太平洋海線七家店的物件（八百多筆、每天在變），每戶再給 Google 一頁等於跟官網重複內容；
 *    客戶要的是「在這棟裡有哪些」，不是搜尋流量。精選好案與他自己上架的地圖物件那兩種單戶頁照舊 index。
 * 刻意沒有 generateStaticParams（同上，八百多筆不預產）；第一次被點才算，之後 ISR 五分鐘。
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { OWNER, SITE_URL } from "@/config/owner";
import type { Listing } from "@/config/listings";
import { AREA_LABEL, PROJECTS, type Project } from "@/data/port-projects";
import { loadListingDetail, type ListingDetail } from "@/lib/listing-detail";
import { detailFeatures, keyStats } from "@/lib/listing-facts";
import { getListing, type MatchListing } from "@/lib/match/store";
import { PACIFIC_SALE_ID, pacificDetailUrl } from "@/lib/prim-share";
import { attributeListing, priceText } from "@/lib/project-inventory";
import { INVENTORY_INDEX, sourceFromListing } from "@/lib/project-inventory-data";
import ListingView, { absolutePhoto, type ListingViewMode } from "@/app/listings/[slug]/ListingView";

export const revalidate = 300;

type Params = { saleId: string };

/** 建置時一戶都不預產（八百多筆、每天在變）；回空陣列只是讓 Next 把這條路當 ISR：第一次被點才算，之後五分鐘內直接給快取 */
export async function generateStaticParams(): Promise<Params[]> {
  return [];
}

type PageData = { row: MatchListing; project: Project | null; item: Listing; detail: ListingDetail | null } | null;

/** 這一頁要的資料一次算好：generateMetadata 與頁面共用（React cache） */
const loadPage = cache(async (raw: string): Promise<PageData> => {
  const saleId = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (!PACIFIC_SALE_ID.test(saleId)) return null;
  let row: MatchListing | null = null;
  try {
    row = await getListing(saleId);
  } catch {
    row = null;
  }
  // 出租物件（deal='rent'，2026-10-26）各有各的頁 /rent/<編號>：這頁的價格寫法是「萬」，畫出租會變成「26,000 萬」
  if (!row || row.deal === "rent") return null;

  const hit = attributeListing(INVENTORY_INDEX, sourceFromListing(row));
  const project = hit ? (PROJECTS.find((p) => p.id === hit.projectId) ?? null) : null;
  const active = row.status === "available";
  const detail = active ? await loadListingDetail(pacificDetailUrl(saleId)) : null;
  const cover = row.images.filter((u) => /^https?:\/\//i.test(u));
  const photos = detail && detail.photos.length > 0 ? detail.photos : cover;
  const area = project?.name || row.district || "海線物件";
  const price = active ? (row.price > 0 ? row.price : (detail?.detail.price ?? null)) : null;
  const item: Listing = {
    slug: saleId,
    title: row.title,
    points: [],
    area,
    photos,
    link: null,
    video: null,
    price,
    status: active ? "active" : "sold",
  };
  return { row, project, item, detail };
});

function modeFor(saleId: string, project: Project | null, active: boolean): ListingViewMode {
  const back = project ? `/map?project=${encodeURIComponent(project.id)}` : "/map";
  return {
    pageHref: `/map/unit/${saleId}`,
    // 麵包屑最後一層 ListingView 自己會印 item.area（＝建案名），這裡不用再放一層建案，不然會「聯悅臻 › 聯悅臻」
    crumbs: [{ name: "海線社區一覽", href: "/map" }],
    backHref: back,
    backLabel: project ? `← 回 ${project.name}` : "← 回建案地圖",
    bookingHref: active ? `/match?book=${encodeURIComponent(saleId)}` : "/match",
    soldCtaLabel: project ? `看 ${project.name} 其他在售` : "回建案地圖",
    collectible: false,
  };
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { saleId } = await params;
  const data = await loadPage(saleId);
  const siteName = `${OWNER.name}｜台中海線房仲`;
  if (!data) return { title: `找不到這個物件｜${OWNER.name}`, robots: { index: false, follow: true } };

  const { row, project, item, detail } = data;
  const url = `${SITE_URL}/map/unit/${row.id}`;
  if (row.status !== "available") {
    const title = `此物件已下架｜${item.area}｜${OWNER.name}`;
    return {
      metadataBase: new URL(SITE_URL),
      title,
      description: `${item.area}「${item.title}」目前不在銷售中。台中海線還有其他在售物件，歡迎到建案地圖看看或線上預約。`,
      robots: { index: false, follow: true },
      alternates: { canonical: "/map" },
      openGraph: { type: "website", url, title, siteName },
    };
  }

  const priceLabel = item.price != null ? `售價 ${priceText(item.price)}` : "";
  const title = `${[item.area, item.title, priceLabel].filter(Boolean).join("｜")}｜${OWNER.name}`;
  const specs = detail ? keyStats(detail.detail, detail.share).map((s) => `${s.label} ${s.value}`) : [];
  const blurb = detail ? detailFeatures(detail.detail).slice(0, 2) : [];
  const description = `${[...specs, ...blurb].join("、") || item.title}。台中海線房仲${OWNER.name}親自帶看，線上預約看屋。`;
  const coverUrl = item.photos[0] ? absolutePhoto(item.photos[0]) : `${SITE_URL}${OWNER.photoUrl}`;
  const alt = `${item.area}－${item.title}`;
  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    keywords: [item.area, project ? AREA_LABEL[project.area] : row.district, item.title, "台中海線", OWNER.name].filter(Boolean),
    // 官網物件的鏡像頁，不給搜尋引擎收（見檔頭）；分享預覽照樣有圖
    robots: { index: false, follow: true },
    alternates: { canonical: `/map/unit/${row.id}` },
    openGraph: { type: "website", url, title, description, siteName, images: [{ url: coverUrl, alt }] },
    twitter: { card: "summary_large_image", title, description, images: [coverUrl] },
  };
}

export default async function PacificUnitPage({ params }: { params: Promise<Params> }) {
  const { saleId } = await params;
  const data = await loadPage(saleId);
  if (!data) notFound();
  const { row, project, item, detail } = data;
  const active = row.status === "available";
  return <ListingView item={item} status={active ? "active" : "sold"} detail={detail} mode={modeFor(row.id, project, active)} />;
}

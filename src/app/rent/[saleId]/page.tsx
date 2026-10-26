/**
 * /rent/[saleId] —— 太平洋官網出租物件的站內單戶頁（2026-10-26）
 *
 * 系統擁有者：「在這個配對裡面增加租屋的物件，一樣從太平洋官網抓取以下店別的物件，但不導入外部連結，
 * 直接在我的網站裡產出物件資料（跟買賣物件相同，但不用作貸款試算）」。
 * 所以這一頁跟 /map/unit/<編號>（官網在售物件）同一套：ListingView ＋ lib/listing-detail.ts ＋ lib/listing-facts.ts，
 * 只差 mode.deal="rent" —— 價格寫「租金 X 元／月」、沒有房貸月付金那一格、沒有降價、多「出租」標籤與「出租型態」那一列。
 *
 * 資料：match_listing 裡 deal='rent' 的那一筆（lib/match/sync.ts 的 pacific_rent 來源每 30 分鐘同步）→ 編號（R／P／C 開頭）→
 * 官網單筆 API（跟買賣同一支，Data Cache 一小時）。買賣的編號來這裡會 404（各走各的頁，/map/unit 也不收出租）。
 *   ・照片用官網的全部；官網讀不到就只剩同步表存的那張封面。
 *   ・租金以同步表為準（每 30 分鐘更新），沒有才退回官網單筆。
 *   ・已下架（同步表 hidden）不 404：客戶從舊連結進來看到「已下架」＋回租屋快搜；整筆不在表裡才 404。
 *   ・「預約看這戶」進 /match?book=<編號>：跟買賣同一個預約表單（BK 編號、綁 LINE 收確認）。
 *
 * 🔴 noindex：跟 /map/unit 同一個理由 —— 官網物件的鏡像頁，每戶再給 Google 一頁等於跟官網重複內容；分享預覽照樣有圖。
 * 刻意沒有 generateStaticParams；第一次被點才算，之後 ISR 五分鐘。
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { OWNER, SITE_URL } from "@/config/owner";
import type { Listing } from "@/config/listings";
import { AREA_LABEL, PROJECTS, type Project } from "@/data/port-projects";
import { loadListingDetail, type ListingDetail } from "@/lib/listing-detail";
import { detailFeatures, keyStats } from "@/lib/listing-facts";
import { formatRent } from "@/lib/match/rent";
import { getListing, type MatchListing } from "@/lib/match/store";
import { PACIFIC_SALE_ID, pacificDetailUrl } from "@/lib/prim-share";
import { attributeListing } from "@/lib/project-inventory";
import { INVENTORY_INDEX, sourceFromListing } from "@/lib/project-inventory-data";
import ListingView, { absolutePhoto, type ListingViewMode } from "@/app/listings/[slug]/ListingView";

export const revalidate = 300;

type Params = { saleId: string };

/** 建置時一戶都不預產；回空陣列只是讓 Next 把這條路當 ISR：第一次被點才算，之後五分鐘內直接給快取 */
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
  // 只收出租的那一筆：買賣的編號各有各的頁（/listings、/map/unit），不在這裡畫成「租金 X 萬」
  if (!row || row.deal !== "rent") return null;

  const hit = attributeListing(INVENTORY_INDEX, sourceFromListing(row));
  const project = hit ? (PROJECTS.find((p) => p.id === hit.projectId) ?? null) : null;
  const active = row.status === "available";
  const detail = active ? await loadListingDetail(pacificDetailUrl(saleId)) : null;
  const cover = row.images.filter((u) => /^https?:\/\//i.test(u));
  const photos = detail && detail.photos.length > 0 ? detail.photos : cover;
  const area = project?.name || row.district || "海線物件";
  // 租金（元／月）：同步表優先，沒有才退回官網單筆（官網單筆的 sellTotalPrice 在出租物件上就是月租）
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

function modeFor(saleId: string, active: boolean): ListingViewMode {
  return {
    pageHref: `/rent/${saleId}`,
    crumbs: [{ name: "租屋快搜", href: "/match?deal=rent" }],
    // back=1：/match 會把剛才那一頁的結果從 sessionStorage 接回來（MatchApp 的 readLast），客人不用重找
    backHref: "/match?deal=rent&back=1",
    backLabel: "← 返回物件列表",
    bookingHref: active ? `/match?book=${encodeURIComponent(saleId)}` : "/match?deal=rent",
    soldCtaLabel: "看其他出租物件",
    collectible: false,
    deal: "rent",
  };
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { saleId } = await params;
  const data = await loadPage(saleId);
  const siteName = `${OWNER.name}｜台中海線房仲`;
  if (!data) return { title: `找不到這個物件｜${OWNER.name}`, robots: { index: false, follow: true } };

  const { row, project, item, detail } = data;
  const url = `${SITE_URL}/rent/${row.id}`;
  if (row.status !== "available") {
    const title = `此物件已下架｜${item.area}｜${OWNER.name}`;
    return {
      metadataBase: new URL(SITE_URL),
      title,
      description: `${item.area}「${item.title}」目前已不再出租。台中海線還有其他出租物件，歡迎到租屋快搜看看或線上預約。`,
      robots: { index: false, follow: true },
      alternates: { canonical: "/match?deal=rent" },
      openGraph: { type: "website", url, title, siteName },
    };
  }

  const priceLabel = item.price != null ? `租金 ${formatRent(item.price)}` : "";
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
    keywords: [item.area, project ? AREA_LABEL[project.area] : row.district, item.title, "台中海線", "租屋", OWNER.name].filter(Boolean),
    // 官網物件的鏡像頁，不給搜尋引擎收（見檔頭）；分享預覽照樣有圖
    robots: { index: false, follow: true },
    alternates: { canonical: `/rent/${row.id}` },
    openGraph: { type: "website", url, title, description, siteName, images: [{ url: coverUrl, alt }] },
    twitter: { card: "summary_large_image", title, description, images: [coverUrl] },
  };
}

export default async function PacificRentPage({ params }: { params: Promise<Params> }) {
  const { saleId } = await params;
  const data = await loadPage(saleId);
  if (!data) notFound();
  const { row, item, detail } = data;
  const active = row.status === "available";
  return <ListingView item={item} status={active ? "active" : "sold"} detail={detail} mode={modeFor(row.id, active)} />;
}

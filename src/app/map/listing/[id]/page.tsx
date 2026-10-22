/**
 * /map/listing/[id] —— 建案地圖物件的單戶頁（2026-10-20 下午系統擁有者拍板）
 *
 * 他的話：「建案地圖裡面的物件顯示，物件介紹移除，不透過外部連結知道物件資訊，也比照精選好案的顯示方式」。
 * 所以 /map 詳情面板的物件卡不再外連，點整張卡進這一頁；版面、資料邏輯跟精選好案的單戶頁**同一份**
 * （`ListingView` ＋ `lib/listing-detail.ts` ＋ `lib/listing-facts.ts`），只差網址、麵包屑、回哪裡、不能收藏。
 *
 * 資料：`map_listing` 表（後台 /admin/map-listings）那一筆 → 「物件資訊」連結當資料來源 → 太平洋官網完整資料。
 * 🔴 `address` 欄（門牌）**刻意不拿出來**：那是後台自己認物件用的，對外只顯示官網的路名。
 * 下架後不 404（傳出去的網址收不回來），改說「已下架」；整筆被刪才 404。
 *
 * generateStaticParams 回空陣列（刻意）：地圖物件近百戶，建置時一口氣打官網會踩到它的限流，所以不在建置時算；
 * 但**沒有這個函式的話 Vercel 會把這條路由當成純動態、每次都現算**（上線實測第二次請求仍 MISS、0.7 秒），
 * 回空陣列 ＋ dynamicParams 預設 true ＝ 第一次被點才算一次、之後進 Full Route Cache、ISR 五分鐘背景重生，
 * 官網結果另有一小時 Data Cache。卡片是 <Link>，進到畫面就會預先抓，實際點的時候多半已經好了。
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { OWNER, SITE_URL } from "@/config/owner";
import type { Listing } from "@/config/listings";
import { AREA_LABEL, PROJECTS, type Project } from "@/data/port-projects";
import { getPublicMapListingById, type PublicMapListingPage } from "@/lib/map-listings";
import { fetchHouseolPrice, formatWan } from "@/lib/houseol-price";
import { loadListingDetail, type ListingDetail } from "@/lib/listing-detail";
import { detailFeatures, keyStats } from "@/lib/listing-facts";
import ListingView, { absolutePhoto, type ListingViewMode } from "@/app/listings/[slug]/ListingView";

/** 跟 /map 一樣五分鐘；後台存檔會主動 revalidate */
export const revalidate = 300;

type Params = { id: string };

/** 空陣列：建置時不預產任何一戶（理由見檔頭），但讓路由進 ISR 快取 */
export async function generateStaticParams(): Promise<Params[]> {
  return [];
}

type PageData = { rec: PublicMapListingPage; project: Project | null; item: Listing; detail: ListingDetail | null } | null;

/** 這一頁要的資料一次算好：generateMetadata 與頁面共用（React cache）。售價與官網資料並行。 */
const loadPage = cache(async (id: string): Promise<PageData> => {
  const rec = await getPublicMapListingById(id);
  if (!rec) return null;
  const project = PROJECTS.find((p) => p.id === rec.projectId) ?? null;
  const base = {
    slug: rec.id,
    title: rec.title,
    points: rec.points,
    photos: rec.photos,
    link: null,
    video: null,
    status: rec.status,
  };
  if (rec.status === "sold") {
    return { rec, project, item: { ...base, area: project?.name ?? "海線物件", price: null }, detail: null };
  }
  const [price, detail] = await Promise.all([
    rec.linkHref ? fetchHouseolPrice(rec.linkHref) : Promise.resolve(null),
    loadListingDetail(rec.linkHref),
  ]);
  // 卡片上那顆標籤：有建案就是建案名；沒建案的（⭐ 星號物件）用官網的社區名或行政區
  const area = project?.name || detail?.detail.community.trim() || detail?.detail.areaName.trim() || "海線物件";
  return { rec, project, item: { ...base, area, price }, detail };
});

function modeFor(rec: PublicMapListingPage, project: Project | null): ListingViewMode {
  return {
    pageHref: `/map/listing/${rec.id}`,
    crumbs: [{ name: "海線社區一覽", href: "/map" }],
    backHref: "/map",
    backLabel: "← 回建案地圖",
    // 預約表單只認精選好案的 slug（/api/listings/<slug>），地圖物件就不帶參數
    bookingHref: "/card/booking",
    soldCtaLabel: project ? `看 ${project.name} 其他物件` : "回建案地圖",
    collectible: false,
  };
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  const data = await loadPage(id);
  const siteName = `${OWNER.name}｜台中海線房仲`;
  if (!data) {
    return { title: `找不到這個物件｜${OWNER.name}`, robots: { index: false, follow: true } };
  }
  const { rec, project, item, detail } = data;
  const url = `${SITE_URL}/map/listing/${rec.id}`;
  const areaLabel = project ? AREA_LABEL[project.area] : "";

  if (rec.status === "sold") {
    const title = `此物件已下架｜${item.area}｜${OWNER.name}`;
    const description = `${item.area}「${item.title}」目前不在銷售中。台中海線還有其他在售物件，歡迎到建案地圖看看或線上預約。`;
    return {
      metadataBase: new URL(SITE_URL),
      title,
      description,
      robots: { index: false, follow: true },
      alternates: { canonical: "/map" },
      openGraph: { type: "website", url, title, description, siteName },
    };
  }

  const priceText = item.price != null ? `售價 ${formatWan(item.price)}` : "";
  const title = `${[item.area, item.title, priceText].filter(Boolean).join("｜")}｜${OWNER.name}`;
  const specs = detail ? keyStats(detail.detail, detail.share).map((s) => `${s.label} ${s.value}`) : [];
  const blurb = detail ? detailFeatures(detail.detail) : [];
  const tail = (blurb.length > 0 ? blurb : item.points).slice(0, specs.length > 0 ? 2 : 3);
  const description = `${[...specs, ...tail].join("、")}。台中海線房仲${OWNER.name}親自帶看，線上預約看屋。`;
  const photos = item.photos.length > 0 ? item.photos : (detail?.photos ?? []);
  const cover = photos[0] ? absolutePhoto(photos[0]) : `${SITE_URL}${OWNER.photoUrl}`;
  const alt = `${item.area}－${item.title}`;

  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    keywords: [item.area, areaLabel, item.title, "台中海線", "沙鹿梧棲清水龍井", OWNER.name].filter(Boolean),
    robots: { index: true, follow: true },
    alternates: { canonical: `/map/listing/${rec.id}` },
    openGraph: { type: "website", url, title, description, siteName, images: [{ url: cover, alt }] },
    twitter: { card: "summary_large_image", title, description, images: [cover] },
  };
}

export default async function MapListingPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const data = await loadPage(id);
  if (!data) notFound();
  const { rec, project, item, detail } = data;
  return <ListingView item={item} status={rec.status} detail={detail} mode={modeFor(rec, project)} />;
}

/**
 * /listings/[slug] —— 單一物件頁
 *
 * 2026-09-08 系統擁有者拍板做的。目的只有一個：**把某一戶傳給客戶**。
 *   ・以前只有 `/listings#<slug>`，LINE 預覽永遠是整頁清單的標題、沒有那戶的照片。
 *   ・現在每戶一頁，og:image 是它的封面照，標題帶區域、標題、售價。
 *
 * 三個他拍板的行為：
 *   ① 下架後不 404 —— 傳出去的網址收不回來，那頁改說「已下架」＋引導看其他好案。
 *      （後台按「刪除」整筆刪掉的才會 404：那是 not-found.tsx 的「找不到這個物件」。）
 *   ② 「預約看屋」帶 `?listing=<slug>` 進預約表單，後台看得到客戶問的是哪戶。
 *   ③ 售價照 /listings 卡片同一條規則顯示（愛屋型錄現抓，抓不到就不顯示）。
 *
 * 這個檔只做「查資料＋metadata」，畫面在 ListingView.tsx。
 * 資料來源跟清單頁同一個 `lib/listings.ts`，後台存檔／上下架時 server action 會
 * `revalidatePath("/listings/[slug]", "page")` 一次刷掉這底下所有頁。
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OWNER, SITE_URL } from "@/config/owner";
import { getListingBySlug } from "@/lib/listings";
import { formatWan } from "@/lib/houseol-price";
import ListingView, { absolutePhoto } from "./ListingView";

/** 跟 /listings 一樣：後台存檔會主動 revalidate，這裡只是保險 */
export const revalidate = 300;

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const found = await getListingBySlug(slug);
  const siteName = `${OWNER.name}｜台中海線房仲`;

  if (!found.listing) {
    return {
      title: `找不到這個物件｜${OWNER.name}`,
      robots: { index: false, follow: true },
    };
  }

  const item = found.listing;
  const url = `${SITE_URL}/listings/${item.slug}`;

  // 已下架：頁面留著（傳出去的網址不能死），但不讓 Google 收錄，canonical 指回清單
  if (found.status === "sold") {
    const title = `此物件已下架｜${item.area}｜${OWNER.name}`;
    const description = `${item.area}「${item.title}」目前不在銷售中。台中海線沙鹿、梧棲、清水、龍井還有其他精選物件，歡迎線上預約看屋。`;
    return {
      metadataBase: new URL(SITE_URL),
      title,
      description,
      robots: { index: false, follow: true },
      alternates: { canonical: "/listings" },
      openGraph: { type: "website", url, title, description, siteName },
    };
  }

  const priceText = item.price != null ? `售價 ${formatWan(item.price)}` : "";
  const title = `${[item.area, item.title, priceText].filter(Boolean).join("｜")}｜${OWNER.name}`;
  const description = `${item.points.slice(0, 3).join("、")}。台中海線房仲${OWNER.name}親自帶看，線上預約看屋。`;
  const cover = item.photos[0] ? absolutePhoto(item.photos[0]) : `${SITE_URL}${OWNER.photoUrl}`;
  const alt = `${item.area}－${item.title}`;

  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    keywords: [item.area, item.title, "台中海線", "沙鹿梧棲清水龍井", OWNER.name],
    robots: { index: true, follow: true },
    alternates: { canonical: `/listings/${item.slug}` },
    openGraph: {
      type: "website",
      url,
      title,
      description,
      siteName,
      images: [{ url: cover, alt }],
    },
    twitter: { card: "summary_large_image", title, description, images: [cover] },
  };
}

export default async function ListingPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const found = await getListingBySlug(slug);
  if (!found.listing) notFound();
  return <ListingView item={found.listing} status={found.status === "sold" ? "sold" : "active"} />;
}

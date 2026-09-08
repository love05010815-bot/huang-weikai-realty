/**
 * /listings/[slug] —— 單一物件頁
 *
 * 2026-09-08 系統擁有者拍板做的。目的只有一個：**把某一戶傳給客戶**。
 *   ・以前只有 `/listings#<slug>`，LINE 預覽永遠是整頁清單的標題、沒有那戶的照片。
 *   ・現在每戶一頁，og:image 是它的封面照，標題帶區域、標題、售價。
 *
 * 三個他拍板的行為：
 *   ① 下架後不 404 —— 傳出去的網址收不回來，那頁改說「已下架」＋引導看其他好案。
 *   ② 「預約看屋」帶 `?listing=<slug>` 進預約表單，後台看得到客戶問的是哪戶。
 *   ③ 售價照 /listings 卡片同一條規則顯示（愛屋型錄現抓，抓不到就不顯示）。
 *
 * 資料來源跟清單頁同一個 `lib/listings.ts`，後台存檔／上下架時 server action 會
 * `revalidatePath("/listings/[slug]", "page")` 一次刷掉這底下所有頁。
 */
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OWNER, SITE_URL, SOCIAL } from "@/config/owner";
import { getListingBySlug } from "@/lib/listings";
import { formatWan } from "@/lib/houseol-price";
import { resolvePhotoSrc } from "@/lib/photo-src";
import styles from "../../home.module.css";
import lst from "../listings.module.css";
import one from "./listing.module.css";
import SiteNav from "@/app/_ui/SiteNav";
import SocialLinks from "@/app/_ui/SocialLinks";
import SiteFooter from "@/app/_ui/SiteFooter";
import PhotoCarousel from "../PhotoCarousel";
import ListingPageView from "./ListingPageView";

/** 跟 /listings 一樣：後台存檔會主動 revalidate，這裡只是保險 */
export const revalidate = 300;

type Params = { slug: string };

/** 照片存的是 Blob 網址或 public/listings 底下的檔名；分享預覽（og:image）一定要絕對網址 */
function absolutePhoto(value: string): string {
  const src = resolvePhotoSrc(value);
  return /^https?:\/\//i.test(src) ? src : `${SITE_URL}${src}`;
}

const NOTE_TEXT = (
  <>
    ⚠️ 物件資訊僅供初步參考。<strong>實際坪數、格局、屋況與產權，以現場勘查及不動產說明書所載為準</strong>。
    物件狀態隨時可能異動，成交後即下架。詳細條件與價格歡迎預約當面說明。
  </>
);

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

  const item = found.listing;
  const sold = found.status === "sold";
  const shareUrl = `${SITE_URL}/listings/${item.slug}`;
  const displayName = `${item.area} ${item.title}`;

  // Google 的「房地產物件」結構化資料。只給在售的；已下架那頁不該再被當成商品。
  const jsonLd = sold
    ? null
    : {
        "@context": "https://schema.org",
        "@type": "RealEstateListing",
        name: displayName,
        url: shareUrl,
        image: item.photos.map(absolutePhoto),
        description: item.points.join("；"),
        ...(item.price != null
          ? {
              offers: {
                "@type": "Offer",
                price: Math.round(item.price * 10000),
                priceCurrency: "TWD",
                availability: "https://schema.org/InStock",
                url: shareUrl,
              },
            }
          : {}),
        provider: {
          "@type": "RealEstateAgent",
          name: OWNER.name,
          telephone: `+886-${OWNER.phoneRaw.replace(/^0/, "")}`,
          url: SITE_URL,
        },
      };

  const externalLinks = [
    { action: "link", target: item.link },
    { action: "video", target: item.video },
  ].filter((x) => x.target);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.navWrap}>
          <Link href="/" className={styles.brand}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.brandLogo} src="/kaixing-mark.png" alt="凱心成家" width={40} height={40} />
            <span>
              凱心成家
              <small className={styles.brandSub}>{OWNER.company} 台中海線房仲</small>
            </span>
          </Link>
          <SiteNav variant="sub" />
          <div className={styles.navCta}>
            <Link className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`} href="/card/booking">
              線上預約
            </Link>
          </div>
        </div>
      </header>

      <SocialLinks variant="float" />

      <main>
        <section className={styles.section}>
          <div className={`${styles.container} ${one.wrap}`}>
            <nav className={one.crumbs} aria-label="所在位置">
              <Link href="/">首頁</Link>
              <span aria-hidden="true">›</span>
              <Link href="/listings">精選好案</Link>
              <span aria-hidden="true">›</span>
              <span>{item.area}</span>
            </nav>

            {sold ? (
              /* ① 下架後的頁面 —— 2026-09-08 系統擁有者拍板用「已下架，看看其他好案」，不能 404。
                    後台狀態只有 active／sold 兩種、分不出「成交」跟「暫時下架」，
                    所以這裡只說「已下架」，不寫「已成交」（暫時下架的對客戶要說「暫停銷售」）。 */
              <div className={one.soldBox}>
                <span className={styles.eyebrow}>OFF MARKET</span>
                <h1>這戶已經下架了</h1>
                <p>
                  {item.area}「{item.title}」目前不在銷售中。台中海線還有其他正在推的物件；
                  也歡迎直接告訴我您的需求，有合適的第一時間通知您。
                </p>
                <div className={one.soldActions}>
                  <Link className={`${styles.btn} ${styles.btnPrimary}`} href="/listings">
                    看看其他好案
                  </Link>
                  <Link className={one.btnAlt} href="/card/booking">
                    告訴我您的需求
                  </Link>
                </div>
              </div>
            ) : (
              <article className={one.detail}>
                {/* 相簿沿用清單卡片的元件；外面包一層 .card 讓桌機的左右箭頭有東西可以 hover，
                    但把卡片的「浮起來」效果關掉（見 listing.module.css 的 .mediaCard）。 */}
                <div className={`${lst.card} ${one.mediaCard}`}>
                  <PhotoCarousel photos={item.photos} alt={`${item.area}－${item.title}`} eager />
                </div>

                <div className={one.info}>
                  <span className={lst.area}>{item.area}</span>
                  <h1 className={one.title}>{item.title}</h1>
                  {/* ③ 售價：跟卡片同一條規則，抓不到就整行不出現 */}
                  {item.price != null ? (
                    <p className={lst.price}>
                      售價 <b>{formatWan(item.price)}</b>
                    </p>
                  ) : null}
                  <ul className={lst.points}>
                    {item.points.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>

                  <div className={one.actions}>
                    {/* ② 帶 slug 進預約表單，表單會顯示「您詢問的物件」並寫進備註 */}
                    <Link
                      className={lst.actionBtn}
                      href={`/card/booking?listing=${encodeURIComponent(item.slug)}`}
                      data-listing-slug={item.slug}
                      data-listing-action="booking"
                    >
                      預約看這戶
                    </Link>
                    <a className={lst.actionLink} href={SOCIAL.line} target="_blank" rel="noopener noreferrer">
                      LINE 直接問
                    </a>
                    {externalLinks.map((x) => (
                      <a
                        key={x.target!.href}
                        className={lst.actionLink}
                        href={x.target!.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-listing-slug={item.slug}
                        data-listing-action={x.action}
                      >
                        {x.target!.label} ↗
                      </a>
                    ))}
                  </div>

                  <ListingPageView slug={item.slug} shareUrl={shareUrl} title={displayName} />
                </div>
              </article>
            )}

            <p className={lst.note}>{NOTE_TEXT}</p>

            <Link href="/listings" className={lst.backLink}>
              ← 回精選好案
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />

      {jsonLd ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      ) : null}
    </div>
  );
}

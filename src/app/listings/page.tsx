/**
 * /listings —— 好案總覽
 *
 * 首頁「精選好案」的卡片都指到這裡。物件資料在資料庫，
 * 要改物件請到 /admin/listings 後台，這頁不用動。
 *
 * 版面沿用首頁那套（home.module.css 的 .page 裡定義了配色變數），
 * 卡片本身的樣式在同目錄的 listings.module.css。
 */
import Link from "next/link";
import type { Metadata } from "next";
import { OG_IMAGE, OWNER, SITE_URL } from "@/config/owner";
import BreadcrumbJsonLd from "@/app/_ui/BreadcrumbJsonLd";
import { getPublicListings, sortByPrice } from "@/lib/listings";
import styles from "../home.module.css";
import SiteNav from "@/app/_ui/SiteNav";
import SocialLinks from "@/app/_ui/SocialLinks";
import SiteFooter from "@/app/_ui/SiteFooter";
import lst from "./listings.module.css";
import FeaturedTitle from "./FeaturedTitle";
// 卡片本體跟首頁共用（照片、區域、標題、售價、整張可點、影片賞析＋預約看屋）
import ListingCard from "./ListingCard";

const TITLE = `精選好案｜台中海線房仲${OWNER.name}｜沙鹿梧棲清水龍井`;
const DESCRIPTION = `${OWNER.name}目前主打的台中海線精選物件。沙鹿、梧棲、清水、龍井的透天與大樓，格局、屋況、生活機能一次看清楚，看中意可直接線上預約看屋。`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "台中海線好案",
    "沙鹿買房",
    "梧棲置產",
    "清水換屋",
    "龍井房屋",
    "台中海線物件",
    OWNER.name,
  ],
  robots: { index: true, follow: true },
  alternates: { canonical: "/listings" },
  openGraph: {
    type: "website",
    url: `${SITE_URL}/listings`,
    title: TITLE,
    description: DESCRIPTION,
    siteName: `${OWNER.name}｜台中海線房仲`,
    // 2026-10-19 分享預覽圖（LINE／FB 連結卡），圖在 owner.ts 的 OG_IMAGE。單戶頁有自己的封面照，這裡是總覽頁
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE.url],
  },
};

/**
 * 物件在資料庫裡，但這頁仍然是「靜態產生 ＋ 定時重生」的。
 * 後台存檔時 server action 會 revalidatePath("/listings")，所以改完是立刻生效，
 * 下面這個秒數只是萬一 revalidate 沒跑到的保險。
 */
export const revalidate = 300;

export default async function ListingsPage() {
  /**
   * 2026-09-18 系統擁有者拍板：這頁（客戶實際瀏覽的完整清單）改成依售價由低到高排序。
   * 2026-09-25 推翻「首頁維持後台手動排序」那半：首頁精選好案前 3 筆也改吃同一套
   * 價格排序（見 src/app/page.tsx），後台↑↓手動排的機制整組拿掉。
   * LINE 機器人與地圖的建案比對還吃 getPublicListings() 原始順序，不要動那支函式本身，
   * 這裡用 sortByPrice() 回傳排過的新陣列。
   */
  const listings = sortByPrice(await getPublicListings(), (item) => item.price);
  return (
    <div className={styles.page}>
      {/* 麵包屑結構化資料（只給 Google 看，畫面不變）—— 2026-10-19 第一包。名稱用導覽列那四個字 */}
      <BreadcrumbJsonLd items={[{ name: "精選好案", href: "/listings" }]} />
      <header className={styles.header}>
        <div className={styles.navWrap}>
          <Link href="/" className={styles.brand}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.brandLogo}
              src="/kaixing-mark.png"
              alt="凱心成家"
              width={40}
              height={40}
            />
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
        {/* 2026-10-22 系統擁有者：社群藥丸搬到 logo 下方、固定不隨頁面捲動消失——
            header 本身就是 position:sticky，當第二排會一起固定，見 home.module.css 的說明。 */}
        <div className={styles.headerSocial}>
          <SocialLinks variant="bar" align="start" compact className={styles.headerSocialBar} />
        </div>
      </header>

      <main>
        <section className={styles.section}>
          <div className={`${styles.container} ${styles.center}`}>
            <span className={styles.eyebrow}>FEATURED PROPERTIES</span>
            <FeaturedTitle as="h1" className={styles.sectionTitle} />
            <p className={styles.sectionDesc}>
              台中海線目前主打的物件。看中意的直接約時間看屋，我陪您一間一間看清楚再決定。
            </p>
          </div>

          <div className={styles.container}>
            {listings.length === 0 ? (
              <p className={lst.empty}>
                目前沒有正在推的物件。有新案子我會第一時間放上來，
                也歡迎先<Link href="/card/booking">預約諮詢</Link>聊聊您的需求。
              </p>
            ) : (
              <div className={lst.grid}>
                {/* 每張卡片的 id ＝ slug，所以每一筆都有自己的網址：`/listings#<slug>`。
                    為的是「把某一筆直接傳給客戶」——不加的話只能叫他自己在清單裡找。
                    ⚠️ 跳過去會被 sticky header 蓋住，靠 `listings.module.css` 的
                    `.card { scroll-margin-top }` 讓位。**兩者要一起在**，
                    少一個就是「網址跳到了、但看到的是卡片中段，標題被 header 吃掉」。 */}
                {/* 卡片本體在 ListingCard.tsx（跟首頁共用）。第一排三張是首屏，封面圖立刻載；其餘等捲到才載。
                    🚫 2026-10-20 系統擁有者拍板：卡片不列 ✨ 賣點、不外連「物件資訊」，整張卡點了就進單戶頁。 */}
                {listings.map((item, i) => (
                  <ListingCard key={item.slug} item={item} eager={i < 3} variant="list" />
                ))}
              </div>
            )}

            <p className={lst.note}>
              ⚠️ 物件資訊僅供初步參考。<strong>實際坪數、格局、屋況與產權，以現場勘查及不動產說明書所載為準</strong>。
              物件狀態隨時可能異動，成交後即下架。詳細條件與價格歡迎預約當面說明。
            </p>

            <Link href="/" className={lst.backLink}>
              ← 回首頁
            </Link>
          </div>
        </section>
      </main>
      {/* 2026-10-19 補頁尾：聯絡方式＋經紀業揭露。這頁最像廣告，之前反而是少數沒有揭露那行的頁 */}
      <SiteFooter />
    </div>
  );
}

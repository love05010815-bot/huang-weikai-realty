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
import { OWNER, SITE_URL } from "@/config/owner";
import { getPublicListings } from "@/lib/listings";
import styles from "../home.module.css";
import lst from "./listings.module.css";
import FeaturedTitle from "./FeaturedTitle";
import PhotoCarousel from "./PhotoCarousel";

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
  },
};

/**
 * 物件在資料庫裡，但這頁仍然是「靜態產生 ＋ 定時重生」的。
 * 後台存檔時 server action 會 revalidatePath("/listings")，所以改完是立刻生效，
 * 下面這個秒數只是萬一 revalidate 沒跑到的保險。
 */
export const revalidate = 300;

export default async function ListingsPage() {
  const listings = await getPublicListings();
  return (
    <div className={styles.page}>
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
          <div className={styles.navCta}>
            <Link className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`} href="/card/booking">
              線上預約
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className={styles.section}>
          <div className={`${styles.container} ${styles.center}`}>
            <span className={styles.eyebrow}>LISTINGS</span>
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
                {listings.map((item, i) => (
                  <article key={item.slug} className={lst.card}>
                    {/* 一張照片就是一張圖；兩張以上會自動變成可左右滑的相簿。
                        第一排三張是首屏，封面圖立刻載；其餘等捲到才載。 */}
                    <PhotoCarousel
                      photos={item.photos}
                      alt={`${item.area}－${item.title}`}
                      eager={i < 3}
                    />
                    <div className={lst.body}>
                      <span className={lst.area}>{item.area}</span>
                      <h2 className={lst.title}>{item.title}</h2>
                      <ul className={lst.points}>
                        {item.points.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                      {/* 外部連結（FB 影片／591）放在預約按鈕上面當次要動作 ——
                          先讓客戶看得更清楚，再引導到預約，順序不要顛倒。 */}
                      {/* 兩顆連結各自獨立：後台哪一欄留空，那顆就不出現。
                          兩個都留空的話這區塊整個不渲染，卡片不會留一塊空白。 */}
                      {[item.link, item.video].filter(Boolean).map((l) => (
                        <a
                          key={l!.href}
                          className={lst.actionLink}
                          href={l!.href}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {l!.label} ↗
                        </a>
                      ))}
                      <Link className={lst.actionBtn} href="/card/booking">
                        預約看屋
                      </Link>
                    </div>
                  </article>
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
    </div>
  );
}

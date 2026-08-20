/**
 * /listings —— 好案總覽
 *
 * 首頁「精選好案」的卡片都指到這裡。物件資料在 src/config/listings.ts，
 * 要改物件只改那個檔，這頁不用動。
 *
 * 版面沿用首頁那套（home.module.css 的 .page 裡定義了配色變數），
 * 卡片本身的樣式在同目錄的 listings.module.css。
 */
import Link from "next/link";
import type { Metadata } from "next";
import { OWNER, SITE_URL } from "@/config/owner";
import { ACTIVE_LISTINGS } from "@/config/listings";
import styles from "../home.module.css";
import lst from "./listings.module.css";

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

export default function ListingsPage() {
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
            <h1 className={styles.sectionTitle}>精選好案</h1>
            <p className={styles.sectionDesc}>
              台中海線目前主打的物件。看中意的直接約時間看屋，我陪您一間一間看清楚再決定。
            </p>
          </div>

          <div className={styles.container}>
            {ACTIVE_LISTINGS.length === 0 ? (
              <p className={lst.empty}>
                目前沒有正在推的物件。有新案子我會第一時間放上來，
                也歡迎先<Link href="/card/booking">預約諮詢</Link>聊聊您的需求。
              </p>
            ) : (
              <div className={lst.grid}>
                {ACTIVE_LISTINGS.map((item) => (
                  <article key={item.slug} className={lst.card}>
                    {item.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        className={lst.photo}
                        src={`/listings/${item.photo}`}
                        alt={`${item.area}－${item.title}`}
                        width={640}
                        height={480}
                      />
                    ) : (
                      <div className={lst.photoPlaceholder} aria-label="照片準備中">
                        <span>🏠</span>
                        <span>照片準備中</span>
                      </div>
                    )}
                    <div className={lst.body}>
                      <span className={lst.area}>{item.area}</span>
                      <h2 className={lst.title}>{item.title}</h2>
                      <ul className={lst.points}>
                        {item.points.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
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

/**
 * /school —— 台中市國中小學區查詢
 *
 * 2026-09-24 系統擁有者：客戶問學區時他都去翻教育局的「學區查詢」網頁，
 * 要一個放在自己前台、不用把客戶丟去外部網站的版本。
 *
 * 資料：
 *   - 學區文字來自臺中市政府教育局「學區查詢」整張表（scripts/fetch-school-districts.mjs 抓，
 *     解析規則在 src/lib/school-district.ts，結果放 public/data/school-districts.json）。
 *   - 里的邊界來自內政部國土測繪中心「村里界圖」（public/data/taichung-villages.geojson），
 *     讓客戶在地圖上點一下、或用手機定位，就知道自己在哪個里。
 *
 * ⚠️ 學區每學年會調整。教育局改公告時跑 `npm run fetch:school` → `npm run check:school`，
 *    看過警告再 commit，這頁不用動；記得同步下面「資料抓取日」的日期是自動帶的。
 * ⚠️ 額滿學校的設籍年限、共同學區怎麼選，工具只照公告標出來，不替客戶下判斷。
 */
import Link from "next/link";
import type { Metadata } from "next";
import { OWNER, SITE_URL } from "@/config/owner";
import SiteNav from "@/app/_ui/SiteNav";
import SocialLinks from "@/app/_ui/SocialLinks";
import SiteFooter from "@/app/_ui/SiteFooter";
import styles from "../home.module.css";
import tax from "../tax/tax.module.css";
import SchoolFinder from "./SchoolFinder";

const TITLE = `台中市國中小學區查詢｜輸入里或地圖定位看國小國中學區｜台中海線房仲${OWNER.name}`;
const DESCRIPTION =
  "台中市 29 區、625 個里的國小與國中學區一次查：選行政區和里、在地圖上點一下，或用手機定位，馬上列出對應的學校。只有幾個鄰、共同學區、自由學區、以街道分界這些細節都照臺中市政府教育局公告標示，買房、租屋、遷戶籍前先確認學區。";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "台中學區查詢",
    "台中國小學區",
    "台中國中學區",
    "學區查詢",
    "梧棲學區",
    "沙鹿學區",
    "清水學區",
    "龍井學區",
    "大甲學區",
    "共同學區",
    "台中海線房仲",
    OWNER.name,
  ],
  robots: { index: true, follow: true },
  alternates: { canonical: "/school" },
  openGraph: {
    type: "website",
    url: `${SITE_URL}/school`,
    title: TITLE,
    description: DESCRIPTION,
    siteName: `${OWNER.name}｜台中海線房仲`,
  },
};

export default function SchoolPage() {
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

      {/* 一定要放在 <header> 外面，理由見 SiteNav.tsx */}
      <SocialLinks variant="float" />
      <main>
        <section className={styles.section}>
          <div className={`${styles.container} ${styles.center}`}>
            <SocialLinks variant="bar" align="center" />
            <span className={styles.eyebrow}>TOOLS</span>
            <h1 className={styles.sectionTitle}>國中小學區查詢</h1>
            <p className={styles.sectionDesc}>
              買房前最常被問的一句：「這裡讀哪間國小？」選好行政區和里、在地圖上點一下，
              或直接用手機定位，對應的國小與國中就列在下面，細節照教育局公告原文標出來。
            </p>
          </div>

          <div className={styles.container}>
            <SchoolFinder />

            <div className={tax.disclaimer}>
              <strong>⚠️ 查詢結果僅供參考，入學資格以學校與臺中市政府教育局認定為準。</strong>
              學區每學年可能調整，本頁資料是從教育局公告整理的，抓取日期標在查詢結果下方。
              <strong>共同學區</strong>表示可在列出的學校之間擇一；<strong>自由學區</strong>依公告可不受學區限制。
              部分里只有某幾鄰、或以某條路、某段門牌分界，這種只能對照戶籍地址的<strong>鄰別與門牌</strong>判斷，
              工具會標示「依門牌分」，請務必再向學校確認。
              <strong>額滿（總量管制）學校</strong>另有設籍期限等規定，公告裡不會寫，想確定能不能入學請直接問學校或我。
              查詢結果不構成入學資格的核定。
              <div className={tax.sources}>
                資料來源：
                <br />
                ・各校學區劃分 ——{" "}
                <a
                  href="https://www.tc.edu.tw/page/02b0fa2f-7dda-404f-b411-8286cd97c9c1"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  臺中市政府教育局 學區查詢 ↗
                </a>
                <br />
                ・里的邊界 ——{" "}
                <a href="https://data.gov.tw/dataset/7438" target="_blank" rel="noopener noreferrer">
                  內政部國土測繪中心 村里界圖（政府資料開放授權）↗
                </a>
                <br />
                ・地圖底圖 —— © OpenStreetMap 貢獻者
              </div>
            </div>

            <Link href="/" className={tax.backLink}>
              ← 回首頁
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

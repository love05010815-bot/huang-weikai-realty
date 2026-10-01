/**
 * /area —— 地籍面積單位換算
 *
 * 2026-10-01 系統擁有者：前台免費工具加一項，平方公尺、坪、公畝、公頃、平方公里、甲、分
 * 全部互通，輸入任一格其他格自動對應。
 *
 * 算法在 src/lib/area-units.ts（純函式、每個係數都註明來源），畫面在 AreaConverter.tsx。
 * 這些都是定義值，不會像稅率那樣過期；改到係數跑 `npm run check:area`。
 *
 * 標題用客戶會搜的字（坪數換算、一甲幾坪、平方公尺換算坪），不用「地籍面積單位換算」當主標。
 */
import Link from "next/link";
import type { Metadata } from "next";
import { OWNER, SITE_URL } from "@/config/owner";
import SiteNav from "@/app/_ui/SiteNav";
import SocialLinks from "@/app/_ui/SocialLinks";
import SiteFooter from "@/app/_ui/SiteFooter";
import styles from "../home.module.css";
import tax from "../tax/tax.module.css";
import AreaConverter from "./AreaConverter";

const TITLE = `坪數換算｜平方公尺、坪、甲、分、公頃一次互換｜台中海線房仲${OWNER.name}`;
const DESCRIPTION =
  "平方公尺換算坪、一甲幾坪、一分地幾坪、公頃換算甲，七種地籍面積單位在同一頁互通：在任何一格輸入數字，其他單位立刻自動對應。1 坪＝3.3058 平方公尺、1 甲＝2,934 坪＝10 分、1 公頃＝3,025 坪、1 公畝＝100 平方公尺，看謄本、權狀、土地買賣前先換清楚。";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "坪數換算",
    "平方公尺換算坪",
    "一坪幾平方公尺",
    "一甲幾坪",
    "一分地幾坪",
    "公頃換算坪",
    "公頃換算甲",
    "公畝換算坪",
    "地籍面積換算",
    "土地面積換算",
    "台中海線房仲",
    OWNER.name,
  ],
  robots: { index: true, follow: true },
  alternates: { canonical: "/area" },
  openGraph: {
    type: "website",
    url: `${SITE_URL}/area`,
    title: TITLE,
    description: DESCRIPTION,
    siteName: `${OWNER.name}｜台中海線房仲`,
  },
};

export default function AreaPage() {
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
            <h1 className={styles.sectionTitle}>坪數與地籍面積換算</h1>
            <p className={styles.sectionDesc}>
              謄本寫平方公尺、廣告講坪、農地論甲論分。在任何一格打數字，
              平方公尺、坪、公畝、公頃、平方公里、甲、分七種單位就同時換好，不用自己乘來乘去。
            </p>
          </div>

          <div className={styles.container}>
            <AreaConverter />

            <div className={tax.disclaimer}>
              <strong>⚠️ 換算結果僅供參考，土地與建物的登記面積以地政機關謄本為準。</strong>
              這頁用的是法定換算值：1 坪 ＝ 400/121 平方公尺（約 3.3058）、1 甲 ＝ 2,934 坪、1 分 ＝ 1/10 甲，
              顯示時四捨五入到小數 4 位，所以總面積很大時最後一位可能跟謄本差一點點。
              <strong>坪數寫法各家不同</strong>：建商、仲介廣告常把平方公尺乘 0.3025 後取到小數 2 位，
              跟這裡取 4 位的尾數會有些微差距，不是哪一邊算錯。
              <strong>建物坪數不等於室內坪數</strong>：權狀坪數含主建物、附屬建物與共有部分（公設），
              要看實際能用的面積，請看謄本上「主建物」那一欄再換算。
              <div className={tax.sources}>
                資料來源：
                <br />
                ・坪、甲、分與公制的換算關係 —— 地政機關通用的土地面積單位換算表（1 甲 ＝ 2,934 坪、1 公頃 ＝ 3,025 坪）
                <br />
                ・1 台尺 ＝ 10/33 公尺、1 坪 ＝ 36 平方台尺 —— 度量衡法沿用的台制定義
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

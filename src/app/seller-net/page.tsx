/**
 * /seller-net —— 賣方實拿速算（出售／贈與／繼承三個分頁）
 *
 * 2026-11-11 系統擁有者：「我想做另一個工具放在賣方常用裡面：賣方實拿速算，跟這個網站做一樣」
 *   （參考頁是別家房仲的「賣屋損益試算」）。欄位、三種稅制、豪宅門檻、自住／重購退稅、3% 概算、
 *   贈與稅、遺產稅都照它做；文案自己寫；房地合一那段直接用 /tax 同一支 calcLandTax。
 *
 * 算法在 src/lib/seller-net.ts、每年會變的數字在 src/lib/seller-net-data.ts（改完跑 `npm run check:seller-net`）。
 * 畫面在 SellerNetCalculator.tsx。這頁只放殼、標題、免責與出處。
 *
 * ⚠️ 設算比率表、豪宅門檻、遺贈稅免稅額與級距的出處都標在 seller-net-data.ts，2026-11-11 對過財政部原文
 *    （參考頁的遺贈稅級距是舊的，我們沒照抄）。每年照出處核對一次、改 DATA_CHECKED_ON。
 */
import Link from "next/link";
import type { Metadata } from "next";
import { OG_IMAGE, OWNER, SITE_URL } from "@/config/owner";
import { DATA_CHECKED_ON, DATA_YEAR } from "@/lib/seller-net-data";
import BreadcrumbJsonLd from "@/app/_ui/BreadcrumbJsonLd";
import SiteNav from "@/app/_ui/SiteNav";
import SocialLinks from "@/app/_ui/SocialLinks";
import SiteFooter from "@/app/_ui/SiteFooter";
import styles from "../home.module.css";
import tax from "../tax/tax.module.css";
import SellerNetCalculator from "./SellerNetCalculator";

const TITLE = `賣方實拿速算｜賣房實拿多少、房地合一稅、贈與稅、遺產稅一次算｜台中海線房仲${OWNER.name}`;
const DESCRIPTION =
  "賣房前先算清楚：填成交價、買價、日期和費用，自動判斷舊制或房地合一 2.0、算出稅金、仲介費、土增稅後實拿多少、賺多少。含豪宅門檻、自住優惠、重購退稅、3% 費用概算；另有贈與稅、遺產稅試算。";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "賣房實拿多少",
    "賣屋損益試算",
    "賣房要繳多少稅",
    "房地合一稅試算",
    "財產交易所得 設算",
    "重購退稅",
    "自住優惠 400萬",
    "贈與稅試算",
    "遺產稅試算",
    "台中海線房仲",
    OWNER.name,
  ],
  robots: { index: true, follow: true },
  alternates: { canonical: "/seller-net" },
  openGraph: {
    type: "website",
    url: `${SITE_URL}/seller-net`,
    title: TITLE,
    description: DESCRIPTION,
    siteName: `${OWNER.name}｜台中海線房仲`,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE.url],
  },
};

export default function SellerNetPage() {
  return (
    <div className={styles.page}>
      <BreadcrumbJsonLd items={[{ name: "免費小工具", href: "/tools" }, { name: "賣方實拿速算", href: "/seller-net" }]} />
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
        <div className={styles.headerSocial}>
          <SocialLinks variant="bar" align="start" compact className={styles.headerSocialBar} />
        </div>
      </header>

      {/* 一定要放在 <header> 外面——header 的 backdrop-filter 會把 position:fixed 的子元素關在裡面（見 SiteNav.tsx） */}
      <SocialLinks variant="float" />

      <main>
        <section className={styles.section}>
          <div className={`${styles.container} ${styles.center} ${styles.stickyTitleWrap}`}>
            <span className={styles.eyebrow}>TOOLS</span>
            <h1 className={styles.sectionTitle}>賣方實拿速算</h1>
          </div>
          <div className={`${styles.container} ${styles.center}`}>
            <p className={styles.sectionDesc}>
              賣房子最怕簽了約才發現稅金和費用把獲利吃掉。填成交價、買價和日期，這裡會自己判斷是舊制還是房地合一，
              把稅、仲介費、土增稅全扣完，告訴你實拿多少、賺多少。要送人或是繼承的，也有贈與稅、遺產稅可以算。
            </p>
          </div>

          <div className={styles.container}>
            <SellerNetCalculator />

            <div className={tax.disclaimer}>
              <strong>⚠️ 試算僅供參考，實際稅額以國稅局核定為準。</strong>
              本頁依 {DATA_YEAR} 年度規定計算，數字最後核對日期 {DATA_CHECKED_ON}。
              舊制的財產交易所得會併入你當年度的綜合所得，實際稅率要看整年所得；房地合一稅以完成所有權移轉登記日起算申報期限；
              土地增值稅請洽代書或地方稅務局估算。自住優惠、重購退稅、豪宅認定各有細節條件，工具只照你勾的算，不替你認定資格。
              贈與與繼承的不動產以公告現值認定，另有未成年加計、農地免稅等規定這裡沒算。試算結果不構成稅務或法律意見，要確定數字請直接問我或找代書、會計師。
              <div className={tax.sources}>
                法規與資料來源：
                <br />
                ・房地合一稅 —— 所得稅法第 14 條之 4、財政部「房地合一稅制設計（個人）」（跟本站「房地合一稅試算」同一套算法）
                <br />
                ・舊制財產交易所得設算比率、高價住宅（豪宅）認定門檻 —— 財政部「114 年度個人出售房屋之財產交易所得計算規定」（{DATA_YEAR} 年 3 月 4 日台財稅字第 11400690240 號令，目前最新的一份）
                <br />
                ・贈與稅、遺產稅 —— 遺產及贈與稅法第 13、17、18、19、20、22 條，免稅額與扣除額依財政部公告之 {DATA_YEAR} 年度數額
                <br />
                ・契稅 —— 契稅條例第 3 條（贈與 6%）
              </div>
            </div>

            <Link href="/tools" className={tax.backLink}>
              ← 回免費小工具
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

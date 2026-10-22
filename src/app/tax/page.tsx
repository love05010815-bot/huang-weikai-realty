/**
 * /tax —— 稅費試算
 *
 * 2026-08-23 系統擁有者拍板：不再連到外部網站，改成自己站上算完。
 * 原本首頁連財政部與內政部的兩張卡已經改成導引到這一頁。
 *
 * 算法在 src/lib/land-tax.ts（房地合一）、src/lib/loan.ts（房貸）、
 * src/lib/rent-subsidy.ts（租金補貼）與 src/lib/youth-loan.ts（青安 3.0），
 * 都是純函式、有官方出處註記。畫面在 TaxCalculator.tsx（青安那頁在 YouthLoanForm.tsx）。
 *
 * ⚠️ 稅率或法規變動時，改 land-tax.ts，這頁不用動。
 *    改完記得同步下面「資料來源」的日期。
 */
import Link from "next/link";
import type { Metadata } from "next";
import { OG_IMAGE, OWNER, SITE_URL } from "@/config/owner";
import BreadcrumbJsonLd from "@/app/_ui/BreadcrumbJsonLd";
import TaxCalculator from "./TaxCalculator";
import styles from "../home.module.css";
import SiteNav from "@/app/_ui/SiteNav";
import SocialLinks from "@/app/_ui/SocialLinks";
import SiteFooter from "@/app/_ui/SiteFooter";
import tax from "./tax.module.css";

const TITLE = `稅費、新青安 3.0 與租金補貼試算｜台中海線房仲${OWNER.name}｜買賣租屋前先算清楚`;
const DESCRIPTION =
  "房地合一稅、新青安 3.0 資格、房貸月付金、租金補貼一站算清楚：房地合一稅 2.0 依所得稅法第 14 條之 4，含自住優惠與非自願因素判斷；新青安 3.0 依財政部 115 年 8 月上路的方案，點 7 題看能不能辦、能貸多少、月付多少；300 億元中央擴大租金補貼依內政部官方分級表，逐縣市、逐行政區試算每月可領金額。";

/** 法規最後核對日。改稅率時記得一起更新，不然客戶不知道這頁多舊 */
const RULES_CHECKED_AT = "2026 年 9 月";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "房地合一稅試算",
    "房地合一稅2.0",
    "賣房要繳多少稅",
    "自住優惠 400萬",
    "房貸試算",
    "新青安3.0",
    "青安3.0 資格",
    "青安貸款試算",
    "青年安心成家購屋優惠貸款",
    "租金補貼試算",
    "300億元中央擴大租金補貼",
    "台中海線房仲",
    OWNER.name,
  ],
  robots: { index: true, follow: true },
  alternates: { canonical: "/tax" },
  openGraph: {
    type: "website",
    url: `${SITE_URL}/tax`,
    title: TITLE,
    description: DESCRIPTION,
    siteName: `${OWNER.name}｜台中海線房仲`,
    // 2026-10-19 分享預覽圖（LINE／FB 連結卡），圖在 owner.ts 的 OG_IMAGE
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE.url],
  },
};

export default function TaxPage() {
  return (
    <div className={styles.page}>
      {/* 麵包屑結構化資料（只給 Google 看，畫面不變）—— 2026-10-19 第一包 */}
      <BreadcrumbJsonLd items={[{ name: "稅費試算", href: "/tax" }]} />
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
        {/* 2026-10-22 系統擁有者：社群藥丸搬到 logo 下方、固定不隨頁面捲動消失——
            header 本身就是 position:sticky，當第二排會一起固定，見 home.module.css 的說明。 */}
        <div className={styles.headerSocial}>
          <SocialLinks variant="bar" align="center" className={styles.headerSocialBar} />
        </div>
      </header>

      <main>
        <section className={styles.section}>
          <div className={`${styles.container} ${styles.center}`}>
            <span className={styles.eyebrow}>TOOLS</span>
            <h1 className={styles.sectionTitle}>稅費試算</h1>
            <p className={styles.sectionDesc}>
              賣房子最怕的不是稅高，是簽了約才發現稅金把獲利吃掉了。
              這裡直接算，不用跳到別的網站，也會把每一步怎麼來的攤開給你看。
            </p>
          </div>

          <div className={styles.container}>
            <TaxCalculator />

            <div className={tax.disclaimer}>
              <strong>⚠️ 試算結果僅供參考，不是核定結果。</strong>
              房地合一稅的<strong>實際稅額以國稅局核定為準</strong>；房貸的利率、成數與寬限期，以銀行實際審核結果為準。
              青安 3.0 的試算只比對官方公布的資格門檻、額度上限與利息補貼，
              <strong>實際能不能核貸、核多少成數，以承辦公股銀行審核為準</strong>，基準利率會隨郵儲利率浮動。
              試算只涵蓋<strong>個人買賣</strong>的一般情況，
              <strong>公司名下的房地、預售屋轉售、股份交易、重購退稅、繼承併計持有期間</strong>
              等情形沒有納入，這些請找會計師或直接問我。
              租金補貼的試算<strong>不代表一定核准</strong>：超過各縣市當年度辦理戶數會用評點制排序，
              動產與不動產的精確財產限額也沒有列入試算，那要比對稅務與財產登記資料，內政部官方的前台試算工具本身也沒有做。
              稅率與法規會調整，本頁規則最後核對於 {RULES_CHECKED_AT}。試算結果不構成稅務或財務意見。

              <div className={tax.sources}>
                資料來源：
                <br />
                ・稅率級距、自住優惠、20% 特殊情形 ——{" "}
                <a
                  href="https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=G0340003&flno=14-4"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  所得稅法第 14 條之 4 ↗
                </a>
                <br />
                ・計算公式、費用推計、申報期限 ——{" "}
                <a
                  href="https://www.mof.gov.tw/houseandland/multiplehtml/de144e74630c4ac59f2d84a068c889c9"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  財政部 房地合一稅制設計（個人）↗
                </a>
                <br />
                ・非自願性因素七款 ——{" "}
                <a
                  href="https://www.etax.nat.gov.tw/etwmain/tax-info/understanding/tax-q-and-a/national/individual-income-tax/house-tax-and-land-tax-consolidation-question/xvYPNOm"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  財政部稅務入口網 問答 1813 ↗
                </a>
                <br />
                ・青安 3.0 資格門檻、額度、利息補貼退場 ——{" "}
                <a
                  href="https://www.nta.gov.tw/singlehtml/109"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  財政部國庫署 青安 3.0 問答集 ↗
                </a>
                、
                <a
                  href="https://www.mof.gov.tw/singlehtml/384fb3077bb349ea973e7fc6f13b6974?cntId=482aa9c142b34abc83750cb64c15cb11"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  財政部 115-07-16 新聞稿 ↗
                </a>
                <br />
                ・租金補貼分級表、資格與加碼規則 ——{" "}
                <a
                  href="https://pip.moi.gov.tw/V3/B/SCRB0104.aspx"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  內政部不動產資訊平台 300億元中央擴大租金補貼 ↗
                </a>
              </div>
            </div>

            <Link href="/" className={tax.backLink}>
              ← 回首頁
            </Link>
          </div>
        </section>
      </main>
      {/* 2026-10-19 補頁尾（聯絡方式＋經紀業揭露），跟其他子頁一致 */}
      <SiteFooter />
    </div>
  );
}

/**
 * /tax —— 稅費試算
 *
 * 2026-08-23 系統擁有者拍板：不再連到外部網站，改成自己站上算完。
 * 原本首頁連財政部與內政部的兩張卡已經改成導引到這一頁。
 *
 * 算法在 src/lib/land-tax.ts（房地合一）與 src/lib/loan.ts（房貸），
 * 都是純函式、有官方出處註記。畫面在 TaxCalculator.tsx。
 *
 * ⚠️ 稅率或法規變動時，改 land-tax.ts，這頁不用動。
 *    改完記得同步下面「資料來源」的日期。
 */
import Link from "next/link";
import type { Metadata } from "next";
import { OWNER, SITE_URL } from "@/config/owner";
import TaxCalculator from "./TaxCalculator";
import styles from "../home.module.css";
import tax from "./tax.module.css";

const TITLE = `房地合一稅試算｜台中海線房仲${OWNER.name}｜賣房前先算清楚要繳多少稅`;
const DESCRIPTION =
  "房地合一稅 2.0 線上試算：填入取得與出售日期、成交價與成本，馬上算出持有期間、適用稅率與應納稅額，並列出完整計算過程。含自住優惠 400 萬免稅、非自願因素 20% 稅率判斷，另附房貸月付金試算。稅率依所得稅法第 14 條之 4。";

/** 法規最後核對日。改稅率時記得一起更新，不然客戶不知道這頁多舊 */
const RULES_CHECKED_AT = "2026 年 8 月";

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
  },
};

export default function TaxPage() {
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
              <strong>⚠️ 這是試算，不是核定結果。</strong>
              房地合一稅的<strong>實際稅額以國稅局核定為準</strong>；房貸的利率、成數與寬限期，以銀行實際審核結果為準。
              試算只涵蓋<strong>個人買賣</strong>的一般情況，
              <strong>公司名下的房地、預售屋轉售、股份交易、重購退稅、繼承併計持有期間</strong>
              等情形沒有納入，這些請找會計師或直接問我。
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
              </div>
            </div>

            <Link href="/" className={tax.backLink}>
              ← 回首頁
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

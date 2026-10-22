/**
 * /faq —— 常見問題
 *
 * 2026-10-20 系統擁有者說「先做 FAQ」，並指定「買方流程及賣方流程直接做成兩題問答」。
 * 題目與答案都在 src/config/faq.ts（答案的每個數字都來自 /buy、/sell，不是新寫的），要加題改那裡。
 *
 * 版面：跟 /buy、/sell 同一套（header、社群列、eyebrow＋h1、內容、免責聲明、頁尾）。
 * 問答清單是共用元件 <FaqList />（src/app/_ui/FaqList.tsx），第一題預設展開（兩題都收著的話客戶一進來只看到兩行字）。
 * 入口：2026-10-20 他同日改口「首頁買賣卡的三顆藥丸拿掉，常見問題放在首頁影音專區下方單獨顯示」——
 *   所以首頁 #faq 區塊才是主要入口，這一頁留著當可以單獨分享的版本（sitemap 有收）；導覽列沒加（已經九格、1045px 只剩 25px 餘裕）。
 *
 * JSON-LD 放 FAQPage：Google 2023 年起只給政府／醫療類網站顯示 FAQ 精選摘要，所以不預期搜尋結果會多出問答，
 * 放著只是讓它讀得懂這頁是什麼，不花成本。
 */
import Link from "next/link";
import type { Metadata } from "next";
import { OG_IMAGE, OWNER, SITE_URL } from "@/config/owner";
import { FAQ, faqAnswerText } from "@/config/faq";
import BreadcrumbJsonLd from "@/app/_ui/BreadcrumbJsonLd";
import FaqList from "@/app/_ui/FaqList";
import SiteNav from "@/app/_ui/SiteNav";
import SocialLinks from "@/app/_ui/SocialLinks";
import SiteFooter from "@/app/_ui/SiteFooter";
import styles from "../home.module.css";
import buy from "../buy/buy.module.css";

const TITLE = `買房賣房常見問題｜流程與費用一次問清楚｜台中海線房仲${OWNER.name}`;
const DESCRIPTION =
  "買房的流程是什麼、要準備哪些費用？賣房的流程是什麼、要繳哪些稅費？台中海線房仲黃瑋凱把簽約、備證、完稅、交屋四個階段，和服務費、契稅、土地增值稅、房地合一稅這些項目，用問答的方式一次講清楚。沙鹿、梧棲、清水、龍井。";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  keywords: ["買房流程", "賣房流程", "買房費用", "賣房要繳什麼稅", "房仲常見問題", "過戶流程", "台中海線房仲", OWNER.name],
  robots: { index: true, follow: true },
  alternates: { canonical: "/faq" },
  openGraph: {
    type: "website",
    url: `${SITE_URL}/faq`,
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

const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: faqAnswerText(item) },
  })),
};

export default function FaqPage() {
  return (
    <div className={styles.page}>
      <BreadcrumbJsonLd items={[{ name: "常見問題", href: "/faq" }]} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }} />
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
          <SocialLinks variant="bar" align="start" compact className={styles.headerSocialBar} />
        </div>
      </header>

      <main>
        <section className={styles.section}>
          <div className={`${styles.container} ${styles.center}`}>
            <span className={styles.eyebrow}>FAQ</span>
            <h1 className={styles.sectionTitle}>常見問題</h1>
            <p className={styles.sectionDesc}>
              買房、賣房最常被問的流程與費用，先在這裡看一遍。每一題底下都有連結可以看完整的表格；
              有其他想問的，直接預約，我當面跟您說清楚。
            </p>
          </div>

          <div className={styles.container}>
            <FaqList />

            <p className={buy.disclaimer}>
              ⚠️ 以上費用項目、比例與天數為一般行情與作業慣例，僅供參考；
              <strong>實際金額會因物件、貸款成數、持有年限、承辦銀行與最新法規而不同</strong>，
              土地增值稅與房地合一稅以稅捐機關核定為準，確切數字請以個案實際計算與合約內容為準。
            </p>

            <div className={`${styles.center} ${styles.aboutBlock}`}>
              <Link className={`${styles.btn} ${styles.btnPrimary}`} href="/card/booking">
                還有想問的？線上預約諮詢
              </Link>
              <div>
                <Link href="/" className={buy.backLink}>
                  ← 回首頁
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

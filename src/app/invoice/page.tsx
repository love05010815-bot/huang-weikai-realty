/**
 * /invoice —— 統一發票兌獎
 *
 * 2026-11-19 系統擁有者：「我想做一個統一發票兌獎工具在我的免費小工具內」。
 *
 * 中獎號碼從財政部官方號碼單現抓（lib/invoice-lottery-fetch.ts，官方兩頁 → 讀不到改 RSS → 都不行就明講），
 * 對獎規則在 lib/invoice-lottery.ts（純函式，改完跑 `npm run check:invoice`），畫面在 InvoiceChecker.tsx。
 *
 * 這頁是 ISR：一小時重生一次，所以單月 25 日開獎後最慢一個多小時會換成新一期，不用人去改。
 * 標題帶期別（「115 年 7–8 月」）—— 大家搜的就是「統一發票 7 8 月 中獎號碼」。
 */
import Link from "next/link";
import type { Metadata } from "next";
import { OG_IMAGE, OWNER, SITE_URL } from "@/config/owner";
import BreadcrumbJsonLd from "@/app/_ui/BreadcrumbJsonLd";
import SiteNav from "@/app/_ui/SiteNav";
import SocialLinks from "@/app/_ui/SocialLinks";
import SiteFooter from "@/app/_ui/SiteFooter";
import { INVOICE_OFFICIAL_URL, loadInvoiceData } from "@/lib/invoice-lottery-fetch";
import styles from "../home.module.css";
import tax from "../tax/tax.module.css";
import InvoiceChecker from "./InvoiceChecker";

/** 一小時重生一次；號碼本身的 Data Cache 也是一小時（只存成功的） */
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const data = await loadInvoiceData();
  const period = data ? `${data.draws[0].label}` : "";
  const title = `統一發票兌獎｜${period ? period + "中獎號碼，" : ""}輸入末 3 碼馬上對｜台中海線房仲${OWNER.name}`;
  const description = `統一發票對獎免下載 App：${period ? period + "與上一期" : "最新一期與上一期"}中獎號碼直接取自財政部，輸入發票末 3 碼當場知道有沒有中，中了再補前 5 碼看是幾獎。一疊發票連續對、自動加總獎金，領獎期限也一起標出來。`;
  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    keywords: ["統一發票兌獎", "統一發票對獎", "發票對獎", "統一發票中獎號碼", "發票中獎號碼", "發票末三碼", "統一發票領獎期限", "台中海線房仲", OWNER.name],
    robots: { index: true, follow: true },
    alternates: { canonical: "/invoice" },
    openGraph: {
      type: "website",
      url: `${SITE_URL}/invoice`,
      title,
      description,
      siteName: `${OWNER.name}｜台中海線房仲`,
      images: [OG_IMAGE],
    },
    twitter: { card: "summary_large_image", title, description, images: [OG_IMAGE.url] },
  };
}

export default async function InvoicePage() {
  const data = await loadInvoiceData();

  return (
    <div className={styles.page}>
      <BreadcrumbJsonLd items={[{ name: "統一發票兌獎", href: "/invoice" }]} />
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

      {/* ⚠️ 一定要放在 <header> 外面（header 的 backdrop-filter 會把 position:fixed 關在裡面） */}
      <SocialLinks variant="float" />

      <main>
        <section className={styles.section}>
          <div className={`${styles.container} ${styles.center} ${styles.stickyTitleWrap}`}>
            <span className={styles.eyebrow}>TOOLS</span>
            <h1 className={styles.sectionTitle}>統一發票兌獎</h1>
          </div>
          <div className={`${styles.container} ${styles.center}`}>
            <p className={styles.sectionDesc}>
              中獎號碼直接取自財政部。輸入發票末 3 碼當場知道有沒有中，中了再補前 5 碼看是幾獎；一疊發票可以連續對，獎金自動加總。
            </p>
          </div>

          <div className={styles.container}>
            {data ? (
              <InvoiceChecker draws={data.draws} source={data.source} />
            ) : (
              <div className={tax.alert}>
                <p className={tax.alertTitle}>財政部的中獎號碼現在讀不到</p>
                <p className={tax.alertBody}>
                  不是您的問題，是我們這邊暫時連不上財政部網站，為了不給您錯的號碼，這頁先不顯示。請過一會兒再試，或直接到
                  <a href={INVOICE_OFFICIAL_URL} target="_blank" rel="noopener noreferrer">
                    財政部統一發票中獎號碼頁
                  </a>
                  查看。
                </p>
              </div>
            )}

            <div className={tax.disclaimer}>
              <strong>⚠️ 中獎號碼與領獎規定以財政部公告為準，這頁只是幫您對得快一點。</strong>
              領獎前請再對一次
              <a href={INVOICE_OFFICIAL_URL} target="_blank" rel="noopener noreferrer">
                財政部的中獎號碼單
              </a>
              。<strong>領獎要帶</strong>身分證和中獎的發票，在領獎期間內到代發獎金的單位兌領，逾期不能領。
              <strong>這幾種不能領</strong>：發票上沒有載明金額的；買受人是公司行號（打了統一編號）、政府機關、公營事業、公立學校、部隊的。
              <strong>同一張發票對中好幾個獎，只能領其中一個</strong>，這頁顯示的是獎金最高的那個。
              <strong>稅</strong>：中三獎以上，發獎單位會先扣 20% 所得稅；中五獎以上要繳 0.4% 印花稅（用財政部統一發票兌獎 App
              或電子發票整合服務平台設定領獎帳戶兌領的免繳）。
              <strong>雲端發票專屬獎不在這頁</strong>：存在手機條碼、會員載具裡的雲端發票另外有專屬獎，財政部會直接對，請用官方兌獎 App 查。
              <div className={tax.sources}>
                資料來源：
                <br />
                ・中獎號碼、領獎期間、領獎注意事項 —— 財政部財政資訊中心「統一發票中獎號碼」（invoice.etax.nat.gov.tw），本頁約每小時同步一次
                <br />
                ・獎別與獎金 —— 統一發票給獎辦法
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

/**
 * /privacy —— 個人資料蒐集告知（個資法第 8 條）
 *
 * 2026-11-18 系統擁有者拍板兩件事（其餘文字是依法條列舉項目寫的一般範本，他沒逐字看）：
 *   ① 蒐集者寫**他個人**（不是加盟店法人馥勵）  ② 保存期間「服務結束後五年」
 * ⚠️ 這兩個值不要自己改；要改先問他。這份沒有給律師或公司法務看過。
 *
 * 入口：線上預約（BookingForm）與自動配對找房（MatchApp，同事代客那條不顯示——那邊的業務不是他本人）
 * 送出鈕旁各一行小字連到這裡。頁尾、導覽列都沒放。
 * 蒐集的資料項目是對著兩支表單實際欄位寫的：表單加欄位，第 3 點要跟著改。
 */
import Link from "next/link";
import type { Metadata } from "next";
import { OWNER, SITE_URL } from "@/config/owner";
import BreadcrumbJsonLd from "@/app/_ui/BreadcrumbJsonLd";
import SiteNav from "@/app/_ui/SiteNav";
import SiteFooter from "@/app/_ui/SiteFooter";
import styles from "../home.module.css";
import buy from "../buy/buy.module.css";
import css from "./privacy.module.css";

const TITLE = `個人資料蒐集告知｜台中海線房仲${OWNER.name}`;
const DESCRIPTION = `${OWNER.name}個人官網蒐集、使用與保存您個人資料的方式，以及您可以行使的權利。`;

/** 保存期間。2026-11-18 他拍板 */
const RETENTION = "五年";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  robots: { index: true, follow: true },
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <div className={styles.page}>
      <BreadcrumbJsonLd items={[{ name: "個人資料蒐集告知", href: "/privacy" }]} />
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

      <main>
        <section className={styles.section}>
          <div className={`${styles.container} ${styles.center}`}>
            <span className={styles.eyebrow}>PRIVACY</span>
            <h1 className={styles.sectionTitle}>個人資料蒐集告知</h1>
            <p className={styles.sectionDesc}>
              您在本站預約或留下資料時，我會這樣使用與保管。依個人資料保護法第 8 條向您說明如下。
            </p>
          </div>

          <div className={`${styles.container} ${css.wrap}`}>
            <ol className={css.list}>
              <li>
                <strong>誰在蒐集</strong>
                {OWNER.name}（{OWNER.title}）。
              </li>
              <li>
                <strong>蒐集的目的</strong>
                不動產買賣與租賃的諮詢、預約面談與看屋安排、物件配對與通知，以及相關的聯繫與客戶服務。
              </li>
              <li>
                <strong>蒐集哪些資料</strong>
                姓名或稱呼、電話、電子郵件、預約時間、您填寫的購屋或租屋條件與備註；若您透過 LINE
                官方帳號預約，另包含用來發送通知的 LINE 帳號識別碼。
              </li>
              <li>
                <strong>使用多久</strong>
                自您送出資料起，至服務結束後{RETENTION}為止；您要求刪除時會提前刪除。
              </li>
              <li>
                <strong>在哪裡用、給誰用</strong>
                由{OWNER.name}本人及所屬門市為上述目的使用，不會出售或提供給無關的第三人。
                資料存放於本網站使用的雲端主機與資料庫（位於境外），預約確認信與通知透過電子郵件及 LINE 的服務發送。
              </li>
              <li>
                <strong>您的權利</strong>
                您可以隨時要求查詢、閱覽、補充、更正、停止使用或刪除您的資料，以及索取複本。請來電{" "}
                <a href={`tel:${OWNER.phoneRaw}`}>{OWNER.phone}</a> 或透過 LINE @a8865 告知。
              </li>
              <li>
                <strong>不提供會怎樣</strong>
                資料由您自由決定是否提供；若未填寫必要欄位，將無法完成預約或配對服務。
              </li>
            </ol>

            <div className={styles.center}>
              <Link href="/" className={buy.backLink}>
                ← 回首頁
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

/**
 * /match —— 買方自動配對找房 ＋ 預約看屋
 *
 * 版面沿用首頁那套（home.module.css 的 .page 定義了配色變數），互動流程在 MatchApp.tsx。
 * 物件來自愛屋店網自動同步（lib/match/sync.ts），要改配對規則看 config/match.ts 與 lib/match/matcher.ts。
 *
 * 從 LINE 卡片的「預約看屋」按鈕進來會帶 ?book=物件編號，MatchApp 會直接跳到那一戶的預約表單。
 */
import type { Metadata } from "next";
import Link from "next/link";
import { OWNER, SITE_URL } from "@/config/owner";
import SiteNav from "@/app/_ui/SiteNav";
import SocialLinks from "@/app/_ui/SocialLinks";
import SiteFooter from "@/app/_ui/SiteFooter";
import styles from "../home.module.css";
import MatchApp from "./MatchApp";

const TITLE = `自動配對找房｜台中海線房仲${OWNER.name}｜沙鹿梧棲清水龍井`;
const DESCRIPTION = `告訴${OWNER.alias}您的購屋條件（區域、預算、房數、坪數、類型），系統從目前在售的台中海線物件自動配對，看中意可直接預約看屋，並在 LINE 收到確認與新物件通知。`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  robots: { index: true, follow: true },
  alternates: { canonical: "/match" },
  openGraph: { type: "website", url: `${SITE_URL}/match`, title: TITLE, description: DESCRIPTION, siteName: `${OWNER.name}｜台中海線房仲` },
};

export const dynamic = "force-dynamic";

export default function MatchPage() {
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

      <SocialLinks variant="float" />
      <main>
        <section className={styles.section}>
          <div className={`${styles.container} ${styles.center}`}>
            <span className={styles.eyebrow}>MATCH</span>
            <h1 className={styles.sectionTitle}>自動配對找房</h1>
            <p className={styles.sectionDesc}>
              告訴我們您的購屋條件，系統會從目前在售的物件裡自動配對，看中意可以直接預約看屋。
              預約完成後在官方 LINE 收到確認，之後有符合條件的新物件也會第一時間通知您。
            </p>
          </div>
          <div className={styles.container}>
            <MatchApp />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

/**
 * /favorites —— 我的最愛＋瀏覽足跡
 *
 * 2026-10-02 系統擁有者：「客戶在建案地圖或精選好案看到喜歡的建案，可以在我的網站裡面
 * 加到我的最愛，以及他瀏覽過的足跡」。
 *
 * 清單存在客戶自己的瀏覽器裡（沒有登入，見 lib/favorites.ts 檔頭），所以：
 *   ・這個檔只做頁面外殼（header／footer／metadata），內容全在 FavoritesView.tsx（client）
 *   ・**不給 Google 收錄**：每個人看到的都不一樣，而且沒收藏時是空的
 *   ・不進 sitemap
 *
 * 入口：header 的愛心（桌機是圖示＋數字、手機在漢堡選單裡），以及按完收藏旁邊冒出來的「查看我的最愛 →」。
 */
import Link from "next/link";
import type { Metadata } from "next";
import { OWNER, SITE_URL } from "@/config/owner";
import SiteNav from "@/app/_ui/SiteNav";
import SocialLinks from "@/app/_ui/SocialLinks";
import SiteFooter from "@/app/_ui/SiteFooter";
import styles from "../home.module.css";
import FavoritesView from "./FavoritesView";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `我的最愛｜收藏的建案與物件｜${OWNER.name}`,
  description: "你在建案地圖與精選好案收藏的建案與物件，還有最近看過的紀錄。",
  robots: { index: false, follow: true },
};

export default function FavoritesPage() {
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
            <span className={styles.eyebrow}>MY LIST</span>
            <h1 className={styles.sectionTitle}>我的最愛</h1>
            <p className={styles.sectionDesc}>
              在建案地圖或精選好案看到喜歡的，按一下愛心就會收在這裡；最近看過的也幫你留著。
              看中意的直接約時間，我陪您一間一間看清楚再決定。
            </p>
          </div>
          <div className={styles.container}>
            <FavoritesView />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

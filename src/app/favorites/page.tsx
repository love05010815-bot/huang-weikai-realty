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
        {/* 2026-10-22 系統擁有者：社群藥丸搬到 logo 下方、固定不隨頁面捲動消失——
            header 本身就是 position:sticky，當第二排會一起固定，見 home.module.css 的說明。 */}
        <div className={styles.headerSocial}>
          <SocialLinks variant="bar" align="start" compact className={styles.headerSocialBar} />
        </div>
      </header>

      {/* 桌機右側固定的社群直排（1220px 以上一直在，捲動時也看得到）。2026-10-22 這排
          一度被拿掉（header 第二排的藥丸已經「永遠看得到」，兩個一起多餘），同一天系統
          擁有者又說「改移到右側邊下方，隨著頁面滾動」要這個——所以加回來，跟 headerSocial
          用斷點分工：1220px 以上顯示這排、藏起 header 那顆 compact 藥丸；以下相反
          （見 home.module.css／Map.module.css 的 .headerSocial 那條 1220px 規則），
          兩個不會同時出現。⚠️ 一定要放在 <header> 外面——header 的 backdrop-filter
          會把 position:fixed 的子元素關在 header 裡（見 SiteNav.tsx 的說明）。 */}
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

/**
 * 全站 404 —— 打錯網址、舊連結失效、文章或報告書還是草稿（notFound()），都會落到這頁。
 *
 * 2026-10-19 第一包補的：之前是 Next 預設的英文白頁「404 | This page could not be found.」，
 * 沒有任何按鈕，客戶只能自己改網址。單戶物件頁有自己的版本（listings/[slug]/not-found.tsx，
 * 文案是「找不到這個物件」），這裡管其餘所有路徑。
 *
 * header 跟子頁一樣（logo、導覽列、線上預約），客戶走錯路還是看得到整個選單；
 * 頁尾也照常掛，聯絡方式跟經紀業揭露不會因為走錯頁就不見。
 * ⚠️ 這個檔刻意不 export metadata：Next 對不存在的網址渲染 404 時用的是 root layout 的標題，
 *    not-found 自己的 metadata 不一定會被採用，寫了只會讓人以為有效。狀態碼本來就是 404，Google 不會收錄。
 */
import Link from "next/link";
import { OWNER } from "@/config/owner";
import styles from "./home.module.css";
import nf from "./not-found.module.css";
import SiteNav from "@/app/_ui/SiteNav";
import SiteFooter from "@/app/_ui/SiteFooter";

export default function NotFound() {
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

      <main>
        <section className={styles.section}>
          <div className={styles.container}>
            <div className={nf.box}>
              <span className={styles.eyebrow}>404</span>
              <h1>找不到這一頁</h1>
              <p>
                網址可能打錯了，或是這一頁已經移除。台中海線沙鹿、梧棲、清水、龍井的物件與小工具都還在，
                從下面任一個入口回去就好。
              </p>
              <div className={nf.actions}>
                <Link className={`${styles.btn} ${styles.btnPrimary}`} href="/">
                  回首頁
                </Link>
                <Link className={nf.btnAlt} href="/listings">
                  看精選好案
                </Link>
                <Link className={nf.btnAlt} href="/card/booking">
                  線上預約
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

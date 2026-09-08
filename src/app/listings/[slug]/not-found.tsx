/**
 * /listings/<不存在的 slug> —— 找不到這戶。
 *
 * 跟「已下架」是兩回事：下架的那戶在資料庫裡有、頁面會說已下架（見 page.tsx）；
 * 這裡是 slug 根本對不上（打錯字、或那筆被整個刪掉），不能謊稱「已下架」。
 * 一樣不讓客戶撞牆：給清單跟預約兩條路。
 */
import Link from "next/link";
import styles from "../../home.module.css";
import one from "./listing.module.css";
import SiteFooter from "@/app/_ui/SiteFooter";

export default function ListingNotFound() {
  return (
    <div className={styles.page}>
      <main>
        <section className={styles.section}>
          <div className={`${styles.container} ${one.wrap}`}>
            <div className={one.soldBox}>
              <span className={styles.eyebrow}>NOT FOUND</span>
              <h1>找不到這個物件</h1>
              <p>
                網址可能打錯了，或是這戶已經移除。台中海線沙鹿、梧棲、清水、龍井還有其他正在推的物件，
                也歡迎直接告訴我您的需求。
              </p>
              <div className={one.soldActions}>
                <Link className={`${styles.btn} ${styles.btnPrimary}`} href="/listings">
                  看看其他好案
                </Link>
                <Link className={one.btnAlt} href="/card/booking">
                  告訴我您的需求
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

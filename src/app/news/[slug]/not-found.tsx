/**
 * /news/<不存在的 slug> —— 找不到這篇。
 *
 * 兩種情況會走到這裡：網址打錯，或那篇被收回成草稿／刪掉了。
 * 不讓客戶撞牆：給「回房產消息」與「線上預約」兩條路。
 */
import Link from "next/link";
import SiteFooter from "@/app/_ui/SiteFooter";
import styles from "@/app/home.module.css";
import nw from "../news.module.css";

export default function NewsPostNotFound() {
  return (
    <div className={styles.page}>
      <main>
        <section className={styles.section}>
          <div className={`${styles.container} ${styles.center}`}>
            <span className={styles.eyebrow}>NOT FOUND</span>
            <h1 className={styles.sectionTitle}>找不到這篇文章</h1>
            <p className={styles.sectionDesc}>
              網址可能打錯了，或這篇已經收回整理中。其他房市消息與房產知識都還在，歡迎回去看看。
            </p>
            <div className={nw.ctaBtns} style={{ marginTop: 24 }}>
              <Link className={`${styles.btn} ${styles.btnPrimary}`} href="/news">
                回房產消息
              </Link>
              <Link className={`${styles.btn} ${styles.btnOutline}`} href="/card/booking">
                線上預約諮詢
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

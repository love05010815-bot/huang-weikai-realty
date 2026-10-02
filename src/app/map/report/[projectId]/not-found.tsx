/**
 * /map/report/<id> 找不到：建案 id 不存在、或這個社區還沒有已發佈的報告書（草稿也算沒有）。
 * 客戶多半是從別人轉傳的連結進來的，講清楚、引導回地圖，不要只給一個 404。
 */
import Link from "next/link";
import { OWNER } from "@/config/owner";
import { REPORT_LABEL } from "@/lib/project-report";
import SiteNav from "@/app/_ui/SiteNav";
import styles from "../../Map.module.css";

export default function ReportNotFound() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand}>
            {OWNER.name}
            <span>台中海線房仲</span>
          </Link>
          <SiteNav variant="sub" />
          <Link href="/card/booking" className={styles.headerCta}>
            預約諮詢
          </Link>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.container}>
          <span className={styles.eyebrow}>{REPORT_LABEL}</span>
          <h1 className={styles.title}>這個社區還沒有銷售報告書</h1>
          <p className={styles.lede}>
            可能是連結打錯、或這份報告書還在整理中。到海線建案一覽可以看這個社區的基本資料與我在售的物件；
            想先了解這個社區，直接預約諮詢，我把資料整理好跟你說。
          </p>
          <p style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/map" className={styles.headerCta}>
              前往海線建案一覽
            </Link>
            <Link href="/card/booking" className={styles.cta} style={{ display: "inline-block", width: "auto", padding: "8px 18px" }}>
              預約諮詢
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}

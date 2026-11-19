/**
 * 後台換頁時的「載入中」畫面。
 *
 * 為什麼要有：後台每一頁都是即時讀資料庫（force-dynamic）。沒有這個檔的時候，
 * 點左邊選單要等伺服器把整頁算完才會換畫面，中間完全沒反應，看起來像沒點到。
 * 有了它，一點就先換成這個骨架（選單的紅色標記也立刻跳過去），資料好了再換成真的頁面。
 *
 * 只畫在右側內容區 —— 左側 menu 是 layout 的，換頁時不會動。
 */
import styles from "./loading.module.css";

export default function AdminLoading() {
  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <div className={styles.bar} />
      <div className={styles.title} />
      <div className={styles.line} />
      <div className={styles.cards}>
        <div className={styles.card} />
        <div className={styles.card} />
        <div className={styles.card} />
      </div>
      <div className={styles.block} />
      <span className={styles.text}>讀取中…</span>
    </div>
  );
}

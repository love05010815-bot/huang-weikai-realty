/**
 * 🌊 區塊之間的弧形分隔
 *
 * 2026-09-07 系統擁有者指定「每個主題的分割用色塊處理」，參考圖的色塊之間不是直線、
 * 是一道淺淺的弧。這支就是那道弧：一個絕對定位在區塊**頂端外面**的 SVG，
 * 顏色吃 `currentColor`，由區塊的色帶 class 決定（見 home.module.css 的 .band*）。
 *
 * 用法：放在帶 .band 的 <section> 裡當第一個子元素。
 *   <section className={`${styles.section} ${styles.band} ${styles.bandSoft}`}>
 *     <SectionWave />
 *     ...
 *
 * ⚠️ 它「吃」的是上一個區塊的底部 —— 上一個區塊的 padding-bottom 至少要比弧高
 *    （桌機 56px、手機 36px）大，不然弧會壓到上一區的內容。.section 是 72px，夠。
 * ⚠️ preserveAspectRatio="none"：弧的高度固定、寬度跟著視窗拉，手機上不會變成一小撮。
 *
 * `flip` 讓弧左右鏡射 —— 相鄰兩個色帶一正一反，不然每一道弧都往同一邊高，看起來像複製貼上。
 */
import styles from "../home.module.css";

export default function SectionWave({ flip = false }: { flip?: boolean }) {
  return (
    <svg
      className={`${styles.wave} ${flip ? styles.waveFlip : ""}`}
      viewBox="0 0 1440 60"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* 左邊低、右邊高的緩弧；底邊補滿，跟區塊本體的背景無縫接起來 */}
      <path d="M0,42 C360,66 820,8 1440,22 L1440,60 L0,60 Z" fill="currentColor" />
    </svg>
  );
}

"use client";

/**
 * 🔀 浮在畫面底下的「比較列」—— /map（在售物件）與 /favorites（精選好案）共用
 *
 * 勾了至少一件才出現：左邊「已選 N／4 件」＋每件一顆小籤（建案名＋標題，可 ✕ 移除），
 * 右邊「開始比較」與「清空」。**開始比較是開新分頁** —— 地圖那頁載入很重（Leaflet＋500 多案），
 * 用同一分頁跳過去再按上一頁，選中的建案與捲動位置都會掉；收藏頁跟著同一個習慣，客戶不用學兩套。
 *
 * 為什麼要有小籤：選中的物件散在不同建案（或兩個頁籤）底下，切走之後看不到剛剛勾的那戶，
 * 沒有小籤就只剩一個數字，客戶會不確定自己到底勾了什麼。
 *
 * 要開哪一張比較表由呼叫端用 href 傳進來（/map/compare?ids=… 或 /favorites/compare?l=…），
 * 這裡不認得兩種 id 的差別。樣式在 CompareBar.module.css；用到的色票變數（--accent／--ink）
 * 兩個頁的 .page 都有定義。
 */

import { COMPARE_MAX, COMPARE_MIN } from "@/lib/map-compare";
import styles from "./CompareBar.module.css";

export type CompareItem = { id: string; title: string; project: string };

export default function CompareBar({
  items,
  href,
  onRemove,
  onClear,
}: {
  items: CompareItem[];
  /** 「開始比較」要開的網址；湊不到 COMPARE_MIN 件時不會用到 */
  href: string;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  if (items.length === 0) return null;
  const ready = items.length >= COMPARE_MIN;
  const need = COMPARE_MIN - items.length;

  return (
    <div className={styles.bar} role="region" aria-label="物件比較">
      <div className={styles.head}>
        <span className={styles.count} aria-live="polite">
          {`已選 ${items.length}／${COMPARE_MAX} 件物件`}
        </span>
        <span className={styles.hint}>{ready ? `最多可比 ${COMPARE_MAX} 件，開新分頁對照` : `再選 ${need} 件就能開始比較`}</span>
      </div>

      <ul className={styles.chips}>
        {items.map((it) => (
          <li key={it.id} className={styles.chip}>
            {it.project && <span className={styles.chipProject}>{it.project}</span>}
            <span className={styles.chipTitle}>{it.title}</span>
            <button
              type="button"
              className={styles.chipX}
              onClick={() => onRemove(it.id)}
              aria-label={`移除 ${it.title}`}
              title="移除"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <div className={styles.btns}>
        {ready ? (
          <a className={styles.start} href={href} target="_blank" rel="noopener noreferrer">
            開始比較 ↗
          </a>
        ) : (
          <span className={styles.startOff} aria-disabled="true">
            開始比較
          </span>
        )}
        <button type="button" className={styles.clear} onClick={onClear}>
          清空
        </button>
      </div>
    </div>
  );
}

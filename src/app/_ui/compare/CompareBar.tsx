"use client";

/**
 * 🔀 浮在 /map 畫面底下的「比較列」
 *
 * 勾了至少一件才出現：左邊「已選 N／4 件」＋每件一顆小籤（建案名＋標題，可 ✕ 移除），
 * 右邊「開始比較」與「清空」。**開始比較是開新分頁** —— 地圖這頁載入很重（Leaflet＋500 多案），
 * 用同一分頁跳過去再按上一頁，選中的建案與捲動位置都會掉。
 *
 * 為什麼要有小籤：選中的物件散在不同建案底下，切到別的建案後看不到剛剛勾的那戶，
 * 沒有小籤就只剩一個數字，客戶會不確定自己到底勾了什麼。
 *
 * 樣式在 Map.module.css 的 `.cmp*` 那一段。
 */

import { COMPARE_MAX, COMPARE_MIN, compareHref } from "@/lib/map-compare";
import styles from "./Map.module.css";

export type CompareItem = { id: string; title: string; project: string };

export default function CompareBar({
  items,
  onRemove,
  onClear,
}: {
  items: CompareItem[];
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  if (items.length === 0) return null;
  const ready = items.length >= COMPARE_MIN;
  const need = COMPARE_MIN - items.length;

  return (
    <div className={styles.cmpBar} role="region" aria-label="物件比較">
      <div className={styles.cmpBarHead}>
        <span className={styles.cmpCount} aria-live="polite">
          {`已選 ${items.length}／${COMPARE_MAX} 件物件`}
        </span>
        <span className={styles.cmpHint}>{ready ? "最多可比 4 件，開新分頁對照" : `再選 ${need} 件就能開始比較`}</span>
      </div>

      <ul className={styles.cmpChips}>
        {items.map((it) => (
          <li key={it.id} className={styles.cmpChip}>
            {it.project && <span className={styles.cmpChipProject}>{it.project}</span>}
            <span className={styles.cmpChipTitle}>{it.title}</span>
            <button
              type="button"
              className={styles.cmpChipX}
              onClick={() => onRemove(it.id)}
              aria-label={`移除 ${it.title}`}
              title="移除"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <div className={styles.cmpBarBtns}>
        {ready ? (
          <a
            className={styles.cmpStart}
            href={compareHref(items.map((it) => it.id))}
            target="_blank"
            rel="noopener noreferrer"
          >
            開始比較 ↗
          </a>
        ) : (
          <span className={styles.cmpStartOff} aria-disabled="true">
            開始比較
          </span>
        )}
        <button type="button" className={styles.cmpClear} onClick={onClear}>
          清空
        </button>
      </div>
    </div>
  );
}

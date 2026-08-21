/**
 * 「本月瑋凱推薦好案」標題。
 *
 * 首頁那個區塊與 /listings 頁共用同一個元件 —— 這句話兩邊必須一致，
 * 分開寫遲早會有一邊改了另一邊沒改（2026-08-21 之前就是這樣，
 * 首頁寫「本月瑋凱強推好案」、/listings 寫「精選好案」）。
 *
 * 設計：「推薦」兩個字底下墊一道暖金色的螢光筆，兩側各一顆小星星。
 * 用螢光筆而不是底線，是因為底線在中文字下面容易跟筆畫黏在一起；
 * 墊在字後面的色塊比較不會干擾閱讀，又足夠醒目。
 *
 * 螢光筆是用 background-image 畫的，不是 ::after 加絕對定位 ——
 * 後者要靠 z-index 壓到文字後面，一旦外層有 transform 或 overflow
 * 就會出現色塊蓋住字的災難。背景圖沒有這個問題。
 */
import styles from "./listings.module.css";

type Props = {
  /** /listings 是整頁的主標所以用 h1，首頁那個是區塊標題所以用 h2 */
  as?: "h1" | "h2";
  className?: string;
};

export default function FeaturedTitle({ as: Tag = "h2", className }: Props) {
  return (
    <Tag className={className}>
      <span className={styles.titleStar} aria-hidden="true">
        ✦
      </span>
      本月瑋凱
      <span className={styles.titleHighlight}>推薦</span>
      好案
      <span className={styles.titleStar} aria-hidden="true">
        ✦
      </span>
    </Tag>
  );
}

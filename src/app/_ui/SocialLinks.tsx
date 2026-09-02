/**
 * 📱 社群連結 —— FB / IG / YouTube / TikTok
 *
 * ## 網址在哪裡改
 *
 * **`src/config/owner.ts` 的 `SOCIAL`，不是這裡。** 這支只負責排版與隱藏規則。
 * 名片頁 /card 的社群列吃的是同一份設定，所以填一次兩個頁面一起出現。
 *
 * ## 兩種樣式，用在兩種背景上
 *
 *   `variant="bar"`   首頁 hero 最上面那一條。**光禿禿的品牌 icon，沒有底磚**——
 *                     hero 是淺色漸層，白底磚在上面等於看不見邊。
 *   `variant="tiles"` 首頁「預約諮詢」區塊（深藍底）與未來任何深色區塊。
 *                     白色圓角底磚，四個品牌色才跳得出來。
 *
 * ⚠️ **`bar` 一定要放在 `.heroInner` 前面，不能放在 hero 的按鈕下面。**
 *    860px 以下 `.heroPhotoWrap` 是 `order: -1`，**形象照排在所有文字前面**
 *    （260×320 ＋ 20px）。放按鈕下面的話手機第一屏根本看不到，
 *    但桌機看起來完全正常 —— 這種「只有手機壞掉」的差別不會有任何錯誤訊息。
 *
 * ## ⚠️ 沒填網址的平台會整顆消失，不是變灰
 *
 * `href=""` 的 `<a>` 點下去是「重新整理本頁」，客戶會以為連結壞掉，所以沒填的直接不畫。
 * **四個都沒填的話整區（含標題）都不會出現**，這是刻意的，免得留下一塊只有標題的空白。
 *
 * 副作用是：**網址填錯或漏填時，畫面上什麼都不會發生，也不會有錯誤訊息。**
 * 改完 `SOCIAL` 一定要實際看一眼首頁，不要只看 build 有沒有過。
 *
 * ## 為什麼 icon 要去 card/_icons 拿
 *
 * 品牌 SVG 全站只有那一份（`src/app/card/_icons.tsx`）。複製一份過來的話，
 * 哪天 IG 換 logo 就會變成改一邊、另一邊還是舊的，而且不會有人發現。
 */
import { OWNER, SOCIAL } from "@/config/owner";
import { FacebookIcon, InstagramIcon, YoutubeIcon, TiktokIcon } from "../card/_icons";
import styles from "./SocialLinks.module.css";

/** 顯示順序＝這個陣列的順序。系統擁有者提的順序是 FB→IG→YT→TikTok */
const PLATFORMS = [
  { key: "fb", label: "Facebook", href: SOCIAL.fb, Icon: FacebookIcon },
  { key: "ig", label: "Instagram", href: SOCIAL.ig, Icon: InstagramIcon },
  { key: "yt", label: "YouTube", href: SOCIAL.yt, Icon: YoutubeIcon },
  { key: "tiktok", label: "TikTok", href: SOCIAL.tiktok, Icon: TiktokIcon },
] as const;

type Props = {
  variant?: "bar" | "tiles";
  /** 標題文字。`bar` 與 `tiles` 都會顯示，傳空字串就不顯示 */
  title?: string;
};

export default function SocialLinks({ variant = "tiles", title = "追蹤瑋凱" }: Props) {
  const live = PLATFORMS.filter((p) => p.href);
  if (live.length === 0) return null;

  const bar = variant === "bar";
  const size = bar ? 30 : 28;

  /* 用 <ul>/<li> 不用一排 <a>：螢幕閱讀器會先唸「清單，4 個項目」再逐一唸連結，
     使用者知道總共有幾個、現在在第幾個。純 <a> 排一排的話只會聽到四個連結名稱連著念。 */
  const items = (
    <ul className={bar ? styles.barList : styles.row}>
      {live.map(({ key, label, href, Icon }) => (
        <li key={key}>
          <a
            className={bar ? styles.barBtn : styles.btn}
            href={href}
            target="_blank"
            /* noreferrer 一定要留：少了它，對方後台看得到客戶是從哪一頁點過去的，
               而且 target="_blank" 沒有 noopener 會讓新開的分頁能操作我們這頁 */
            rel="noopener noreferrer"
            aria-label={`${OWNER.name}的 ${label}`}
            title={label}
          >
            <Icon size={size} />
          </a>
        </li>
      ))}
    </ul>
  );

  if (bar) {
    return (
      <div className={styles.bar}>
        {title && <span className={styles.barTitle}>{title}</span>}
        {items}
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      {title && <p className={styles.title}>{title}</p>}
      {items}
    </div>
  );
}

/**
 * 📱 社群連結 —— FB / IG / YouTube / TikTok
 *
 * ## 網址在哪裡改
 *
 * **`src/config/owner.ts` 的 `SOCIAL`，不是這裡。** 這支只負責排版與隱藏規則。
 * 六個公開頁＋名片頁 /card 全部吃同一份設定，填一次到處都出現。
 *
 * ## 三種樣式，各有各的位置（2026-09-03 系統擁有者拍板 ①③④⑤⑨）
 *
 *   `variant="float"` 桌機右側固定的直排（position:fixed，往下捲也一直看得到）。
 *                     **只在 1220px 以上顯示**（扣掉捲軸後 1080 容器兩側才有 ≥62px 放它）。
 *                     沒有標題。⚠️ **要放在 <header> 外面**：header 有 backdrop-filter，
 *                     會變成 fixed 子元素的定位基準，放裡面它會被關在 78px 高的 header 內。
 *                     原本想直接塞進 header 那一排，量過塞不下（見 SiteNav.tsx 的註解）。
 *   `variant="bar"`   每一頁內容最上面那一條（首頁在 hero 頂端、子頁在第一個 section 頂端）。
 *                     **跟 nav 互斥**：header 那組出現時這條自動隱藏，不然桌機會在 100px 內
 *                     看到同一排 icon 兩次。標題分長短兩句，860px 以下自動換短句。
 *   `variant="tiles"` 底磚版。`tone="dark"`（預設）是白磚配深色區塊；
 *                     `tone="light"` 是米色磚配淺色底 —— /card 名片頁用這個。
 *
 * ⚠️ **`bar` 一定要放在該頁第一屏內容的最前面。** 首頁 860px 以下 `.heroPhotoWrap` 是
 *    `order: -1`，形象照排在所有文字前面，放按鈕下面手機第一屏根本看不到，
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

/**
 * bar 的標題文案。2026-09-03 從「追蹤瑋凱」改成「說理由」——
 * 「追蹤」是指令，「有開箱影片跟房產知識可以看」才是人會動手的原因。
 *
 * ⚠️ 只能寫他頻道上**真的有**的東西。影音專區的三個分類是房產知識／生活知識／房屋開箱，
 *    TikTok 簡介也寫空拍開箱＋房產知識；「每週更新」這種頻率承諾沒人守得住，不要寫。
 */
const BAR_TITLE_LONG = "追蹤瑋凱，看開箱影片與房產知識";
const BAR_TITLE_SHORT = "開箱影片・房產知識";

type Props = {
  variant?: "float" | "bar" | "tiles";
  /**
   * bar 專用：不管視窗多寬都顯示（預設 1220px 以上會讓位給右側直排）。
   * 給沒有右側直排的頁面用 —— /map 的容器接近滿版（1280px 視窗時內容到 x=1237），
   * 直排 fixed 在右側會壓到地圖與清單，所以那頁不放直排、改讓這條一直在。
   */
  persistent?: boolean;
  /** tiles 專用：dark＝白磚配深色區塊（預設）、light＝米色磚配淺色底（/card） */
  tone?: "dark" | "light";
  /** tiles 的標題；bar 的標題是長短兩句寫死在上面，傳這個會把兩句都換掉；float 不顯示標題 */
  title?: string;
};

export default function SocialLinks({ variant = "tiles", tone = "dark", title, persistent = false }: Props) {
  const live = PLATFORMS.filter((p) => p.href);
  if (live.length === 0) return null;

  const size = variant === "float" ? 22 : variant === "bar" ? 30 : tone === "light" ? 26 : 28;
  const btnClass =
    variant === "float" ? styles.floatBtn : variant === "bar" ? styles.barBtn : styles.btn;
  const listClass =
    variant === "float" ? styles.floatList : variant === "bar" ? styles.barList : styles.row;

  /* 用 <ul>/<li> 不用一排 <a>：螢幕閱讀器會先唸「清單，4 個項目」再逐一唸連結，
     使用者知道總共有幾個、現在在第幾個。純 <a> 排一排的話只會聽到四個連結名稱連著念。 */
  const items = (
    <ul className={listClass}>
      {live.map(({ key, label, href, Icon }) => (
        <li key={key}>
          <a
            className={btnClass}
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

  if (variant === "float") {
    return (
      <div className={styles.float} role="group" aria-label="社群連結">
        {items}
      </div>
    );
  }

  if (variant === "bar") {
    return (
      <div className={`${styles.bar} ${persistent ? styles.barPersistent : ""}`}>
        {/* 長短兩句都渲染、靠 CSS 切換 —— 這是 server component，拿不到視窗寬度 */}
        <span className={`${styles.barTitle} ${styles.barTitleLong}`}>{title ?? BAR_TITLE_LONG}</span>
        <span className={`${styles.barTitle} ${styles.barTitleShort}`}>{title ?? BAR_TITLE_SHORT}</span>
        {items}
      </div>
    );
  }

  const tilesTitle = title ?? "追蹤瑋凱";
  return (
    <div className={`${styles.wrap} ${tone === "light" ? styles.tilesLight : ""}`}>
      {tilesTitle && <p className={styles.title}>{tilesTitle}</p>}
      {items}
    </div>
  );
}

/**
 * 📱 社群連結 —— FB / IG / YouTube / TikTok
 *
 * ## 網址在哪裡改
 *
 * **`src/config/owner.ts` 的 `SOCIAL`，不是這裡。** 這支只負責排版與隱藏規則。
 * 六個公開頁＋名片頁 /card 全部吃同一份設定，填一次到處都出現。
 *
 * ## 三種樣式，各有各的位置
 *
 *   `variant="bar"`   白底藥丸：粗體文案＋五顆 36px icon，**所有寬度都顯示**。2026-09-03 第一版
 *                     在 1220px 以上會收掉讓位給直排，結果系統擁有者在桌機上「找不到那句文案」、
 *                     子頁「不明顯」—— 文案只有這裡有，收掉等於桌機整個沒有。現在不收了。
 *                     2026-10-22 起**子頁改放 header 第二排**（各頁自己在 `<header>` 裡多一個
 *                     `.headerSocial` 包著它，傳 `className={styles.headerSocialBar}` 蓋掉預設
 *                     底距），跟著 header 的 `position:sticky` 一起固定、不隨頁面捲動消失——
 *                     不用算 header 高度去對 `top` 位移，兩排本來就是同一個盒子。**首頁例外**，
 *                     藥丸還在 hero banner 右上角、當內容頂端的第一屏元素（見下一條規則）。
 *                     2026-10-22 同日系統擁有者看過之後嫌「每頁都縮小放在黃框處」（logo 正下方、
 *                     不要整排置中那麼大），所以子頁又加了 `compact` 這個開關：icon 縮回跟
 *                     `float` 一樣的 22px、拿掉文案、`align="start"` 貼左對齊 logo。**首頁沒有
 *                     這個開關**，hero banner 那顆還是原本的大藥丸＋文案。**這顆 compact 藥丸
 *                     只在 1220px 以下顯示**（見下一條、跟 `float` 用斷點分工），1220px 以上
 *                     `.headerSocial` 自己 `display:none`（home.module.css／Map.module.css）。
 *   `variant="float"` 桌機右側固定的直排（position:fixed，1220px 以上一直在，捲動時也看得到）。
 *                     2026-10-22 子頁改放 header 第二排之後一度把這個拿掉（兩個同時出現是視覺
 *                     雜訊），同一天系統擁有者又說「改移到右側邊下方，隨著頁面滾動」要回來，
 *                     所以子頁又加回這個呼叫了——跟 compact 藥丸用 1220px 斷點分工，兩個
 *                     不會同時出現（≥1220 顯示這排、<1220 顯示 header 那顆）。
 *                     ⚠️ 一定要放在 `<header>` 外面：header 有 backdrop-filter，會變成
 *                     fixed 子元素的定位基準（見 SiteNav.tsx）。
 *   `variant="tiles"` 底磚版。`tone="dark"`（預設）白磚配深色區塊；`tone="light"` 米色磚
 *                     配淺色底 —— /card 名片頁用這個。
 *
 * ⚠️ **首頁的 `bar`（`page.tsx` 裡那個，沒傳 `className`）一定要放在第一屏內容的最前面。**
 *    860px 以下 `.heroPhotoWrap` 是 `order: -1`，形象照排在所有文字前面，放按鈕下面手機第一屏
 *    根本看不到，但桌機看起來完全正常 —— 這種「只有手機壞掉」的差別不會有任何錯誤訊息。
 *    子頁的 `bar`（傳了 `headerSocialBar`）在 header 裡，不吃這條規則。
 *
 * ## ⚠️ 沒填網址的平台會整顆消失，不是變灰
 *
 * `href=""` 的 `<a>` 點下去是「重新整理本頁」，客戶會以為連結壞掉，所以沒填的直接不畫。
 * **全部都沒填的話整區（含標題）都不會出現**，這是刻意的，免得留下一塊只有標題的空白。
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
import { FacebookIcon, InstagramIcon, ThreadsIcon, YoutubeIcon, TiktokIcon } from "../card/_icons";
import styles from "./SocialLinks.module.css";

/**
 * 顯示順序＝這個陣列的順序。系統擁有者提的順序是 FB→IG→YT→TikTok；
 * 2026-09-17 加的 Threads（脆）排在 IG 後面 —— 他實體名片上的 icon 也是這樣排（IG 旁邊就是脆）。
 * ⚠️ 加平台之前先量藥丸放不放得下：一顆 icon 連內距是 48px，手機 480px 以下藥丸會變成
 *    「文案一行＋icon 一行」，icon 那行超過畫面寬度就會擠掉。五顆在 375px 量過還有空間。
 */
const PLATFORMS = [
  { key: "fb", label: "Facebook", href: SOCIAL.fb, Icon: FacebookIcon },
  { key: "ig", label: "Instagram", href: SOCIAL.ig, Icon: InstagramIcon },
  { key: "threads", label: "Threads", href: SOCIAL.threads, Icon: ThreadsIcon },
  { key: "yt", label: "YouTube", href: SOCIAL.yt, Icon: YoutubeIcon },
  { key: "tiktok", label: "TikTok", href: SOCIAL.tiktok, Icon: TiktokIcon },
] as const;

/**
 * 藥丸的文案。2026-09-03 從「追蹤瑋凱」改成「說理由」——
 * 「追蹤」是指令，「有開箱影片跟房產知識可以看」才是人會動手的原因。
 *
 * ⚠️ 只能寫他頻道上**真的有**的東西。影音專區的三個分類是房產知識／生活知識／房屋開箱，
 *    TikTok 簡介也寫空拍開箱＋房產知識；「每週更新」這種頻率承諾沒人守得住，不要寫。
 */
const BAR_TITLE_LONG = "追蹤瑋凱，看開箱影片與房產知識";
const BAR_TITLE_SHORT = "開箱影片・房產知識";

type Props = {
  variant?: "float" | "bar" | "tiles";
  /** tiles 專用：dark＝白磚配深色區塊（預設）、light＝米色磚配淺色底（/card） */
  tone?: "dark" | "light";
  /** bar 專用：桌機靠右（預設）、置中（子頁標題都置中）還是靠左（子頁 header 第二排的 compact 版，
   *  貼齊 logo）。首頁自 2026-09-08 起放在品牌 banner 的右上角（page.tsx 的 .bannerSocial 負責定位、
   *  這裡傳 align="center"）。860px 以下（非 compact 時）一律置中 */
  align?: "end" | "center" | "start";
  /** tiles 的標題；bar 的標題是長短兩句寫死在上面，傳這個會把兩句都換掉；float 不顯示標題 */
  title?: string;
  /** bar 專用的額外 class，加在最外層 —— 塞進 header 當第二排時用它蓋掉預設的 28px 底距 */
  className?: string;
  /** bar 專用：2026-10-22 子頁 header 第二排加的迷你版——icon 縮到跟 float 一樣 22px、拿掉
   *  文案，整顆藥丸跟著變小。不影響首頁 hero 的大藥丸（首頁沒傳這個 prop）。 */
  compact?: boolean;
};

export default function SocialLinks({
  variant = "tiles",
  tone = "dark",
  align = "end",
  title,
  className,
  compact = false,
}: Props) {
  const live = PLATFORMS.filter((p) => p.href);
  if (live.length === 0) return null;

  const size =
    variant === "float" ? 22 : variant === "bar" ? (compact ? 22 : 36) : tone === "light" ? 26 : 28;
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
    const alignClass =
      align === "center" ? styles.barCenter : align === "start" ? styles.barStart : "";
    return (
      <div className={[styles.barOuter, alignClass, className].filter(Boolean).join(" ")}>
        <div className={[styles.bar, compact ? styles.barCompact : ""].filter(Boolean).join(" ")}>
          {/* compact 版（子頁 header 第二排）沒有文案空間，只留 icon —— 長短兩句是給
              有空間說「為什麼要點」的大藥丸（首頁 hero）用的。 */}
          {!compact && (
            <>
              {/* 長短兩句都渲染、靠 CSS 切換 —— 這是 server component，拿不到視窗寬度 */}
              <span className={`${styles.barTitle} ${styles.barTitleLong}`}>{title ?? BAR_TITLE_LONG}</span>
              <span className={`${styles.barTitle} ${styles.barTitleShort}`}>{title ?? BAR_TITLE_SHORT}</span>
            </>
          )}
          {items}
        </div>
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

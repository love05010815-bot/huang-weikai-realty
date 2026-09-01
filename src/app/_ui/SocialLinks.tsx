/**
 * 📱 追蹤社群 —— FB / IG / YouTube / TikTok 一排品牌 icon
 *
 * ## 網址在哪裡改
 *
 * **`src/config/owner.ts` 的 `SOCIAL`，不是這裡。** 這支只負責排版與隱藏規則。
 * 名片頁 /card 的社群列吃的是同一份設定，所以填一次兩個頁面一起出現。
 *
 * ## ⚠️ 沒填網址的平台會整顆消失，不是變灰
 *
 * `href=""` 的 `<a>` 點下去是「重新整理本頁」，客戶會以為連結壞掉，
 * 所以沒填的直接不畫。**四個都沒填的話整區（含「追蹤瑋凱」標題）都不會出現**——
 * 這是刻意的，免得首頁多一塊只有標題的空白。
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

export default function SocialLinks({ title = "追蹤瑋凱" }: { title?: string }) {
  const live = PLATFORMS.filter((p) => p.href);
  if (live.length === 0) return null;

  return (
    <div className={styles.wrap}>
      <p className={styles.title}>{title}</p>
      <div className={styles.row}>
        {live.map(({ key, label, href, Icon }) => (
          <a
            key={key}
            className={styles.btn}
            href={href}
            target="_blank"
            /* noreferrer 一定要留：少了它，對方後台看得到客戶是從哪一頁點過去的，
               而且 target="_blank" 沒有 noopener 會讓新開的分頁能操作我們這頁 */
            rel="noopener noreferrer"
            aria-label={`${OWNER.name}的 ${label}`}
            title={label}
          >
            <Icon size={28} />
          </a>
        ))}
      </div>
    </div>
  );
}

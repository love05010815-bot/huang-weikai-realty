"use client";

/**
 * 🧭 全站導覽列 —— 桌機那一條 ＋ 手機的漢堡選單，**同一份清單**
 *
 * ## 為什麼兩種模式要寫在同一個元件裡
 *
 * 這七項原本只寫在首頁 `page.tsx` 的一個 `<ul>` 裡。要讓子頁的桌機也有導覽列，
 * 最直覺的做法是把那段 JSX 複製到另外五頁 —— **那會變成六份清單，改一次要改六個檔，
 * 而且漏掉一個不會報錯、build 也會過**，只會讓客戶在不同頁看到不一樣的選單。
 * 所以清單只留在下面的 `ITEMS`，桌機與手機都從它長出來。
 *
 * ⚠️ 項目與順序是 2026-08-26 系統擁有者親自指定的，**不要「順手」重排**。
 *
 * ## 兩種模式怎麼切
 *
 *   1045px 以上  → 桌機那一條橫的（`.desktopNav`），漢堡鈕 `display: none`
 *   1044px 以下  → 漢堡鈕（`.mobile`），桌機那條 `display: none`
 *
 * 斷點怎麼掃出來的、為什麼是 1044，見 `SiteNav.module.css`。
 *
 * ## ⚠️ `variant` 一定要給對，這是最容易默默壞掉的地方
 *
 * `#about` 這種錨點**只有在首頁才跳得到東西**。在 /videos 上點它，
 * 網址列會變、畫面完全不動、**不會有任何錯誤訊息**。
 * 所以首頁用 `home`（錨點直接跳），其他頁一律 `sub`（自動變成 `/#about`，
 * 先回首頁再跳）。
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { OWNER } from "@/config/owner";
import styles from "./SiteNav.module.css";

/**
 * 選單項目。`anchor` ＝ 首頁上的區塊錨點，`route` ＝ 獨立分頁。
 *
 * 分兩種只是因為連結要用不同寫法（錨點用 `<a>`、分頁用 `<Link>` 才有預先載入），
 * 不是為了分類 —— 客戶不需要知道哪個是同一頁哪個是另一頁。
 *
 * 注意「稅費試算」指的是**首頁的 `#tools` 區塊**，不是 /tax 那一頁。
 * 桌機那條原本就是這樣接的，不要「順手」改成 /tax。
 */
type NavItem =
  | { label: string; kind: "anchor"; hash: string }
  | { label: string; kind: "route"; href: "/map" | "/videos" };

const ITEMS: readonly NavItem[] = [
  { label: "關於我", kind: "anchor", hash: "#about" },
  { label: "服務項目", kind: "anchor", hash: "#services" },
  { label: "精選好案", kind: "anchor", hash: "#listings" },
  // 2026-08-21 恢復入口。原本雪藏是因為「土地使用分區」那層的建商名沒核對完；
  // 該層已從 /map 移除，現在頁面上是系統擁有者自己確認過的 39 個建案。
  { label: "重劃區建案", kind: "route", href: "/map" },
  { label: "稅費試算", kind: "anchor", hash: "#tools" },
  // 2026-08-25 系統擁有者拍板：**影音不放首頁下滑區塊，做成獨立分頁**，跟「重劃區建案」
  // 一樣。所以這是 route 不是 #videos 錨點 —— 首頁上沒有那個區塊了。
  { label: "影音專區", kind: "route", href: "/videos" },
  { label: "預約諮詢", kind: "anchor", hash: "#booking" },
];

type Variant = "home" | "sub";

function NavItemLink({
  item,
  variant,
  className,
  onClick,
}: {
  item: NavItem;
  variant: Variant;
  className: string;
  onClick?: () => void;
}) {
  if (item.kind === "route") {
    // href 是字面值型別（"/map" | "/videos"），typedRoutes 才過得了
    return (
      <Link className={className} href={item.href} onClick={onClick}>
        {item.label}
      </Link>
    );
  }
  return (
    <a
      className={className}
      href={variant === "home" ? item.hash : `/${item.hash}`}
      onClick={onClick}
    >
      {item.label}
    </a>
  );
}

export default function SiteNav({ variant }: { variant: Variant }) {
  const [open, setOpen] = useState(false);

  /**
   * 展開時鎖住背景捲動，並讓 Esc 關閉。
   *
   * 不鎖的話手指滑在選單外面會把整頁帶著跑，選單卻黏在 header 上不動，
   * 看起來像當掉。收合時要還原成「原本的值」而不是寫死 `""`，
   * 不然哪天別的元件也在鎖捲動，這裡會順手把人家解掉。
   */
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      {/* 桌機：1045px 以上。這一條原本寫在首頁 page.tsx，搬過來讓六頁共用 */}
      <ul className={styles.desktopNav}>
        {ITEMS.map((item) => (
          <li key={item.label}>
            <NavItemLink item={item} variant={variant} className={styles.desktopLink} />
          </li>
        ))}
      </ul>

      {/* 🚫 2026-09-03 試過把四顆社群 icon 塞進這條 header，**量過塞不下**：
          1280px 實測 brand 173.5＋導覽列 526＋社群組 157＋電話與預約鈕 258＋三個間距 48
          ＝ 1163px，容器只有 1080，溢出 83px —— 而且視窗再寬也沒用，容器是固定的。
          縮 icon、縮導覽列間距、拿掉分隔線全加起來省不到 83。
          改成桌機右側固定的直排（<SocialLinks variant="float">，各頁自己渲染在 header 外面，
          因為 header 有 backdrop-filter，會把 position:fixed 的子元素關在 header 裡）。
          **不要再試著把它塞回這一排。** */}

      {/* 手機：1044px 以下 */}
      <div className={styles.mobile}>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={open}
          aria-controls="site-nav-panel"
          aria-label={open ? "關閉選單" : "開啟選單"}
          onClick={() => setOpen((value) => !value)}
        >
          <span className={styles.bars} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>

        {open ? (
          <>
            {/* 點旁邊關掉。讀螢幕軟體看不到它（aria-hidden）：它跟漢堡鈕會是
                同一個「關閉選單」，念兩次只會讓人困惑。鍵盤要關有 Esc 跟漢堡鈕本身。
                它從 header 底下才開始（top: 100%），所以不會蓋住漢堡鈕 ——
                蓋住的話就變成「打得開關不掉」。 */}
            <button
              type="button"
              className={styles.backdrop}
              aria-hidden="true"
              tabIndex={-1}
              onClick={close}
            />

            <nav id="site-nav-panel" className={styles.panel} aria-label="主選單">
              <ul className={styles.list}>
                {ITEMS.map((item) => (
                  <li key={item.label}>
                    <NavItemLink
                      item={item}
                      variant={variant}
                      className={styles.link}
                      onClick={close}
                    />
                  </li>
                ))}
              </ul>

              {/* 📞 一鍵撥號。
                  桌機的 header 右上角本來就有這顆，但 **560px 以下它是隱藏的**
                  （見 home.module.css 的 `.navCta .navCtaPhone`）——
                  也就是「真的能打電話的那個裝置反而看不到撥號鈕」。
                  2026-08-31 系統擁有者指定補在選單最下面。
                  樣式做成外框式，跟 header 那顆實心的「線上預約」分開，
                  避免兩顆長得一樣的主要按鈕互相搶。 */}
              <a className={styles.phone} href={`tel:${OWNER.phoneRaw}`} onClick={close}>
                📞 {OWNER.phone}
              </a>
            </nav>
          </>
        ) : null}
      </div>
    </>
  );
}

"use client";

/**
 * 📱 手機版導覽選單（漢堡鈕）
 *
 * ## 為什麼需要這個
 *
 * 桌機那條 `<ul className={styles.nav}>` 在 **1044px 以下是整條 `display:none`**
 * （斷點怎麼掃出來的見 `home.module.css` 那段紀錄——硬擠會撐爆 header、整頁橫向捲動）。
 * 結果是**手機上完全沒有選單**：客戶從 Google 或 LINE 點進 /videos，
 * 看完影片就出不去了，回首頁只能按瀏覽器的上一頁。
 * 2026-08-27 系統擁有者要求：手機上面要有選單，項目跟網頁版一樣。
 *
 * ## 這支只做一件事
 *
 * **1044px 以下多一顆漢堡鈕，展開跟桌機一模一樣的七項。**
 * 1045px 以上這支整個 `display:none` —— **桌機的畫面一個像素都沒有動**，
 * 上面那段辛苦掃出來的斷點也完全沒碰。
 *
 * ⚠️ 項目與順序是 2026-08-26 系統擁有者親自指定的，跟首頁 `page.tsx` 那條 `<ul>`
 *    是同一份清單。**要加項目或改字就兩邊一起改**——只改一邊不會報錯、build 也會過，
 *    只會讓客戶在手機跟桌機看到不一樣的選單，這是那種放三個月才被發現的錯。
 *
 * ⚠️ `variant` 一定要給對，這是最容易默默壞掉的地方：
 *    `#about` 這種錨點**只有在首頁上才跳得到東西**。在 /videos 上點 `#about`
 *    網址列會變、畫面完全不動、**不會有任何錯誤訊息**。
 *    所以首頁用 `home`（錨點直接跳），其他頁一律 `sub`（自動變成 `/#about`，
 *    先回首頁再跳）。
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./SiteNav.module.css";

/**
 * 選單項目。
 *
 * `anchor` ＝ 首頁上的區塊錨點；`route` ＝ 獨立分頁。
 * 分成兩種是因為它們的連結要用不同的寫法（見下面 render 的地方），
 * 而不是為了分類——客戶不需要知道哪個是同一頁哪個是另一頁。
 *
 * 注意「稅費試算」指的是**首頁的 `#tools` 區塊**，不是 /tax 那一頁 ——
 * 桌機那條就是這樣接的，這裡照抄，不要「順手」改成 /tax。
 */
type NavItem =
  | { label: string; kind: "anchor"; hash: string }
  | { label: string; kind: "route"; href: "/map" | "/videos" };

const ITEMS: readonly NavItem[] = [
  { label: "關於我", kind: "anchor", hash: "#about" },
  { label: "服務項目", kind: "anchor", hash: "#services" },
  { label: "精選好案", kind: "anchor", hash: "#listings" },
  { label: "重劃區建案", kind: "route", href: "/map" },
  { label: "稅費試算", kind: "anchor", hash: "#tools" },
  { label: "影音專區", kind: "route", href: "/videos" },
  { label: "預約諮詢", kind: "anchor", hash: "#booking" },
];

export default function SiteNav({ variant }: { variant: "home" | "sub" }) {
  const [open, setOpen] = useState(false);

  /**
   * 展開時鎖住背景捲動，並讓 Esc 關閉。
   *
   * 不鎖的話手指滑在選單外面會把整頁帶著跑，選單卻黏在 header 上不動，
   * 看起來像當掉。收合時要把 `overflow` 還原成「原本的值」而不是寫死 `""`，
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
    <div className={styles.wrap}>
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
          {/* 點旁邊關掉。用 <button> 而不是 <div> 是為了鍵盤與讀螢幕軟體也走得通。
              它從 header 底下才開始（top: 100%），所以不會蓋住漢堡鈕本身——
              蓋住的話就變成「打得開關不掉」。 */}
          {/* 讀螢幕軟體看不到它（aria-hidden）：它跟漢堡鈕會是同一個「關閉選單」，
              念兩次只會讓人困惑。鍵盤要關有 Esc 跟漢堡鈕本身，不缺這一個。 */}
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
                  {item.kind === "route" ? (
                    // 獨立分頁走 <Link>，才有 Next 的預先載入與不重刷整頁。
                    // href 是字面值型別（"/map" | "/videos"），typedRoutes 才過得了。
                    <Link className={styles.link} href={item.href} onClick={close}>
                      {item.label}
                    </Link>
                  ) : (
                    // 錨點維持 <a>，跟首頁那條 <ul> 的寫法一致。
                    // 子頁補上開頭的 "/"，變成「先回首頁再跳到該區塊」。
                    <a
                      className={styles.link}
                      href={variant === "home" ? item.hash : `/${item.hash}`}
                      onClick={close}
                    >
                      {item.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        </>
      ) : null}
    </div>
  );
}

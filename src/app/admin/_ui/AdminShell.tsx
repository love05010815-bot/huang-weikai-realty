"use client";

/**
 * 後台外殼（左側 menu ＋ 右側內容）。
 *
 * children 是從 server layout 傳進來的 —— 這樣頁面本身仍然是 server component，
 * 只有「抽屜開/關」這一點狀態是 client 的，不會把整個後台拖下水變成 client render。
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CIS } from "@/app/admin/_components/cis";
import { Icon } from "@/app/admin/_ui/icons";
import { ADMIN_NAV, isNavItemActive, type AdminNavItem } from "./nav";
import styles from "./adminShell.module.css";

export default function AdminShell({
  children,
  ownerName,
}: {
  children: React.ReactNode;
  ownerName: string;
}) {
  const pathname = usePathname() || "";
  const [open, setOpen] = useState(false);

  // 換頁就把抽屜收掉，否則點完選單新頁面被蓋住一半。
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Esc 關抽屜：手機上抽屜蓋滿畫面時，這是最快的逃生口。
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const currentLabel =
    ADMIN_NAV.flatMap((group) => group.items).find(
      (item) => !item.external && isNavItemActive(pathname, item.href),
    )?.label || "後台";

  // 明亮／深色（2026-10-28 他要的；預設明亮）。真正生效的是 <html data-adm-theme>，
  // layout.tsx 的 inline script 在畫面出來前就掛好了，這裡只是把它讀回來給按鈕顯示用。
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    setTheme(document.documentElement.getAttribute("data-adm-theme") === "dark" ? "dark" : "light");
  }, []);
  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-adm-theme", next);
    try {
      localStorage.setItem("adm-theme", next);
    } catch {
      /* 無痕模式存不了就只影響這一次 */
    }
    setTheme(next);
  }
  const themeLabel = theme === "dark" ? "切成明亮版" : "切成深色版";
  const themeIcon = theme === "dark" ? "sun" : "moon";

  return (
    <div className={styles.shell} style={{ background: CIS.bg, color: CIS.text, fontFamily: CIS.font }}>
      {/* 手機才看得到的頂欄。放在文件流裡（不是浮動的），才不會蓋住頁面標題。 */}
      <div
        className={styles.topbar}
        style={{ background: CIS.bgSoft, borderBottomColor: CIS.divider }}
      >
        <button
          type="button"
          className={styles.hamburger}
          style={{ borderColor: CIS.cardBorder, color: CIS.text }}
          onClick={() => setOpen(true)}
          aria-label="開啟選單"
          aria-expanded={open}
        >
          <Icon name="menu" size={20} />
        </button>
        <div className={styles.topbarTitle}>{currentLabel}</div>
        <button type="button" className={styles.themeBtnTop} onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}>
          <Icon name={themeIcon} size={18} />
        </button>
      </div>

      {open ? (
        <button
          type="button"
          className={styles.overlay}
          onClick={() => setOpen(false)}
          aria-label="關閉選單"
        />
      ) : null}

      <aside
        className={`${styles.sidebar}${open ? ` ${styles.sidebarOpen}` : ""}`}
        style={{ background: CIS.bgSoft, borderRightColor: CIS.divider }}
        aria-label="後台選單"
      >
        <div className={styles.brand} style={{ borderBottomColor: CIS.divider }}>
          <Icon name="adminUser" size={22} color={CIS.blue} />
          <div className={styles.brandText}>
            <div className={styles.brandName}>{ownerName}　後台</div>
            <div className={styles.brandSub} style={{ color: CIS.textMute }}>
              weikaihouse.com
            </div>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            style={{ borderColor: CIS.cardBorder, color: CIS.text, marginLeft: "auto" }}
            onClick={() => setOpen(false)}
            aria-label="關閉選單"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {ADMIN_NAV.map((group) => (
          <nav className={styles.group} key={group.title} aria-label={group.title}>
            {/* 組名跟唯一那一項同字的組（LINE 機器人、留言收件匣）不畫組名，畫出來是重複的，
                只留 .group 的上方間距把它跟前一組隔開；aria-label 照常給。
                「買方」「開發物件」雖然也只有一項，但組名跟項目不同字、是他指定的分類，照畫。 */}
            {group.items.length > 1 || group.items[0]?.label !== group.title ? (
              <div className={styles.groupTitle} style={{ color: CIS.blue }}>
                {group.title}
              </div>
            ) : null}
            {group.items.map((item) => (
              <NavLink key={item.href} item={item} active={!item.external && isNavItemActive(pathname, item.href)} />
            ))}
          </nav>
        ))}

        <div className={styles.spacer} />

        <div className={styles.footer} style={{ borderTopColor: CIS.divider }}>
          <button type="button" className={styles.themeBtn} onClick={toggleTheme} aria-label={themeLabel}>
            <Icon name={themeIcon} size={18} />
            <span className={styles.itemLabel}>{themeLabel}</span>
          </button>
          <a
            className={styles.item}
            href="/api/auth/signout?callbackUrl=%2F"
            style={{ color: CIS.textMute }}
          >
            <Icon name="logout" size={18} />
            <span className={styles.itemLabel}>登出</span>
          </a>
        </div>
      </aside>

      <div className={styles.main}>{children}</div>
    </div>
  );
}

function NavLink({ item, active }: { item: AdminNavItem; active: boolean }) {
  const className = `${styles.item}${active ? ` ${styles.itemActive}` : ""}`;
  const style: React.CSSProperties = active
    ? { background: "rgba(var(--adm-brand-rgb), 0.14)", color: CIS.blue }
    : { color: CIS.textSub };

  const inner = (
    <>
      <Icon name={item.icon} size={18} />
      <span className={styles.itemLabel}>{item.label}</span>
      {item.badge ? (
        <span
          className={styles.badge}
          style={{ background: "rgba(var(--adm-ink-rgb), 0.06)", borderColor: CIS.cardBorder, color: CIS.textMute }}
        >
          {item.badge}
        </span>
      ) : null}
      {item.external ? <Icon name="externalLink" size={14} style={{ opacity: 0.6 }} /> : null}
    </>
  );

  // 前台頁面一律開新分頁：點一下就離開後台的話，回來還要再過一次 Google 登入。
  if (item.external) {
    return (
      <a className={className} style={style} href={item.href} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    );
  }

  return (
    <Link className={className} style={style} href={item.href} aria-current={active ? "page" : undefined}>
      {inner}
    </Link>
  );
}

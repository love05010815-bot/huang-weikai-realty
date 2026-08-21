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
            <div className={styles.groupTitle} style={{ color: CIS.textMute }}>
              {group.title}
            </div>
            {group.items.map((item) => (
              <NavLink key={item.href} item={item} active={!item.external && isNavItemActive(pathname, item.href)} />
            ))}
          </nav>
        ))}

        <div className={styles.spacer} />

        <div className={styles.footer} style={{ borderTopColor: CIS.divider }}>
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
    ? { background: "rgba(242,102,102,0.14)", color: CIS.blue }
    : { color: CIS.textSub };

  const inner = (
    <>
      <Icon name={item.icon} size={18} />
      <span className={styles.itemLabel}>{item.label}</span>
      {item.badge ? (
        <span
          className={styles.badge}
          style={{ background: "rgba(255,255,255,0.06)", borderColor: CIS.cardBorder, color: CIS.textMute }}
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

/**
 * 後台左側 menu 的項目清單 —— 要加/改/刪選單，只改這個檔。
 *
 * 分組規則：
 *   「營運」＝你每天真的會進去做事的頁面（後台自己的路由，站內導覽）。
 *   「前台頁面」＝客戶看得到的頁面，只是方便你跳過去檢查，一律開新分頁，
 *                 不要讓你點一下就離開後台、回頭還要重新登入。
 *
 * ⚠️ 這裡只放「線上真的存在」的路由。掛一條連過去 404 的選單，
 *    比沒有那條選單更糟 —— 你會以為功能壞了。
 */
import type { IconName } from "@/app/admin/_ui/icons";

export type AdminNavItem = {
  href: string;
  label: string;
  icon: IconName;
  /** 右側小標籤，例如「準備中」。沒填就不顯示。 */
  badge?: string;
  /** true = 開新分頁（前台頁面用） */
  external?: boolean;
};

export type AdminNavGroup = {
  title: string;
  items: AdminNavItem[];
};

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    title: "營運",
    items: [
      { href: "/admin/appointments", label: "預約營運", icon: "calendar" },
      { href: "/admin/listings", label: "精選好案", icon: "building" },
      { href: "/admin/line", label: "LINE 機器人", icon: "mobile" },
      { href: "/admin/inbox", label: "留言收件匣", icon: "chat", badge: "準備中" },
    ],
  },
  {
    title: "前台頁面",
    items: [
      { href: "/", label: "官網首頁", icon: "home", external: true },
      { href: "/card", label: "線上名片", icon: "card", external: true },
      { href: "/card/booking", label: "線上預約", icon: "edit", external: true },
      { href: "/listings", label: "精選好案", icon: "building", external: true },
    ],
  },
];

/** 目前這條路由算不算「選中」（子頁面也算，例如 /admin/inbox/youtube）。 */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

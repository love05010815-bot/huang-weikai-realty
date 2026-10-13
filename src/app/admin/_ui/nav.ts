/**
 * 後台左側 menu 的項目清單 —— 要加/改/刪選單，只改這個檔。
 *
 * 分組規則（2026-10-13 系統擁有者指定，原本 16 項全擠在一組「營運」底下他嫌亂）：
 *   網站前台 ＝ 管客戶在官網上看得到的東西（影音／預約／好案／地圖物件／報告書）
 *   屋主     ＝ 跟屋主談委託會用到的（屋主建檔、競品分析）
 *   買方     ＝ 買方資料建檔
 *   廣告助手 ＝ 兩支 Chrome 外掛的後台（591、FB 社團）
 *   房產新聞 ＝ 新聞 → 待產文案 → 房產消息 這條產線
 *   開發物件 ＝ 開發物件追蹤
 *   LINE 機器人、留言收件匣 ＝ 各自一組（只有一項的組，側欄不畫組名，見 AdminShell）
 *   「前台頁面」＝客戶看得到的頁面，只是方便你跳過去檢查，一律開新分頁，
 *                 不要讓你點一下就離開後台、回頭還要重新登入。
 *   組內順序照他列的順序，不要照字母或自己覺得順的排。
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
    title: "網站前台",
    items: [
      { href: "/admin/videos", label: "影音", icon: "video" },
      { href: "/admin/appointments", label: "預約營運", icon: "calendar" },
      { href: "/admin/listings", label: "精選好案", icon: "building" },
      // 跟「精選好案」是兩套資料：這裡管的是 /map 上掛在各建案底下的物件
      { href: "/admin/map-listings", label: "建案地圖物件", icon: "map" },
      // 一個建案一份：複製指令 → 他自己的 ChatGPT → 貼回 JSON → 發佈到 /map/report/<id>，/map 詳情多一顆入口。表 project_report。
      { href: "/admin/reports", label: "社區銷售報告書", icon: "book" },
    ],
  },
  {
    title: "屋主",
    items: [
      // 接過的房子、屋主的聯絡資料統整在一處，手機也查得到。屋主一筆、底下掛房子與聯絡紀錄。表 owner_client / owner_property / owner_contact_log。
      { href: "/admin/owners", label: "屋主建檔", icon: "users" },
      // 貼上 591 同社區在賣的物件，產出可以傳給屋主的競品分析。純前端、不進資料庫。
      { href: "/admin/compare", label: "競品分析", icon: "radar" },
    ],
  },
  {
    title: "買方",
    items: [
      // 買方在 /match 留條件、預約看屋；物件從愛屋店網自動同步。表 match_listing / match_buyer / match_viewing。
      { href: "/admin/match", label: "買方資料建檔", icon: "handshake" },
    ],
  },
  {
    title: "廣告助手",
    items: [
      // 貼上愛屋型錄／LINE 物件文字，一鍵交給 Chrome 外掛填進 591／樂屋網的刊登表單。純前端、不進資料庫。
      // 2026-09-10 他改名「廣告刊登助手」（不只 591 了）；2026-10-13 他又改回「591廣告刊登助手」。網址 /admin/post591 不動。
      { href: "/admin/post591", label: "591廣告刊登助手", icon: "edit" },
      // 一版廣告 → 交給 Chrome 外掛（tools/fb-group-poster）用粉專身分逐一發到勾好的 FB 社團（預設替他按發佈）。純前端＋IndexedDB，不進資料庫。
      // 2026-10-13 他把後台名稱從「社團廣告發佈」改成「FB社團廣告助手」（跟外掛同名）。網址 /admin/fb 不動。
      { href: "/admin/fb", label: "FB社團廣告助手", icon: "megaphone" },
    ],
  },
  {
    title: "房產新聞",
    items: [
      // 每天早上自動抓進來的房產新聞（海線 → 中部 → 全台），他在這裡挑、按「拿去做」。抓取邏輯在 lib/news-fetch.ts。
      { href: "/admin/news", label: "房產新聞", icon: "news" },
      // 房產新聞按「拿去做」排進來的題（知識文章／短影音兩條線），他在這裡改寫、拍片；表 news_task。
      { href: "/admin/content", label: "待產文案", icon: "list" },
      // 改寫好的稿按「放到前台」就會出現在這裡，發佈後客戶在 /news 看得到；表 site_post。
      { href: "/admin/posts", label: "房產消息", icon: "file" },
    ],
  },
  {
    title: "開發物件",
    items: [
      // 談屋主專任委託的過程紀錄：地址／591／樂屋案件一筆，去談一次加一筆追蹤紀錄。表 dev_lead / dev_lead_contact。
      { href: "/admin/leads", label: "開發物件追蹤", icon: "target" },
    ],
  },
  {
    title: "LINE 機器人",
    items: [{ href: "/admin/line", label: "LINE 機器人", icon: "mobile" }],
  },
  {
    title: "留言收件匣",
    items: [{ href: "/admin/inbox", label: "留言收件匣", icon: "chat" }],
  },
  {
    title: "前台頁面",
    items: [
      { href: "/", label: "官網首頁", icon: "home", external: true },
      { href: "/card", label: "線上名片", icon: "card", external: true },
      { href: "/card/booking", label: "線上預約", icon: "edit", external: true },
      { href: "/listings", label: "精選好案", icon: "building", external: true },
      { href: "/match", label: "自動配對找房", icon: "handshake", external: true },
      { href: "/videos", label: "影音專區", icon: "video", external: true },
      { href: "/news", label: "房產消息", icon: "news", external: true },
    ],
  },
];

/** 目前這條路由算不算「選中」（子頁面也算，例如 /admin/inbox/youtube）。 */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

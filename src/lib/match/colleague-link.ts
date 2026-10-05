/**
 * 同事相關的純函式（不碰資料庫，scripts/check-match.mjs 測得到；資料庫那半在 colleagues.ts）。
 */
import { SITE_URL } from "@/config/owner";

/** 給客人看的那一面（配對頁、預約完成頁）：只有名字、電話、LINE 連結，金鑰絕對不能跟著出去 */
export type ColleagueContact = { name: string; phone: string; lineUrl: string };

/**
 * 同事填的 LINE：可以是 LINE ID（abc123、@abc123）或他從 LINE「加入好友 → 分享連結」複製來的網址，
 * 整理成客人點了就能開的網址。不像樣的一律回空字串（畫面就不畫那顆按鈕，不留死連結）。
 *
 * line.me/ti/p/~ID 是「用 ID 加好友」；同事的 LINE 若關了「允許利用 ID 加入好友」，客人點了會找不到人 ——
 * 那就請他改貼自己的加好友連結（LINE 裡「加入好友 → 邀請 → 分享連結」那一條）。
 */
export function lineUrlFromInput(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return /line\.me\//i.test(s) ? s.slice(0, 200) : "";
  const id = s.replace(/^@/, "").replace(/\s+/g, "");
  if (!/^[A-Za-z0-9._-]{1,40}$/.test(id)) return "";
  return `https://line.me/ti/p/~${id}`;
}

/** 同事的快速建檔連結（跟本人的同一個頁面，金鑰不同） */
export function colleagueIntakeUrl(key: string): string {
  return `${SITE_URL}/intake?key=${encodeURIComponent(key)}`;
}

/**
 * 👆 精選好案點擊統計的收件端
 *
 *   POST /api/listing-click   body: { slug, action }
 *
 * 前台是用 `navigator.sendBeacon` 打過來的（見 `ListingClickTracker.tsx`）——
 * 那個 API 不會等回應、也不看回傳值，所以這裡回什麼其實沒人在乎，
 * 重點是**絕對不能因為這支壞掉就影響到使用者點連結的行為**。
 *
 * ⚠️ 統計失敗一律回 204，不要回 5xx —— 這只是統計，不是功能。
 */

import { NextRequest, NextResponse } from "next/server";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { isClickAction, recordListingClick } from "@/lib/listing-clicks";

export const dynamic = "force-dynamic";

/** 跟 `/api/visits` 同一份名單：正常爬蟲不會跑 JS，這是第二道保險 */
const BOT_UA = /bot|crawler|spider|crawling|slurp|headless|lighthouse|preview|monitor|curl|wget|python-requests|axios|node-fetch/i;

const done = () => new NextResponse(null, { status: 204 });

export async function POST(req: NextRequest) {
  if (BOT_UA.test(req.headers.get("user-agent") || "")) return done();

  // 一個 IP 一分鐘 60 次。正常人瀏覽時點個幾張卡不會撞到，
  // 拿腳本刷某一筆物件的排名會。
  if (!rateLimit(`listing-click:${getClientIp(req)}`, 60, 60_000).allowed) return done();

  // sendBeacon 送出的是 Blob，Content-Type 可能不是 application/json，
  // 所以用 text() 自己 parse，不要用 req.json()（型別不合會直接丟例外）。
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(await req.text()) as Record<string, unknown>;
  } catch {
    return done();
  }

  const slug = String(body.slug ?? "").trim().slice(0, 120);
  const action = body.action;
  if (!slug || !isClickAction(action)) return done();

  try {
    await recordListingClick(slug, action);
  } catch (error) {
    // 記不起來就算了 —— 客戶那邊的連結照樣會開，這裡不該讓任何事情壞掉
    console.error("[listing-click] 記錄失敗:", error);
  }
  return done();
}

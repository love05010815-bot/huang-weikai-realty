/**
 * 👁 影片觀看次數的收件端
 *
 *   POST /api/videos/view   body: { id }
 *
 * 客戶**按下播放**的時候才打（不是看到縮圖就算），前台用 `sendBeacon` 送。
 *
 * ⚠️ 這支壞掉不可以影響播放 —— 統計只是統計，一律回 204，
 *    前端也不看回應。
 */

import { NextRequest, NextResponse } from "next/server";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { recordVideoView } from "@/lib/video-views";

export const dynamic = "force-dynamic";

/** 跟 /api/listing-click 同一份名單：爬蟲不跑 JS 走不到這裡，這是第二道保險 */
const BOT_UA = /bot|crawler|spider|crawling|slurp|headless|lighthouse|preview|monitor|curl|wget|python-requests|axios|node-fetch/i;

const done = () => new NextResponse(null, { status: 204 });

export async function POST(req: NextRequest) {
  if (BOT_UA.test(req.headers.get("user-agent") || "")) return done();

  // 一個 IP 一分鐘 30 次。正常看影片不會撞到，拿腳本刷排名的會。
  if (!rateLimit(`video-view:${getClientIp(req)}`, 30, 60_000).allowed) return done();

  // sendBeacon 送的是 Blob，Content-Type 不一定是 application/json，
  // 所以自己 parse，不要用 req.json()
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(await req.text()) as Record<string, unknown>;
  } catch {
    return done();
  }

  const id = String(body.id ?? "").trim().slice(0, 36);
  if (!id) return done();

  try {
    await recordVideoView(id);
  } catch (error) {
    console.error("[videos/view] 記錄失敗:", error);
  }
  return done();
}

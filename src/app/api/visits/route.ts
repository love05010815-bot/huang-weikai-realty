/**
 * 📊 人氣計數器 API
 *
 *   GET  /api/visits  → 只讀，回 { today, total }
 *   POST /api/visits  → 記一次，回更新後的 { today, total }
 *
 * 「同一個人今天只算一次」是**瀏覽器端**用 localStorage 判斷的（見
 * `VisitCounter.tsx`）—— 已經算過的人重新整理時打 GET，第一次來才打 POST。
 * 伺服器這邊不存任何識別碼，所以也無從判斷「這是不是同一個人」，
 * 只能靠底下的限速擋住明顯的灌水。
 *
 * ⚠️ 這支壞掉不可以影響任何頁面 —— 計數器只是裝飾，
 *    資料庫連不上就回 `available: false`，畫面自己不顯示，不要讓客戶看到錯誤。
 */

import { NextRequest, NextResponse } from "next/server";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { readVisitCounts, recordVisit } from "@/lib/site-visits";

export const dynamic = "force-dynamic";

/**
 * 爬蟲擋一道。
 *
 * 正常來說爬蟲根本走不到這裡（要跑 JS 才會發出請求），這是第二道保險。
 * 另外**保溫排程打的是 `/api/health` 不是頁面**，所以那個每 10 分鐘一次
 * 不會混進人氣數字裡。
 */
const BOT_UA = /bot|crawler|spider|crawling|slurp|headless|lighthouse|preview|monitor|curl|wget|python-requests|axios|node-fetch/i;

function isBot(req: NextRequest): boolean {
  return BOT_UA.test(req.headers.get("user-agent") || "");
}

function fail() {
  // 200 而不是 500 —— 前端拿到 available:false 就安靜地不顯示
  return NextResponse.json({ available: false }, { status: 200 });
}

export async function GET() {
  try {
    const counts = await readVisitCounts();
    return NextResponse.json({ available: true, ...counts });
  } catch (error) {
    console.error("[visits] 讀取失敗:", error);
    return fail();
  }
}

export async function POST(req: NextRequest) {
  if (isBot(req)) return GET();

  // 一個 IP 一分鐘最多 10 次。家庭／公司共用 IP 的正常訪客不會撞到，
  // 手動狂打 API 灌水的會。
  const ip = getClientIp(req);
  if (!rateLimit(`visits:${ip}`, 10, 60_000).allowed) {
    return GET();
  }

  try {
    const counts = await recordVisit();
    return NextResponse.json({ available: true, ...counts });
  } catch (error) {
    console.error("[visits] 記錄失敗:", error);
    return fail();
  }
}

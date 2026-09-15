/**
 * 每天抓一次房產新聞的觸發點。
 *
 * 這個端點是公開的，但它自己會判斷該不該跑（台北時間過了 09:00、今天還沒成功、
 * 沒有另一次在跑）—— 所以誰來打都一樣，一天最多成功一次，打再多次也只是一個 SELECT。
 * 觸發來源：`.github/workflows/keep-warm.yml` 每 10 分鐘來一次；第一次過 09:00 的那一下就會跑。
 *
 * 加 `?force=1` 而且已登入後台，才會不管幾點都跑一次（給你自己測試用）。
 *
 * 抓取本身最多 48 秒（`RUN_BUDGET_MS`），這裡把函式上限開到 60 秒留餘裕。
 */
import { NextRequest, NextResponse } from "next/server";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import { runDailyNewsFetch } from "@/lib/news";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const wantForce = req.nextUrl.searchParams.get("force") === "1";
  const force = wantForce && (await isCurrentUserAdmin());
  try {
    const r = await runDailyNewsFetch({ force, trigger: force ? "manual" : "auto" });
    // 公開端點不回傳完整過程 log（裡面有各來源的細節），只回摘要；log 在後台看。
    const { log, ...summary } = r;
    return NextResponse.json({ ...summary, logLines: log?.length ?? 0 });
  } catch (e) {
    // 保溫排程把這支當「可失敗」，這裡也永遠回 200，不要讓它的紀錄變紅。
    return NextResponse.json({ ran: false, ok: false, reason: e instanceof Error ? e.message : String(e) });
  }
}

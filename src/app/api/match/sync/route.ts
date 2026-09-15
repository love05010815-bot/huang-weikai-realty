/**
 * 愛屋店網 → 物件庫 的同步觸發點。
 *
 * 公開端點，但它自己會判斷該不該跑（距上次成功不到 30 分鐘、或另一次在跑，就直接回來）——
 * 所以誰來打都一樣。觸發來源：.github/workflows/keep-warm.yml 每 10 分鐘來一次。
 *
 * 加 `?force=1` 而且已登入後台，才會不管間隔立刻跑一次（後台「立即同步」按鈕用這個）。
 *
 * 抓店網本身最多 36 秒（lib/match/sync.ts 的 FETCH_BUDGET_MS），這裡把函式上限開到 60 秒留餘裕。
 */
import { NextRequest, NextResponse } from "next/server";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import { runHouseolSync } from "@/lib/match/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const wantForce = req.nextUrl.searchParams.get("force") === "1";
  const force = wantForce && (await isCurrentUserAdmin());
  try {
    const result = await runHouseolSync({ force, trigger: force ? "manual" : "auto" });
    return NextResponse.json(result);
  } catch (e) {
    // 保溫排程把這支當「可失敗」，這裡也永遠回 200，不要讓它的紀錄變紅。
    return NextResponse.json({ ran: false, ok: false, reason: e instanceof Error ? e.message : String(e) });
  }
}

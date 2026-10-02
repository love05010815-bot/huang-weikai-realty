/**
 * 物件同步的觸發點（太平洋官網 ＋ 愛屋店網 → 物件庫，規則見 lib/match/sync.ts）。
 *
 * 公開端點，但它自己會判斷該不該跑：兩個來源各自「距上次成功不到 30 分鐘」就不跑來源、一次只跑一個，
 * 都不用跑的那一次改去補土地的類別（愛屋物件頁，lib/match/land-enrich.ts），另一次在跑也直接回來 ——
 * 所以誰來打都一樣。觸發來源：.github/workflows/keep-warm.yml 每 10 分鐘來一次。
 *
 * 已登入後台才認的參數（後台「立即同步」按鈕用）：
 *   `?force=1&source=pacific|houseol`  不管間隔立刻跑指定的來源
 *   `?force=1&job=land`                補土地類別，一次最多 60 筆
 *
 * 抓資料本身最多 38 秒（lib/match/sync.ts 的 FETCH_BUDGET_MS），這裡把函式上限開到 60 秒留餘裕。
 */
import { NextRequest, NextResponse } from "next/server";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import { isSource, runListingSync } from "@/lib/match/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const wantForce = req.nextUrl.searchParams.get("force") === "1";
  const force = wantForce && (await isCurrentUserAdmin());
  const rawSource = req.nextUrl.searchParams.get("source");
  const source = isSource(rawSource) ? rawSource : undefined;
  const job = req.nextUrl.searchParams.get("job") === "land" ? ("land" as const) : undefined;
  try {
    const result = await runListingSync({ force, trigger: force ? "manual" : "auto", source, job });
    return NextResponse.json(result);
  } catch (e) {
    // 保溫排程把這支當「可失敗」，這裡也永遠回 200，不要讓它的紀錄變紅。
    return NextResponse.json({ ran: false, ok: false, reason: e instanceof Error ? e.message : String(e) });
  }
}

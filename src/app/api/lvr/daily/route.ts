/**
 * 每天同步一次實價登錄（前台 /lvr）的觸發點。
 *
 * 跟 /api/news/daily 同一套：端點公開，但自己判斷該不該跑（台北時間過 10:00、今天還沒成功、
 * 沒有另一次在跑），誰來打都一樣，一天最多真的抓一次；其餘時候只是一個 SELECT。
 * 觸發來源：`vercel.json` 的 cron（02:00 UTC ＝ 台北 10:00）＋ `.github/workflows/keep-warm.yml` 備援。
 *
 * 已登入後台才有的兩個參數：
 *   `?force=1`        不管幾點都抓一次本期（測試用）
 *   `?season=115S2`   回填整季（14MB，約 20–40 秒；正式回填建議用 `npm run backfill:lvr` 在本機跑）
 *
 * 內政部資料每月 1、11、21 日發布新一期，所以大部分日子跑完是「更新 N、新增 0」，那是正常的。
 * 本期同步之前會先看「前期下載」清單，哪一旬沒進庫就補（一次最多兩旬），所以偶爾漏跑一天也會自己補回來。
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import { syncLvr } from "@/lib/lvr";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const wantForce = sp.get("force") === "1";
  const season = (sp.get("season") || "").trim();
  const admin = wantForce || season ? await isCurrentUserAdmin() : false;
  if (season && !admin) {
    return NextResponse.json({ ran: false, ok: false, reason: "forbidden" }, { status: 403 });
  }
  if (season && !/^\d{3}S[1-4]$/.test(season)) {
    return NextResponse.json({ ran: false, ok: false, reason: "季別格式應為 115S2" }, { status: 400 });
  }

  try {
    const r = await syncLvr({
      source: season ? season : "current",
      force: admin && wantForce,
      trigger: admin ? "manual" : "auto",
    });
    if (r.ran && r.ok) {
      // 摘要有 1 小時快取（tag "lvr"），同步成功就立刻讓前台拿到新資料
      try {
        revalidateTag("lvr", "max");
        revalidatePath("/lvr");
      } catch (e) {
        console.error("[lvr] revalidate 失敗:", e);
      }
    }
    const { log, ...summary } = r;
    // 公開端點只回摘要；完整過程 log 給登入的人看
    return NextResponse.json({ ...summary, logLines: log?.length ?? 0, ...(admin ? { log } : {}) });
  } catch (e) {
    // 保溫排程把這支當「可失敗」，永遠回 200，不要讓它的紀錄變紅
    return NextResponse.json({ ran: false, ok: false, reason: e instanceof Error ? e.message : String(e) });
  }
}

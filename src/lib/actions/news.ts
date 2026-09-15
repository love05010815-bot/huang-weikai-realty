"use server";
/**
 * 房產新聞後台的兩個動作：立即抓取、改處理狀態。
 *
 * 每一個都先擋權限再做事 —— server action 是可以被直接 POST 的，
 * 「畫面上沒有按鈕」不等於「外面的人叫不到」。
 */
import { revalidatePath } from "next/cache";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import { isNewsStatus, runDailyNewsFetch, setNewsStatus, type NewsStatus } from "@/lib/news";

type Result = { ok: boolean; error?: string };

/** 手動抓一次。不管幾點、今天跑過沒都跑，只擋「另一次正在跑」。 */
export async function runNewsFetchAction(): Promise<Result & { summary?: string }> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };

  const r = await runDailyNewsFetch({ force: true, trigger: "manual" });
  revalidatePath("/admin/news");

  if (!r.ran) {
    return {
      ok: false,
      error: r.reason === "running" ? "已經有一次抓取正在跑，等它跑完（最多一分鐘）再按。" : `這次沒有執行（${r.reason}）`,
    };
  }
  if (!r.ok) return { ok: false, error: r.reason || "抓取失敗" };

  const c = r.counts ?? { coast: 0, central: 0, national: 0 };
  return {
    ok: true,
    summary:
      `抓到 ${r.found} 則、新增 ${r.inserted} 則` +
      `（海線 ${c.coast}、中部 ${c.central}、全台 ${c.national}），花了 ${Math.round((r.ms || 0) / 1000)} 秒`,
  };
}

export async function setNewsStatusAction(id: string, status: NewsStatus): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  if (typeof id !== "string" || !id || !isNewsStatus(status)) return { ok: false, error: "參數不對" };
  try {
    await setNewsStatus(id, status);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/admin/news");
  return { ok: true };
}

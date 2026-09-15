"use server";
/**
 * 房產新聞後台的動作：立即抓取、「拿去做」（排進待產文案）、待產文案的完成／復原／退回。
 *
 * 每一個都先擋權限再做事 —— server action 是可以被直接 POST 的，
 * 「畫面上沒有按鈕」不等於「外面的人叫不到」。
 */
import { revalidatePath } from "next/cache";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import { COPYWRITER } from "@/config/copywriter";
import { generateCopy, isCopywriterConfigured } from "@/lib/copywriter";
import {
  addNewsTask,
  getNewsTask,
  insertNewsDraft,
  isNewsLine,
  isNewsTaskStatus,
  removeNewsTask,
  runDailyNewsFetch,
  setNewsTaskStatus,
  type NewsDraftRecord,
  type NewsLine,
  type NewsTaskStatus,
} from "@/lib/news";

type Result = { ok: boolean; error?: string };

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** 兩頁都會顯示同一批資料，動到 news_task 兩頁一起重新讀。 */
function revalidateNewsPages(): void {
  revalidatePath("/admin/news");
  revalidatePath("/admin/content");
}

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

/** 「拿去做」：把一則新聞排進知識文章或短影音那條線，回傳那一題的 id 好讓畫面跳過去。 */
export async function addNewsTaskAction(newsId: string, line: NewsLine): Promise<Result & { taskId?: string }> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  if (typeof newsId !== "string" || !newsId || !isNewsLine(line)) return { ok: false, error: "參數不對" };
  try {
    const { taskId } = await addNewsTask(newsId, line);
    revalidateNewsPages();
    return { ok: true, taskId };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** 待產文案：完成（todo → done）或復原（done → todo）。 */
export async function setNewsTaskStatusAction(taskId: string, status: NewsTaskStatus): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  if (typeof taskId !== "string" || !taskId || !isNewsTaskStatus(status)) return { ok: false, error: "參數不對" };
  try {
    await setNewsTaskStatus(taskId, status);
  } catch (e) {
    return { ok: false, error: message(e) };
  }
  revalidateNewsPages();
  return { ok: true };
}

/**
 * 待產文案：「派工寫稿」。把這一題的原文交給 ChatGPT，照 src/config/copywriter.ts 的規則寫，
 * 寫好存成一版 news_draft 回給畫面。每按一次多一版，舊的留著可以比。
 */
export async function generateDraftAction(taskId: string): Promise<Result & { draft?: NewsDraftRecord }> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  if (typeof taskId !== "string" || !taskId) return { ok: false, error: "參數不對" };
  if (!isCopywriterConfigured()) {
    return { ok: false, error: "還沒接上 ChatGPT：到 Vercel 的環境變數加 OPENAI_API_KEY（platform.openai.com 的 API 金鑰），重新部署後再按。" };
  }
  try {
    const task = await getNewsTask(taskId);
    if (!task) return { ok: false, error: "找不到這一題，可能已經被退回了。" };
    const text = (task.news.content || task.news.summary || "").trim();
    if (!text) return { ok: false, error: "這則只有標題、沒抓到內文，寫不出東西。請開原文自己看。" };

    const r = await generateCopy(task.line, {
      title: task.news.title,
      source: task.news.source,
      publishedAt: task.news.publishedAt,
      url: task.news.url,
      text: text.slice(0, COPYWRITER.MAX_SOURCE_CHARS),
    });
    const draft = await insertNewsDraft({
      taskId,
      line: task.line,
      model: r.model,
      content: r.text,
      ms: r.ms,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      truncated: r.truncated,
    });
    revalidatePath("/admin/content");
    return { ok: true, draft };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** 待產文案：退回。這條線刪掉，新聞沒有別條線就回到「房產新聞」的還沒排。 */
export async function removeNewsTaskAction(taskId: string): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  if (typeof taskId !== "string" || !taskId) return { ok: false, error: "參數不對" };
  try {
    await removeNewsTask(taskId);
  } catch (e) {
    return { ok: false, error: message(e) };
  }
  revalidateNewsPages();
  return { ok: true };
}

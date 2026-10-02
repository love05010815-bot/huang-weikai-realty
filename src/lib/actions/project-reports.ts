"use server";
/**
 * 社區銷售報告書後台的四個動作：拿指令、存檔（草稿／發佈）、改狀態、刪除。
 *
 * 每一個都先擋權限再做事 —— server action 可以被直接 POST，「畫面上沒有按鈕」不等於「外面的人叫不到」。
 * 存檔前在伺服器端**重新解析一次**貼回來的文字，不信任瀏覽器送來的預覽結果。
 *
 * 改完 revalidate：/map（入口要出現／消失）、那一頁報告書、sitemap、後台自己。
 *
 * ⚠️ 這個檔是 "use server"，**不能 export type** —— Next 會把每個 export 當成 action 登記，
 *    執行期 ReferenceError 整頁 500、tsc 與 build 都不會抓（learning_use_server_type_reexport）。
 *    回傳型別在這裡用 inline 寫法，畫面那邊要型別自己從 lib import。
 */
import { revalidatePath } from "next/cache";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import { PROJECTS } from "@/data/port-projects";
import { buildReportPrompt } from "@/config/report-prompt";
import { parseReportPaste, reportHref } from "@/lib/project-report";
import { getMapListingsByProject } from "@/lib/map-listings";
import { deleteReport, REPORT_MODEL_MANUAL, saveReport, setReportStatus, type ReportStatus } from "@/lib/project-reports";

function revalidateAll(projectId: string): void {
  revalidatePath("/map");
  revalidatePath(reportHref(projectId));
  revalidatePath("/sitemap.xml");
  revalidatePath("/admin/reports");
}

function describeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function findProject(projectId: string) {
  const id = (projectId ?? "").trim();
  return /^[a-z0-9-]{1,64}$/i.test(id) ? (PROJECTS.find((p) => p.id === id) ?? null) : null;
}

/** 選好建案後拿那段要貼進 ChatGPT 的指令。在伺服器組是為了不用把 786 案的完整資料送進瀏覽器。 */
export async function getReportPromptAction(projectId: string): Promise<{ ok: true; prompt: string } | { ok: false; error: string }> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  const project = findProject(projectId);
  if (!project) return { ok: false, error: "找不到這個建案，重新挑一個" };

  // 在售幾件只是寫進指令讓 ChatGPT 知道脈絡；讀不到就當 0，不要因此拿不到指令
  let mineCount = 0;
  try {
    mineCount = (await getMapListingsByProject()).get(project.id)?.length ?? 0;
  } catch {
    mineCount = 0;
  }
  return { ok: true, prompt: buildReportPrompt(project, { mineCount }) };
}

/**
 * 把貼回來的 ChatGPT 回覆存成報告書。`publish` true 直接發佈，false 存草稿。
 * 回傳的 warnings／risks 是給人看的提醒，有警告也會存（決定權在他，不在程式）。
 */
export async function saveReportAction(
  projectId: string,
  pasteText: string,
  publish: boolean,
): Promise<{ ok: boolean; error?: string; warnings?: string[]; risks?: Array<{ word: string; why: string }>; href?: string }> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  const project = findProject(projectId);
  if (!project) return { ok: false, error: "找不到這個建案，重新挑一個" };

  const parsed = parseReportPaste(pasteText ?? "");
  if (!parsed.ok) return { ok: false, error: parsed.error };

  try {
    await saveReport(project.id, parsed.data, publish ? "published" : "draft", REPORT_MODEL_MANUAL);
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
  revalidateAll(project.id);
  return { ok: true, warnings: parsed.warnings, risks: parsed.risks, href: reportHref(project.id) };
}

export async function setReportStatusAction(projectId: string, status: ReportStatus): Promise<{ ok: boolean; error?: string }> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  const project = findProject(projectId);
  if (!project) return { ok: false, error: "找不到這個建案" };
  try {
    await setReportStatus(project.id, status === "published" ? "published" : "draft");
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
  revalidateAll(project.id);
  return { ok: true };
}

export async function deleteReportAction(projectId: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  const id = (projectId ?? "").trim();
  if (!/^[a-z0-9-]{1,64}$/i.test(id)) return { ok: false, error: "建案代號不合法" };
  try {
    await deleteReport(id);
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
  revalidateAll(id);
  return { ok: true };
}

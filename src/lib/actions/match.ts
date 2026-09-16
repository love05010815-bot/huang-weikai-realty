"use server";
/**
 * 買方配對後台的動作：改預約狀態。
 *
 * 先擋權限再做事 —— server action 是可以被直接 POST 的。
 * 「立即同步」不在這裡：它要跑到 40 秒，走 /api/match/sync?force=1（那支的函式上限開到 60 秒）。
 *
 * 狀態改成「已確認」「已取消」時，買方有綁 LINE 就推播通知他（計費，一則）。
 */
import { revalidatePath } from "next/cache";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import { updateViewing } from "@/lib/match/store";
import { applyViewingStatus } from "@/lib/match/viewing-status";

type Result = { ok: boolean; error?: string; notified?: boolean };

export async function setViewingStatusAction(id: string, status: string): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };

  // 真正的動作在 lib/match/viewing-status.ts —— 官方帳號的「確認 BK-XXXXXX」走的是同一段，
  // 兩條路的結果必須一模一樣。
  const res = await applyViewingStatus(id, status);
  if (!res.ok) return { ok: false, error: res.error };

  revalidatePath("/admin/match");
  return { ok: true, notified: res.notified };
}


export async function setViewingAgentNoteAction(id: string, agentNote: string): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  try {
    const viewing = await updateViewing(id, { agentNote: agentNote.trim().slice(0, 1000) || null });
    if (!viewing) return { ok: false, error: "找不到預約" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/admin/match");
  return { ok: true };
}

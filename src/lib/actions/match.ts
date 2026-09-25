"use server";
/**
 * 買方配對後台的動作：改預約狀態、代客建檔（買方存／刪／推播物件卡）、快速建檔連結。
 *
 * 先擋權限再做事 —— server action 是可以被直接 POST 的。
 * 「立即同步」不在這裡：它要跑到 40 秒，走 /api/match/sync?force=1（那支的函式上限開到 60 秒）。
 *
 * 狀態改成「已確認」「已取消」時，買方有綁 LINE 就推播通知他（計費，一則）。
 * 代客建檔的本體在 lib/match/intake.ts —— 手機快速連結（lib/actions/intake.ts）走的是同一段，
 * 只是把關的方式不同（這裡看登入，那邊看金鑰）。
 */
import { revalidatePath } from "next/cache";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import { rotateIntakeKey } from "@/lib/match/intake-key";
import { pushBriefToBuyer, saveBuyerFromForm, type BuyerFormInput } from "@/lib/match/intake";
import { deleteBuyer, updateViewing } from "@/lib/match/store";
import { applyViewingStatus } from "@/lib/match/viewing-status";

type Result = { ok: boolean; error?: string; notified?: boolean };

const describeError = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export async function setViewingStatusAction(id: string, status: string): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };

  // 真正的動作在 lib/match/viewing-status.ts —— 官方帳號的「確認 BK-XXXXXX」走的是同一段，
  // 兩條路的結果必須一模一樣。
  const res = await applyViewingStatus(id, status);
  if (!res.ok) return { ok: false, error: res.error };

  revalidatePath("/admin/match");
  return { ok: true, notified: res.notified };
}

// ---------------------------------------------------------------- 代客建檔（2026-09-26）

/** 存買方。id 為 null = 新建；電話撞到既有資料會合併，回 merged = true */
export async function saveBuyerAction(id: string | null, input: BuyerFormInput): Promise<Result & { id?: string; merged?: boolean }> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  try {
    const r = await saveBuyerFromForm(id, input);
    if (!r.ok) return { ok: false, error: r.error };
    revalidatePath("/admin/match");
    revalidatePath(`/admin/match/buyers/${r.buyer.id}`);
    return { ok: true, id: r.buyer.id, merged: r.merged };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

/** 刪買方（打錯了用）。名下有預約的刪不掉，理由在 store.deleteBuyer。 */
export async function deleteBuyerAction(id: string): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  try {
    const r = await deleteBuyer(id);
    if (!r.ok) return { ok: false, error: r.reason };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
  revalidatePath("/admin/match");
  return { ok: true };
}

/** 從官方帳號推物件卡給這位買方（計費一則；只有綁了 LINE 的推得到） */
export async function pushMatchesToBuyerAction(id: string): Promise<Result & { count?: number }> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  try {
    return await pushBriefToBuyer(id);
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

/** 重新產生手機快速建檔連結的金鑰 —— 舊連結立刻失效 */
export async function rotateIntakeKeyAction(): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  try {
    await rotateIntakeKey();
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
  revalidatePath("/admin/match");
  return { ok: true };
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

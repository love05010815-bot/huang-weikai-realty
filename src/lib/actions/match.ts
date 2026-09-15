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
import { VIEWING_STATUS } from "@/config/match";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import { pushMessages, text, viewingConfirmFlex } from "@/lib/match/line";
import { getListing, updateViewing } from "@/lib/match/store";

type Result = { ok: boolean; error?: string; notified?: boolean };

export async function setViewingStatusAction(id: string, status: string): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  if (!VIEWING_STATUS[status]) return { ok: false, error: "無效的狀態" };

  let notified = false;
  try {
    const viewing = await updateViewing(id, { status });
    if (!viewing) return { ok: false, error: "找不到預約" };

    if (viewing.lineUserId && (status === "confirmed" || status === "cancelled")) {
      const listing = await getListing(viewing.listingId);
      const message =
        status === "confirmed"
          ? viewingConfirmFlex(viewing, listing, { title: "📅 看屋時間已確認", note: "當天請準時抵達；如需更改時間請在此留言。" })
          : text(`您的預約 ${viewing.code} 已取消。若要重新安排，隨時在此留言或輸入「找房」。`);
      notified = await pushMessages(viewing.lineUserId, [message]);
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath("/admin/match");
  return { ok: true, notified };
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

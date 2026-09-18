/**
 * 改預約狀態＋通知買方 —— 後台按鈕與 LINE 指令共用同一段
 *
 * 2026-09-16 抽出來：他要能「直接在官方帳號回一句『確認 BK-XXXXXX』就好，不用再開後台」。
 * 兩條路（/admin/match 的下拉、LINE 的指令）必須做完全一樣的事，
 * 不然同一筆預約會因為你從哪裡改而得到不同結果 —— 所以只留這一份實作。
 *
 * 權限檢查不在這裡：後台那條走 isCurrentUserAdmin()，LINE 那條走「是不是專員的 userId」。
 */
import { VIEWING_STATUS } from "@/config/match";
import { pushMessages, text, viewingConfirmFlex } from "./line";
import { getListings, updateViewing, type Viewing } from "./store";

export type ApplyResult = { ok: boolean; error?: string; viewing?: Viewing; notified?: boolean };

export async function applyViewingStatus(id: string, status: string): Promise<ApplyResult> {
  if (!VIEWING_STATUS[status]) return { ok: false, error: "無效的狀態" };

  let notified = false;
  let viewing: Viewing | null = null;
  try {
    viewing = await updateViewing(id, { status });
    if (!viewing) return { ok: false, error: "找不到預約" };

    // 只有「已確認」「已取消」值得花一則推播；已完成看屋他人就在現場，不用再通知。
    if (viewing.lineUserId && (status === "confirmed" || status === "cancelled")) {
      const listings = await getListings(viewing.listingIds);
      const message =
        status === "confirmed"
          ? viewingConfirmFlex(viewing, listings, { title: "📅 看屋時間已確認", note: "當天請準時抵達；如需更改時間請在此留言。" })
          : text(`您的預約 ${viewing.code} 已取消。若要重新安排，隨時在此留言或輸入「找房」。`);
      notified = await pushMessages(viewing.lineUserId, [message]);
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  return { ok: true, viewing, notified };
}

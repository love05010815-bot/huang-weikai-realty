"use server";
/**
 * 買方配對後台的動作：改預約狀態、代客建檔（買方存／刪／推播物件卡）。
 *
 * 先擋權限再做事 —— server action 是可以被直接 POST 的。
 * 「立即同步」不在這裡：它要跑到 40 秒，走 /api/match/sync?force=1（那支的函式上限開到 60 秒）。
 *
 * 狀態改成「已確認」「已取消」時，買方有綁 LINE 就推播通知他（計費，一則）。
 */
import { revalidatePath } from "next/cache";
import { MATCH } from "@/config/match";
import { OWNER } from "@/config/owner";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import { listingCarousel, pushMessages, text } from "@/lib/match/line";
import { describePreference, normalizePreference, rankListings } from "@/lib/match/matcher";
import {
  deleteBuyer,
  getBuyer,
  getBuyerByPhone,
  listAvailableListings,
  normalizePhone,
  updateViewing,
  upsertBuyer,
} from "@/lib/match/store";
import { createBuyerToken } from "@/lib/match/token";
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
//
// 他在外面接到買方來電，用手機把姓名、電話、需求記下來；存好就能把配對結果傳給客戶。
// 資料就是 match_buyer 那一筆 —— 跟買方自己在 /match 填的是同一張表、同一種條件，
// 所以之後新物件推播、預約看屋、改條件全部都接得上。

export type BuyerInput = {
  name: string;
  phone: string;
  note: string;
  /** 表單送來的條件（toApiPreference 的結果）；這裡再 normalize 一次，不信任前端 */
  preference: unknown;
};

/**
 * 存買方。id 為 null = 新建。
 * 新建時用電話查重 —— 同一個人打第二次電話、或他之前自己在 /match 留過條件，
 * 都不該變成兩筆；找到就更新那一筆，回 merged = true 讓畫面提醒一聲。
 */
export async function saveBuyerAction(id: string | null, input: BuyerInput): Promise<Result & { id?: string; merged?: boolean }> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };

  const name = String(input.name ?? "").trim().slice(0, 40);
  const phone = normalizePhone(String(input.phone ?? "")).slice(0, 40);
  const note = String(input.note ?? "").trim().slice(0, 1000);
  if (!name) return { ok: false, error: "請填怎麼稱呼（例如「王先生」）" };
  if (phone.length < 8) return { ok: false, error: "電話至少 8 碼" };
  const preference = normalizePreference(input.preference);

  try {
    let targetId = id;
    let merged = false;
    if (!targetId) {
      const existing = await getBuyerByPhone(phone);
      if (existing) {
        targetId = existing.id;
        merged = true;
      }
    }
    const buyer = await upsertBuyer({ id: targetId, name, phone, note, preference });
    revalidatePath("/admin/match");
    revalidatePath(`/admin/match/buyers/${buyer.id}`);
    return { ok: true, id: buyer.id, merged };
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

/**
 * 從官方帳號把配對到的物件卡推給這位買方 —— **計費，一則**。
 * 只有綁了 LINE、而且還是好友的才推得到；沒綁的走「複製連結」那條路（免費）。
 * 卡片帶這位買方自己的識別碼：他是收件人不是轉傳者，按「預約看屋」就該認得是他。
 */
export async function pushMatchesToBuyerAction(id: string): Promise<Result & { count?: number }> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  try {
    const buyer = await getBuyer(id);
    if (!buyer) return { ok: false, error: "找不到這位買方" };
    if (!buyer.lineUserId) return { ok: false, error: "這位買方還沒綁定官方 LINE，請用「複製訊息」傳給他" };
    if (!buyer.followed) return { ok: false, error: "這位買方已封鎖官方帳號，推播送不到" };
    if (!buyer.preference) return { ok: false, error: "還沒有條件，先按「編輯」填條件" };

    const matches = rankListings(buyer.preference, await listAvailableListings(), { threshold: MATCH.threshold, limit: 10 });
    if (!matches.length) return { ok: false, error: "目前沒有符合條件的物件，沒有東西可以推" };

    const token = createBuyerToken(buyer.id);
    const ok = await pushMessages(buyer.lineUserId, [
      text(`🏠 ${OWNER.alias}幫您挑了 ${matches.length} 間符合條件的物件（${describePreference(buyer.preference)}）`),
      listingCarousel(matches, token),
    ]);
    if (!ok) return { ok: false, error: "推播失敗：LINE 沒收（可能是額度用完或 token 沒設）" };
    return { ok: true, count: matches.length };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
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

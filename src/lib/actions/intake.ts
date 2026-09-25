"use server";
/**
 * 手機快速建檔（/intake?key=…）的動作 —— 用金鑰把關，不用登入。
 *
 * 每一個都先驗金鑰再做事：server action 可以被直接 POST，畫面上有沒有那個按鈕不算數。
 * 本體在 lib/match/intake.ts，跟後台代客建檔是同一段程式。
 *
 * ⚠️ 2026-09-26 起這條路也回得到**整份名單**（他要在 /intake 看已建立的客戶）——
 *    也就是說拿到連結的人看得到客戶姓名、電話、需求。連結外流就到後台「重新產生」。
 */
import { revalidatePath } from "next/cache";
import { verifyIntakeKey } from "@/lib/match/intake-key";
import {
  buildBuyerBrief,
  listIntakeRows,
  pushBriefToBuyer,
  saveBuyerFromForm,
  toIntakeBuyer,
  type BuyerBrief,
  type BuyerFormInput,
  type IntakeBuyer,
  type IntakeRow,
} from "@/lib/match/intake";
import { getBuyer } from "@/lib/match/store";

// ⚠️ 這裡不能寫 `export type { IntakeBuyer, IntakeRow }` 轉出去：
//    "use server" 的檔案會被當成「每個 export 都是 action」處理，那一行在執行期會變成
//    ReferenceError: IntakeBuyer is not defined（2026-09-26 踩過）。畫面要型別直接從 lib/match/intake 拿。

/** 存完／點開一位買方之後畫面要的東西：他的資料＋簡報（符合幾間、連結、訊息） */
export type IntakeSaveResult =
  | { ok: false; error: string }
  | { ok: true; buyer: IntakeBuyer; merged: boolean; brief: BuyerBrief };

const INVALID = "連結已失效，請到後台「買方配對 → 買方」重新拿一次快速建檔連結";
const describeError = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export async function intakeSaveAction(key: string, id: string | null, input: BuyerFormInput): Promise<IntakeSaveResult> {
  if (!(await verifyIntakeKey(key))) return { ok: false, error: INVALID };
  try {
    const r = await saveBuyerFromForm(id, input);
    if (!r.ok) return { ok: false, error: r.error };
    const brief = await buildBuyerBrief(r.buyer);
    revalidatePath("/admin/match");
    return { ok: true, merged: r.merged, buyer: toIntakeBuyer(r.buyer), brief };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

/** 名單（最近更新的在前）。跟後台「買方」分頁同一份。 */
export async function intakeListAction(key: string): Promise<{ ok: false; error: string } | { ok: true; rows: IntakeRow[] }> {
  if (!(await verifyIntakeKey(key))) return { ok: false, error: INVALID };
  try {
    return { ok: true, rows: await listIntakeRows(300) };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

/** 點開名單上的一位：資料＋目前的配對結果（跟剛存完看到的是同一個畫面） */
export async function intakeOpenAction(key: string, id: string): Promise<IntakeSaveResult> {
  if (!(await verifyIntakeKey(key))) return { ok: false, error: INVALID };
  try {
    const buyer = await getBuyer(id);
    if (!buyer) return { ok: false, error: "找不到這位買方，可能已經被刪掉了" };
    const brief = await buildBuyerBrief(buyer);
    return { ok: true, merged: false, buyer: toIntakeBuyer(buyer), brief };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

export async function intakePushAction(key: string, buyerId: string): Promise<{ ok: boolean; error?: string; count?: number }> {
  if (!(await verifyIntakeKey(key))) return { ok: false, error: INVALID };
  try {
    return await pushBriefToBuyer(buyerId);
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

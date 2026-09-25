"use server";
/**
 * 手機快速建檔（/intake?key=…）的動作 —— 用金鑰把關，不用登入。
 *
 * 每一個都先驗金鑰再做事：server action 可以被直接 POST，畫面上有沒有那個按鈕不算數。
 * 本體在 lib/match/intake.ts，跟後台代客建檔是同一段程式。
 *
 * 回給畫面的買方資料只有「他剛剛自己填的那一筆」——這條路拿不到別的買方。
 */
import { revalidatePath } from "next/cache";
import { verifyIntakeKey } from "@/lib/match/intake-key";
import { buildBuyerBrief, pushBriefToBuyer, saveBuyerFromForm, type BuyerBrief, type BuyerFormInput } from "@/lib/match/intake";
import type { Preference } from "@/lib/match/matcher";

export type IntakeBuyer = {
  id: string;
  name: string;
  phone: string;
  note: string;
  linked: boolean;
  followed: boolean;
  preference: Preference | null;
};

export type IntakeSaveResult =
  | { ok: false; error: string }
  | { ok: true; buyer: IntakeBuyer; merged: boolean; brief: BuyerBrief };

const describeError = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export async function intakeSaveAction(key: string, id: string | null, input: BuyerFormInput): Promise<IntakeSaveResult> {
  if (!(await verifyIntakeKey(key))) return { ok: false, error: "連結已失效，請到後台重新拿一次快速建檔連結" };
  try {
    const r = await saveBuyerFromForm(id, input);
    if (!r.ok) return { ok: false, error: r.error };
    const b = r.buyer;
    const brief = await buildBuyerBrief(b);
    revalidatePath("/admin/match");
    return {
      ok: true,
      merged: r.merged,
      buyer: { id: b.id, name: b.name ?? "", phone: b.phone ?? "", note: b.note, linked: Boolean(b.lineUserId), followed: b.followed, preference: b.preference },
      brief,
    };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

export async function intakePushAction(key: string, buyerId: string): Promise<{ ok: boolean; error?: string; count?: number }> {
  if (!(await verifyIntakeKey(key))) return { ok: false, error: "連結已失效" };
  try {
    return await pushBriefToBuyer(buyerId);
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

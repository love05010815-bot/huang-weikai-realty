"use server";
/**
 * 成交紀錄後台的動作：存（新增／修改）、刪。
 *
 * 每一個都先擋權限再做事 —— server action 可以被直接 POST，
 * 「畫面上沒有按鈕」不等於「外面的人叫不到」。這裡裝的是買賣雙方的個資與他的業績。
 *
 * 純內部工具，沒有對外頁面吃這份資料，所以只 revalidate 後台自己這頁。
 * ⚠️ 這個檔只能 export async function（"use server" 檔的每個 export 都會被登記成 action）。
 */
import { revalidatePath } from "next/cache";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import { createDeal, deleteDeal, updateDeal, validateDealInput, type DealInput } from "@/lib/deals";

type Result = { ok: boolean; error?: string; id?: string };

function describeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function saveDealAction(id: string | null, input: DealInput): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  const checked = validateDealInput(input);
  if (!checked.ok) return { ok: false, error: checked.error };
  try {
    if (id) {
      const found = await updateDeal(id, checked.value);
      if (!found) return { ok: false, error: "找不到這筆成交，可能已被刪除，請重新整理" };
      revalidatePath("/admin/deals");
      return { ok: true, id };
    }
    const newId = await createDeal(checked.value);
    revalidatePath("/admin/deals");
    return { ok: true, id: newId };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

export async function deleteDealAction(id: string): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  try {
    await deleteDeal(id);
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
  revalidatePath("/admin/deals");
  return { ok: true };
}

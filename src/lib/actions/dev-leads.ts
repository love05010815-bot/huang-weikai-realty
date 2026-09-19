"use server";
/**
 * 開發物件追蹤後台的動作：物件存／刪、追蹤紀錄加／刪。
 *
 * 每一個都先擋權限再做事 —— server action 可以被直接 POST，
 * 「畫面上沒有按鈕」不等於「外面的人叫不到」。
 *
 * 這是純內部工具，沒有對外頁面吃這份資料，所以只 revalidate 後台自己這頁。
 */
import { revalidatePath } from "next/cache";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import {
  addContact,
  createLead,
  deleteContact,
  deleteLead,
  updateLead,
  validateContactInput,
  validateLeadInput,
  type ContactInput,
  type LeadInput,
} from "@/lib/dev-leads";

type Result = { ok: boolean; error?: string };

function revalidateAll(): void {
  revalidatePath("/admin/leads");
}

function describeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function saveLeadAction(id: string | null, input: LeadInput): Promise<Result & { id?: string }> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };

  const checked = validateLeadInput(input);
  if (!checked.ok) return { ok: false, error: checked.error };

  try {
    if (id) {
      await updateLead(id, checked.value);
    } else {
      const newId = await createLead(checked.value);
      revalidateAll();
      return { ok: true, id: newId };
    }
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }

  revalidateAll();
  return { ok: true, id };
}

export async function deleteLeadAction(id: string): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  try {
    await deleteLead(id);
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
  revalidateAll();
  return { ok: true };
}

export async function addContactAction(input: ContactInput): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };

  const checked = validateContactInput(input);
  if (!checked.ok) return { ok: false, error: checked.error };

  try {
    await addContact(checked.value);
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
  revalidateAll();
  return { ok: true };
}

export async function deleteContactAction(id: string): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  try {
    await deleteContact(id);
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
  revalidateAll();
  return { ok: true };
}

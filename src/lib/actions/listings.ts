"use server";
/**
 * 精選好案後台的四個動作：存、上下架、換順序、刪除。
 *
 * 每一個都先擋權限再做事 —— server action 是可以被直接 POST 的，
 * 「畫面上沒有按鈕」不等於「外面的人叫不到」。
 *
 * 改完一律 revalidate 首頁與 /listings，所以後台按下去、對外的頁面立刻就變。
 */
import { revalidatePath } from "next/cache";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import {
  createListing,
  deleteListing,
  moveListing,
  setListingStatus,
  updateListing,
  validateListing,
  type ListingInput,
  type ListingStatus,
} from "@/lib/listings";

type Result = { ok: boolean; error?: string };

/** 對外頁面 ＋ 後台自己，三個路徑一起刷新 */
function revalidateAll(): void {
  revalidatePath("/");
  revalidatePath("/listings");
  revalidatePath("/admin/listings");
}

/** MySQL 的重複鍵錯誤翻成人話 —— 原始訊息是 "Duplicate entry '...' for key ..."，看不懂。 */
function describeError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/duplicate entry/i.test(raw) || /uq_listing_slug/i.test(raw)) {
    return "這個識別字（slug）已經有別的物件在用了，換一個";
  }
  return raw;
}

export async function saveListingAction(
  id: string | null,
  input: ListingInput,
): Promise<Result & { id?: string }> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };

  const checked = validateListing(input);
  if (!checked.ok) return { ok: false, error: checked.error };

  try {
    if (id) {
      await updateListing(id, checked.value);
    } else {
      const newId = await createListing(checked.value);
      revalidateAll();
      return { ok: true, id: newId };
    }
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }

  revalidateAll();
  return { ok: true, id };
}

export async function setListingStatusAction(id: string, status: ListingStatus): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  try {
    await setListingStatus(id, status === "sold" ? "sold" : "active");
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
  revalidateAll();
  return { ok: true };
}

export async function moveListingAction(id: string, direction: "up" | "down"): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  try {
    await moveListing(id, direction);
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
  revalidateAll();
  return { ok: true };
}

/**
 * 真的刪掉一筆。
 *
 * ⚠️ 成交或下架請用「下架」，不要刪 —— 留著才查得到曾經賣過什麼。
 *    這個動作留給「建錯的、重複的」那種資料，後台按鈕也會再問一次。
 */
export async function deleteListingAction(id: string): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  try {
    await deleteListing(id);
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
  revalidateAll();
  return { ok: true };
}

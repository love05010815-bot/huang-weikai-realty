"use server";
/**
 * 建案地圖物件後台的五個動作：存、上下架、換順序、刪除。
 *
 * 每一個都先擋權限再做事 —— server action 可以被直接 POST，
 * 「畫面上沒有按鈕」不等於「外面的人叫不到」。
 *
 * 改完 revalidate `/map` 與後台自己，所以按下去對外頁面立刻就變。
 * ⚠️ 不要 revalidate `/` 或 `/listings` —— 那兩頁吃的是「精選好案」，
 *    跟這裡是兩套資料，白刷一次只是浪費。
 */
import { revalidatePath } from "next/cache";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import {
  createMapListing,
  deleteMapListing,
  moveMapListing,
  setMapListingStatus,
  updateMapListing,
  validateMapListing,
  type MapListingInput,
  type MapListingStatus,
} from "@/lib/map-listings";

type Result = { ok: boolean; error?: string };

function revalidateAll(): void {
  revalidatePath("/map");
  revalidatePath("/admin/map-listings");
}

function describeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function saveMapListingAction(
  id: string | null,
  input: MapListingInput,
): Promise<Result & { id?: string }> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };

  const checked = validateMapListing(input);
  if (!checked.ok) return { ok: false, error: checked.error };

  try {
    if (id) {
      await updateMapListing(id, checked.value);
    } else {
      const newId = await createMapListing(checked.value);
      revalidateAll();
      return { ok: true, id: newId };
    }
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }

  revalidateAll();
  return { ok: true, id };
}

export async function setMapListingStatusAction(id: string, status: MapListingStatus): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  try {
    await setMapListingStatus(id, status === "sold" ? "sold" : "active");
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
  revalidateAll();
  return { ok: true };
}

export async function moveMapListingAction(id: string, direction: "up" | "down"): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  try {
    await moveMapListing(id, direction === "up" ? "up" : "down");
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
  revalidateAll();
  return { ok: true };
}

export async function deleteMapListingAction(id: string): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  try {
    await deleteMapListing(id);
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
  revalidateAll();
  return { ok: true };
}

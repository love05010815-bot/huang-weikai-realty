"use server";
/**
 * 屋主建檔後台的動作：屋主存／刪、房子存／刪、聯絡紀錄加／刪、整批匯入。
 *
 * 每一個都先擋權限再做事 —— server action 可以被直接 POST，
 * 「畫面上沒有按鈕」不等於「外面的人叫不到」。這裡裝的是屋主個資，更不能漏。
 *
 * 純內部工具，沒有對外頁面吃這份資料，所以只 revalidate 後台自己這頁。
 */
import { revalidatePath } from "next/cache";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import {
  addContactLog,
  createOwner,
  createProperty,
  deleteContactLog,
  deleteOwner,
  deleteProperty,
  delistProperty,
  importOwners,
  listOwnerIdentities,
  updateOwner,
  updateProperty,
  validateContactLogInput,
  validateDelistInput,
  validateOwnerInput,
  validatePropertyInput,
  type ContactLogInput,
  type DelistInput,
  type OwnerInput,
  type PropertyInput,
} from "@/lib/owners";
import { parseImportText } from "@/lib/owners-import";
import { findDuplicateOwners, type DuplicateHit } from "@/lib/owners-text";

type Result = { ok: boolean; error?: string };

function revalidateAll(): void {
  revalidatePath("/admin/owners");
}

function describeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export type SaveOwnerResult = Result & {
  id?: string;
  /** 伺服器查到同名／同電話的既有屋主，而且呼叫端沒說 allowDuplicate → 沒存，把名單回去讓畫面問他 */
  duplicates?: DuplicateHit[];
};

/**
 * 同名警示（2026-10-13 他要的）：畫面上打名字時已經用它手上的清單即時提示，
 * 這裡**再查一次資料庫**——他在手機建了、電腦那邊沒重整，手上的清單是舊的，只靠畫面會漏。
 * 查到而且沒帶 allowDuplicate 就不存、回 duplicates；畫面把存檔鈕換成「仍要新增」再送一次（帶 true）。
 * 真的會有兩位陳小姐，所以是警示不是擋死。
 */
export async function saveOwnerAction(
  id: string | null,
  input: OwnerInput,
  opts: { allowDuplicate?: boolean } = {},
): Promise<SaveOwnerResult> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  const checked = validateOwnerInput(input);
  if (!checked.ok) return { ok: false, error: checked.error };
  try {
    if (!opts.allowDuplicate) {
      const dupes = findDuplicateOwners(await listOwnerIdentities(), checked.value.name, checked.value.phone, id);
      if (dupes.length > 0) {
        const names = dupes.map((d) => `${d.name}${d.phone ? `（${d.phone}）` : ""}`).join("、");
        return { ok: false, error: `已有同名或同電話的屋主：${names}。確定不是同一個人再按一次「仍要新增」。`, duplicates: dupes };
      }
    }
    if (id) {
      await updateOwner(id, checked.value);
      revalidateAll();
      return { ok: true, id };
    }
    const newId = await createOwner(checked.value);
    revalidateAll();
    return { ok: true, id: newId };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

export async function deleteOwnerAction(id: string): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  try {
    await deleteOwner(id);
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
  revalidateAll();
  return { ok: true };
}

export async function savePropertyAction(id: string | null, input: PropertyInput): Promise<Result & { id?: string }> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  const checked = validatePropertyInput(input);
  if (!checked.ok) return { ok: false, error: checked.error };
  try {
    if (id) {
      await updateProperty(id, checked.value);
      revalidateAll();
      return { ok: true, id };
    }
    const newId = await createProperty(checked.value);
    revalidateAll();
    return { ok: true, id: newId };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

/** 下架一間房：狀態改「已下架」並記原因／金額／日期。走獨立 action 而不是 save，表單欄位不會互相蓋到。 */
export async function delistPropertyAction(input: DelistInput): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  const checked = validateDelistInput(input);
  if (!checked.ok) return { ok: false, error: checked.error };
  try {
    const found = await delistProperty(checked.value);
    if (!found) return { ok: false, error: "找不到這間房子，可能已被刪除" };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
  revalidateAll();
  return { ok: true };
}

export async function deletePropertyAction(id: string): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  try {
    await deleteProperty(id);
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
  revalidateAll();
  return { ok: true };
}

export async function addContactLogAction(input: ContactLogInput): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  const checked = validateContactLogInput(input);
  if (!checked.ok) return { ok: false, error: checked.error };
  try {
    await addContactLog(checked.value);
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
  revalidateAll();
  return { ok: true };
}

export async function deleteContactLogAction(id: string): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  try {
    await deleteContactLog(id);
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
  revalidateAll();
  return { ok: true };
}

/**
 * 整批貼上匯入。畫面上已經先用同一支 parseImportText 預覽過了，
 * 這裡**再解析一次**而不是信任畫面傳來的結構 —— 伺服器只信自己算的東西。
 * 有任何一行解析出錯就整批不收，叫他先改好那行（寧可少做，不要半批進去又難對）。
 */
export async function importOwnersAction(text: string): Promise<Result & { done?: number }> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };

  const parsed = parseImportText(text ?? "");
  if (parsed.length === 0) return { ok: false, error: "沒有可匯入的資料" };
  if (parsed.length > 500) return { ok: false, error: "一次最多 500 筆，請分批貼" };
  const bad = parsed.find((r) => r.error);
  if (bad) return { ok: false, error: `第 ${bad.line} 行：${bad.error}` };

  const rows = [];
  for (const r of parsed) {
    const checked = validateOwnerInput(r.owner);
    if (!checked.ok) return { ok: false, error: `第 ${r.line} 行：${checked.error}` };
    if (r.property && r.property.address.length > 255) return { ok: false, error: `第 ${r.line} 行：地址太長` };
    rows.push({ owner: checked.value, property: r.property });
  }

  try {
    const r = await importOwners(rows);
    revalidateAll();
    if (r.failedAt !== null) {
      return {
        ok: false,
        done: r.done,
        error: `前 ${r.done} 筆已建好，第 ${parsed[r.failedAt]?.line ?? r.failedAt + 1} 行失敗：${r.error}。請只重貼失敗那行以後的資料，避免重複。`,
      };
    }
    return { ok: true, done: r.done };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

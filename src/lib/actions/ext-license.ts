"use server";
/**
 * 同事授權碼後台（/admin/post591/keys）的動作：新增、停用／恢復、重設電腦清單、改到期日、改電腦數上限、刪除。
 *
 * 每一個都先擋權限再做事 —— server action 是可以被直接 POST 的，「畫面上沒有按鈕」不等於「外面的人叫不到」。
 * 做完 revalidate 後台自己這一頁；外掛那邊不用 revalidate，它每次驗證都是現查資料庫。
 */
import { revalidatePath } from "next/cache";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import {
  createLicense,
  deleteLicense,
  resetLicenseInstalls,
  setLicenseExpires,
  setLicenseMaxInstalls,
  setLicenseRevoked,
  taiwanDateEnd,
} from "@/lib/ext-license";

type Result = { ok: boolean; error?: string };
const PAGE = "/admin/post591/keys";

async function guarded(run: () => Promise<void>): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  try {
    await run();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath(PAGE);
  return { ok: true };
}

export async function createLicenseAction(name: string, expiresDate: string, maxInstalls: number): Promise<Result & { key?: string }> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  const expiresAt = taiwanDateEnd(expiresDate);
  if (!expiresAt) return { ok: false, error: "到期日格式不對（要 YYYY-MM-DD）" };
  try {
    const row = await createLicense(name, expiresAt, maxInstalls);
    revalidatePath(PAGE);
    return { ok: true, key: row.key };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function revokeLicenseAction(id: string, revoked: boolean): Promise<Result> {
  return guarded(() => setLicenseRevoked(id, revoked));
}

export async function resetInstallsAction(id: string): Promise<Result> {
  return guarded(() => resetLicenseInstalls(id));
}

export async function setLicenseExpiresAction(id: string, expiresDate: string): Promise<Result> {
  const expiresAt = taiwanDateEnd(expiresDate);
  if (!expiresAt) return { ok: false, error: "到期日格式不對（要 YYYY-MM-DD）" };
  return guarded(() => setLicenseExpires(id, expiresAt));
}

export async function setLicenseMaxInstallsAction(id: string, maxInstalls: number): Promise<Result> {
  return guarded(() => setLicenseMaxInstalls(id, maxInstalls));
}

export async function deleteLicenseAction(id: string): Promise<Result> {
  return guarded(() => deleteLicense(id));
}

"use server";
/**
 * 後台「買方資料建檔 → 同事」的動作（2026-10-20 他說「建立同事的這個連結一併同步到這裡」）。
 * 跟本人建檔頁的「同事」頁同一套（lib/match/colleague-ops.ts），只差這裡用後台登入把關、那邊用金鑰。
 */
import { revalidatePath } from "next/cache";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import { addColleagueOp, deleteColleagueOp, listColleagueRows, rotateColleagueOp, setColleagueOp } from "@/lib/match/colleague-ops";
import type { IntakeColleagueRow } from "@/lib/match/intake";

type Fail = { ok: false; error: string };
const DENIED: Fail = { ok: false, error: "權限不足" };

export async function adminColleaguesAction(): Promise<Fail | { ok: true; rows: IntakeColleagueRow[] }> {
  if (!(await isCurrentUserAdmin())) return DENIED;
  try {
    return { ok: true, rows: await listColleagueRows() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function adminAddColleagueAction(input: { name: string; phone: string; line: string }): Promise<Fail | { ok: true; rows: IntakeColleagueRow[]; created: IntakeColleagueRow }> {
  if (!(await isCurrentUserAdmin())) return DENIED;
  const r = await addColleagueOp(input);
  if (r.ok) revalidatePath("/admin/match");
  return r;
}

export async function adminSetColleagueAction(
  id: string,
  patch: { active?: boolean; name?: string; phone?: string; line?: string },
): Promise<Fail | { ok: true; rows: IntakeColleagueRow[] }> {
  if (!(await isCurrentUserAdmin())) return DENIED;
  const r = await setColleagueOp(id, patch);
  if (r.ok) revalidatePath("/admin/match");
  return r;
}

export async function adminRotateColleagueKeyAction(id: string): Promise<Fail | { ok: true; rows: IntakeColleagueRow[] }> {
  if (!(await isCurrentUserAdmin())) return DENIED;
  const r = await rotateColleagueOp(id);
  if (r.ok) revalidatePath("/admin/match");
  return r;
}

export async function adminDeleteColleagueAction(id: string): Promise<Fail | { ok: true; rows: IntakeColleagueRow[]; buyers: number; viewings: number }> {
  if (!(await isCurrentUserAdmin())) return DENIED;
  const r = await deleteColleagueOp(id);
  if (r.ok) revalidatePath("/admin/match");
  return r;
}

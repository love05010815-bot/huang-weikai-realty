/**
 * 同事的增刪改 —— 本人的建檔頁「同事」（lib/actions/intake.ts）跟後台「買方資料建檔 → 同事」（lib/actions/colleagues-admin.ts）
 * 共用的那一半：檢查輸入、呼叫資料層、回整份清單。兩邊只差「誰能按」（金鑰 vs 後台登入），其他一模一樣，
 * 所以 2026-10-20 他說「同事連結一併同步到後台」時抽到這裡，兩邊永遠長一樣。
 *
 * 這裡不做權限：呼叫端自己先把關。
 */
import { lineUrlFromInput } from "./colleague-link";
import {
  countBuyersOfColleague,
  createColleague,
  deleteColleague,
  listColleagues,
  offboardColleague,
  rotateColleagueKey,
  updateColleague,
} from "./colleagues";
import { toIntakeColleagueRow, type IntakeColleagueRow } from "./intake";
import { countPushSubscriptions } from "./push";

export type ColleagueOpFail = { ok: false; error: string };
export type ColleagueRowsResult = { ok: true; rows: IntakeColleagueRow[] };

const describeError = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** 「同事」頁的清單：每人幾位客人、開了幾支手機通知、有沒有開過連結 */
export async function listColleagueRows(): Promise<IntakeColleagueRow[]> {
  const rows: IntakeColleagueRow[] = [];
  // 連線池只有 3 條：循序問，不要 Promise.all
  for (const c of await listColleagues()) rows.push(toIntakeColleagueRow(c, await countBuyersOfColleague(c.id), await countPushSubscriptions(c.id)));
  return rows;
}

export async function addColleagueOp(input: { name: string; phone: string; line: string }): Promise<ColleagueOpFail | (ColleagueRowsResult & { created: IntakeColleagueRow })> {
  const name = String(input.name ?? "").trim().slice(0, 40);
  const phone = String(input.phone ?? "").trim().replace(/[^\d+\-]/g, "").slice(0, 40);
  const lineRaw = String(input.line ?? "").trim();
  const lineUrl = lineUrlFromInput(lineRaw);
  if (!name) return { ok: false, error: "請填同事的稱呼（例如「王小明」）" };
  if (lineRaw && !lineUrl) return { ok: false, error: "LINE 看不懂：填 LINE ID（例如 abc123），或貼 line.me 開頭的加好友連結" };
  try {
    const c = await createColleague({ name, phone, lineUrl });
    const rows = await listColleagueRows();
    const created = rows.find((r) => r.id === c.id) ?? toIntakeColleagueRow(c, 0, 0);
    return { ok: true, rows, created };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

export async function setColleagueOp(
  id: string,
  patch: { active?: boolean; name?: string; phone?: string; line?: string },
): Promise<ColleagueOpFail | ColleagueRowsResult> {
  try {
    const clean: { active?: boolean; name?: string; phone?: string; lineUrl?: string } = {};
    if (patch.active !== undefined) clean.active = Boolean(patch.active);
    if (patch.name !== undefined) {
      clean.name = String(patch.name).trim().slice(0, 40);
      if (!clean.name) return { ok: false, error: "稱呼不能空白" };
    }
    if (patch.phone !== undefined) clean.phone = String(patch.phone).trim().replace(/[^\d+\-]/g, "").slice(0, 40);
    if (patch.line !== undefined) {
      const raw = String(patch.line).trim();
      const url = lineUrlFromInput(raw);
      if (raw && !url) return { ok: false, error: "LINE 看不懂：填 LINE ID，或貼 line.me 開頭的加好友連結" };
      clean.lineUrl = url;
    }
    if (!(await updateColleague(id, clean))) return { ok: false, error: "找不到這位同事" };
    // 停用 = 離職：連結作廢（金鑰換掉）、手機通知訂閱清掉（colleagues.ts 的 offboardColleague）
    if (clean.active === false) await offboardColleague(id);
    return { ok: true, rows: await listColleagueRows() };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

/** 重新產生同事的連結 —— 舊的立刻失效 */
export async function rotateColleagueOp(id: string): Promise<ColleagueOpFail | ColleagueRowsResult> {
  try {
    if (!(await rotateColleagueKey(id))) return { ok: false, error: "找不到這位同事" };
    return { ok: true, rows: await listColleagueRows() };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

/** 刪同事。在職且有客人的刪不掉；停用的連她的客人、預約一起清（理由在 colleagues.deleteColleague） */
export async function deleteColleagueOp(id: string): Promise<ColleagueOpFail | (ColleagueRowsResult & { buyers: number; viewings: number })> {
  try {
    const r = await deleteColleague(id);
    if (!r.ok) return { ok: false, error: r.reason ?? "刪除失敗" };
    return { ok: true, rows: await listColleagueRows(), buyers: r.buyers ?? 0, viewings: r.viewings ?? 0 };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

"use server";
/**
 * 手機快速建檔（/intake?key=…）的動作 —— 用金鑰把關，不用登入。
 *
 * 每一個都先驗金鑰再做事：server action 可以被直接 POST，畫面上有沒有那個按鈕不算數。
 * 本體在 lib/match/intake.ts，跟後台代客建檔是同一段程式。
 *
 * ⚠️ 2026-09-26 起這條路也回得到**整份名單**（他要在 /intake 看已建立的客戶）——
 *    也就是說拿到連結的人看得到客戶姓名、電話、需求。連結外流就到後台「重新產生」。
 *    2026-10-05 起也刪得掉（名單往左滑）—— 同一把金鑰，同一句話。
 *
 * 同事版（2026-10-05）：金鑰分兩種 —— 本人的（appointment_config）與同事的（match_colleague.intake_key）。
 * resolveIntakeActor 認出是誰之後，**每一個動作都只在他自己的名單裡做**：
 *   本人   = colleague_id IS NULL 的客人；也只有本人能管同事（最下面那幾支）。
 *   同事   = colleague_id 是他的客人；不能推播（同事的客人不碰官方帳號）；
 *            可以開手機通知（Web Push，lib/match/push.ts）收自己客人的新預約。
 */
import { revalidatePath } from "next/cache";
import { OWNER } from "@/config/owner";
import { lineUrlFromInput } from "@/lib/match/colleague-link";
import {
  countBuyersOfColleague,
  createColleague,
  deleteColleague,
  listColleagues,
  rotateColleagueKey,
  updateColleague,
} from "@/lib/match/colleagues";
import {
  buildBuyerBrief,
  buyerOwnedBy,
  listIntakeRows,
  listIntakeViewings,
  pushBriefToBuyer,
  saveBuyerFromForm,
  toIntakeBuyer,
  toIntakeColleagueRow,
  type BuyerBrief,
  type BuyerFormInput,
  type IntakeBuyer,
  type IntakeColleagueRow,
  type IntakeRow,
  type IntakeViewingRow,
} from "@/lib/match/intake";
import { actorOwnerId, resolveIntakeActor, type IntakeActor } from "@/lib/match/intake-key";
import { countPushSubscriptions, deletePushSubscription, parseSubscription, savePushSubscription, sendTestPush } from "@/lib/match/push";
import { deleteBuyer, getBuyer } from "@/lib/match/store";

// ⚠️ 這裡不能寫 `export type { IntakeBuyer, IntakeRow }` 轉出去：
//    "use server" 的檔案會被當成「每個 export 都是 action」處理，那一行在執行期會變成
//    ReferenceError: IntakeBuyer is not defined（2026-09-26 踩過）。畫面要型別直接從 lib/match/intake 拿。

/** 存完／點開一位買方之後畫面要的東西：他的資料＋簡報（符合幾間、連結、訊息） */
export type IntakeSaveResult =
  | { ok: false; error: string }
  | { ok: true; buyer: IntakeBuyer; merged: boolean; brief: BuyerBrief };

type Fail = { ok: false; error: string };

const INVALID = "連結已失效，請到後台「買方配對 → 買方」重新拿一次快速建檔連結";
const NOT_FOUND = "找不到這位買方，可能已經被刪掉了";
const OWNER_ONLY = "這個功能只有本人的連結才有";
const describeError = (e: unknown): string => (e instanceof Error ? e.message : String(e));
/** 傳給客戶那段話的署名：同事的客人看到的是同事 */
const signerOf = (actor: IntakeActor): string => actor.colleague?.name ?? OWNER.alias;

export async function intakeSaveAction(key: string, id: string | null, input: BuyerFormInput): Promise<IntakeSaveResult> {
  const actor = await resolveIntakeActor(key);
  if (!actor) return { ok: false, error: INVALID };
  try {
    const r = await saveBuyerFromForm(id, input, actorOwnerId(actor));
    if (!r.ok) return { ok: false, error: r.error };
    const brief = await buildBuyerBrief(r.buyer, 40, signerOf(actor));
    revalidatePath("/admin/match");
    return { ok: true, merged: r.merged, buyer: toIntakeBuyer(r.buyer), brief };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

/** 名單（最近更新的在前）。本人的連結＝本人的客人（跟後台「買方」分頁同一份）；同事的連結＝他自己的。 */
export async function intakeListAction(key: string): Promise<Fail | { ok: true; rows: IntakeRow[] }> {
  const actor = await resolveIntakeActor(key);
  if (!actor) return { ok: false, error: INVALID };
  try {
    return { ok: true, rows: await listIntakeRows(300, actorOwnerId(actor)) };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

/** 點開名單上的一位：資料＋目前的配對結果（跟剛存完看到的是同一個畫面）。不是自己的客人就當找不到。 */
export async function intakeOpenAction(key: string, id: string): Promise<IntakeSaveResult> {
  const actor = await resolveIntakeActor(key);
  if (!actor) return { ok: false, error: INVALID };
  try {
    const buyer = await getBuyer(id);
    if (!buyer || !buyerOwnedBy(buyer, actorOwnerId(actor))) return { ok: false, error: NOT_FOUND };
    const brief = await buildBuyerBrief(buyer, 40, signerOf(actor));
    return { ok: true, merged: false, buyer: toIntakeBuyer(buyer), brief };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

/** 從官方帳號推物件卡（計費）。只有本人、只有本人的客人 —— 同事的客人不碰官方帳號。 */
export async function intakePushAction(key: string, buyerId: string): Promise<{ ok: boolean; error?: string; count?: number }> {
  const actor = await resolveIntakeActor(key);
  if (!actor) return { ok: false, error: INVALID };
  if (actor.kind !== "owner") return { ok: false, error: "同事的客人不走官方帳號推播，請用「複製訊息」或「用 LINE 傳送」" };
  try {
    const buyer = await getBuyer(buyerId);
    if (!buyer || !buyerOwnedBy(buyer, null)) return { ok: false, error: NOT_FOUND };
    return await pushBriefToBuyer(buyerId);
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

/** 名單上往左滑刪掉一位（打錯、測試資料用）。名下有預約的刪不掉，理由在 store.deleteBuyer。 */
export async function intakeDeleteAction(key: string, id: string): Promise<{ ok: true } | Fail> {
  const actor = await resolveIntakeActor(key);
  if (!actor) return { ok: false, error: INVALID };
  try {
    const buyer = await getBuyer(id);
    if (!buyer || !buyerOwnedBy(buyer, actorOwnerId(actor))) return { ok: false, error: NOT_FOUND };
    const r = await deleteBuyer(id);
    if (!r.ok) return { ok: false, error: r.reason ?? "刪除失敗" };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
  revalidatePath("/admin/match");
  return { ok: true };
}

/** 自己客人的預約看屋（最新的在前）。同事沒有後台，預約只能在這裡看。 */
export async function intakeViewingsAction(key: string): Promise<Fail | { ok: true; rows: IntakeViewingRow[] }> {
  const actor = await resolveIntakeActor(key);
  if (!actor) return { ok: false, error: INVALID };
  try {
    return { ok: true, rows: await listIntakeViewings(actorOwnerId(actor), 100) };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

// ---------------------------------------------------------------- 同事管理（只有本人的連結）

async function ownerOnly(key: string): Promise<IntakeActor | Fail> {
  const actor = await resolveIntakeActor(key);
  if (!actor) return { ok: false, error: INVALID };
  if (actor.kind !== "owner") return { ok: false, error: OWNER_ONLY };
  return actor;
}

async function colleagueRows(): Promise<IntakeColleagueRow[]> {
  const rows: IntakeColleagueRow[] = [];
  // 連線池只有 3 條：循序問，不要 Promise.all
  for (const c of await listColleagues()) rows.push(toIntakeColleagueRow(c, await countBuyersOfColleague(c.id), await countPushSubscriptions(c.id)));
  return rows;
}

export async function intakeColleaguesAction(key: string): Promise<Fail | { ok: true; rows: IntakeColleagueRow[] }> {
  const gate = await ownerOnly(key);
  if ("ok" in gate) return gate;
  try {
    return { ok: true, rows: await colleagueRows() };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

export async function intakeAddColleagueAction(
  key: string,
  input: { name: string; phone: string; line: string },
): Promise<Fail | { ok: true; rows: IntakeColleagueRow[]; created: IntakeColleagueRow }> {
  const gate = await ownerOnly(key);
  if ("ok" in gate) return gate;
  const name = String(input.name ?? "").trim().slice(0, 40);
  const phone = String(input.phone ?? "").trim().replace(/[^\d+\-]/g, "").slice(0, 40);
  const lineRaw = String(input.line ?? "").trim();
  const lineUrl = lineUrlFromInput(lineRaw);
  if (!name) return { ok: false, error: "請填同事的稱呼（例如「王小明」）" };
  if (lineRaw && !lineUrl) return { ok: false, error: "LINE 看不懂：填 LINE ID（例如 abc123），或貼 line.me 開頭的加好友連結" };
  try {
    const c = await createColleague({ name, phone, lineUrl });
    const rows = await colleagueRows();
    const created = rows.find((r) => r.id === c.id) ?? toIntakeColleagueRow(c, 0, 0);
    return { ok: true, rows, created };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

export async function intakeSetColleagueAction(
  key: string,
  id: string,
  patch: { active?: boolean; name?: string; phone?: string; line?: string },
): Promise<Fail | { ok: true; rows: IntakeColleagueRow[] }> {
  const gate = await ownerOnly(key);
  if ("ok" in gate) return gate;
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
    return { ok: true, rows: await colleagueRows() };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

/** 重新產生同事的連結 —— 舊的立刻失效 */
export async function intakeRotateColleagueKeyAction(key: string, id: string): Promise<Fail | { ok: true; rows: IntakeColleagueRow[] }> {
  const gate = await ownerOnly(key);
  if ("ok" in gate) return gate;
  try {
    if (!(await rotateColleagueKey(id))) return { ok: false, error: "找不到這位同事" };
    return { ok: true, rows: await colleagueRows() };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

/** 刪同事。名下有客人的刪不掉（改停用就好），理由在 colleagues.deleteColleague */
export async function intakeDeleteColleagueAction(key: string, id: string): Promise<Fail | { ok: true; rows: IntakeColleagueRow[] }> {
  const gate = await ownerOnly(key);
  if ("ok" in gate) return gate;
  try {
    const r = await deleteColleague(id);
    if (!r.ok) return { ok: false, error: r.reason ?? "刪除失敗" };
    return { ok: true, rows: await colleagueRows() };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

// ---------------------------------------------------------------- 同事的手機通知（Web Push，只有同事的連結）

async function colleagueOnly(key: string): Promise<IntakeActor | Fail> {
  const actor = await resolveIntakeActor(key);
  if (!actor) return { ok: false, error: INVALID };
  if (actor.kind !== "colleague") return { ok: false, error: "本人的預約走官方帳號和 Email 通知，這個功能只給同事的連結" };
  return actor;
}

/** 這支手機訂好了（PushSetup.tsx 把瀏覽器給的訂閱資料送上來存） */
export async function intakeSubscribePushAction(key: string, subscription: unknown, userAgent: string): Promise<{ ok: true } | Fail> {
  const gate = await colleagueOnly(key);
  if ("ok" in gate) return gate;
  const sub = parseSubscription(subscription);
  if (!sub) return { ok: false, error: "訂閱資料看不懂，請重新整理再試一次" };
  try {
    await savePushSubscription(gate.colleague!.id, sub, String(userAgent ?? ""));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

/** 同事按「關閉通知」 */
export async function intakeUnsubscribePushAction(key: string, endpoint: string): Promise<{ ok: true } | Fail> {
  const gate = await colleagueOnly(key);
  if ("ok" in gate) return gate;
  try {
    await deletePushSubscription(gate.colleague!.id, String(endpoint ?? ""));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

/** 同事按「傳一則測試通知」：推給他名下每一支手機 */
export async function intakeTestPushAction(key: string): Promise<{ ok: true; sent: number; failed: number; removed: number } | Fail> {
  const gate = await colleagueOnly(key);
  if ("ok" in gate) return gate;
  try {
    return { ok: true, ...(await sendTestPush(gate.colleague!)) };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

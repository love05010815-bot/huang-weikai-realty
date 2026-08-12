/**
 * 後台預約操作 API。
 *
 * 後台的 AppointmentActions 全部打這一支（POST /api/admin/appointments/<id>），
 * 模板原本沒附這個檔案，所以後台每個按鈕都是 404。
 *
 * 這一層只做三件事：擋權限、驗參數、把已經寫好的 lib 函式接起來。
 * 真正的邏輯（時段鎖交易、取消時釋放格子、撞號回 409）都在 @/lib/appointment。
 */
import { NextRequest, NextResponse } from "next/server";
import {
  AppointmentSlotConflictError,
  createAppointmentFollowup,
  enqueueAppointmentOutbox,
  getAppointment,
  setAppointmentSlot,
  setAppointmentStatus,
  updateAppointmentOperations,
  type AppointmentRow,
} from "@/lib/appointment";
import { isGoogleConfigured } from "@/lib/google-calendar";
import { isCurrentUserAdmin } from "@/lib/admin-check";

export const dynamic = "force-dynamic";

const ATTENDANCE = ["pending", "confirmed", "arrived", "no_show"];
const OUTCOME = ["none", "hot", "nurture", "unqualified", "closed_won", "closed_lost"];
const CONTACT = ["uncontacted", "contacted", "waiting_customer", "followup_due", "closed"];

/** 前端的回應約定：ok = 全部成功；saved = 資料存了但背景任務沒排進去；error = 沒做成。 */
type ActionResult = { ok?: boolean; saved?: boolean; notice?: string; error?: string; followupId?: string };

function bad(error: string, status = 400): NextResponse {
  return NextResponse.json({ error }, { status });
}

function text(value: unknown, max: number): string | null {
  const s = String(value ?? "").trim().slice(0, max);
  return s || null;
}

function money(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
}

function date(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * 排背景任務。目前沒有任何 worker 在消化 appointment_outbox，
 * 所以這裡排進去的任務會停在佇列裡等 worker 補上 —— 排隊失敗不該讓
 * 「資料已經改好」這件事變成失敗，因此一律吞掉錯誤、只回報排隊成敗。
 */
async function enqueue(
  appt: AppointmentRow,
  tasks: Array<{ taskType: Parameters<typeof enqueueAppointmentOutbox>[0]["taskType"]; suffix: string; payload?: Record<string, unknown> }>,
): Promise<boolean> {
  try {
    await Promise.all(
      tasks.map((t) =>
        enqueueAppointmentOutbox({
          appointmentId: appt.id,
          taskType: t.taskType,
          dedupeKey: `appointment:${appt.id}:${t.suffix}`,
          payload: t.payload,
        }),
      ),
    );
    return true;
  } catch (error) {
    console.error("[admin/appointments] outbox 排隊失敗:", error);
    return false;
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isCurrentUserAdmin())) return bad("權限不足。", 403);

  const { id } = await ctx.params;
  if (!id || id.length > 64) return bad("預約編號不正確。");

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action || "").trim();
  const notifyCustomer = body.notifyCustomer === true;

  const appt = await getAppointment(id);
  if (!appt) return bad("找不到這筆預約。", 404);

  try {
    switch (action) {
      case "confirm":
      case "complete":
      case "cancel": {
        const status = action === "confirm" ? "confirmed" : action === "complete" ? "completed" : "cancelled";
        await setAppointmentStatus(id, status);

        // 取消才需要動日曆與通知；確認 / 完成不重複打擾客戶（確認信在成立時已寄過）。
        if (action === "cancel") {
          const queued = await enqueue(appt, [
            ...(isGoogleConfigured() && appt.google_event_id
              ? [{ taskType: "calendar_cancel" as const, suffix: "calendar-cancel" }]
              : []),
            ...(notifyCustomer ? [{ taskType: "notify_cancel" as const, suffix: "notify-cancel" }] : []),
          ]);
          if (!queued) {
            return NextResponse.json<ActionResult>({
              saved: true,
              notice: "預約已取消、時段已釋出，但取消通知沒有排入佇列。",
            });
          }
        }

        const notice =
          action === "confirm"
            ? "已標記為已確認。"
            : action === "complete"
              ? "已標記為已完成。"
              : "預約已取消，時段已釋出。";
        return NextResponse.json<ActionResult>({ ok: true, notice, });
      }

      case "mark_contacted": {
        const done = await updateAppointmentOperations({ id, contactStatus: "contacted" });
        if (!done) return bad("更新失敗，請重新整理後再試。", 409);
        return NextResponse.json<ActionResult>({ ok: true, notice: "已記錄為已聯絡。" });
      }

      case "set_attendance": {
        const value = String(body.attendanceStatus || "");
        if (!ATTENDANCE.includes(value)) return bad("出席狀態不正確。");
        const done = await updateAppointmentOperations({ id, attendanceStatus: value });
        if (!done) return bad("更新失敗，請重新整理後再試。", 409);
        return NextResponse.json<ActionResult>({
          ok: true,
          notice: value === "arrived" ? "已記錄客戶到場。" : value === "no_show" ? "已記錄客戶未到。" : "出席狀態已更新。",
        });
      }

      case "save_operations": {
        const attendanceStatus = body.attendanceStatus === undefined ? undefined : String(body.attendanceStatus);
        const outcomeStatus = body.outcomeStatus === undefined ? undefined : String(body.outcomeStatus);
        const contactStatus = body.contactStatus === undefined ? undefined : String(body.contactStatus);
        if (attendanceStatus !== undefined && !ATTENDANCE.includes(attendanceStatus)) return bad("出席狀態不正確。");
        if (outcomeStatus !== undefined && !OUTCOME.includes(outcomeStatus)) return bad("案件結果不正確。");
        if (contactStatus !== undefined && !CONTACT.includes(contactStatus)) return bad("聯絡狀態不正確。");

        const nextFollowupAt = date(body.nextFollowupAt);
        if (nextFollowupAt === undefined && body.nextFollowupAt !== undefined) return bad("跟進日期格式不正確。");
        const estimatedCommission = money(body.estimatedCommission);
        if (estimatedCommission === undefined && body.estimatedCommission !== undefined) return bad("預估服務費格式不正確。");
        const actualCommission = money(body.actualCommission);
        if (actualCommission === undefined && body.actualCommission !== undefined) return bad("實收服務費格式不正確。");

        const done = await updateAppointmentOperations({
          id,
          attendanceStatus,
          outcomeStatus,
          contactStatus,
          outcomeNote: text(body.outcomeNote, 4000),
          nextFollowupAt,
          estimatedCommission,
          actualCommission,
          caseReference: text(body.caseReference, 160),
        });
        if (!done) return bad("儲存失敗，請重新整理後再試。", 409);

        // 有排跟進時間就順手把跟進單開起來，省一次點擊。
        if (nextFollowupAt) {
          try {
            await createAppointmentFollowup(appt);
          } catch (error) {
            console.error("[admin/appointments] 自動建立跟進單失敗:", error);
            return NextResponse.json<ActionResult>({ saved: true, notice: "資料已儲存，但跟進單沒建立成功。" });
          }
        }
        return NextResponse.json<ActionResult>({ ok: true, notice: "營運欄位已儲存。" });
      }

      case "create_followup": {
        const followup = await createAppointmentFollowup(appt);
        return NextResponse.json<ActionResult>({ ok: true, notice: "跟進單已建立。", followupId: followup?.id });
      }

      case "resend_customer_confirmation": {
        const queued = await enqueue(appt, [
          { taskType: "notify_new", suffix: `resend-${Date.now()}`, payload: { phase: "confirmed", resend: true } },
        ]);
        if (!queued) return bad("通知沒有排入佇列，請稍後再試。", 500);
        return NextResponse.json<ActionResult>({ ok: true, notice: "確認通知已排入發送佇列。" });
      }

      case "reschedule": {
        const slotAt = date(body.slotIso);
        if (!slotAt) return bad("改期時間格式不正確。");
        const rawDuration = body.durationMin;
        let slotEndAt: Date | null = null;
        if (rawDuration === null || rawDuration === undefined) {
          // preserve：沿用原本的時長，原本沒填就交給 lib 補預設值。
          const original = appt.slot_end_at
            ? new Date(appt.slot_end_at).getTime() - new Date(appt.slot_at).getTime()
            : 0;
          slotEndAt = original > 0 ? new Date(slotAt.getTime() + original) : null;
        } else {
          const minutes = Number(rawDuration);
          if (!Number.isFinite(minutes) || minutes < 15 || minutes > 480) return bad("改期時長不正確。");
          slotEndAt = new Date(slotAt.getTime() + minutes * 60_000);
        }

        await setAppointmentSlot(id, slotAt, slotEndAt);

        const queued = await enqueue(appt, [
          ...(isGoogleConfigured() && appt.google_event_id
            ? [{ taskType: "calendar_reschedule" as const, suffix: `calendar-reschedule-${slotAt.getTime()}` }]
            : []),
          ...(notifyCustomer
            ? [{ taskType: "notify_reschedule" as const, suffix: `notify-reschedule-${slotAt.getTime()}` }]
            : []),
        ]);
        if (!queued) {
          return NextResponse.json<ActionResult>({
            saved: true,
            notice: "時間已改好，但日曆／通知沒有排入佇列。",
          });
        }
        return NextResponse.json<ActionResult>({ ok: true, notice: "已改期，時段鎖已同步更新。" });
      }

      default:
        return bad("不支援的操作。");
    }
  } catch (error) {
    if (error instanceof AppointmentSlotConflictError) {
      return bad("這個時段已經被其他預約佔用了，請換一個時間。", 409);
    }
    console.error(`[admin/appointments] ${action} 失敗:`, error);
    return bad("操作失敗，請稍後再試。", 500);
  }
}

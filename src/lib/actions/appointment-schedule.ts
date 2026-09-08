"use server";
/**
 * 後台儲存「可預約時間」設定（2026-09-08 系統擁有者「要做」）。
 * 跟 appointment-rate-limit.ts 同一種寫法：先正規化再存、存完回讀比對、不相信寫入成功。
 */
import { revalidatePath } from "next/cache";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import { getAppointmentScheduleSettings, saveAppointmentScheduleSettings } from "@/lib/appointment-schedule";
import { normalizeScheduleSettings, type AppointmentScheduleSettings } from "@/lib/appointment-schedule-settings";

export async function saveScheduleSettingsAction(
  input: Partial<AppointmentScheduleSettings>,
): Promise<{ ok: boolean; error?: string; settings?: AppointmentScheduleSettings }> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };

  const s = normalizeScheduleSettings(input);
  try {
    await saveAppointmentScheduleSettings(s);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const back = await getAppointmentScheduleSettings();
  if (JSON.stringify(back) !== JSON.stringify(s)) {
    return { ok: false, error: "存進去了但回讀對不上，請重新整理再看一次" };
  }

  revalidatePath("/admin/appointments");
  return { ok: true, settings: back };
}

/**
 * 「可預約時間」設定的讀寫（server only）。規則與預設值在 appointment-schedule-settings.ts。
 *
 * 讀：一次把九個 key 撈回來（跟 getAppointmentRateLimitSettings 同一種寫法），
 *     讀不到就回預設 —— 設定表掛了不該讓前台整個沒時段。
 * 寫：setConfig 一個一個存，存完回讀比對。
 */
import { db } from "@/lib/db";
import { setConfig } from "@/lib/google-calendar";
import {
  DEFAULT_SCHEDULE_SETTINGS,
  SCHEDULE_CONFIG_KEYS,
  normalizeScheduleSettings,
  type AppointmentScheduleSettings,
} from "@/lib/appointment-schedule-settings";

export async function getAppointmentScheduleSettings(): Promise<AppointmentScheduleSettings> {
  try {
    const keys = Object.values(SCHEDULE_CONFIG_KEYS);
    const rows = await db.$queryRawUnsafe<Array<{ k: string; v: string | null }>>(
      `SELECT k, v FROM appointment_config WHERE k IN (${keys.map(() => "?").join(",")})`,
      ...keys,
    );
    const byKey = new Map(rows.map((r) => [r.k, r.v]));
    const get = (k: string) => byKey.get(k) ?? undefined;
    return normalizeScheduleSettings({
      workDays: get(SCHEDULE_CONFIG_KEYS.workDays),
      startMin: get(SCHEDULE_CONFIG_KEYS.startMin),
      endMin: get(SCHEDULE_CONFIG_KEYS.endMin),
      daysAhead: get(SCHEDULE_CONFIG_KEYS.daysAhead),
      leadHours: {
        office: get(SCHEDULE_CONFIG_KEYS.leadOffice),
        phone: get(SCHEDULE_CONFIG_KEYS.leadPhone),
        video: get(SCHEDULE_CONFIG_KEYS.leadVideo),
        custom: get(SCHEDULE_CONFIG_KEYS.leadCustom),
      },
      closedDates: get(SCHEDULE_CONFIG_KEYS.closedDates),
    });
  } catch (error) {
    // 表還沒建（從來沒存過任何設定）或資料庫暫時不通：用預設，跟以前寫死的行為一樣
    console.error("[appointment-schedule] 讀不到設定，用預設:", error);
    return { ...DEFAULT_SCHEDULE_SETTINGS, workDays: [...DEFAULT_SCHEDULE_SETTINGS.workDays], leadHours: { ...DEFAULT_SCHEDULE_SETTINGS.leadHours }, closedDates: [] };
  }
}

export async function saveAppointmentScheduleSettings(s: AppointmentScheduleSettings): Promise<void> {
  await setConfig(SCHEDULE_CONFIG_KEYS.workDays, JSON.stringify(s.workDays));
  await setConfig(SCHEDULE_CONFIG_KEYS.startMin, String(s.startMin));
  await setConfig(SCHEDULE_CONFIG_KEYS.endMin, String(s.endMin));
  await setConfig(SCHEDULE_CONFIG_KEYS.daysAhead, String(s.daysAhead));
  await setConfig(SCHEDULE_CONFIG_KEYS.leadOffice, String(s.leadHours.office));
  await setConfig(SCHEDULE_CONFIG_KEYS.leadPhone, String(s.leadHours.phone));
  await setConfig(SCHEDULE_CONFIG_KEYS.leadVideo, String(s.leadHours.video));
  await setConfig(SCHEDULE_CONFIG_KEYS.leadCustom, String(s.leadHours.custom));
  await setConfig(SCHEDULE_CONFIG_KEYS.closedDates, JSON.stringify(s.closedDates));
}

/**
 * AppointmentRow → NotifyInput 的轉換。
 *
 * 原本只寫在 manage/route.ts 裡，create 路由要同步寄通知也需要同一份轉換。
 * 抽出來共用，避免兩邊各寫一份、日後欄位加了只改到一邊。
 */
import { LEGACY_DEFAULT_DURATION_MIN, type AppointmentRow, type MeetLocation } from "@/lib/appointment-constants";
import type { NotifyInput } from "@/lib/appointment-notify";

export function parseIntent(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function parseMeetLocation(raw: string | null): MeetLocation | null {
  if (!raw) return null;
  try {
    const location = JSON.parse(raw) as Partial<MeetLocation>;
    if (!location.name) return null;
    return {
      name: String(location.name).slice(0, 120),
      address: String(location.address || "").slice(0, 200),
      lat: typeof location.lat === "number" ? location.lat : null,
      lng: typeof location.lng === "number" ? location.lng : null,
      placeId: typeof location.placeId === "string" ? location.placeId.slice(0, 200) : null,
      source: location.source === "google" ? "google" : "manual",
    };
  } catch {
    return null;
  }
}

export function appointmentSlotEnd(appt: AppointmentRow): Date {
  const start = new Date(appt.slot_at);
  return appt.slot_end_at
    ? new Date(appt.slot_end_at)
    : new Date(start.getTime() + LEGACY_DEFAULT_DURATION_MIN * 60_000);
}

export function toNotifyInput(
  appt: AppointmentRow,
  overrides?: { slotAt?: Date; slotEndAt?: Date },
): NotifyInput {
  return {
    id: appt.id,
    name: appt.name,
    gender: appt.gender,
    phone: appt.phone,
    email: appt.email,
    lineId: appt.line_id,
    meetType: appt.meet_type,
    meetLocation: parseMeetLocation(appt.meet_location),
    intent: parseIntent(appt.intent),
    urgency: appt.urgency,
    note: appt.note,
    slotAt: overrides?.slotAt || new Date(appt.slot_at),
    slotEndAt: overrides?.slotEndAt || appointmentSlotEnd(appt),
    aiHeat: appt.ai_heat,
    aiSuggestion: appt.ai_suggestion,
    meetUrl: appt.meet_url,
    status: appt.status,
    confirmationDeadline: appt.confirmation_deadline,
  };
}

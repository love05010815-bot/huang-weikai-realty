/**
 * 後台「可預約時間」設定（2026-09-08 系統擁有者：「我後臺要從哪邊控制可以選擇的時間」→「要做」）。
 *
 * 之前這些規則全部寫死在 `appointment-constants.ts` 的 BOOKING_RULES／APPOINTMENT_MEETING_POLICIES，
 * 要改開放時段就得改程式、部署。現在存進 appointment_config（跟頻率限制、日曆設定同一張表），
 * 後台面板改完立刻生效。
 *
 * ⚠️ 這支檔案刻意**不 import 任何東西**：後台面板是 client component、擋人的是 API route 與
 *    server-side 驗證，三邊要共用同一份預設值與正規化規則（跟 appointment-rate-limit-settings.ts 同一種寫法）。
 *
 * ⚠️ 預設值＝改之前寫死的那組，**沒有任何一欄存過**的話行為跟以前一模一樣。
 *
 * 沒搬進來、仍在程式裡的：15 分鐘網格、前後緩衝、各見面方式的可選時長 —— 那些跟併發鎖與
 * 日曆事件長度綁在一起，改錯會撞單，不給後台調。
 */

/** 存在 appointment_config 的 key */
export const SCHEDULE_CONFIG_KEYS = {
  workDays: "schedule_work_days", // JSON 陣列，0=日 … 6=六
  startMin: "schedule_start_min", // 一天的第幾分鐘（10:00 → 600）
  endMin: "schedule_end_min", // 最後一格結束（18:00 → 1080）
  daysAhead: "schedule_days_ahead",
  leadOffice: "schedule_lead_office", // 各見面方式至少提前幾小時
  leadPhone: "schedule_lead_phone",
  leadVideo: "schedule_lead_video",
  leadCustom: "schedule_lead_custom",
  closedDates: "schedule_closed_dates", // JSON 陣列："YYYY-MM-DD" 或 "YYYY-MM-DD~YYYY-MM-DD"
} as const;

export type ScheduleMeetType = "office" | "phone" | "video" | "custom";

export type AppointmentScheduleSettings = {
  /** 每週開放哪幾天，0=日、1=一 … 6=六 */
  workDays: number[];
  /** 一天開放的起訖（台灣時間，一天的第幾分鐘；15 分鐘為單位） */
  startMin: number;
  endMin: number;
  /** 開放未來幾天 */
  daysAhead: number;
  /** 各見面方式至少提前幾小時 */
  leadHours: Record<ScheduleMeetType, number>;
  /** 休假日：整天不開放。單日 "YYYY-MM-DD" 或區間 "YYYY-MM-DD~YYYY-MM-DD" */
  closedDates: string[];
};

/** 沒設定時就用這組 —— 跟 2026-09-08 之前寫死的數字一模一樣 */
export const DEFAULT_SCHEDULE_SETTINGS: AppointmentScheduleSettings = {
  workDays: [1, 2, 3, 4, 5],
  startMin: 10 * 60,
  endMin: 18 * 60,
  daysAhead: 14,
  leadHours: { office: 12, phone: 2, video: 2, custom: 24 },
  closedDates: [],
};

export const SCHEDULE_MEET_TYPE_LABELS: Record<ScheduleMeetType, string> = {
  office: "公司面談",
  phone: "電話聯繫",
  video: "視訊",
  custom: "自訂地點",
};

export const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"] as const;

const SLOT_STEP = 15;
const MAX_DAYS_AHEAD = 90;
const MAX_LEAD_HOURS = 24 * 14;
/** 休假日最多存這麼多條，擋住手滑貼一整年 */
const MAX_CLOSED_ENTRIES = 200;

function int(value: unknown, fallback: number): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : fallback;
}

/** 對齊 15 分鐘網格、夾在 00:00～24:00 */
function clampMinute(value: unknown, fallback: number): number {
  const n = int(value, fallback);
  const snapped = Math.round(n / SLOT_STEP) * SLOT_STEP;
  return Math.min(24 * 60, Math.max(0, snapped));
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "YYYY-MM-DD" 是不是真的日期（2 月 30 日這種擋掉） */
export function isValidDateKey(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/**
 * 把一行休假日文字整理成標準寫法；不合法回 null。
 * 接受：2027-02-15、2027/2/15、2027-02-15~2027-02-20、2027-02-15 ~ 2027-02-20（全形波浪號也吃）
 */
export function normalizeClosedEntry(raw: string): string | null {
  const text = String(raw || "").trim().replace(/[～〜]/g, "~").replace(/\s+/g, "");
  if (!text) return null;
  const toKey = (part: string): string | null => {
    const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(part);
    if (!m) return null;
    const key = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    return isValidDateKey(key) ? key : null;
  };
  const parts = text.split("~");
  if (parts.length === 1) return toKey(parts[0]);
  if (parts.length !== 2) return null;
  const a = toKey(parts[0]);
  const b = toKey(parts[1]);
  if (!a || !b) return null;
  if (a === b) return a;
  return a < b ? `${a}~${b}` : `${b}~${a}`;
}

/** 把後台存的字串（或空值）變成能用的設定。任何一欄壞掉只回退那一欄，不整組作廢。 */
export function normalizeScheduleSettings(
  raw: Partial<{
    workDays: unknown;
    startMin: unknown;
    endMin: unknown;
    daysAhead: unknown;
    leadHours: Partial<Record<ScheduleMeetType, unknown>> | null | undefined;
    closedDates: unknown;
  }>,
): AppointmentScheduleSettings {
  const d = DEFAULT_SCHEDULE_SETTINGS;

  let workDays: number[] = [];
  const rawDays = Array.isArray(raw.workDays)
    ? raw.workDays
    : typeof raw.workDays === "string"
      ? safeJsonArray(raw.workDays)
      : [];
  for (const v of rawDays) {
    const n = int(v, -1);
    if (n >= 0 && n <= 6 && !workDays.includes(n)) workDays.push(n);
  }
  workDays.sort((a, b) => a - b);
  // 一天都不開會讓前台永遠沒有時段，而且沒有錯誤訊息 —— 空的就回預設
  if (workDays.length === 0) workDays = [...d.workDays];

  let startMin = clampMinute(raw.startMin, d.startMin);
  let endMin = clampMinute(raw.endMin, d.endMin);
  // 結束至少比開始晚 30 分鐘（最短時長），不然一格都排不出來
  if (endMin - startMin < 30) {
    startMin = d.startMin;
    endMin = d.endMin;
  }

  const daysAhead = Math.min(MAX_DAYS_AHEAD, Math.max(1, int(raw.daysAhead, d.daysAhead)));

  const lead = (k: ScheduleMeetType): number => {
    const v = raw.leadHours && raw.leadHours[k];
    const n = int(v, d.leadHours[k]);
    return Math.min(MAX_LEAD_HOURS, Math.max(0, n));
  };

  const rawClosed = Array.isArray(raw.closedDates)
    ? raw.closedDates
    : typeof raw.closedDates === "string"
      ? safeJsonArray(raw.closedDates)
      : [];
  const closedDates: string[] = [];
  for (const v of rawClosed) {
    const entry = normalizeClosedEntry(String(v ?? ""));
    if (entry && !closedDates.includes(entry)) closedDates.push(entry);
    if (closedDates.length >= MAX_CLOSED_ENTRIES) break;
  }
  closedDates.sort();

  return {
    workDays,
    startMin,
    endMin,
    daysAhead,
    leadHours: { office: lead("office"), phone: lead("phone"), video: lead("video"), custom: lead("custom") },
    closedDates,
  };
}

function safeJsonArray(text: string): unknown[] {
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** 把休假日（含區間）展開成一組 "YYYY-MM-DD"。區間最長只展開 400 天，防手滑填成好幾年。 */
export function expandClosedDates(closedDates: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const entry of closedDates) {
    const [a, b] = entry.split("~");
    if (!b) {
      out.add(a);
      continue;
    }
    const start = new Date(a + "T00:00:00Z").getTime();
    const end = new Date(b + "T00:00:00Z").getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    for (let t = start, i = 0; t <= end && i < 400; t += 86400_000, i++) {
      out.add(new Date(t).toISOString().slice(0, 10));
    }
  }
  return out;
}

export function minuteLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 面板上那幾行「現在的意思」 */
export function describeScheduleSettings(s: AppointmentScheduleSettings): string[] {
  const days = s.workDays.map((d) => `週${WEEKDAY_LABELS[d]}`).join("、");
  const lines = [
    `開放 ${days}，${minuteLabel(s.startMin)} 到 ${minuteLabel(s.endMin)}（最後一格結束）`,
    `開放未來 ${s.daysAhead} 天`,
    `至少提前：${(Object.keys(SCHEDULE_MEET_TYPE_LABELS) as ScheduleMeetType[])
      .map((k) => `${SCHEDULE_MEET_TYPE_LABELS[k]} ${s.leadHours[k]} 小時`)
      .join("、")}`,
  ];
  if (s.closedDates.length) lines.push(`休假日 ${s.closedDates.length} 條：${s.closedDates.slice(0, 6).join("、")}${s.closedDates.length > 6 ? "…" : ""}`);
  else lines.push("沒有設休假日（臨時不接就在 Google 日曆放事件也行）");
  return lines;
}

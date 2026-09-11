/**
 * 同事版外掛授權碼 —— 純邏輯（不碰資料庫），給 ext-license.ts 與 scripts/check-ext-license.mjs 共用。
 *
 * 2026-09-11 他說的：「提供給同事的檔案請設定在 9/20 後失效，我要綁定不可以外流」。
 * 做法：一人一組授權碼（後台 /admin/post591/keys 產生），外掛啟動與上架前向 weikaihouse.com 驗證；
 * 第一次驗證成功就綁在那台 Chrome 的安裝編號上，別台 Chrome 拿同一組碼會被擋（bound_elsewhere）。
 * 到期日預設 2026-09-20（台灣時間當天結束），後台可延長／停用／解除綁定（同事換電腦或重裝時）。
 *
 * ⚠️ 擋的是「檔案轉傳就能用」，不是防駭：外掛是明碼 JS，懂程式的人拆得掉；對象是不會寫程式的同事。
 * ⚠️ 1.4.0 以前發出去的 zip 沒有這道檢查、也不會連伺服器，收不回來 —— 要請同事換新版。
 */

/** 第一批的到期日（台灣日期）。「9/20 後失效」＝ 9/21 00:00 台灣時間起擋 */
export const LICENSE_DEFAULT_EXPIRES = "2026-09-20";

/**
 * 新增授權碼時表單預設的到期日：9/20 還沒到就一律 9/20（第一批統一截止）；
 * 9/20 當天起改成「今天＋30 天」—— 不然表單預設一個過去的日期，他忘了改就會發出一組當場到期的碼。
 * 他在後台可以改成任何日期；到期後不用換檔案，改那一列的到期日就好。
 */
export function defaultExpiresDate(now: Date = new Date()): string {
  const today = taiwanDate(now);
  if (today < LICENSE_DEFAULT_EXPIRES) return LICENSE_DEFAULT_EXPIRES;
  return taiwanDate(new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000));
}

/** 授權碼長相 WK-XXXX-XXXX-XXXX；字母表去掉 0/O/1/I，用 LINE 傳、用唸的都不會搞混 */
export const LICENSE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const LICENSE_KEY_RE = /^WK-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;

export type LicenseRecord = {
  id: string;
  key: string;
  /** 同事姓名（後台看得懂是誰就好，不是聯絡人欄位） */
  name: string;
  /** 綁定的 Chrome 安裝編號（外掛端 crypto.randomUUID()）；null = 還沒啟用 */
  installId: string | null;
  boundAt: Date | null;
  lastSeenAt: Date | null;
  lastVersion: string | null;
  /** 伺服器成功驗證的次數（開外掛頁、上架、填表前都可能驗；快取 6 小時，所以不是精確的操作數） */
  verifyCount: number;
  /** 按「上架到 591／樂屋」的次數：外掛按上架時一定回報一次（event=launch），這才是「有沒有在用」的數字 */
  launchCount: number;
  lastLaunchAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
};

export type LicenseReason = "no_key" | "revoked" | "expired" | "bound_elsewhere";
export type LicenseDecision = { ok: true; bind: boolean } | { ok: false; reason: LicenseReason };

/** 產一組授權碼。rand 由呼叫端給（正式用 crypto.randomBytes，測試用固定值） */
export function generateLicenseKey(rand: (n: number) => Uint8Array): string {
  const bytes = rand(12);
  let body = "";
  for (let i = 0; i < 12; i++) body += LICENSE_ALPHABET[bytes[i] % LICENSE_ALPHABET.length];
  return `WK-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
}

/** 同事貼進來的碼先整理：小寫、全形、多的空白、奇怪的連字號 → 統一成 WK-XXXX-XXXX-XXXX；整理不出來就原樣大寫回去 */
export function normalizeLicenseKey(raw: string): string {
  const s = String(raw || "")
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)) // 全形英數 → 半形
    .toUpperCase()
    .replace(/[\s　]/g, "")
    .replace(/[－–—−_]/g, "-");
  const m = s.replace(/-/g, "").match(/^WK([A-Z0-9]{12})$/);
  if (!m) return s;
  const b = m[1];
  return `WK-${b.slice(0, 4)}-${b.slice(4, 8)}-${b.slice(8, 12)}`;
}

/** 時刻 → 台灣日期 YYYY-MM-DD（後台與外掛顯示用） */
export function taiwanDate(d: Date): string {
  return new Date(d.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** 台灣日期 YYYY-MM-DD → 那一天結束（台灣 23:59:59）的時刻。不是合法日期就回 null */
export function taiwanDateEnd(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const d = new Date(`${date}T15:59:59.000Z`);
  return Number.isNaN(d.getTime()) || taiwanDate(d) !== date ? null : d;
}

/** 安裝編號：外掛端是 crypto.randomUUID()，這裡只擋亂七八糟的東西 */
export function isValidInstallId(s: string): boolean {
  return /^[A-Za-z0-9-]{8,64}$/.test(s);
}

/**
 * 判定。順序有意義：停用優先於過期，過期優先於綁定 ——
 * 一組被停用又綁在別台的碼，同事看到的理由應該是「停用」，不是「綁在別台」。
 */
export function decideLicense(row: LicenseRecord | null, installId: string, now: Date = new Date()): LicenseDecision {
  if (!row) return { ok: false, reason: "no_key" };
  if (row.revokedAt) return { ok: false, reason: "revoked" };
  if (now.getTime() > row.expiresAt.getTime()) return { ok: false, reason: "expired" };
  if (!row.installId) return { ok: true, bind: true };
  if (row.installId === installId) return { ok: true, bind: false };
  return { ok: false, reason: "bound_elsewhere" };
}

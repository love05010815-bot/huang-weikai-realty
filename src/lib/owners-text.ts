/**
 * 屋主建檔的純文字工具 —— **沒有任何 import**，客戶端元件可以直接用。
 *
 * 跟 lib/owners.ts 分開的理由：那支 import 了 Prisma（`@/lib/db`），
 * 客戶端元件只要從它拿一支小函式，整個 Prisma 就會被拖進瀏覽器 bundle、build 直接炸。
 * tsc 不會抓這種錯，要等 `next build` 才知道。
 */

/**
 * 切字串但不切壞 emoji（跟 posts.ts／videos.ts 的 cut 同一支）。
 * `slice` 按 UTF-16 單位切，emoji 占兩個單位，切在中間 Prisma 會丟
 * `unexpected end of hex escape`、整筆存不進去，訊息完全看不出跟 emoji 有關。
 */
export function cut(s: string, n: number): string {
  const clean = s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
  const out = clean.slice(0, n);
  return /[\uD800-\uDBFF]$/.test(out) ? out.slice(0, -1) : out;
}

/** 標籤欄：逗號／頓號／分號／空白都當分隔，去重、去空 */
export function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  for (const t of raw.split(/[,，、;；\s]+/)) {
    const v = t.trim();
    if (v && !seen.has(v)) seen.add(v);
  }
  return [...seen];
}

/**
 * 電話只留數字，搜尋與 tel: 連結用：「0912-345-678」「0912 345 678」「(04)2626-1234」都要對得起來。
 * 存進資料庫的還是他打的原樣（顯示用），這支只拿來比對。
 */
export function phoneDigits(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D+/g, "");
}

/** "YYYY-MM-DD" 往後推 n 天（可為負），一樣用字串算，不繞去本地時區 */
export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 兩個 "YYYY-MM-DD" 差幾天（to - from），同一天是 0 */
export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/** 合約到期提醒的一句話：「剩 N 天」「今天到期」「已過期 N 天」 */
export function contractDueLabel(today: string, contractEnd: string): string {
  const n = daysBetween(today, contractEnd);
  if (n > 0) return `剩 ${n} 天`;
  if (n === 0) return "今天到期";
  return `已過期 ${-n} 天`;
}

export type ContractReminderItem = {
  ownerId: string;
  ownerName: string;
  ownerPhone: string | null;
  address: string;
  community: string | null;
  contractNo: string | null;
  contractStart: string | null;
  contractEnd: string;
};

/**
 * 推給專員的 LINE 文字。幾筆合在一則裡，不要一筆一則——官方帳號每月免費額度只有 200 則。
 * 每一件自己帶一條連結、直接點進「那位屋主」（?owner=id 展開那張卡），
 * 不要一條共用連結丟回整頁列表——他說點進去還要自己找到是哪個物件到期，等於白點。
 * 連結帶 openExternalBrowser=1：他都從 LINE 點，沒這個參數會卡在 LINE 內建瀏覽器的 Google 登入。
 */
export function buildContractReminderText(today: string, items: ContractReminderItem[], siteUrl: string): string {
  // 合約日期用民國（2026-10-13 他要的），跟後台畫面一致
  const fmt = (d: string | null) => (d ? toRoc(d) : "？");
  const base = `${siteUrl.replace(/\/$/, "")}/admin/owners?openExternalBrowser=1`;
  const lines: string[] = [`📄 委託合約到期提醒（${items.length} 件）`, ""];
  for (const it of items) {
    lines.push(`▍${it.ownerName}${it.ownerPhone ? `｜${it.ownerPhone}` : ""}`);
    lines.push(`${it.community ? `${it.community}｜` : ""}${it.address}`);
    lines.push(`合約${it.contractNo ? ` ${it.contractNo}` : ""}：${fmt(it.contractStart)} ～ ${fmt(it.contractEnd)}（${contractDueLabel(today, it.contractEnd)}）`);
    lines.push(`查看屋主建檔：${base}&owner=${encodeURIComponent(it.ownerId)}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

// ---------------------------------------------------------------- 民國年（2026-10-13 他要生日與合約日期改民國）

/** "2026-03-31" → "115/03/31"；不是合法 ISO 日期就原樣回（不要讓畫面因為一筆壞資料掛掉） */
export function toRoc(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const y = Number(m[1]) - 1911;
  if (y < 1) return iso;
  return `${y}/${m[2]}/${m[3]}`;
}

/**
 * 他手打的日期 → ISO "YYYY-MM-DD"。收：
 *   民國「115/3/31」「115-03-31」「115.3.31」「1150331」「民國115年3月31日」
 *   西元「2026/3/31」「2026-03-31」「20260331」「2026年3月31日」
 * 三位數以下的年當民國、四位數當西元。拆不出來或日期不合法回 null。空字串回 ""。
 */
export function parseDateInput(raw: string): string | null {
  const s = (raw ?? "").trim().replace(/^民國/, "").replace(/[年月]/g, "/").replace(/日$/, "");
  if (!s) return "";
  let y: number, m: number, d: number;
  const sep = /^(\d{2,4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/.exec(s);
  const compact = /^(\d{7}|\d{8})$/.exec(s);
  if (sep) {
    y = Number(sep[1]);
    m = Number(sep[2]);
    d = Number(sep[3]);
  } else if (compact) {
    const t = compact[1];
    const yl = t.length - 4;
    y = Number(t.slice(0, yl));
    m = Number(t.slice(yl, yl + 2));
    d = Number(t.slice(yl + 2));
  } else {
    return null;
  }
  if (y < 1000) y += 1911;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  // 2/30 這種要擋：用 UTC 組回去再比一次
  const check = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

// ---------------------------------------------------------------- 同名屋主警示（2026-10-13 他要的）

/** 比對用：去頭尾、去掉所有空白（含全形）、英文轉小寫 */
export function normalizeName(s: string | null | undefined): string {
  return (s ?? "").replace(/[\s　]+/g, "").toLowerCase();
}

export type OwnerIdentity = { id: string; name: string; phone: string | null; phone2?: string | null };
export type DuplicateHit = { id: string; name: string; phone: string | null; reason: "name" | "phone" };

/**
 * 在既有屋主裡找「同名」或「同電話」的。同名是他要的；同電話順便（更準）。
 * excludeId：編輯自己時不要把自己算進去。只比對到有值的欄位——空電話不會跟空電話「相同」。
 */
export function findDuplicateOwners(
  existing: OwnerIdentity[],
  name: string,
  phone: string,
  excludeId: string | null = null,
): DuplicateHit[] {
  const n = normalizeName(name);
  const p = phoneDigits(phone);
  const out: DuplicateHit[] = [];
  for (const o of existing) {
    if (excludeId && o.id === excludeId) continue;
    if (n && normalizeName(o.name) === n) {
      out.push({ id: o.id, name: o.name, phone: o.phone, reason: "name" });
      continue;
    }
    if (p.length >= 8 && (phoneDigits(o.phone) === p || phoneDigits(o.phone2) === p)) {
      out.push({ id: o.id, name: o.name, phone: o.phone, reason: "phone" });
    }
  }
  return out;
}

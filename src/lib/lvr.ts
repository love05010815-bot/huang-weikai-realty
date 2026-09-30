/**
 * 📈 海線實價登錄 —— 資料庫層與同步流程
 *
 * 前台 `/lvr` 讓客戶看梧棲、清水、沙鹿、龍井四區內政部最新一期的成交，資料每天同步一次
 * （`/api/lvr/daily`，Vercel cron 台北 10:00 ＋ keep-warm 備援），存進 `lvr_deal`。
 * 解析是純函式，在 `lvr-parse.ts`；這裡只管「抓、存、查」。
 *
 * ## 資料只會累積、不會刪
 *
 * 內政部同一筆成交在後續期別可能修正（例如補備註），所以一律 upsert：主鍵是官方編號，
 * 撞到就整列更新，只有 `first_seen`（第一次看到的日期）不動。**沒有任何 DELETE**。
 *
 * ## 「本期」怎麼定義
 *
 * 官方檔沒有「登錄日期」欄位，只有交易日。每一列存 `batch`：本期／前期 zip 抓到的存成
 * 「登記 115/9/1–9/10」這種標籤（從 build_time.xml 的期程文字算），季度回填的存季別（115S2）。
 * 畫面上「本期新增」＝ batch 等於最近一次成功同步的標籤。補前期在本期之前跑、季度回填在最前，
 * 同一筆最後會被本期同步蓋成本期標籤，所以順序不用擔心。
 *
 * ## 三種來源
 *
 * - `current`        本期 zip（約 2MB），每天抓
 * - `hist:20260701`  前期 zip（每旬一個、約 14MB），本期同步時自動補漏掉的旬（一次最多兩旬）
 * - `115S2`          季度 zip（約 14MB），只給 `npm run backfill:lvr` 回填歷史用；當季結束後要再等一陣子才會有
 *
 * ## ⚠️ 連線紀律（同 news.ts／post-views.ts）
 *
 * Vercel 上 pool 只有 3 條。建表只在撞到 1146 才做；P2024／P1017 退一步重試一次。
 * 讀取失敗一律回空值，不要讓前台 500。
 */
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { taipeiDay } from "@/lib/site-visits";
import {
  LVR_CURRENT_ZIP_URL,
  LVR_DISTRICTS,
  LVR_HISTORY_LIST_URL,
  categorize,
  lvrHistoryZipUrl,
  lvrSeasonZipUrl,
  noteFlags,
  parseHistoryList,
  parseLvrZip,
  salePeriodRange,
  type LvrCategory,
  type LvrDeal,
  type LvrKind,
} from "@/lib/lvr-parse";

// ---------------------------------------------------------------- 設定

/** 每日自動同步最早幾點跑（台北時間）。官方新一期多在早上放出來，10 點抓保守一點。 */
export const LVR_START_HOUR = 10;
/** 一天最多自動嘗試幾次（失敗的也算），免得每 10 分鐘撞一次外部站 */
const MAX_AUTO_ATTEMPTS = 3;
/** 一次 running 超過這麼久沒結束就當它死了 */
const STALE_RUNNING_MS = 10 * 60_000;
/** 下載 zip 的時間上限。本期 2MB 幾秒就好；季度 14MB 留寬一點。 */
const FETCH_TIMEOUT_MS = 45_000;
/** 一句 INSERT 塞幾列（每列 28 個參數） */
const UPSERT_BATCH = 60;

// ---------------------------------------------------------------- 小工具

function errorText(error: unknown): string {
  return String((error as { message?: string })?.message ?? error);
}

function isConnectionError(error: unknown): boolean {
  const t = errorText(error);
  return (
    t.includes("Timed out fetching a new connection") ||
    t.includes("Server has closed the connection") ||
    t.includes("P2024") ||
    t.includes("P1017")
  );
}

function isMissingTable(error: unknown): boolean {
  const t = errorText(error);
  return t.includes("1146") || /doesn.t exist/i.test(t);
}

async function withRetry<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!isConnectionError(error)) throw error;
    await new Promise((r) => setTimeout(r, 350));
    return run();
  }
}

async function withSchema<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await withRetry(run);
  } catch (error) {
    if (!isMissingTable(error)) throw error;
    await ensureLvrTables();
    return withRetry(run);
  }
}

/** ⚠️ TiDB 的 SUM／COUNT／DECIMAL 經 Prisma 會變字串或 bigint，一律轉 */
function toNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "bigint") return Number(v);
  const n = Number(String(v));
  return Number.isFinite(n) ? n : 0;
}

/** 台北時間 `YYYY-MM-DD HH:MM:SS` */
export function taipeiStamp(d: Date = new Date()): string {
  return new Date(d.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
}

// ---------------------------------------------------------------- 建表

export async function ensureLvrTables(): Promise<void> {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS lvr_deal (
      id               VARCHAR(48)   NOT NULL,
      kind             VARCHAR(8)    NOT NULL,
      district         VARCHAR(8)    NOT NULL,
      target           VARCHAR(32)   NOT NULL DEFAULT '',
      address          VARCHAR(191)  NOT NULL DEFAULT '',
      deal_date        CHAR(10)      NOT NULL,
      floor            VARCHAR(255)  NOT NULL DEFAULT '',
      total_floors     VARCHAR(16)   NOT NULL DEFAULT '',
      building_type    VARCHAR(48)   NOT NULL DEFAULT '',
      main_use         VARCHAR(48)   NOT NULL DEFAULT '',
      built_ym         CHAR(7)       NULL,
      land_area_m2     DECIMAL(12,2) NOT NULL DEFAULT 0,
      building_area_m2 DECIMAL(12,2) NOT NULL DEFAULT 0,
      rooms            SMALLINT UNSIGNED NOT NULL DEFAULT 0,
      halls            SMALLINT UNSIGNED NOT NULL DEFAULT 0,
      baths            SMALLINT UNSIGNED NOT NULL DEFAULT 0,
      has_mgmt         TINYINT(1)    NOT NULL DEFAULT 0,
      has_elevator     TINYINT(1)    NULL,
      total_price      BIGINT        NOT NULL DEFAULT 0,
      unit_price_m2    INT           NULL,
      parking_type     VARCHAR(32)   NOT NULL DEFAULT '',
      parking_area_m2  DECIMAL(12,2) NOT NULL DEFAULT 0,
      parking_price    BIGINT        NOT NULL DEFAULT 0,
      note             TEXT          NULL,
      project_name     VARCHAR(96)   NOT NULL DEFAULT '',
      unit_no          VARCHAR(64)   NOT NULL DEFAULT '',
      cancelled        VARCHAR(64)   NOT NULL DEFAULT '',
      batch            VARCHAR(40)   NOT NULL DEFAULT '',
      first_seen       CHAR(10)      NOT NULL,
      updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_lvr_deal_district_date (district, deal_date),
      KEY idx_lvr_deal_kind_date (kind, deal_date),
      KEY idx_lvr_deal_batch (batch)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS lvr_run (
      id          VARCHAR(36) NOT NULL,
      day         CHAR(10)    NOT NULL,
      trigger_by  VARCHAR(16) NOT NULL,
      source      VARCHAR(16) NOT NULL DEFAULT 'current',
      status      VARCHAR(16) NOT NULL DEFAULT 'running',
      started_ms  BIGINT      NOT NULL,
      finished_ms BIGINT      NULL,
      period_text VARCHAR(255) NOT NULL DEFAULT '',
      batch       VARCHAR(40) NOT NULL DEFAULT '',
      found       INT         NOT NULL DEFAULT 0,
      inserted    INT         NOT NULL DEFAULT 0,
      updated     INT         NOT NULL DEFAULT 0,
      log         TEXT        NULL,
      PRIMARY KEY (id),
      KEY idx_lvr_run_day (day, started_ms),
      KEY idx_lvr_run_status (source, status, finished_ms)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

// ---------------------------------------------------------------- 寫入

const DEAL_COLUMNS = [
  "id",
  "kind",
  "district",
  "target",
  "address",
  "deal_date",
  "floor",
  "total_floors",
  "building_type",
  "main_use",
  "built_ym",
  "land_area_m2",
  "building_area_m2",
  "rooms",
  "halls",
  "baths",
  "has_mgmt",
  "has_elevator",
  "total_price",
  "unit_price_m2",
  "parking_type",
  "parking_area_m2",
  "parking_price",
  "note",
  "project_name",
  "unit_no",
  "cancelled",
  "batch",
  "first_seen",
] as const;

/** ON DUPLICATE KEY 時更新的欄位：除了主鍵與 first_seen 全部蓋 */
const DEAL_UPDATE_SQL = DEAL_COLUMNS.filter((c) => c !== "id" && c !== "first_seen")
  .map((c) => `${c} = VALUES(${c})`)
  .join(", ");

function dealParams(d: LvrDeal, batch: string, firstSeen: string): unknown[] {
  return [
    d.id.slice(0, 48),
    d.kind,
    d.district,
    d.target.slice(0, 32),
    d.address.slice(0, 191),
    d.dealDate,
    d.floor.slice(0, 255),
    d.totalFloors.slice(0, 16),
    d.buildingType.slice(0, 48),
    d.mainUse.slice(0, 48),
    d.builtYm,
    d.landAreaM2,
    d.buildingAreaM2,
    Math.min(65535, d.rooms),
    Math.min(65535, d.halls),
    Math.min(65535, d.baths),
    d.hasMgmt ? 1 : 0,
    d.hasElevator === null ? null : d.hasElevator ? 1 : 0,
    Math.round(d.totalPrice),
    d.unitPriceM2 === null ? null : Math.round(d.unitPriceM2),
    d.parkingType.slice(0, 32),
    d.parkingAreaM2,
    Math.round(d.parkingPrice),
    d.note ? d.note.slice(0, 4000) : null,
    d.projectName.slice(0, 96),
    d.unitNo.slice(0, 64),
    d.cancelled.slice(0, 64),
    batch.slice(0, 40),
    firstSeen,
  ];
}

/** 這批 id 裡哪些已經在庫裡（用來分「新增」與「更新」的數字） */
async function existingIds(ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const rows = await withSchema(() =>
      db.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM lvr_deal WHERE id IN (${chunk.map(() => "?").join(",")})`,
        ...chunk,
      ),
    );
    for (const r of rows) out.add(String(r.id));
  }
  return out;
}

/**
 * 整批 upsert。回傳新增／更新筆數。
 * 同一份檔裡同一個 id 出現兩次（官方偶有），後者蓋前者，避免同一句 INSERT 撞自己。
 */
export async function upsertDeals(
  deals: LvrDeal[],
  batch: string,
): Promise<{ inserted: number; updated: number }> {
  const byId = new Map<string, LvrDeal>();
  for (const d of deals) byId.set(d.id, d);
  const list = [...byId.values()];
  if (!list.length) return { inserted: 0, updated: 0 };

  const had = await existingIds(list.map((d) => d.id));
  const firstSeen = taipeiDay();
  const cols = DEAL_COLUMNS.join(", ");
  const rowSql = `(${DEAL_COLUMNS.map(() => "?").join(",")})`;

  for (let i = 0; i < list.length; i += UPSERT_BATCH) {
    const chunk = list.slice(i, i + UPSERT_BATCH);
    const params: unknown[] = [];
    for (const d of chunk) params.push(...dealParams(d, batch, firstSeen));
    await withSchema(() =>
      db.$executeRawUnsafe(
        `INSERT INTO lvr_deal (${cols}) VALUES ${chunk.map(() => rowSql).join(",")} ON DUPLICATE KEY UPDATE ${DEAL_UPDATE_SQL}`,
        ...params,
      ),
    );
  }
  const inserted = list.filter((d) => !had.has(d.id)).length;
  return { inserted, updated: list.length - inserted };
}

// ---------------------------------------------------------------- 同步紀錄

export type LvrRunStatus = "running" | "success" | "error";
export type LvrRun = {
  id: string;
  day: string;
  trigger: "auto" | "manual";
  source: string;
  status: LvrRunStatus;
  startedMs: number;
  finishedMs: number | null;
  periodText: string;
  batch: string;
  found: number;
  inserted: number;
  updated: number;
  log: string;
};

type RunRow = {
  id: string;
  day: string;
  trigger_by: string;
  source: string;
  status: string;
  started_ms: unknown;
  finished_ms: unknown;
  period_text: string;
  batch: string;
  found: unknown;
  inserted: unknown;
  updated: unknown;
  log: string | null;
};

const RUN_COLUMNS =
  "id, day, trigger_by, source, status, started_ms, finished_ms, period_text, batch, found, inserted, updated, log";

function toRun(r: RunRow): LvrRun {
  const status: LvrRunStatus = r.status === "success" || r.status === "error" ? r.status : "running";
  return {
    id: r.id,
    day: r.day,
    trigger: r.trigger_by === "manual" ? "manual" : "auto",
    source: r.source,
    status,
    startedMs: toNumber(r.started_ms),
    finishedMs: r.finished_ms == null ? null : toNumber(r.finished_ms),
    periodText: r.period_text || "",
    batch: r.batch || "",
    found: toNumber(r.found),
    inserted: toNumber(r.inserted),
    updated: toNumber(r.updated),
    log: r.log || "",
  };
}

async function listRunsForDay(day: string): Promise<LvrRun[]> {
  const rows = await withSchema(() =>
    db.$queryRawUnsafe<RunRow[]>(`SELECT ${RUN_COLUMNS} FROM lvr_run WHERE day = ? ORDER BY started_ms DESC`, day),
  );
  return rows.map(toRun);
}

/** 最近一次「本期」同步成功的紀錄（前台顯示期程與更新時間用）。讀不到回 null。 */
export async function latestSuccessfulSync(): Promise<LvrRun | null> {
  try {
    const rows = await withSchema(() =>
      db.$queryRawUnsafe<RunRow[]>(
        `SELECT ${RUN_COLUMNS} FROM lvr_run WHERE source = 'current' AND status = 'success' ORDER BY finished_ms DESC LIMIT 1`,
      ),
    );
    return rows.length ? toRun(rows[0]) : null;
  } catch (error) {
    console.error("[lvr] 讀不到同步紀錄:", error);
    return null;
  }
}

async function createRun(day: string, trigger: "auto" | "manual", source: string, startedMs: number): Promise<string> {
  const id = randomUUID();
  await withSchema(() =>
    db.$executeRawUnsafe(
      "INSERT INTO lvr_run (id, day, trigger_by, source, status, started_ms) VALUES (?, ?, ?, ?, 'running', ?)",
      id,
      day,
      trigger,
      source,
      startedMs,
    ),
  );
  return id;
}

async function finishRun(
  id: string,
  status: LvrRunStatus,
  data: { periodText: string; batch: string; found: number; inserted: number; updated: number; log: string },
): Promise<void> {
  await withSchema(() =>
    db.$executeRawUnsafe(
      "UPDATE lvr_run SET status = ?, finished_ms = ?, period_text = ?, batch = ?, found = ?, inserted = ?, updated = ?, log = ? WHERE id = ?",
      status,
      Date.now(),
      data.periodText.slice(0, 255),
      data.batch.slice(0, 40),
      data.found,
      data.inserted,
      data.updated,
      data.log.slice(0, 60_000),
      id,
    ),
  );
}

// ---------------------------------------------------------------- 抓取

async function downloadZip(url: string, log: (s: string) => void): Promise<Uint8Array> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: { "user-agent": "Mozilla/5.0 (compatible; weikaihouse.com lvr sync)" },
    });
    if (!res.ok) throw new Error(`下載失敗 HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    log(`下載完成 ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB`);
    return bytes;
  } finally {
    clearTimeout(timer);
  }
}

/** zip 檔頭 `PK\x03\x04`。內政部季度 zip 還沒發布時回的是一頁 HTML「系統訊息」（HTTP 200），不是 404。 */
export function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.byteLength > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/** 前期（每旬）在 lvr_run 的 source 寫法：`hist:20260701`（發布日） */
function historySource(publishDate: string): string {
  return `hist:${publishDate}`;
}

/** 已經成功進庫的前期發布日 */
async function importedHistoryDates(): Promise<Set<string>> {
  const rows = await withSchema(() =>
    db.$queryRawUnsafe<{ source: string }[]>(
      "SELECT DISTINCT source FROM lvr_run WHERE status = 'success' AND source LIKE 'hist:%'",
    ),
  );
  return new Set(rows.map((r) => String(r.source).slice(5)));
}

/** Vercel 一支函式 60 秒；前期 zip 一個約 14MB，一次補兩旬留得住餘裕，其餘明天繼續。 */
const CATCH_UP_PER_RUN = 2;
/** 補抓要在這個時間點之前開始，否則留給本期 */
const CATCH_UP_DEADLINE_MS = 30_000;

/**
 * 補抓漏掉的旬。每日同步只抓「本期」（最新一旬），中間如果有哪一旬沒進庫（上線那天以前的、
 * 或某天同步沒跑成功），從內政部「前期下載」清單（最近一季內每一旬）挑還沒進庫的補回來。
 * 例：2026-09-30 上線時 115S3 的季度 zip 還沒發布，6/11–8/31 那八旬就是靠這裡補的。
 *
 * 每一旬成功就寫一筆 source=`hist:發布日` 的 lvr_run，下次就不會再抓；清單抓不到只記一行、不算錯誤。
 * **要在本期同步之前跑**，這樣本期那批的 batch 標籤最後會被本期蓋成正確的「登記 …」。
 */
async function catchUpHistory(day: string, log: (s: string) => void, startedMs: number, limit: number): Promise<void> {
  if (limit <= 0) return;
  const listRes = await fetch(LVR_HISTORY_LIST_URL, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!listRes.ok) {
    log(`前期清單 HTTP ${listRes.status}，這次不補`);
    return;
  }
  const entries = parseHistoryList(await listRes.text());
  if (!entries.length) {
    log("前期清單解析不到任何一旬（內政部頁面格式可能變了），這次不補");
    return;
  }
  const done = await importedHistoryDates();
  const missing = entries.filter((e) => !done.has(e.publishDate));
  if (!missing.length) return;
  log(`前期清單 ${entries.length} 旬，還沒進庫 ${missing.length} 旬：${missing.map((e) => e.publishDate).join("、")}`);

  let n = 0;
  for (const e of missing) {
    if (n >= limit) {
      log(`這次只補 ${limit} 旬，其餘明天繼續`);
      break;
    }
    if (Date.now() - startedMs > CATCH_UP_DEADLINE_MS) {
      log("時間快用完，其餘明天繼續");
      break;
    }
    n++;
    const runStart = Date.now();
    const bytes = await downloadZip(lvrHistoryZipUrl(e.publishDate), log);
    if (!looksLikeZip(bytes)) {
      log(`${e.publishDate} 回的不是 zip，跳過`);
      continue;
    }
    const runId = await createRun(day, "auto", historySource(e.publishDate), runStart);
    try {
      const { deals, periodText } = parseLvrZip(bytes);
      const batch = batchLabelFromPeriod(periodText || e.periodText, day);
      const { inserted, updated } = await upsertDeals(deals, batch);
      log(`補 ${e.publishDate}「${batch}」：${deals.length} 筆，新增 ${inserted}、更新 ${updated}`);
      await finishRun(runId, "success", { periodText: periodText || e.periodText, batch, found: deals.length, inserted, updated, log: "" });
    } catch (err) {
      await finishRun(runId, "error", { periodText: e.periodText, batch: "", found: 0, inserted: 0, updated: 0, log: errorText(err) });
      throw err;
    }
  }
}

/** 期程文字 → 本期標籤「登記 115/9/1–9/10」。解析不出來就用今天當標籤，至少不會跟季別撞名。 */
export function batchLabelFromPeriod(periodText: string, today: string = taipeiDay()): string {
  const r = salePeriodRange(periodText);
  if (!r) return `期別 ${today}`;
  const from = /(\d+)年(\d+)月(\d+)日/.exec(r.from);
  const to = /(\d+)年(\d+)月(\d+)日/.exec(r.to);
  if (!from || !to) return `期別 ${today}`;
  const toPart = from[1] === to[1] ? `${to[2]}/${to[3]}` : `${to[1]}/${to[2]}/${to[3]}`;
  return `登記 ${from[1]}/${from[2]}/${from[3]}–${toPart}`;
}

export type LvrSyncSource = "current" | `${number}S${1 | 2 | 3 | 4}` | string;

export type LvrSyncOptions = {
  /** "current" 抓本期；"115S2" 這種抓整季（回填用） */
  source: LvrSyncSource;
  /** true = 不管幾點、今天跑過沒都跑（後台／腳本用）。季度回填一律視為 force。 */
  force?: boolean;
  trigger: "auto" | "manual";
  /** 本期同步順帶補幾旬前期（預設 CATCH_UP_PER_RUN；本機腳本可以開大） */
  catchUpLimit?: number;
};

export type LvrSyncOutcome = {
  ran: boolean;
  ok?: boolean;
  reason?: string;
  found?: number;
  inserted?: number;
  updated?: number;
  periodText?: string;
  batch?: string;
  runId?: string;
  ms?: number;
  log?: string[];
};

/**
 * 同步一次。本期（source = "current"）的自動觸發有三道自我限制：
 * 過了 LVR_START_HOUR、今天還沒成功、沒有另一次在跑（也不會一天失敗超過 MAX_AUTO_ATTEMPTS 次）。
 * 所以公開端點誰來打都一樣，一天最多真的抓一次。
 */
export async function syncLvr(opts: LvrSyncOptions): Promise<LvrSyncOutcome> {
  const startedMs = Date.now();
  const day = taipeiDay();
  const hourTaipei = Number(taipeiStamp().slice(11, 13));
  const isCurrent = opts.source === "current";
  const force = opts.force || !isCurrent;

  const runs = await listRunsForDay(day);
  if (runs.some((r) => r.status === "running" && startedMs - r.startedMs < STALE_RUNNING_MS)) {
    return { ran: false, reason: "running" };
  }
  if (!force) {
    if (hourTaipei < LVR_START_HOUR) return { ran: false, reason: "not_due" };
    if (runs.some((r) => r.source === "current" && r.status === "success")) return { ran: false, reason: "done_today" };
    const attempts = runs.filter((r) => r.source === "current" && r.status !== "success").length;
    if (attempts >= MAX_AUTO_ATTEMPTS) return { ran: false, reason: "too_many_errors" };
  }

  const lines: string[] = [];
  const log = (s: string) => lines.push(`[${taipeiStamp().slice(11, 19)}] ${s}`);
  const runId = await createRun(day, opts.trigger, isCurrent ? "current" : String(opts.source), startedMs);

  try {
    if (isCurrent) {
      // 補漏掉的旬（見 catchUpHistory）。它失敗不能拖垮本期同步 —— 本期才是客戶每天要看的。
      try {
        await catchUpHistory(day, log, startedMs, opts.catchUpLimit ?? CATCH_UP_PER_RUN);
      } catch (e) {
        log(`補抓前期失敗（不影響本期）：${errorText(e)}`);
      }
    }
    const url = isCurrent ? LVR_CURRENT_ZIP_URL : lvrSeasonZipUrl(String(opts.source));
    log(`開始下載 ${url}`);
    const zip = await downloadZip(url, log);
    if (!looksLikeZip(zip)) {
      throw new Error(isCurrent ? "內政部回的不是 zip（網站可能在維護）" : `${opts.source} 的季度 zip 內政部還沒發布`);
    }
    const { deals, periodText } = parseLvrZip(zip);
    const batch = isCurrent ? batchLabelFromPeriod(periodText, day) : String(opts.source);
    log(`期程：${periodText || "（檔內沒有期程）"}`);
    log(`四區買賣 ${deals.filter((d) => d.kind === "sale").length} 筆、預售 ${deals.filter((d) => d.kind === "presale").length} 筆；標籤「${batch}」`);
    const { inserted, updated } = await upsertDeals(deals, batch);
    log(`新增 ${inserted}、更新 ${updated}`);
    await finishRun(runId, "success", { periodText, batch, found: deals.length, inserted, updated, log: lines.join("\n") });
    return { ran: true, ok: true, found: deals.length, inserted, updated, periodText, batch, runId, ms: Date.now() - startedMs, log: lines };
  } catch (e) {
    const msg = errorText(e);
    log(`發生錯誤：${msg}`);
    try {
      await finishRun(runId, "error", { periodText: "", batch: "", found: 0, inserted: 0, updated: 0, log: lines.join("\n") });
    } catch {
      // 連紀錄都寫不進去（多半是資料庫連線）—— 錯誤已在回傳值裡
    }
    return { ran: true, ok: false, reason: msg, runId, ms: Date.now() - startedMs, log: lines };
  }
}

// ---------------------------------------------------------------- 前台查詢

export type LvrSort = "date" | "unitDesc" | "unitAsc" | "priceDesc" | "priceAsc";
export const LVR_SORTS: { value: LvrSort; label: string }[] = [
  { value: "date", label: "成交日新→舊" },
  { value: "unitDesc", label: "單價高→低" },
  { value: "unitAsc", label: "單價低→高" },
  { value: "priceDesc", label: "總價高→低" },
  { value: "priceAsc", label: "總價低→高" },
];

export type LvrQuery = {
  district?: string;
  /** 空字串／undefined ＝ 全部房屋（不含土地與純車位） */
  category?: LvrCategory | "";
  q?: string;
  sort?: LvrSort;
  /** 只看本期新增 */
  freshOnly?: boolean;
  page: number;
  pageSize: number;
};

/** 資料表一列（畫面用，欄位已轉成 camelCase 與正確型別） */
export type LvrDealRow = LvrDeal & { batch: string; firstSeen: string };

type DealRow = Record<string, unknown>;

function rowToDeal(r: DealRow): LvrDealRow {
  const s = (k: string) => (r[k] == null ? "" : String(r[k]));
  const elevator = r.has_elevator;
  return {
    id: s("id"),
    kind: (s("kind") === "presale" ? "presale" : "sale") as LvrKind,
    district: s("district"),
    target: s("target"),
    address: s("address"),
    dealDate: s("deal_date"),
    floor: s("floor"),
    totalFloors: s("total_floors"),
    buildingType: s("building_type"),
    mainUse: s("main_use"),
    builtYm: r.built_ym == null ? null : s("built_ym"),
    landAreaM2: toNumber(r.land_area_m2),
    buildingAreaM2: toNumber(r.building_area_m2),
    rooms: toNumber(r.rooms),
    halls: toNumber(r.halls),
    baths: toNumber(r.baths),
    hasMgmt: toNumber(r.has_mgmt) === 1,
    hasElevator: elevator == null ? null : toNumber(elevator) === 1,
    totalPrice: toNumber(r.total_price),
    unitPriceM2: r.unit_price_m2 == null ? null : toNumber(r.unit_price_m2),
    parkingType: s("parking_type"),
    parkingAreaM2: toNumber(r.parking_area_m2),
    parkingPrice: toNumber(r.parking_price),
    note: s("note"),
    projectName: s("project_name"),
    unitNo: s("unit_no"),
    cancelled: s("cancelled"),
    batch: s("batch"),
    firstSeen: s("first_seen"),
  };
}

/** 型態分類 → SQL 條件。跟 lvr-parse.ts 的 categorize() 要對得上。 */
function categoryWhere(category: LvrCategory | "" | undefined): { sql: string; params: unknown[] } {
  const APT = "(building_type LIKE '%住宅大樓%' OR building_type LIKE '%華廈%' OR building_type LIKE '%公寓%' OR building_type LIKE '%套房%')";
  const HOUSE = "building_type LIKE '%透天%'";
  const SHOP =
    "(building_type LIKE '%店面%' OR building_type LIKE '%店鋪%' OR building_type LIKE '%辦公%' OR building_type LIKE '%廠辦%' OR building_type LIKE '%倉庫%' OR building_type LIKE '%工廠%')";
  switch (category) {
    case "apt":
      return { sql: `kind = 'sale' AND target <> '土地' AND ${APT}`, params: [] };
    case "house":
      return { sql: `kind = 'sale' AND target <> '土地' AND ${HOUSE}`, params: [] };
    case "presale":
      return { sql: "kind = 'presale'", params: [] };
    case "shop":
      return { sql: `kind = 'sale' AND target <> '土地' AND ${SHOP}`, params: [] };
    case "land":
      return { sql: "target = '土地'", params: [] };
    case "other":
      return { sql: `kind = 'sale' AND target <> '土地' AND target <> '車位' AND NOT ${APT} AND NOT ${HOUSE} AND NOT ${SHOP}`, params: [] };
    default:
      // 全部房屋：買賣＋預售，不含純土地、純車位
      return { sql: "target <> '土地' AND target <> '車位'", params: [] };
  }
}

function buildWhere(q: LvrQuery, latestBatch: string): { sql: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  const cat = categoryWhere(q.category);
  parts.push(cat.sql);
  params.push(...cat.params);
  if (q.district && (LVR_DISTRICTS as readonly string[]).includes(q.district)) {
    parts.push("district = ?");
    params.push(q.district);
  }
  const kw = (q.q || "").trim();
  if (kw) {
    parts.push("(address LIKE ? OR project_name LIKE ?)");
    params.push(`%${kw}%`, `%${kw}%`);
  }
  if (q.freshOnly && latestBatch) {
    parts.push("batch = ?");
    params.push(latestBatch);
  }
  return { sql: parts.join(" AND "), params };
}

function orderSql(sort: LvrSort | undefined): string {
  switch (sort) {
    case "unitDesc":
      return "unit_price_m2 IS NULL, unit_price_m2 DESC, deal_date DESC";
    case "unitAsc":
      return "unit_price_m2 IS NULL, unit_price_m2 ASC, deal_date DESC";
    case "priceDesc":
      return "total_price DESC, deal_date DESC";
    case "priceAsc":
      return "total_price ASC, deal_date DESC";
    default:
      return "deal_date DESC, first_seen DESC, id DESC";
  }
}

export type LvrListResult = { rows: LvrDealRow[]; total: number };

/**
 * 前台清單。兩趟 query（筆數＋這一頁）。讀失敗回空清單，不丟錯 —— 這頁不能因為資料庫抽風就 500。
 * `latestBatch` 給「只看本期」用，呼叫端從 latestSuccessfulSync() 拿。
 */
export async function listDeals(q: LvrQuery, latestBatch: string): Promise<LvrListResult> {
  const where = buildWhere(q, latestBatch);
  const pageSize = Math.max(1, Math.min(100, q.pageSize));
  const offset = Math.max(0, (q.page - 1) * pageSize);
  try {
    const [countRows, rows] = await Promise.all([
      withSchema(() =>
        db.$queryRawUnsafe<{ n: unknown }[]>(`SELECT COUNT(*) AS n FROM lvr_deal WHERE ${where.sql}`, ...where.params),
      ),
      withSchema(() =>
        db.$queryRawUnsafe<DealRow[]>(
          `SELECT * FROM lvr_deal WHERE ${where.sql} ORDER BY ${orderSql(q.sort)} LIMIT ${pageSize} OFFSET ${offset}`,
          ...where.params,
        ),
      ),
    ]);
    return { rows: rows.map(rowToDeal), total: toNumber(countRows[0]?.n) };
  } catch (error) {
    console.error("[lvr] 清單讀取失敗:", error);
    return { rows: [], total: 0 };
  }
}

// ---------------------------------------------------------------- 各區摘要

export type LvrDistrictStat = {
  district: string;
  /** 近 N 個月的房屋成交筆數（不含土地、純車位） */
  count: number;
  /** 中位數 萬／坪；樣本少於 3 筆回 null */
  aptMedian: number | null;
  aptCount: number;
  houseMedian: number | null;
  houseCount: number;
  presaleMedian: number | null;
  presaleCount: number;
  /** 本期新增筆數 */
  fresh: number;
};

export type LvrStats = { months: number; since: string; districts: LvrDistrictStat[]; totalDeals: number };

const STATS_MONTHS = 6;
const MEDIAN_MIN_SAMPLES = 3;

function median(values: number[]): number | null {
  if (values.length < MEDIAN_MIN_SAMPLES) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const m = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return Math.round(m * 10) / 10;
}

/**
 * 四區近 6 個月摘要：筆數＋各型態單價中位數（萬／坪）。
 * 中位數**排除**備註有親友、法拍等特殊註記的、以及沒有單價的（純土地等）——
 * 那些價格不代表行情，混進去會拉歪。
 * 一趟 query 撈近 6 個月四區全部（幾千列），在 JS 算，比在 SQL 算中位數簡單也好驗。
 */
export async function getDistrictStats(latestBatch: string): Promise<LvrStats> {
  const today = taipeiDay();
  const sinceDate = new Date(Date.parse(`${today}T00:00:00Z`));
  sinceDate.setUTCMonth(sinceDate.getUTCMonth() - STATS_MONTHS);
  const since = sinceDate.toISOString().slice(0, 10);
  const empty: LvrStats = {
    months: STATS_MONTHS,
    since,
    districts: LVR_DISTRICTS.map((d) => ({
      district: d,
      count: 0,
      aptMedian: null,
      aptCount: 0,
      houseMedian: null,
      houseCount: 0,
      presaleMedian: null,
      presaleCount: 0,
      fresh: 0,
    })),
    totalDeals: 0,
  };
  try {
    type R = { district: string; kind: string; target: string; building_type: string; unit_price_m2: unknown; note: string | null };
    const [rows, totalRows, freshRows] = await Promise.all([
      withSchema(() =>
        db.$queryRawUnsafe<R[]>(
          `SELECT district, kind, target, building_type, unit_price_m2, note
             FROM lvr_deal
            WHERE deal_date >= ? AND target <> '土地' AND target <> '車位'`,
          since,
        ),
      ),
      withSchema(() => db.$queryRawUnsafe<{ n: unknown }[]>(`SELECT COUNT(*) AS n FROM lvr_deal`)),
      // 本期新增不受 6 個月窗口限制 —— 預售屋常常簽約好幾年後才登錄，交易日很舊但確實是本期才出現
      latestBatch
        ? withSchema(() =>
            db.$queryRawUnsafe<{ district: string; n: unknown }[]>(
              `SELECT district, COUNT(*) AS n FROM lvr_deal WHERE batch = ? AND target <> '土地' AND target <> '車位' GROUP BY district`,
              latestBatch,
            ),
          )
        : Promise.resolve([] as { district: string; n: unknown }[]),
    ]);
    const buckets = new Map<string, { apt: number[]; house: number[]; presale: number[]; count: number; fresh: number }>();
    for (const d of LVR_DISTRICTS) buckets.set(d, { apt: [], house: [], presale: [], count: 0, fresh: 0 });
    for (const r of freshRows) {
      const b = buckets.get(r.district);
      if (b) b.fresh = toNumber(r.n);
    }
    for (const r of rows) {
      const b = buckets.get(r.district);
      if (!b) continue;
      b.count++;
      const unit = r.unit_price_m2 == null ? null : toNumber(r.unit_price_m2);
      if (!unit) continue;
      if (noteFlags(r.note || "").length) continue;
      const wanPing = unit / 0.3025 / 10_000;
      const cat = categorize({ kind: r.kind === "presale" ? "presale" : "sale", target: r.target, buildingType: r.building_type });
      if (cat === "apt") b.apt.push(wanPing);
      else if (cat === "house") b.house.push(wanPing);
      else if (cat === "presale") b.presale.push(wanPing);
    }
    return {
      months: STATS_MONTHS,
      since,
      totalDeals: toNumber(totalRows[0]?.n),
      districts: LVR_DISTRICTS.map((d) => {
        const b = buckets.get(d)!;
        return {
          district: d,
          count: b.count,
          aptMedian: median(b.apt),
          aptCount: b.apt.length,
          houseMedian: median(b.house),
          houseCount: b.house.length,
          presaleMedian: median(b.presale),
          presaleCount: b.presale.length,
          fresh: b.fresh,
        };
      }),
    };
  } catch (error) {
    console.error("[lvr] 摘要讀取失敗:", error);
    return empty;
  }
}

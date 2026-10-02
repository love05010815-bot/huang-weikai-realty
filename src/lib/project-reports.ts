/**
 * 📄 社區銷售報告書 —— 資料層（表 project_report）
 *
 * 一個建案一份（主鍵 project_id）。內容是 ChatGPT 回的 JSON 經 normalizeReport() 整理後整包存進 data；
 * 狀態只有 draft（前台看不到、/map 不出現入口）與 published。
 *
 * 跟這個專案其他表同一套：raw SQL、CREATE TABLE IF NOT EXISTS、首次用到自動建表、沒有 prisma model。
 * 對外的讀取（/map 入口、報告書頁、sitemap）**讀不到一律回空**，不丟例外 ——
 * 資料庫抽風不該讓 /map 整頁開天窗。後台的讀取讓錯誤往上丟，頁面會印出來。
 *
 * 純規則（型別、解析、合併）在 lib/project-report.ts；這裡只管存取。
 */

import { db } from "@/lib/db";
import { normalizeReport, type ReportData } from "@/lib/project-report";

export type ReportStatus = "draft" | "published";

export type ReportRecord = {
  projectId: string;
  status: ReportStatus;
  data: ReportData;
  /** 誰產的內容。目前只有「ChatGPT（自己貼）」 */
  model: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  publishedAt: Date | null;
};

/** 跟待產文案那邊同一個字（news_draft.model 也記這個） */
export const REPORT_MODEL_MANUAL = "ChatGPT（自己貼）";

let ensured = false;

export async function ensureProjectReportTable(): Promise<void> {
  if (ensured) return;
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS project_report (
      project_id   VARCHAR(64)  NOT NULL,
      status       VARCHAR(16)  NOT NULL DEFAULT 'draft',
      data         LONGTEXT     NOT NULL,
      model        VARCHAR(64)  NOT NULL DEFAULT '',
      created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      published_at DATETIME     NULL,
      PRIMARY KEY (project_id),
      KEY idx_project_report_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  ensured = true;
}

type Row = {
  project_id: string;
  status: string;
  data: string;
  model: string;
  created_at: Date | null;
  updated_at: Date | null;
  published_at: Date | null;
};

const SELECT = `SELECT project_id, status, data, model, created_at, updated_at, published_at FROM project_report`;

/** JSON 壞掉的那一筆回 null、跳過，不要讓整個清單掛掉 */
function toRecord(r: Row): ReportRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(r.data);
  } catch {
    return null;
  }
  return {
    projectId: r.project_id,
    status: r.status === "published" ? "published" : "draft",
    data: normalizeReport(parsed),
    model: r.model,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    publishedAt: r.published_at,
  };
}

/** 後台用：全部，含草稿。錯誤往上丟。 */
export async function listReports(): Promise<ReportRecord[]> {
  await ensureProjectReportTable();
  const rows = await db.$queryRawUnsafe<Row[]>(`${SELECT} ORDER BY updated_at DESC`);
  return rows.map(toRecord).filter((x): x is ReportRecord => x !== null);
}

/** 後台用：某一建案的那份（含草稿）。 */
export async function getReport(projectId: string): Promise<ReportRecord | null> {
  await ensureProjectReportTable();
  const rows = await db.$queryRawUnsafe<Row[]>(`${SELECT} WHERE project_id = ? LIMIT 1`, projectId);
  return rows[0] ? toRecord(rows[0]) : null;
}

/** 前台用：只回已發佈的；讀不到回 null。 */
export async function getPublishedReport(projectId: string): Promise<ReportRecord | null> {
  try {
    await ensureProjectReportTable();
    const rows = await db.$queryRawUnsafe<Row[]>(`${SELECT} WHERE project_id = ? AND status = 'published' LIMIT 1`, projectId);
    return rows[0] ? toRecord(rows[0]) : null;
  } catch {
    return null;
  }
}

/** 前台用（/map 的入口、sitemap）：已發佈的建案 id 與更新時間；讀不到回空陣列。 */
export async function listPublishedReports(): Promise<Array<{ projectId: string; updatedAt: Date | null }>> {
  try {
    await ensureProjectReportTable();
    const rows = await db.$queryRawUnsafe<Array<{ project_id: string; updated_at: Date | null }>>(
      `SELECT project_id, updated_at FROM project_report WHERE status = 'published'`,
    );
    return rows.map((r) => ({ projectId: r.project_id, updatedAt: r.updated_at }));
  } catch {
    return [];
  }
}

/**
 * 存一份（有就蓋、沒有就新增）。發佈時間只在第一次變成 published 時寫，之後重存不動它 ——
 * 落款要的是「這份第一次給客戶看的時間」，不是每次修字的時間。
 */
export async function saveReport(projectId: string, data: ReportData, status: ReportStatus, model: string): Promise<void> {
  await ensureProjectReportTable();
  const json = JSON.stringify(data);
  await db.$executeRawUnsafe(
    `INSERT INTO project_report (project_id, status, data, model, published_at)
     VALUES (?, ?, ?, ?, ${status === "published" ? "CURRENT_TIMESTAMP" : "NULL"})
     ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       data = VALUES(data),
       model = VALUES(model),
       published_at = CASE
         WHEN VALUES(status) = 'published' THEN COALESCE(published_at, CURRENT_TIMESTAMP)
         ELSE published_at
       END`,
    projectId,
    status,
    json,
    model,
  );
}

export async function setReportStatus(projectId: string, status: ReportStatus): Promise<void> {
  await ensureProjectReportTable();
  await db.$executeRawUnsafe(
    `UPDATE project_report
        SET status = ?,
            published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, CURRENT_TIMESTAMP) ELSE published_at END
      WHERE project_id = ?`,
    status,
    status,
    projectId,
  );
}

export async function deleteReport(projectId: string): Promise<void> {
  await ensureProjectReportTable();
  await db.$executeRawUnsafe(`DELETE FROM project_report WHERE project_id = ?`, projectId);
}

/**
 * 同事版外掛授權碼 —— 資料庫這一層。純邏輯（判定、日期、碼的格式）在 ext-license-core.ts。
 *
 * 表 ext_license 跟 site_video 同一套作法：第一次撞到「表不存在」(1146) 才 CREATE TABLE IF NOT EXISTS，
 * 不在冷啟動無條件跑（多佔一條稀缺連線）。存的是同事姓名、授權碼、安裝編號（隨機 UUID）與時間；
 * 沒有物件資料、沒有客戶個資。時間一律存 UTC（DATETIME），顯示時用 taiwanDate() 換成台灣日期。
 */
import { randomBytes, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  LICENSE_KEY_RE,
  decideLicense,
  generateLicenseKey,
  isValidInstallId,
  normalizeLicenseKey,
  taiwanDate,
  type LicenseReason,
  type LicenseRecord,
} from "@/lib/ext-license-core";

export * from "@/lib/ext-license-core";

type Row = {
  id: string;
  license_key: string;
  name: string;
  install_id: string | null;
  bound_at: Date | null;
  last_seen_at: Date | null;
  last_version: string | null;
  verify_count: number;
  launch_count: number;
  last_launch_at: Date | null;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
};

const COLS = Prisma.sql`id, license_key, name, install_id, bound_at, last_seen_at, last_version, verify_count, launch_count, last_launch_at, expires_at, revoked_at, created_at`;

function toRecord(r: Row): LicenseRecord {
  return {
    id: r.id,
    key: r.license_key,
    name: r.name,
    installId: r.install_id,
    boundAt: r.bound_at,
    lastSeenAt: r.last_seen_at,
    lastVersion: r.last_version,
    verifyCount: Number(r.verify_count || 0),
    launchCount: Number(r.launch_count || 0),
    lastLaunchAt: r.last_launch_at,
    expiresAt: r.expires_at,
    revokedAt: r.revoked_at,
    createdAt: r.created_at,
  };
}

function errText(error: unknown): string {
  return String((error as { message?: string })?.message ?? error);
}

function isMissingTable(error: unknown): boolean {
  const text = errText(error);
  return text.includes("1146") || /doesn.t exist/i.test(text);
}

/** 「Unknown column」（MySQL 1054）：表早就在正式庫，後來加的欄位不會自己長出來，撞到就補欄位再重試 */
function isMissingColumn(error: unknown): boolean {
  const text = errText(error);
  return text.includes("1054") || /unknown column/i.test(text);
}

function needsSchemaFix(error: unknown): boolean {
  return isMissingTable(error) || isMissingColumn(error);
}

export async function ensureLicenseTable(): Promise<void> {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ext_license (
      id             VARCHAR(36)  NOT NULL,
      license_key    VARCHAR(24)  NOT NULL,
      name           VARCHAR(80)  NOT NULL,
      install_id     VARCHAR(64)  NULL,
      bound_at       DATETIME     NULL,
      last_seen_at   DATETIME     NULL,
      last_version   VARCHAR(16)  NULL,
      verify_count   INT          NOT NULL DEFAULT 0,
      launch_count   INT          NOT NULL DEFAULT 0,
      last_launch_at DATETIME     NULL,
      expires_at     DATETIME     NOT NULL,
      revoked_at     DATETIME     NULL,
      created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY ext_license_key_uq (license_key)
    )
  `);
  // ⚠️ CREATE TABLE IF NOT EXISTS 對既有的表什麼都不做 —— 表在 1.5.0 那天就建在正式庫了（沒有這三欄），
  //    先 SHOW COLUMNS 再 ALTER，重複跑不會炸；兩個請求同時補到同一欄，後到的吃 1060 也當沒事。
  for (const [column, ddl] of [
    ["verify_count", "ADD COLUMN verify_count INT NOT NULL DEFAULT 0 AFTER last_version"],
    ["launch_count", "ADD COLUMN launch_count INT NOT NULL DEFAULT 0 AFTER verify_count"],
    ["last_launch_at", "ADD COLUMN last_launch_at DATETIME NULL AFTER launch_count"],
  ] as const) {
    const existing = await db.$queryRawUnsafe<unknown[]>(`SHOW COLUMNS FROM ext_license LIKE ?`, column);
    if (existing.length === 0) {
      try {
        await db.$executeRawUnsafe(`ALTER TABLE ext_license ${ddl}`);
      } catch (error) {
        if (!/1060|duplicate column/i.test(errText(error))) throw error;
      }
    }
  }
}

/** 表不存在（1146）或少欄位（1054）就補一次再重跑；其他錯誤照丟 */
async function ensureThenRun<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!needsSchemaFix(error)) throw error;
    await ensureLicenseTable();
    return run();
  }
}

export async function listLicenses(): Promise<LicenseRecord[]> {
  return ensureThenRun(async () => {
    const rows = await db.$queryRaw<Row[]>`SELECT ${COLS} FROM ext_license ORDER BY created_at DESC`;
    return rows.map(toRecord);
  });
}

export async function findLicenseByKey(key: string): Promise<LicenseRecord | null> {
  return ensureThenRun(async () => {
    const rows = await db.$queryRaw<Row[]>`SELECT ${COLS} FROM ext_license WHERE license_key = ${key} LIMIT 1`;
    return rows.length ? toRecord(rows[0]) : null;
  });
}

export async function createLicense(name: string, expiresAt: Date): Promise<LicenseRecord> {
  const cleanName = name.trim().slice(0, 80);
  if (!cleanName) throw new Error("同事姓名不能空白");
  return ensureThenRun(async () => {
    // 60 bits 的隨機碼撞到的機率趨近於零，但 UNIQUE 真撞到就再產一組
    for (let attempt = 0; attempt < 3; attempt++) {
      const id = randomUUID();
      const key = generateLicenseKey((n) => randomBytes(n));
      try {
        await db.$executeRaw`INSERT INTO ext_license (id, license_key, name, expires_at) VALUES (${id}, ${key}, ${cleanName}, ${expiresAt})`;
      } catch (error) {
        if (attempt < 2 && /1062|duplicate/i.test(errText(error))) continue;
        throw error;
      }
      const row = await findLicenseByKey(key);
      if (!row) throw new Error("剛建立的授權碼讀不回來");
      return row;
    }
    throw new Error("授權碼產生失敗，再按一次");
  });
}

export async function setLicenseRevoked(id: string, revoked: boolean): Promise<void> {
  await ensureThenRun(() =>
    revoked
      ? db.$executeRaw`UPDATE ext_license SET revoked_at = ${new Date()} WHERE id = ${id} AND revoked_at IS NULL`
      : db.$executeRaw`UPDATE ext_license SET revoked_at = NULL WHERE id = ${id}`,
  );
}

/** 同事換電腦或重裝 Chrome：清掉綁定，讓他再填一次就綁到新的那台 */
export async function unbindLicense(id: string): Promise<void> {
  await ensureThenRun(() => db.$executeRaw`UPDATE ext_license SET install_id = NULL, bound_at = NULL WHERE id = ${id}`);
}

export async function setLicenseExpires(id: string, expiresAt: Date): Promise<void> {
  await ensureThenRun(() => db.$executeRaw`UPDATE ext_license SET expires_at = ${expiresAt} WHERE id = ${id}`);
}

export async function deleteLicense(id: string): Promise<void> {
  await ensureThenRun(() => db.$executeRaw`DELETE FROM ext_license WHERE id = ${id}`);
}

export type VerifyResult =
  | { ok: true; name: string; expiresAt: string; expiresText: string; bound: boolean }
  | { ok: false; reason: LicenseReason | "bad_request"; expiresAt?: string; expiresText?: string };

/**
 * 外掛打來驗證：整理碼 → 找 → 判定 → ok 就記錄最後使用時間（第一次順便綁定）。
 * 不 ok 也把到期日一起回去，外掛離線時拿它當本機硬上限。
 * event＝"launch" 是外掛按「上架」那一次帶的，順便 launch_count +1 —— 後台「有幾個人在用」看的就是這個。
 */
export async function verifyLicense(input: { key: string; installId: string; version: string; event?: string }): Promise<VerifyResult> {
  const key = normalizeLicenseKey(input.key);
  const installId = String(input.installId || "").trim();
  if (!LICENSE_KEY_RE.test(key)) return { ok: false, reason: "no_key" };
  if (!isValidInstallId(installId)) return { ok: false, reason: "bad_request" };

  const row = await findLicenseByKey(key);
  if (!row) return { ok: false, reason: "no_key" };
  const now = new Date();
  const expiry = { expiresAt: row.expiresAt.toISOString(), expiresText: taiwanDate(row.expiresAt) };
  const decision = decideLicense(row, installId, now);
  if (!decision.ok) return { ok: false, reason: decision.reason, ...expiry };

  const version = String(input.version || "").slice(0, 16);
  const isLaunch = input.event === "launch";
  // 每次成功驗證 verify_count +1；按上架那一次外掛帶 event=launch，順便記上架次數與時間
  const bump = Prisma.sql`verify_count = verify_count + 1${isLaunch ? Prisma.sql`, launch_count = launch_count + 1, last_launch_at = ${now}` : Prisma.empty}`;
  if (decision.bind) {
    // 兩台同時搶著綁：靠 install_id IS NULL 只讓一台成功，沒搶到的重讀一次照規則判
    const changed = await ensureThenRun(
      () => db.$executeRaw`UPDATE ext_license SET install_id = ${installId}, bound_at = ${now}, last_seen_at = ${now}, last_version = ${version}, ${bump}
                            WHERE id = ${row.id} AND install_id IS NULL`,
    );
    if (changed === 0) {
      const again = await findLicenseByKey(key);
      const d2 = decideLicense(again, installId, now);
      if (!d2.ok) return { ok: false, reason: d2.reason, ...expiry };
    }
  } else {
    await ensureThenRun(() => db.$executeRaw`UPDATE ext_license SET last_seen_at = ${now}, last_version = ${version}, ${bump} WHERE id = ${row.id}`);
  }
  return { ok: true, name: row.name, ...expiry, bound: decision.bind };
}

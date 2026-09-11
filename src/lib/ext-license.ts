/**
 * 同事版外掛授權碼 —— 資料庫這一層。純邏輯（判定、日期、碼的格式）在 ext-license-core.ts。
 *
 * 兩張表，跟 site_video 同一套作法：第一次撞到「表不存在」(1146) 或「少欄位」(1054) 才補，不在冷啟動無條件跑。
 *   ext_license          一組碼一列：名稱（批次）、碼、電腦數上限、到期、停用、總計數
 *   ext_license_install  一台 Chrome 一列：安裝編號（外掛端隨機 UUID）、首次／最近、上架次數 —— 不記名字
 * 沒有物件資料、沒有客戶個資。時間一律存 UTC（DATETIME），顯示時用 taiwanDate() 換成台灣日期。
 *
 * 歷史：1.5.0～1.5.2（2026-09-11 上午）是「一人一組、綁第一台」，綁定存在 ext_license.install_id；
 * 下午他改成「一批共用一組」，舊的綁定在 ensureLicenseTable() 一次性搬進 install 表，install_id／bound_at 兩欄留著不用。
 */
import { randomBytes, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  LICENSE_DEFAULT_MAX_INSTALLS,
  LICENSE_KEY_RE,
  decideLicense,
  generateLicenseKey,
  isValidInstallId,
  normalizeLicenseKey,
  normalizeMaxInstalls,
  taiwanDate,
  type LicenseReason,
  type LicenseRecord,
} from "@/lib/ext-license-core";

export * from "@/lib/ext-license-core";

type Row = {
  id: string;
  license_key: string;
  name: string;
  max_installs: number;
  installs: bigint | number;
  launched_installs: bigint | number;
  last_seen_at: Date | null;
  last_version: string | null;
  verify_count: number;
  launch_count: number;
  last_launch_at: Date | null;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
};

/** 一列碼＋兩個子查詢（幾台登記、幾台上架過）。COUNT(*) 回來是 bigint，toRecord 轉 Number */
const SELECT = Prisma.sql`
  SELECT l.id, l.license_key, l.name, l.max_installs, l.last_seen_at, l.last_version, l.verify_count, l.launch_count, l.last_launch_at,
         l.expires_at, l.revoked_at, l.created_at,
         (SELECT COUNT(*) FROM ext_license_install i WHERE i.license_id = l.id) AS installs,
         (SELECT COUNT(*) FROM ext_license_install i WHERE i.license_id = l.id AND i.launch_count > 0) AS launched_installs
  FROM ext_license l`;

function toRecord(r: Row): LicenseRecord {
  return {
    id: r.id,
    key: r.license_key,
    name: r.name,
    installs: Number(r.installs || 0),
    launchedInstalls: Number(r.launched_installs || 0),
    maxInstalls: Number(r.max_installs || LICENSE_DEFAULT_MAX_INSTALLS),
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

export type InstallRecord = {
  id: string;
  licenseId: string;
  installId: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  lastVersion: string | null;
  verifyCount: number;
  launchCount: number;
  lastLaunchAt: Date | null;
};

type InstallRow = {
  id: string;
  license_id: string;
  install_id: string;
  first_seen_at: Date;
  last_seen_at: Date;
  last_version: string | null;
  verify_count: number;
  launch_count: number;
  last_launch_at: Date | null;
};

function toInstall(r: InstallRow): InstallRecord {
  return {
    id: r.id,
    licenseId: r.license_id,
    installId: r.install_id,
    firstSeenAt: r.first_seen_at,
    lastSeenAt: r.last_seen_at,
    lastVersion: r.last_version,
    verifyCount: Number(r.verify_count || 0),
    launchCount: Number(r.launch_count || 0),
    lastLaunchAt: r.last_launch_at,
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

async function hasColumn(table: string, column: string): Promise<boolean> {
  const existing = await db.$queryRawUnsafe<unknown[]>(`SHOW COLUMNS FROM ${table} LIKE ?`, column);
  return existing.length > 0;
}

export async function ensureLicenseTable(): Promise<void> {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ext_license (
      id             VARCHAR(36)  NOT NULL,
      license_key    VARCHAR(24)  NOT NULL,
      name           VARCHAR(80)  NOT NULL,
      max_installs   INT          NOT NULL DEFAULT ${LICENSE_DEFAULT_MAX_INSTALLS},
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
  // ⚠️ CREATE TABLE IF NOT EXISTS 對既有的表什麼都不做 —— 表在 1.5.0 那天就建在正式庫了，後來加的欄位要另外補：
  //    先 SHOW COLUMNS 再 ALTER，重複跑不會炸；兩個請求同時補到同一欄，後到的吃 1060 也當沒事。
  for (const [column, ddl] of [
    ["verify_count", "ADD COLUMN verify_count INT NOT NULL DEFAULT 0 AFTER last_version"],
    ["launch_count", "ADD COLUMN launch_count INT NOT NULL DEFAULT 0 AFTER verify_count"],
    ["last_launch_at", "ADD COLUMN last_launch_at DATETIME NULL AFTER launch_count"],
    ["max_installs", `ADD COLUMN max_installs INT NOT NULL DEFAULT ${LICENSE_DEFAULT_MAX_INSTALLS} AFTER name`],
  ] as const) {
    if (!(await hasColumn("ext_license", column))) {
      try {
        await db.$executeRawUnsafe(`ALTER TABLE ext_license ${ddl}`);
      } catch (error) {
        if (!/1060|duplicate column/i.test(errText(error))) throw error;
      }
    }
  }
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ext_license_install (
      id             VARCHAR(36)  NOT NULL,
      license_id     VARCHAR(36)  NOT NULL,
      install_id     VARCHAR(64)  NOT NULL,
      first_seen_at  DATETIME     NOT NULL,
      last_seen_at   DATETIME     NOT NULL,
      last_version   VARCHAR(16)  NULL,
      verify_count   INT          NOT NULL DEFAULT 0,
      launch_count   INT          NOT NULL DEFAULT 0,
      last_launch_at DATETIME     NULL,
      PRIMARY KEY (id),
      UNIQUE KEY ext_license_install_uq (license_id, install_id),
      KEY ext_license_install_lic (license_id)
    )
  `);
  // 一次性搬家：1.5.0～1.5.2「綁第一台」存在 ext_license.install_id 的那幾台搬進 install 表。
  // INSERT IGNORE 靠 (license_id, install_id) 唯一鍵，跑幾次結果都一樣；全新的庫沒有 install_id 這欄就跳過。
  if (await hasColumn("ext_license", "install_id")) {
    await db.$executeRawUnsafe(`
      INSERT IGNORE INTO ext_license_install (id, license_id, install_id, first_seen_at, last_seen_at, last_version, verify_count, launch_count, last_launch_at)
      SELECT UUID(), id, install_id, COALESCE(bound_at, created_at), COALESCE(last_seen_at, bound_at, created_at), last_version, verify_count, launch_count, last_launch_at
      FROM ext_license WHERE install_id IS NOT NULL
    `);
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
    const rows = await db.$queryRaw<Row[]>`${SELECT} ORDER BY l.created_at DESC`;
    return rows.map(toRecord);
  });
}

export async function findLicenseByKey(key: string): Promise<LicenseRecord | null> {
  return ensureThenRun(async () => {
    const rows = await db.$queryRaw<Row[]>`${SELECT} WHERE l.license_key = ${key} LIMIT 1`;
    return rows.length ? toRecord(rows[0]) : null;
  });
}

/** 全部登記過的電腦（後台明細用；一組碼通常幾台到二十台，一次讀完再分組就好） */
export async function listInstalls(): Promise<InstallRecord[]> {
  return ensureThenRun(async () => {
    const rows = await db.$queryRaw<InstallRow[]>`
      SELECT id, license_id, install_id, first_seen_at, last_seen_at, last_version, verify_count, launch_count, last_launch_at
      FROM ext_license_install ORDER BY first_seen_at ASC`;
    return rows.map(toInstall);
  });
}

export async function createLicense(name: string, expiresAt: Date, maxInstalls: number = LICENSE_DEFAULT_MAX_INSTALLS): Promise<LicenseRecord> {
  const cleanName = name.trim().slice(0, 80);
  if (!cleanName) throw new Error("這組碼要有個名稱（例：9 月第一批）");
  const max = normalizeMaxInstalls(maxInstalls);
  if (max == null) throw new Error("電腦數上限要 1～999");
  return ensureThenRun(async () => {
    // 60 bits 的隨機碼撞到的機率趨近於零，但 UNIQUE 真撞到就再產一組
    for (let attempt = 0; attempt < 3; attempt++) {
      const id = randomUUID();
      const key = generateLicenseKey((n) => randomBytes(n));
      try {
        await db.$executeRaw`INSERT INTO ext_license (id, license_key, name, max_installs, expires_at) VALUES (${id}, ${key}, ${cleanName}, ${max}, ${expiresAt})`;
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

/** 清掉這組碼登記過的電腦：名額歸零，大家下次驗證重新登記（同事重裝 Chrome 佔了名額、或想重算人數時用） */
export async function resetLicenseInstalls(id: string): Promise<void> {
  await ensureThenRun(() => db.$executeRaw`DELETE FROM ext_license_install WHERE license_id = ${id}`);
}

export async function setLicenseExpires(id: string, expiresAt: Date): Promise<void> {
  await ensureThenRun(() => db.$executeRaw`UPDATE ext_license SET expires_at = ${expiresAt} WHERE id = ${id}`);
}

export async function setLicenseMaxInstalls(id: string, maxInstalls: number): Promise<void> {
  const max = normalizeMaxInstalls(maxInstalls);
  if (max == null) throw new Error("電腦數上限要 1～999");
  await ensureThenRun(() => db.$executeRaw`UPDATE ext_license SET max_installs = ${max} WHERE id = ${id}`);
}

export async function deleteLicense(id: string): Promise<void> {
  await ensureThenRun(async () => {
    await db.$executeRaw`DELETE FROM ext_license_install WHERE license_id = ${id}`;
    await db.$executeRaw`DELETE FROM ext_license WHERE id = ${id}`;
  });
}

export type VerifyResult =
  | { ok: true; name: string; expiresAt: string; expiresText: string; bound: boolean }
  | { ok: false; reason: LicenseReason | "bad_request"; expiresAt?: string; expiresText?: string };

/**
 * 外掛打來驗證：整理碼 → 找 → 這台登記過沒 → 判定 → ok 就登記／更新這台，並加總到那組碼。
 * 不 ok 也把到期日一起回去，外掛離線時拿它當本機硬上限。
 * event＝"launch" 是外掛按「上架」那一次帶的，順便 launch_count +1 —— 後台「有幾個人在用」看的就是這個。
 * 回傳的 bound＝這次是不是新登記的一台（外掛沒在用，留著相容）。
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
  const known = await ensureThenRun(async () => {
    const r = await db.$queryRaw<{ n: bigint | number }[]>`SELECT COUNT(*) AS n FROM ext_license_install WHERE license_id = ${row.id} AND install_id = ${installId}`;
    return Number(r[0]?.n || 0) > 0;
  });
  const decision = decideLicense(row, known, now);
  if (!decision.ok) return { ok: false, reason: decision.reason, ...expiry };

  const version = String(input.version || "").slice(0, 16);
  const isLaunch = input.event === "launch";
  const launchInc = isLaunch ? 1 : 0;
  const launchAt = isLaunch ? now : null;
  // 兩台新電腦同時來、都算過名額沒滿 → 可能多登記一台；閘是擋「拿去外面用」的，差一台不影響，不為此上鎖
  await ensureThenRun(async () => {
    await db.$executeRaw`
      INSERT INTO ext_license_install (id, license_id, install_id, first_seen_at, last_seen_at, last_version, verify_count, launch_count, last_launch_at)
      VALUES (${randomUUID()}, ${row.id}, ${installId}, ${now}, ${now}, ${version}, 1, ${launchInc}, ${launchAt})
      ON DUPLICATE KEY UPDATE last_seen_at = ${now}, last_version = ${version}, verify_count = verify_count + 1,
                              launch_count = launch_count + ${launchInc}, last_launch_at = COALESCE(${launchAt}, last_launch_at)`;
    await db.$executeRaw`
      UPDATE ext_license SET last_seen_at = ${now}, last_version = ${version}, verify_count = verify_count + 1,
                             launch_count = launch_count + ${launchInc}, last_launch_at = COALESCE(${launchAt}, last_launch_at)
      WHERE id = ${row.id}`;
  });
  return { ok: true, name: row.name, ...expiry, bound: decision.register };
}

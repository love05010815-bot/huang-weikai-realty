/**
 * 一次性修正（2026-10-14）：lvr_deal 的主鍵原本是「編號-移轉編號」，但「移轉編號」只是官方那份檔的流水號，
 * 內政部重發同一期的檔就會變號，所以同一案進了兩次。主鍵已改成只用「編號」（src/lib/lvr-parse.ts），
 * 這支把既有資料對齊：
 *   1. 同一個編號有兩列的（舊流水號那列是過時的），**只刪明列出來的那幾個 id**（印出來給你看）；
 *   2. 其餘帶 `-流水號` 的 id 一律改成純編號。
 * 可重複執行（第二次什麼都不會動）。跑法：node --env-file=.env.local scripts/fix-lvr-dup-ids.mjs [--apply]
 * 不帶 --apply 只印出會做什麼。
 */
import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const db = new PrismaClient();
const plain = (rows) => JSON.parse(JSON.stringify(rows, (_, v) => (typeof v === "bigint" ? Number(v) : v)));

try {
  // 1. 同一個編號兩列：留 updated_at 最新那列（最後一次被官方檔蓋到的），其餘列出 id 準備刪
  const dup = plain(
    await db.$queryRawUnsafe(
      `SELECT SUBSTRING_INDEX(id,'-',1) AS serial, id, address, deal_date, total_price, first_seen, updated_at
         FROM lvr_deal
        WHERE kind = 'sale' AND id LIKE '%-%'
          AND SUBSTRING_INDEX(id,'-',1) IN (
            SELECT serial FROM (SELECT SUBSTRING_INDEX(id,'-',1) AS serial FROM lvr_deal WHERE kind='sale' AND id LIKE '%-%' GROUP BY serial HAVING COUNT(*) > 1) t
          )
        ORDER BY serial, updated_at DESC, id DESC`,
    ),
  );
  const seen = new Set();
  const toDelete = [];
  for (const r of dup) {
    if (seen.has(r.serial)) toDelete.push(r);
    else seen.add(r.serial);
  }
  console.log(`同一編號多列：${seen.size} 案，要刪 ${toDelete.length} 列（留每案最新那列）：`);
  for (const r of toDelete) console.log(`  刪 ${r.id}  ${r.address} ${r.deal_date} ${r.total_price} (first_seen ${r.first_seen})`);

  // 2. 其餘帶流水號的 id
  const [{ n: suffixed }] = plain(
    await db.$queryRawUnsafe("SELECT COUNT(*) AS n FROM lvr_deal WHERE id LIKE '%-%'"),
  );
  console.log(`帶流水號的 id 共 ${suffixed} 列（含上面要刪的），其餘會改成純編號。`);

  // 純編號已存在（例如季度檔先進來過）又撞到的，不能直接 UPDATE —— 先數有沒有
  const collide = plain(
    await db.$queryRawUnsafe(
      `SELECT a.id FROM lvr_deal a JOIN lvr_deal b ON b.id = SUBSTRING_INDEX(a.id,'-',1) WHERE a.id LIKE '%-%'`,
    ),
  );
  if (collide.length) {
    console.log(`⚠️ 有 ${collide.length} 列改成純編號會撞到既有列，先不動，列出來人工看：`);
    for (const r of collide) console.log("  ", r.id);
  }

  if (!APPLY) {
    console.log("\n（沒帶 --apply，什麼都沒改）");
  } else {
    let deleted = 0;
    for (const r of toDelete) {
      deleted += await db.$executeRawUnsafe("DELETE FROM lvr_deal WHERE id = ?", r.id);
    }
    const collideSet = new Set(collide.map((r) => r.id));
    const rest = plain(await db.$queryRawUnsafe("SELECT id FROM lvr_deal WHERE id LIKE '%-%'")).filter(
      (r) => !collideSet.has(r.id),
    );
    let renamed = 0;
    for (const r of rest) {
      renamed += await db.$executeRawUnsafe(
        "UPDATE lvr_deal SET id = SUBSTRING_INDEX(id,'-',1) WHERE id = ?",
        r.id,
      );
    }
    const [{ n: left }] = plain(await db.$queryRawUnsafe("SELECT COUNT(*) AS n FROM lvr_deal WHERE id LIKE '%-%'"));
    console.log(`\n已刪 ${deleted} 列、改名 ${renamed} 列；還帶流水號的剩 ${left} 列。`);
  }
} finally {
  await db.$disconnect();
}

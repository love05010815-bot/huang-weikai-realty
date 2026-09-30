/**
 * 回填實價登錄歷史資料（前台 /lvr）。
 *
 * 用法（連正式資料庫，要帶 .env.local）：
 *   node --experimental-strip-types --env-file=.env.local scripts/backfill-lvr.mjs 114S3 114S4 115S1 115S2 115S3 current
 *
 * 參數是季別（`115S2` ＝ 民國 115 年第 2 季，登記日 3/11–6/10）或 `current`（本期）。
 * 一季的 zip 約 14MB，全台 CSV 解完只留四區，跑一季約 10–30 秒。
 * `current` 會先把內政部「前期下載」清單裡（最近一季內每一旬）還沒進庫的旬全部補完、再抓本期。
 * 建議順序：舊季 → 新季 → current，這樣本期那批會被蓋成本期標籤（見 lvr.ts 檔頭）。
 * ⚠️ 當季的季度 zip 要等季結束後一陣子才會有（回的是 HTML 不是 zip），拿不到就靠 current 的補旬。
 *
 * ⚠️ 只有 INSERT … ON DUPLICATE KEY UPDATE，沒有任何 DELETE。重跑同一季只是把同樣的資料再蓋一次。
 */
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!args.length) {
  console.error("請給季別，例如：114S4 115S1 115S2 115S3 current");
  process.exit(1);
}
for (const a of args) {
  if (a !== "current" && !/^\d{3}S[1-4]$/.test(a)) {
    console.error(`季別格式應為 115S2 或 current，收到：${a}`);
    process.exit(1);
  }
}

const { syncLvr } = await import("../src/lib/lvr.ts");
const { db } = await import("../src/lib/db.ts");

let failed = false;
for (const source of args) {
  console.log(`\n=== ${source} ===`);
  const t = Date.now();
  // current 會順帶把「前期下載」清單裡還沒進庫的旬全部補完（線上一次只補兩旬，本機不用省）
  const r = await syncLvr({ source, trigger: "manual", force: true, catchUpLimit: 50 });
  for (const line of r.log || []) console.log("  " + line);
  if (r.ran && r.ok) {
    console.log(`  ✅ 找到 ${r.found} 筆，新增 ${r.inserted}、更新 ${r.updated}（${((Date.now() - t) / 1000).toFixed(1)}s）`);
  } else {
    failed = true;
    console.log(`  ❌ ${r.reason || "沒有跑"}`);
  }
}

await db.$disconnect();
process.exit(failed ? 1 : 0);

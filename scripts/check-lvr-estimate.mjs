/**
 * 行情試算比對引擎的檢查（src/lib/lvr-estimate.ts）—— 純函式、不進資料庫。
 * 用法：node --experimental-strip-types scripts/check-lvr-estimate.mjs
 * 改到分階條件（TIERS）、排除規則（EXCLUDE_FLAGS）、輸入驗證前後都跑一次。
 */
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
const E = await import("../src/lib/lvr-estimate.ts");

let pass = true;
const ok = (cond, label, got, want) => {
  if (!cond) pass = false;
  console.log(`${cond ? "  ✅" : "  ❌"} ${String(label).padEnd(44)} ${String(got).padEnd(26)}${cond ? "" : "應為 " + want}`);
};
const eq = (label, got, want) => ok(JSON.stringify(got) === JSON.stringify(want), label, JSON.stringify(got), JSON.stringify(want));

const TODAY = "2026-10-26";
const DISTRICTS = ["梧棲區", "清水區", "沙鹿區", "龍井區"];

/** 造一列資料池：unit 是 萬／坪、total 是 萬、ping 不含車位 */
let seq = 0;
function mk({ date, built = "2023-01", ping = 35, unit = 25, type = "住宅大樓(11層含以上有電梯)", note = "", total = 900, parkingPing = 0, parkingWan = 0 }) {
  seq++;
  return {
    id: `R${seq}`,
    address: `臺中市沙鹿區測試路${seq}號`,
    dealDate: date,
    builtYm: built,
    floor: "七層",
    totalFloors: "十二層",
    buildingType: type,
    buildingAreaM2: (ping + parkingPing) / 0.3025,
    parkingAreaM2: parkingPing / 0.3025,
    rooms: 3,
    halls: 2,
    baths: 2,
    totalPrice: total * 10_000,
    unitPriceM2: unit * 10_000 * 0.3025,
    parkingType: parkingPing ? "坡道平面" : "",
    parkingPrice: parkingWan * 10_000,
    note,
  };
}
const APT = "住宅大樓(11層含以上有電梯)";
const MID = "華廈(10層含以下有電梯)";
const input = { district: "沙鹿區", type: "apt", ping: 35, age: 3 };

console.log("=== A 輸入驗證 ===");
let p = E.parseEstimateInput({ district: "沙鹿區", type: "apt", ping: "３５", age: "3" }, DISTRICTS);
eq("全形數字也收", p.input, { district: "沙鹿區", type: "apt", ping: 35, age: 3 });
p = E.parseEstimateInput({}, DISTRICTS);
eq("全空＝還沒查（touched false）", [p.input, p.touched], [null, false]);
p = E.parseEstimateInput({ district: "西屯區", type: "apt", ping: "abc", age: "80" }, DISTRICTS);
eq("三個錯各自回在自己的欄位", p.errors.map((e) => e.field), ["district", "ping", "age"]);
p = E.parseEstimateInput({ district: "沙鹿區", type: "shop", ping: "1,200", age: "3" }, DISTRICTS);
eq("型態不認＋坪數超過上限", p.errors.map((e) => e.field), ["type", "ping"]);
p = E.parseEstimateInput({ district: "沙鹿區", type: "house", ping: "60.5", age: "0" }, DISTRICTS);
eq("新成屋 0 年合法", p.input?.age, 0);

console.log("=== B 成交當時屋齡 ===");
eq("2024-05 完工、2026-06 成交 → 2.1 年", E.ageAtDeal("2024-05", "2026-06-07"), 2.1);
eq("完工晚於成交（預售簽約）→ 0", E.ageAtDeal("2026-05", "2025-03-03"), 0);
eq("沒有完成年月 → null", E.ageAtDeal(null, "2026-01-01"), null);

console.log("=== C 一列 → 比對用 ===");
let r = E.toComp(mk({ date: "2026-04-09", ping: 27.49, parkingPing: 8.98, unit: 30.1, note: "預售屋、或土地及建物分件登記案件；" }));
eq("預售轉售不排除、但標籤留著", [r.excludedBy, r.comp?.flags], [null, ["預售轉售"]]);
eq("坪數不含車位", r.comp?.ping, 27.49);
eq("單價 萬／坪", r.comp?.unitWan, 30.1);
r = E.toComp(mk({ date: "2026-04-09", note: "親友、員工、共有人或其他特殊關係間之交易；" }));
eq("親友交易排除、記原因", [r.comp, r.excludedBy], [null, "親友／特殊關係"]);
r = E.toComp(mk({ date: "2026-04-09", note: "陽台外推；其他增建；" }));
eq("含增建不排除", [r.excludedBy, r.comp?.flags], [null, ["含增建"]]);
r = E.toComp({ ...mk({ date: "2026-04-09" }), unitPriceM2: null });
eq("沒單價 → 不能比、也不算排除", [r.comp, r.excludedBy], [null, null]);
eq("官方 91019 元/m² → 30.1 萬/坪", E.unitWanPerPing(91019), 30.1);

console.log("=== D 第一階就夠：數字 ===");
const units = [20, 21, 22, 23, 24, 25, 26, 27, 28, 29];
let pool = units.map((u, i) => mk({ date: `2026-0${(i % 9) + 1}-10`, ping: 33 + (i % 5), unit: u, total: 700 + u * 10 }));
let res = E.estimate(input, pool, TODAY);
eq("ok、第一階", [res.ok, res.tierIndex], [true, 1]);
eq("樣本 10", res.stats.sample, 10);
eq("最低 20、中位 24.5、最高 29", [res.stats.low.unitWan, res.stats.median, res.stats.high.unitWan], [20, 24.5, 29]);
eq("最低那筆追得到門牌", res.stats.low.comp.unitWan, 20);
eq("推算總價＝單價 × 35 坪（整數）", [res.stats.totalLow, res.stats.totalMedian, res.stats.totalHigh], [700, 858, 1015]);
eq("四分位 22.25／26.75", [res.stats.p25, res.stats.p75], [22.3, 26.8]);
eq("實際總價 最低／中位／最高", [res.stats.dealTotalLow, res.stats.dealTotalMedian, res.stats.dealTotalHigh], [900, 945, 990]);
eq("表格依成交日新→舊", res.comps.map((c) => c.dealDate).slice(0, 3), ["2026-09-10", "2026-08-10", "2026-07-10"]);
eq("沒被排除的", res.excluded, {});

console.log("=== E 分階放寬 ===");
// 近一年只有 5 筆像的，另外 4 筆是 14 個月前 → 第二階（還是近一年）不夠，第三階（近 2 年）才夠
pool = [
  ...[21, 22, 23, 24, 25].map((u) => mk({ date: "2026-05-01", unit: u })),
  ...[26, 27, 28, 29].map((u) => mk({ date: "2025-08-01", unit: u })),
];
res = E.estimate(input, pool, TODAY);
eq("第三階（近 2 年）", [res.ok, res.tierIndex, res.tier.months, res.stats.sample], [true, 3, 24, 9]);
// 坪數差 25%（35 → 43.75）第一階 ±20% 不收、第二階 ±30% 收
pool = [...Array(8)].map((_, i) => mk({ date: "2026-05-01", ping: 43.5, unit: 20 + i }));
res = E.estimate(input, pool, TODAY);
eq("坪數差 24% → 第二階", [res.tierIndex, res.tier.areaPct], [2, 0.3]);
// 屋齡差 7 年：第一階 ±5 不收、第二階 ±8 收
pool = [...Array(8)].map((_, i) => mk({ date: "2026-05-01", built: "2016-01", unit: 20 + i }));
res = E.estimate(input, pool, TODAY);
eq("屋齡差 7 年 → 第二階", res.tierIndex, 2);
// 住宅大樓只有 4 筆、華廈 5 筆 → 第四階合併才夠
pool = [...[21, 22, 23, 24].map((u) => mk({ date: "2026-05-01", unit: u })), ...[25, 26, 27, 28, 29].map((u) => mk({ date: "2026-05-01", unit: u, type: MID }))];
res = E.estimate(input, pool, TODAY);
eq("大樓＋華廈合併 → 第四階", [res.tierIndex, res.tier.mergeApt, res.stats.sample], [4, true, 9]);
eq("標籤寫成「住宅大樓／華廈」", E.tierLabel(res.tier, input).type, "住宅大樓／華廈");
// 查透天時華廈不會被合併進來
res = E.estimate({ ...input, type: "house" }, pool, TODAY);
eq("透天沒有合併夥伴 → 樣本不足", [res.ok, res.sample], [false, 0]);
// 沒有完成年月的在有屋齡限制的階段不收、最後一階（不限屋齡）才收
pool = [...Array(8)].map((_, i) => mk({ date: "2026-05-01", built: null, unit: 20 + i }));
res = E.estimate(input, pool, TODAY);
eq("沒完成年月 → 只在不限屋齡那階", [res.ok, res.tierIndex, res.tier.ageYears], [true, 5, null]);

console.log("=== F 樣本不足與邊界 ===");
pool = [mk({ date: "2026-05-01", unit: 21 }), mk({ date: "2026-05-01", unit: 22 })];
res = E.estimate(input, pool, TODAY);
eq("只有 2 筆 → ok false、仍列出那 2 筆", [res.ok, res.sample, res.comps.length], [false, 2, 2]);
pool = [21, 22, 23].map((u) => mk({ date: "2026-05-01", unit: u }));
res = E.estimate(input, pool, TODAY);
eq("剛好 3 筆 → 放到最後一階給數字", [res.ok, res.tierIndex, res.stats.sample], [true, 5, 3]);
eq("空資料池", E.estimate(input, [], TODAY).ok, false);
pool = [...Array(40)].map((_, i) => mk({ date: `2026-0${(i % 9) + 1}-${String((i % 27) + 1).padStart(2, "0")}`, unit: 20 + (i % 10) }));
res = E.estimate(input, pool, TODAY);
eq("40 筆算全部、表格也全部列出（不再只列 30）", [res.stats.sample, res.comps.length], [40, 40]);
eq("備註原文帶進表格", E.toComp(mk({ date: "2026-05-01", note: "陽台外推；" })).comp.note, "陽台外推；");
pool = [...Array(E.MAX_COMPS_SHOWN + 10)].map((_, i) => mk({ date: `2026-0${(i % 9) + 1}-${String((i % 27) + 1).padStart(2, "0")}`, unit: 20 + (i % 10) }));
res = E.estimate(input, pool, TODAY);
eq("超過上限才截斷", [res.stats.sample, res.comps.length], [E.MAX_COMPS_SHOWN + 10, E.MAX_COMPS_SHOWN]);
// 排除的那幾筆如果條件也像，要算進「另有 N 筆不列入」
pool = [
  ...[21, 22, 23, 24, 25, 26, 27, 28].map((u) => mk({ date: "2026-05-01", unit: u })),
  mk({ date: "2026-05-01", unit: 5, note: "親友、員工、共有人或其他特殊關係間之交易；" }),
  mk({ date: "2026-05-01", unit: 60, note: "法拍" }),
  mk({ date: "2026-05-01", unit: 60, ping: 80, note: "法拍" }), // 坪數差太多，不算在「條件相近」裡
];
res = E.estimate(input, pool, TODAY);
eq("排除的不進數字", [res.stats.low.unitWan, res.stats.high.unitWan], [21, 28]);
eq("條件相近但排除的分原因計數", res.excluded, { "親友／特殊關係": 1, "法拍／標售": 1 });

console.log("=== G 文字 ===");
const lbl = E.tierLabel(E.TIERS[0], input);
eq("第一階標籤", lbl, { period: "近 1 年", area: "28～42 坪", age: "屋齡 0～8 年", type: "住宅大樓" });
eq("屋齡下限不會變負數", E.tierLabel(E.TIERS[3], { ...input, age: 2 }).age, "屋齡 0～17 年");
eq("萬 格式", E.fmtWan(1234.6), "1,235");
eq("資料池回看月數 ≥ 最大階", E.POOL_MONTHS, 36);

console.log(pass ? "\n全部通過 ✅" : "\n有項目沒過 ❌");
process.exit(pass ? 0 : 1);

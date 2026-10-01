/**
 * 迴歸測試：地籍面積單位換算（src/lib/area-units.ts）。
 * 用法：node --experimental-strip-types scripts/check-area-units.mjs
 * 改到換算係數、輸入解析或顯示格式前後都跑一次。
 */
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
const A = await import("../src/lib/area-units.ts");

let pass = true;
const ok = (cond, label, got, want) => {
  if (!cond) pass = false;
  console.log(`${cond ? "  ✅" : "  ❌"} ${String(label).padEnd(34)} ${String(got).padEnd(18)}${cond ? "" : "應為 " + want}`);
};
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const conv = (v, from) => A.convertArea(v, from);

console.log("=== A 官方對照（臺南市政府全球資訊網那張表）===");
ok(near(conv(1, "sqm").ping, 0.3025, 5e-5), "1 平方公尺 ＝ 0.3025 坪", conv(1, "sqm").ping, 0.3025);
ok(near(conv(1, "ping").sqm, 3.3058, 5e-5), "1 坪 ＝ 3.3058 平方公尺", conv(1, "ping").sqm, 3.3058);
ok(conv(1, "hectare").sqm === 10_000, "1 公頃 ＝ 10,000 平方公尺", conv(1, "hectare").sqm, 10_000);
ok(near(conv(1, "hectare").ping, 3025), "1 公頃 ＝ 3,025 坪", conv(1, "hectare").ping, 3025);
ok(near(conv(1, "hectare").jia, 1.03102, 5e-6), "1 公頃 ＝ 1.03102 甲", conv(1, "hectare").jia, 1.03102);
ok(near(conv(1, "jia").fen, 10), "1 甲 ＝ 10 分", conv(1, "jia").fen, 10);
ok(near(conv(1, "jia").ping, 2934), "1 甲 ＝ 2,934 坪", conv(1, "jia").ping, 2934);
ok(near(conv(1, "jia").hectare, 0.96992, 5e-6), "1 甲 ＝ 0.96992 公頃", conv(1, "jia").hectare, 0.96992);
ok(conv(1, "are").sqm === 100, "1 公畝 ＝ 100 平方公尺", conv(1, "are").sqm, 100);
ok(near(conv(1, "are").ping, 30.25), "1 公畝 ＝ 30.25 坪", conv(1, "are").ping, 30.25);
ok(conv(1, "sqkm").hectare === 100, "1 平方公里 ＝ 100 公頃", conv(1, "sqkm").hectare, 100);
ok(near(conv(1, "fen").ping, 293.4), "1 分 ＝ 293.4 坪", conv(1, "fen").ping, 293.4);

console.log("=== B 他舉的例子：50 平方公尺 ===");
{
  const r = conv(50, "sqm");
  ok(r.sqm === 50, "自己那格原樣", r.sqm, 50);
  ok(near(r.ping, 15.125), "15.125 坪", r.ping, 15.125);
  ok(near(r.are, 0.5), "0.5 公畝", r.are, 0.5);
  ok(near(r.hectare, 0.005), "0.005 公頃", r.hectare, 0.005);
  ok(near(r.sqkm, 0.00005, 1e-12), "0.00005 平方公里", r.sqkm, 0.00005);
  ok(near(r.jia, 15.125 / 2934, 1e-9), "0.005155 甲", r.jia, 15.125 / 2934);
  ok(near(r.fen, 15.125 / 293.4, 1e-9), "0.05155 分", r.fen, 15.125 / 293.4);
}

console.log("=== C 來回換不走樣 ===");
for (const u of A.AREA_UNITS) {
  const back = conv(conv(123.456, u.key).sqm, "sqm")[u.key];
  ok(near(back, 123.456, 1e-9), `${u.label} → 平方公尺 → ${u.label}`, back, 123.456);
}

console.log("=== D 輸入解析 ===");
ok(A.parseAreaInput("") === null, "空字串 → null", A.parseAreaInput(""), null);
ok(A.parseAreaInput("  ") === null, "只有空白 → null", A.parseAreaInput("  "), null);
ok(A.parseAreaInput("1,234.5") === 1234.5, "千分位逗號", A.parseAreaInput("1,234.5"), 1234.5);
ok(A.parseAreaInput("１２３") === 123, "全形數字", A.parseAreaInput("１２３"), 123);
ok(A.parseAreaInput(".5") === 0.5, "開頭小數點", A.parseAreaInput(".5"), 0.5);
ok(A.parseAreaInput("5.") === 5, "結尾小數點", A.parseAreaInput("5."), 5);
ok(Number.isNaN(A.parseAreaInput("abc")), "文字 → NaN", A.parseAreaInput("abc"), NaN);
ok(Number.isNaN(A.parseAreaInput("1.2.3")), "兩個小數點 → NaN", A.parseAreaInput("1.2.3"), NaN);
ok(Number.isNaN(A.parseAreaInput("-5")), "負數 → NaN", A.parseAreaInput("-5"), NaN);

console.log("=== E 顯示格式 ===");
ok(A.formatArea(0) === "0", "0", A.formatArea(0), "0");
ok(A.formatArea(15.125) === "15.125", "15.125", A.formatArea(15.125), "15.125");
ok(A.formatArea(3025) === "3,025", "3,025 千分位", A.formatArea(3025), "3,025");
ok(A.formatArea(3.305785123) === "3.3058", "≥1 四位小數", A.formatArea(3.305785123), "3.3058");
ok(A.formatArea(0.5) === "0.5", "0.5 剪尾 0", A.formatArea(0.5), "0.5");
ok(A.formatArea(0.00005) === "0.00005", "0.00005 不出科學記號", A.formatArea(0.00005), "0.00005");
ok(A.formatArea(0.969917355) === "0.9699", "<1 四位有效", A.formatArea(0.969917355), "0.9699");
ok(A.formatArea(0.005155418) === "0.005155", "0.005155 四位有效", A.formatArea(0.005155418), "0.005155");
ok(A.formatArea(1_000_000) === "1,000,000", "一百萬", A.formatArea(1_000_000), "1,000,000");

console.log("=== F 壞輸入要丟錯 ===");
let threw = false;
try {
  conv(-1, "sqm");
} catch {
  threw = true;
}
ok(threw, "負數丟錯", threw, true);
threw = false;
try {
  conv(NaN, "ping");
} catch {
  threw = true;
}
ok(threw, "NaN 丟錯", threw, true);

console.log(pass ? "\n全部通過" : "\n有失敗");
process.exit(pass ? 0 : 1);

/**
 * 成交紀錄的煙霧測試 —— 數字解析、自動計算、欄位驗證、每月每年統計。不碰資料庫、不連網。
 * 用法：npm run check:deals
 * 改 src/lib/deals-text.ts 或 src/lib/deals.ts 的驗證前後都跑一次。
 *
 * ⚠️ 測試資料全是編的（姓名、電話、地址都不是真人），repo 是公開的，別放真資料。
 */
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
const T = await import("../src/lib/deals-text.ts");
const D = await import("../src/lib/deals.ts");

let pass = true;
const ok = (cond, label, got, want) => {
  if (!cond) pass = false;
  console.log(
    `${cond ? "  ✅" : "  ❌"} ${String(label).padEnd(40)} ${JSON.stringify(got).slice(0, 70).padEnd(40)}${cond ? "" : " 應為 " + JSON.stringify(want)}`,
  );
};
const eq = (got, want, label) => ok(JSON.stringify(got) === JSON.stringify(want), label, got, want);

console.log("A. 數字解析");
eq(T.parseNum("1288"), 1288, "純數字");
eq(T.parseNum("1,288萬"), 1288, "逗號與「萬」");
eq(T.parseNum(" 4.6% "), 4.6, "百分比與空白");
eq(T.parseNum(""), null, "空白＝沒填");
ok(Number.isNaN(T.parseNum("一千")), "看不懂回 NaN（不能當 0）", T.parseNum("一千"), "NaN");
ok(Number.isNaN(T.parseNum("-5")), "負數不收", T.parseNum("-5"), "NaN");

console.log("B. 自動計算（他 Excel 那一筆：1288 萬／59.32 萬／3 點 → 17.796 萬）");
eq(T.calcPerf(59.32, 3), 17.796, "達成業績＝服務費×點數÷10");
eq(T.calcFeePct(1288, 59.32), 4.606, "％數＝服務費÷成交金額");
eq(T.calcFeePct(0, 59.32), null, "成交金額 0 不除");
eq(T.calcPerf(59.32, null), null, "沒點數不算");
eq(T.fmtNum(433.67880001), "433.6788", "浮點尾巴收掉");
eq(T.fmtWan(1288), "1,288 萬", "千分位");
eq(T.fmtWan(null), "—", "沒值顯示破折號");

console.log("C. 驗證");
const party = { name: "", phone: "", birthday: "", idNo: "", address: "" };
const base = {
  dealDate: "2026-11-02",
  method: "dev",
  partner: "測試業務",
  objectNo: "AA0000000",
  address: "台中市測試區假路 1 號",
  community: "假社區",
  priceWan: "1288",
  feeWan: "59.32",
  feePct: "",
  points: "3",
  perfWan: "",
  buyer: party,
  seller: { ...party, name: "測試甲", idNo: "a123456789" },
  note: "",
};
{
  const r = D.validateDealInput(base);
  ok(r.ok, "完整一筆通過", r.ok, true);
  eq(r.value?.perfWan, 17.796, "業績空白→自動算");
  eq(r.value?.feePct, 4.606, "％數空白→自動算");
  eq(r.value?.seller.idNo, "A123456789", "身分證字號轉大寫");
  eq(r.value?.buyer.name, null, "沒填的存 null");
}
{
  const r = D.validateDealInput({ ...base, feePct: "4.6", perfWan: "18" });
  eq([r.value?.feePct, r.value?.perfWan], [4.6, 18], "自己填的照他填的");
}
ok(!D.validateDealInput({ ...base, dealDate: "" }).ok, "沒日期擋下", false, false);
ok(!D.validateDealInput({ ...base, method: "x" }).ok, "不認得的成交方式擋下", false, false);
ok(!D.validateDealInput({ ...base, priceWan: "" }).ok, "沒成交金額擋下", false, false);
ok(!D.validateDealInput({ ...base, priceWan: "12880000" }).ok, "1288 萬打成元（12880000）擋下", false, false);
ok(!D.validateDealInput({ ...base, feeWan: "五十" }).ok, "服務費不是數字擋下", false, false);
ok(!D.validateDealInput({ ...base, address: "", community: "" }).ok, "地址與社區都沒填擋下", false, false);
ok(!D.validateDealInput({ ...base, buyer: { ...party, birthday: "71/7/18" } }).ok, "生日不是 ISO 擋下", false, false);

console.log("D. 統計");
const rows = [
  { day: "2026-01-05", method: "dev", priceWan: 1000, feeWan: 40, perfWan: 12 },
  { day: "2026-01-20", method: "both", priceWan: 800, feeWan: 48, perfWan: 24.5 },
  { day: "2026-11-02", method: "dev", priceWan: 1288, feeWan: 59.32, perfWan: 17.796 },
  { day: "2025-12-31", method: "sale", priceWan: 600, feeWan: null, perfWan: null },
];
eq(T.dealYears(rows, "2026-11-23"), ["2026", "2025"], "年份新到舊");
eq(T.dealYears([], "2027-01-02"), ["2027"], "沒資料也有今年");
const m = T.sumByMonth(rows, "2026");
eq(m.length, 12, "一定 12 格");
eq([m[0].count, m[0].priceWan, m[0].perfWan], [2, 1800, 36.5], "1 月兩件加總");
eq([m[10].count, m[10].perfWan], [1, 17.796], "11 月一件");
eq(m[5].count, 0, "沒成交的月份是 0");
const y = T.sumByYear(rows, "2026-11-23");
eq([y[0].key, y[0].count, y[0].perfWan], ["2026", 3, 54.296], "年度合計（浮點不帶尾巴）");
eq(y[0].months[0], 2, "年度列帶每月件數");
eq([y[1].key, y[1].count, y[1].priceWan, y[1].perfWan], ["2025", 1, 600, 0], "沒填的金額當 0 加");
const sh = T.methodShares(rows.filter((r) => r.day.startsWith("2026")), ["dev", "sale", "both"]);
eq(sh.map((x) => [x.count, x.pct]), [[2, 67], [0, 0], [1, 33]], "成交方式件數與占比");
eq(T.methodShares([], ["dev"])[0].pct, 0, "0 件不除以 0");
eq(T.rocYearOf("2026-11-02"), 115, "民國年");

console.log("E. 歷年每月件數（只有件數、沒有明細）跟建檔的合併");
{
  const legacy = [
    { ym: "2024-06", count: 8 },
    { ym: "2025-12", count: 3 }, // 那個月建檔 1 件 → 取 3
    { ym: "2026-01", count: 1 }, // 那個月建檔 2 件 → 取 2（不相加）
    { ym: "2023-05", count: 0 }, // 0 件不該讓那一年冒出來
  ];
  eq(T.dealYears(rows, "2026-11-23", legacy), ["2026", "2025", "2024"], "年份含只有件數的年、不含 0 件的年");
  const m25 = T.monthCounts(rows, legacy, "2025");
  eq([m25.counts[11], m25.legacyOnly], [3, 2], "歷年件數比建檔多 → 取歷年件數");
  const m26 = T.monthCounts(rows, legacy, "2026");
  eq([m26.counts[0], m26.legacyOnly], [2, 0], "建檔比較多 → 取建檔的，不相加");
  const ys = T.sumByYear(rows, "2026-11-23", legacy);
  const y24 = ys.find((x) => x.key === "2024");
  eq([y24.count, y24.recorded, y24.legacyOnly, y24.months[5]], [8, 0, 8, 8], "只有件數的年：件數有、建檔 0");
  const y25 = ys.find((x) => x.key === "2025");
  eq([y25.count, y25.recorded, y25.priceWan], [3, 1, 600], "混合的年：件數合併、金額只算建檔的");
  eq(T.sumByYear(rows, "2026-11-23").map((x) => x.count), [3, 1], "不給歷年件數時跟原本一樣");
}

console.log(pass ? "\n全部通過" : "\n❌ 有沒過的");
process.exit(pass ? 0 : 1);

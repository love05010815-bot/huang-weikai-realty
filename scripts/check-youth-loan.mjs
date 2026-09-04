/**
 * 迴歸測試：青安 3.0 資格檢測與可貸金額（src/lib/youth-loan.ts）。
 * 用法：node --experimental-strip-types scripts/check-youth-loan.mjs
 * 改到門檻數字、利率退場表或月付分段前後都跑一次。
 */
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
const YL = await import("../src/lib/youth-loan.ts");
const { annuity } = await import("../src/lib/loan.ts");

let pass = true;
const ok = (cond, label, got, want) => {
  if (!cond) pass = false;
  console.log(`${cond ? "  ✅" : "  ❌"} ${String(label).padEnd(30)} ${String(got).padEnd(16)}${cond ? "" : "應為 " + want}`);
};
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;
const 萬 = (n) => n * 10_000;

const base = {
  age: 35,
  incomeOverCap: false,
  familyOwnsHome: false,
  usedBefore: false,
  region: "other",
  price: 萬(1000),
  household: "general",
  years: 40,
  graceYears: 0,
  amount: null,
};
const run = (patch) => YL.calcYouthLoan({ ...base, ...patch });

console.log("=== A 利率退場表（3＋3）===");
ok(YL.CONTRACT_RATE === 2.275, "合約利率 1.72+0.555", YL.CONTRACT_RATE, 2.275);
ok(YL.FIRST_RATE === 1.775, "前 3 年 1.775", YL.FIRST_RATE, 1.775);
[[1, 1.775], [3, 1.775], [4, 1.9], [5, 2.025], [6, 2.15], [7, 2.275], [40, 2.275]].forEach(([y, r]) =>
  ok(YL.rateForYear(y) === r, `第 ${y} 年利率`, YL.rateForYear(y), r)
);

console.log("=== B 年齡→最長年限 ===");
[[30, 40], [40, 40], [41, 39], [45, 35], [49, 31], [18, 40]].forEach(([a, y]) =>
  ok(YL.maxYearsForAge(a) === y, `${a} 歲最長`, YL.maxYearsForAge(a), y)
);

console.log("=== C 資格 ===");
ok(run({}).eligible === true, "35 歲一般首購 符合", run({}).eligible, true);
ok(run({ age: 49 }).eligible === true, "49 歲 符合", run({ age: 49 }).eligible, true);
ok(run({ age: 50 }).eligible === false, "50 歲 不符", run({ age: 50 }).eligible, false);
ok(run({ age: 17 }).eligible === false, "17 歲 不符", run({ age: 17 }).eligible, false);
ok(run({ incomeOverCap: true }).eligible === false, "所得超過 不符", run({ incomeOverCap: true }).eligible, false);
ok(run({ familyOwnsHome: true }).eligible === false, "家人有房 不符", run({ familyOwnsHome: true }).eligible, false);
ok(run({ usedBefore: true }).eligible === false, "辦過 不符", run({ usedBefore: true }).eligible, false);
ok(run({ price: 萬(2000) }).eligible === true, "其他縣市 2000 萬 剛好符合", run({ price: 萬(2000) }).eligible, true);
ok(run({ price: 萬(2001) }).eligible === false, "其他縣市 2001 萬 不符", run({ price: 萬(2001) }).eligible, false);
ok(run({ region: "newTaipeiHsinchu", price: 萬(2500) }).eligible === true, "新北 2500 萬 符合", "", true);
ok(run({ region: "newTaipeiHsinchu", price: 萬(2501) }).eligible === false, "新北 2501 萬 不符", "", false);
ok(run({ region: "taipei", price: 萬(3500) }).eligible === true, "北市 3500 萬 符合", "", true);
ok(run({ region: "taipei", price: 萬(3501) }).eligible === false, "北市 3501 萬 不符", "", false);
{
  const r = run({ age: 52, incomeOverCap: true, usedBefore: true });
  ok(r.blockers.length === 3, "三個原因都列出", r.blockers.length, 3);
}

console.log("=== C2 資格快篩清單 ===");
{
  const keys = run({}).checks.map((c) => c.key).join(",");
  ok(keys === "age,term,income,price,home,once,amount,other", "八列順序", keys, "age,term,income,price,home,once,amount,other");
  ok(run({}).checks.every((c) => c.status === "ok"), "全符合時八列都 ok", run({}).checks.map((c) => c.status).join(","), "全 ok");
  // 圖二的情境：51 歲、選 40 年
  const r = run({ age: 51, years: 40, household: "children", price: 萬(997) });
  const st = Object.fromEntries(r.checks.map((c) => [c.key, c.status]));
  ok(st.age === "fail" && st.term === "fix", "51 歲：年齡 fail、年限 fix", `${st.age}/${st.term}`, "fail/fix");
  const term = r.checks.find((c) => c.key === "term");
  ok(term.detail.includes("最長可貸 29 年") && term.detail.includes("選 40 年會超標"), "年限那列講 29 年、40 年超標", term.detail.slice(0, 30), "…");
  ok(r.blockers.length === 1 && r.eligible === false, "只有年齡算不符", r.blockers.length, 1);
  ok(r.checks.find((c) => c.key === "price").detail.includes("997 萬／上限 2,000 萬"), "總價列寫 997／2,000", r.checks.find((c) => c.key === "price").detail.slice(0, 20), "…");
  const two = run({ age: 55, incomeOverCap: true, usedBefore: true, price: 萬(2100) });
  ok(two.blockers.length === 4, "年齡＋所得＋辦過＋總價 = 4 個不符", two.blockers.length, 4);
  ok(two.checks.find((c) => c.key === "home").status === "ok", "沒房那列仍是 ok", two.checks.find((c) => c.key === "home").status, "ok");
}

console.log("=== D 可貸上限（額度 vs 8 成）===");
{
  const r = run({});
  ok(r.maxAmount === 萬(800), "1000 萬一般→800 萬", r.maxAmount / 1e4, 800);
  ok(r.binding === "ltv", "卡在成數", r.binding, "ltv");
}
{
  const r = run({ price: 萬(1500) });
  ok(r.maxAmount === 萬(1000), "1500 萬一般→1000 萬", r.maxAmount / 1e4, 1000);
  ok(r.binding === "cap", "卡在額度", r.binding, "cap");
}
ok(run({ price: 萬(1500), household: "newlywed" }).maxAmount === 萬(1200), "1500 萬新婚→1200 萬", "", 1200);
ok(run({ price: 萬(1400), household: "newlywed" }).maxAmount === 萬(1120), "1400 萬新婚→1120 萬(8成)", "", 1120);
ok(run({ price: 萬(2000), household: "children" }).maxAmount === 萬(1500), "2000 萬育兒→1500 萬", "", 1500);
ok(run({ price: 萬(1800), household: "children" }).maxAmount === 萬(1440), "1800 萬育兒→1440 萬(8成)", "", 1440);

console.log("=== E 月付分段 ===");
{
  const r = run({ price: 萬(1500) }); // 貸 1000 萬、40 年、無寬限
  const want = annuity(萬(1000), 0.01775 / 12, 480);
  ok(near(r.firstMonthly, want, 0.01), "前 3 年月付＝年金公式", Math.round(r.firstMonthly), Math.round(want));
  ok(near(r.firstMonthly, 29111, 2), "1000 萬 40 年 1.775% ≈ 29,111", Math.round(r.firstMonthly), 29111);
  ok(r.schedule.length === 5, "分 5 段", r.schedule.length, 5);
  const spans = r.schedule.map((s) => `${s.fromYear}-${s.toYear}@${s.annualRate}`).join(" ");
  ok(spans === "1-3@1.775 4-4@1.9 5-5@2.025 6-6@2.15 7-40@2.275", "分段與利率", spans, "1-3@1.775 4-4@1.9 5-5@2.025 6-6@2.15 7-40@2.275");
  const rising = r.schedule.every((s, i) => i === 0 || s.monthly > r.schedule[i - 1].monthly);
  ok(rising, "月付逐段上升", rising, true);
  ok(r.schedule.map((s) => s.subsidyTicks).join(",") === "2,1.5,1,0.5,0", "補貼碼數", r.schedule.map((s) => s.subsidyTicks).join(","), "2,1.5,1,0.5,0");
  ok(near(r.totalPayment, 萬(1000) + r.totalInterest, 0.01), "總還款＝本金＋利息", Math.round(r.totalPayment), Math.round(萬(1000) + r.totalInterest));
  // 用逐月模擬驗證分段算法真的把本金還完
  let bal = 萬(1000);
  for (const s of r.schedule) {
    const rr = s.annualRate / 100 / 12;
    for (let m = 0; m < (s.toYear - s.fromYear + 1) * 12; m++) bal = bal * (1 + rr) - s.monthly;
  }
  ok(near(bal, 0, 1), "40 年後餘額歸零", bal.toFixed(2), 0);
  ok(r.totalInterest > 萬(400) && r.totalInterest < 萬(500), "總利息落在 400～500 萬", Math.round(r.totalInterest / 1e4), "400~500");
}
{
  const r = run({ price: 萬(1500), graceYears: 5 });
  const spans = r.schedule.map((s) => `${s.fromYear}-${s.toYear}@${s.annualRate}${s.interestOnly ? "i" : ""}`).join(" ");
  ok(spans === "1-3@1.775i 4-4@1.9i 5-5@2.025i 6-6@2.15 7-40@2.275", "寬限 5 年分段", spans, "1-3@1.775i 4-4@1.9i 5-5@2.025i 6-6@2.15 7-40@2.275");
  ok(near(r.firstMonthly, (萬(1000) * 0.01775) / 12, 0.01), "寬限期只繳息 14,792", Math.round(r.firstMonthly), 14792);
  let bal = 萬(1000);
  for (const s of r.schedule) {
    const rr = s.annualRate / 100 / 12;
    for (let m = 0; m < (s.toYear - s.fromYear + 1) * 12; m++) bal = s.interestOnly ? bal : bal * (1 + rr) - s.monthly;
  }
  ok(near(bal, 0, 1), "寬限後餘額歸零", bal.toFixed(2), 0);
}
{
  const r = run({ price: 萬(1500), years: 20 });
  ok(r.schedule[r.schedule.length - 1].toYear === 20, "20 年最後一段到第 20 年", r.schedule[r.schedule.length - 1].toYear, 20);
}

console.log("=== E2 六年補貼受益 ===");
{
  // 逐月模擬當對照：每個月「月初餘額 × 補貼月利率」加總
  const simSaved = (r) => {
    let bal = r.amount, saved = 0;
    for (const s of r.schedule) {
      const rr = s.annualRate / 100 / 12, sub = (YL.CONTRACT_RATE - s.annualRate) / 100 / 12;
      for (let m = 0; m < (s.toYear - s.fromYear + 1) * 12; m++) {
        saved += bal * sub;
        bal = s.interestOnly ? bal : bal * (1 + rr) - s.monthly;
      }
    }
    return saved;
  };
  ok(YL.SUBSIDY_TOTAL_PCT === 2.25, "六年補貼加總 2.25%", YL.SUBSIDY_TOTAL_PCT, 2.25);
  const a = run({ price: 萬(1500) }); // 貸 1000 萬 40 年
  ok(a.subsidySavedRough === 225000, "粗估 1000 萬 × 2.25% = 22.5 萬", a.subsidySavedRough, 225000);
  ok(near(a.subsidySaved, simSaved(a), 1), "逐段公式＝逐月模擬（40 年）", Math.round(a.subsidySaved), Math.round(simSaved(a)));
  ok(a.subsidySaved < a.subsidySavedRough && a.subsidySaved > 200000, "精算略少於粗估、仍 > 20 萬", Math.round(a.subsidySaved), "20~22.5 萬");
  const b = run({ price: 萬(1500), graceYears: 5 });
  ok(near(b.subsidySaved, simSaved(b), 1), "逐段公式＝逐月模擬（寬限 5 年）", Math.round(b.subsidySaved), Math.round(simSaved(b)));
  ok(b.subsidySaved > a.subsidySaved, "寬限期本金不減，省得比較多", Math.round(b.subsidySaved), "> " + Math.round(a.subsidySaved));
  const c = run({ price: 萬(1500), years: 20 });
  ok(near(c.subsidySaved, simSaved(c), 1), "逐段公式＝逐月模擬（20 年）", Math.round(c.subsidySaved), Math.round(simSaved(c)));
  const d = run({ price: 萬(2000), household: "children" }); // 1500 萬
  ok(d.subsidySavedRough === 337500, "粗估 1500 萬 → 33.75 萬（懶人包同數）", d.subsidySavedRough, 337500);
  const e = run({ price: 萬(1500), household: "newlywed" }); // 1200 萬
  ok(e.subsidySavedRough === 270000, "粗估 1200 萬 → 27 萬（懶人包同數）", e.subsidySavedRough, 270000);
}

console.log("=== F 自動修正與錯誤 ===");
{
  const r = run({ age: 45, years: 40 });
  const term = r.checks.find((c) => c.key === "term");
  ok(r.years === 35 && term.status === "fix", "45 歲要貸 40 年→改 35 年、快篩標要調整", `${r.years}/${term.status}`, "35/fix");
  ok(r.eligible === true, "年限太長不算不符資格", r.eligible, true);
}
{
  const r = run({ graceYears: 6 });
  ok(r.graceYears === 5 && r.warnings.some((w) => w.includes("寬限期")), "寬限 6 年→改 5 年", r.graceYears, 5);
}
{
  const r = run({ amount: 萬(900) });
  const row = r.checks.find((c) => c.key === "amount");
  ok(r.amount === 萬(800) && row.status === "fix" && row.detail.includes("超過可貸上限"), "想貸 900 萬→改 800 萬、快篩標要調整", r.amount / 1e4, 800);
}
{
  const r = run({ amount: 萬(500) });
  ok(r.amount === 萬(500) && r.steps.some((s) => s.label === "你想貸的金額"), "想貸 500 萬照算", r.amount / 1e4, 500);
  ok(r.steps[r.steps.length - 1].amount === 萬(500), "自備款＝總價－貸款", r.steps[r.steps.length - 1].amount / 1e4, 500);
}
{
  const r = run({ years: 3, graceYears: 5 });
  ok(r.graceYears === 2, "寬限≥年限→改成年限－1", r.graceYears, 2);
}
const throws = (patch) => {
  try {
    run(patch);
    return false;
  } catch (e) {
    return e instanceof YL.YouthLoanInputError;
  }
};
ok(throws({ price: 0 }), "總價 0 會丟錯", throws({ price: 0 }), true);
ok(throws({ age: NaN }), "年齡 NaN 會丟錯", throws({ age: NaN }), true);
ok(throws({ amount: 0 }), "金額 0 會丟錯", throws({ amount: 0 }), true);

console.log(pass ? "\n全部通過" : "\n有項目失敗");
process.exit(pass ? 0 : 1);

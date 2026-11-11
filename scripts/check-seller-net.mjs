/**
 * 賣方實拿速算的驗算：
 *   npm run check:seller-net
 *
 * 1) 稅制分界（101/7/31、101/8/1、104/12/31、105/1/1）
 * 2) 房地合一那條跟 land-tax.ts 算出來一致（同一間房子 /tax 跟 /seller-net 要同一個稅）
 * 3) 參考頁的例子手算一次：費用列舉／3% 概算／自住／賠售／重購退稅
 * 4) 舊制：設算比率、核實、豪宅三種模式；缺欄位要列出來不是算 0
 * 5) 贈與、遺產：三級稅率的速算扣除要對
 * 6) 資料表不變量：每個縣市行政區比率 8～50、臺中 29 區都在、海線四區的數字
 */
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
const S = await import("../src/lib/seller-net.ts");
const D = await import("../src/lib/seller-net-data.ts");
const L = await import("../src/lib/land-tax.ts");

let failures = 0;
const fail = (m) => {
  failures++;
  console.log("✗ " + m);
};
const near = (a, b, eps = 0.051) => Math.abs(a - b) <= eps;
const expect = (label, got, want, eps) => {
  if (typeof want === "number" ? !near(got, want, eps) : got !== want) fail(`${label}：得到 ${JSON.stringify(got)}，要 ${JSON.stringify(want)}`);
};

/* ── 1) 稅制分界 ── */
expect("regimeOf 2012-07-31", S.regimeOf("2012-07-31"), "superOld");
expect("regimeOf 2012-08-01", S.regimeOf("2012-08-01"), "old");
expect("regimeOf 2015-12-31", S.regimeOf("2015-12-31"), "old");
expect("regimeOf 2016-01-01", S.regimeOf("2016-01-01"), "new");
expect("regimeOf 空字串", S.regimeOf(""), null);
expect("regimeOf 假日期", S.regimeOf("2024-02-31"), null);

/* ── 2+3) 房地合一：參考頁的例子 ── */
const base = {
  salePrice: 1500,
  buyPrice: 900,
  buyDate: "2018-03-01",
  sellDate: "2026-11-11",
  buyAgentFee: 18,
  buyDeedTax: 6,
  buyNotaryFee: 6,
  renovation: 50,
  otherBuyCost: 0,
  landIncrement: 20,
  agentFee: 60,
  notaryFee: 2,
  landTax: 10,
  useStd: false,
  selfUse: false,
  repurchase: { enabled: false, newPrice: 0, newDate: "" },
};
{
  const r = S.calcNewRegime(base);
  // 課稅所得 = 1500 − 900 − 80 − 20 − 62 = 438；持有 8 年 8 個月 → 20% → 87.6
  expect("新制 課稅所得", r.taxableIncome, 438);
  expect("新制 稅率", r.rate, 0.2);
  expect("新制 稅額", r.taxAmount, 87.6);
  expect("新制 全部支出", r.totalOut, 62 + 87.6 + 10);
  expect("新制 實拿", r.netCash, 1500 - 159.6);
  expect("新制 投入", r.invested, 980);
  expect("新制 獲利", r.profit, 1340.4 - 980);
  expect("新制 ROI", r.roi, ((1340.4 - 980) / 980) * 100, 0.06);
  expect("新制 持有年", r.holding.years, 8);
  expect("新制 持有月", r.holding.months, 8);
  expect("新制 概算建議（62 > 30 不該建議）", r.stdSuggestion, null);
  expect("新制 自住未勾 ignored", r.selfUseIgnored, null);
  // 跟 land-tax 直接算一致
  const t = L.calcLandTax({ acquiredAt: base.buyDate, soldAt: base.sellDate, price: 15_000_000, cost: 9_800_000, expense: 620_000, landIncrement: 200_000, residency: "resident", selfUse: false, special: false });
  expect("新制 跟 calcLandTax 同稅額", r.taxAmount, t.tax / 10000);
}
{
  // 3% 概算：min(45, 30) = 30 → 課稅所得 470 → 94；實拿照實際費用 62
  const r = S.calcNewRegime({ ...base, useStd: true });
  expect("概算 費用", r.expenseForTax, 30);
  expect("概算 模式", r.expenseMode, "assumed");
  expect("概算 課稅所得", r.taxableIncome, 470);
  expect("概算 稅額", r.taxAmount, 94);
  expect("概算 實拿用實際費用", r.netCash, 1500 - (62 + 94 + 10));
}
{
  // 列舉費用低於概算 → 建議改用
  const r = S.calcNewRegime({ ...base, agentFee: 10, notaryFee: 2 });
  if (!r.stdSuggestion) fail("列舉 12 萬 < 概算 30 萬 應建議改用概算");
  else {
    expect("建議 listed", r.stdSuggestion.listed, 12);
    expect("建議 std", r.stdSuggestion.std, 30);
    expect("建議 diff", r.stdSuggestion.diff, 18);
  }
}
{
  // 自住滿 6 年：400 萬免稅後 10%
  const r = S.calcNewRegime({ ...base, selfUse: true });
  expect("自住 免稅額", r.exemption, 400);
  expect("自住 稅率", r.rate, 0.1);
  expect("自住 稅額", r.taxAmount, 3.8);
  expect("自住 holding.sixYears", r.holding.sixYears, true);
}
{
  // 自住但不滿 6 年：不套用、要有原因
  const r = S.calcNewRegime({ ...base, buyDate: "2022-01-01", selfUse: true });
  expect("自住不滿 6 年 稅率仍 35%", r.rate, 0.35);
  if (!r.selfUseIgnored) fail("自住不滿 6 年要回原因");
  expect("自住不滿 6 年 sixYears", r.holding.sixYears, false);
}
{
  // 賠售
  const r = S.calcNewRegime({ ...base, salePrice: 900 });
  expect("賠售 稅額", r.taxAmount, 0);
  expect("賠售 isProfit", r.isProfit, false);
  expect("賠售 實拿", r.netCash, 900 - 62 - 10);
}
{
  // 重購退稅：全額／比例／超過 2 年
  const full = S.calcNewRegime({ ...base, repurchase: { enabled: true, newPrice: 2000, newDate: "2027-06-01" } });
  expect("重購 全額 isFull", full.repurchase?.isFull, true);
  expect("重購 全額 refund", full.repurchase?.refund, 87.6);
  expect("重購 全額 withinWindow", full.repurchase?.withinWindow, true);
  const part = S.calcNewRegime({ ...base, repurchase: { enabled: true, newPrice: 750, newDate: "2027-06-01" } });
  expect("重購 比例 ratio", part.repurchase?.ratio, 0.5);
  expect("重購 比例 refund", part.repurchase?.refund, 43.8);
  const late = S.calcNewRegime({ ...base, repurchase: { enabled: true, newPrice: 2000, newDate: "2029-01-01" } });
  expect("重購 超過 2 年 withinWindow", late.repurchase?.withinWindow, false);
  expect("重購 超過 2 年 refund", late.repurchase?.refund, 0);
  const before = S.calcNewRegime({ ...base, repurchase: { enabled: true, newPrice: 2000, newDate: "2025-01-01" } });
  expect("重購 先買後賣 2 年內 withinWindow", before.repurchase?.withinWindow, true);
  const noDate = S.calcNewRegime({ ...base, repurchase: { enabled: true, newPrice: 2000, newDate: "" } });
  expect("重購 沒填日期 withinWindow null", noDate.repurchase?.withinWindow, null);
}
{
  // 日期錯要丟 TaxInputError，不是回 0
  let threw = false;
  try {
    S.calcNewRegime({ ...base, buyDate: "", sellDate: "" });
  } catch (e) {
    threw = e instanceof L.TaxInputError;
  }
  expect("日期沒填要丟 TaxInputError", threw, true);
}

/* ── 4) 舊制 ── */
const oldBase = {
  regime: "superOld",
  salePrice: 1500,
  buyPrice: 900,
  houseValue: 80,
  landValue: 320,
  imputedRate: 18,
  luxuryCode: "major",
  area: 40,
  noParkingPrice: null,
  bracketRate: null,
  agentFee: 60,
  notaryFee: 2,
  landTax: 10,
  buyCosts: 30,
};
{
  const r = S.calcOldRegime(oldBase);
  expect("超舊制 mode", r.mode, "imputed");
  expect("超舊制 所得 80×18%", r.income, 14.4);
  expect("超舊制 未選級距 incomeTax null", r.incomeTax, null);
  expect("超舊制 實拿（沒扣所得稅）", r.netCash, 1500 - 72);
  expect("超舊制 missing 空", r.missing.length, 0);
  const t = S.calcOldRegime({ ...oldBase, bracketRate: 20 });
  expect("超舊制 20% 級距 所得稅", t.incomeTax, 2.9); // 14.4 × 20% = 2.88 → 2.9
  expect("超舊制 實拿扣所得稅", t.netCash, 1500 - 72 - 2.9);
  expect("超舊制 獲利", t.profit, 1500 - 72 - 2.9 - 930);
}
{
  // 超舊制缺比率：要列 missing，不是算 0 當答案
  const r = S.calcOldRegime({ ...oldBase, imputedRate: 0 });
  if (!r.missing.includes("設算比率")) fail("超舊制缺設算比率要列在 missing");
}
{
  // 豪宅：台中 3000 萬門檻 → 3000 × (80/400) × 20% = 120
  const r = S.calcOldRegime({ ...oldBase, salePrice: 3000 });
  expect("超舊制 豪宅 isLuxury", r.luxury.isLuxury, true);
  expect("超舊制 豪宅 mode", r.mode, "luxury");
  expect("超舊制 豪宅 所得", r.income, 120);
  // 每坪：不含車位 2500 / 40 坪 = 62.5 ≥ 50 → 也是豪宅
  const p = S.calcOldRegime({ ...oldBase, salePrice: 2600, noParkingPrice: 2500, area: 40 });
  expect("每坪門檻 isLuxury", p.luxury.isLuxury, true);
  expect("每坪門檻 perPing", p.luxury.perPing, 62.5);
  // 其他縣市門檻：總價 2200／每坪 35。1500 萬、沒填坪數 → 不算；1500 萬÷40 坪＝37.5 ≥ 35 → 算（每坪門檻比總價門檻先到）
  const o = S.calcOldRegime({ ...oldBase, luxuryCode: "other", area: null });
  expect("其他縣市 1500 沒坪數 非豪宅", o.luxury.isLuxury, false);
  const o2 = S.calcOldRegime({ ...oldBase, luxuryCode: "other", area: 40 });
  expect("其他縣市 1500/40 坪 每坪 37.5 是豪宅", o2.luxury.isLuxury, true);
  expect("其他縣市 每坪理由一條", o2.luxury.reasons.length, 1);
}
{
  // 舊制核實：(1500−900) × 80/400 = 120
  const r = S.calcOldRegime({ ...oldBase, regime: "old" });
  expect("舊制 mode", r.mode, "actual");
  expect("舊制 所得", r.income, 120);
  expect("舊制 房地比", r.houseRatio, 0.2);
  const loss = S.calcOldRegime({ ...oldBase, regime: "old", salePrice: 800 });
  expect("舊制 賠售 所得 0", loss.income, 0);
  expect("舊制 賠售 rawIncome 負", loss.rawIncome, -20);
}

/* ── 5) 贈與、遺產 ── */
{
  const g = S.calcGiftTax({ landValue: 200, houseValue: 100, priorGifts: 0, landTax: 10, toSpouse: false });
  expect("贈與 總值", g.total, 300);
  expect("贈與 淨額 300−244", g.taxableNet, 56);
  expect("贈與 稅 10%", g.giftTax, 5.6);
  expect("贈與 契稅 6%", g.deedTax, 6);
  expect("贈與 三稅合計", g.grandTotal, 21.6);
  // 115 年度級距：2,811 萬／5,621 萬（參考頁的 2,500／5,000 是舊的）
  const g2 = S.calcGiftTax({ landValue: 3000, houseValue: 1244, priorGifts: 0, landTax: 0, toSpouse: false });
  expect("贈與 15% 級距（4000 淨額）", g2.giftTax, 4000 * 0.15 - 140.55);
  const g3 = S.calcGiftTax({ landValue: 5000, houseValue: 1244, priorGifts: 0, landTax: 0, toSpouse: false });
  expect("贈與 20% 級距（6000 淨額）", g3.giftTax, 6000 * 0.2 - 421.6);
  // 級距邊界要連續：2,811 萬用 10% 跟 15% 算出來一樣、5,621 萬用 15% 跟 20% 一樣
  const gb1 = S.calcGiftTax({ landValue: 2811 + 244, houseValue: 0, priorGifts: 0, landTax: 0, toSpouse: false });
  expect("贈與 邊界 2,811 連續", gb1.giftTax, 281.1);
  const gb2 = S.calcGiftTax({ landValue: 5621 + 244, houseValue: 0, priorGifts: 0, landTax: 0, toSpouse: false });
  expect("贈與 邊界 5,621 連續", gb2.giftTax, 702.6);
  const prior = S.calcGiftTax({ landValue: 200, houseValue: 100, priorGifts: 500, landTax: 0, toSpouse: false });
  // 累計 800 → 淨 556 → 55.6；前次 500 → 淨 256 → 25.6；本次 30
  expect("贈與 扣前次已納", prior.giftTax, 30);
  const sp = S.calcGiftTax({ landValue: 200, houseValue: 100, priorGifts: 0, landTax: 10, toSpouse: true });
  expect("配偶贈與 稅 0", sp.giftTax, 0);
  expect("配偶贈與 合計只有契稅＋土增", sp.grandTotal, 16);
  const ex = S.calcGiftTax({ landValue: 100, houseValue: 100, priorGifts: 0, landTax: 0, toSpouse: false });
  expect("免稅額內 isExempt", ex.isExempt, true);
}
{
  const e = S.calcEstateTax({ total: 3000, debt: 0, heirs: 2, hasSpouse: true, descendants: 2, parents: 0, siblings: 0, disabled: false, funeral: 138 });
  // 扣除 553 + 112 + 138 = 803；淨 3000 − 1333 − 803 = 864 → 86.4；每人 43.2
  expect("遺產 扣除額合計", e.totalDeductions, 803);
  expect("遺產 淨額", e.net, 864);
  expect("遺產 稅", e.tax, 86.4);
  expect("遺產 每人", e.perHeir, 43.2);
  // 115 年度級距：5,621 萬／11,242 萬（參考頁的 5,000／10,000 是舊的）
  const e2 = S.calcEstateTax({ total: 1333 + 138 + 8000, debt: 0, heirs: 1, hasSpouse: false, descendants: 0, parents: 0, siblings: 0, disabled: false, funeral: 138 });
  expect("遺產 15% 級距（8000 淨額）", e2.tax, 8000 * 0.15 - 281.05);
  const e3 = S.calcEstateTax({ total: 1333 + 138 + 12000, debt: 0, heirs: 1, hasSpouse: false, descendants: 0, parents: 0, siblings: 0, disabled: false, funeral: 138 });
  expect("遺產 20% 級距（12000 淨額）", e3.tax, 12000 * 0.2 - 843.15);
  const eb1 = S.calcEstateTax({ total: 1333 + 138 + 5621, debt: 0, heirs: 1, hasSpouse: false, descendants: 0, parents: 0, siblings: 0, disabled: false, funeral: 138 });
  expect("遺產 邊界 5,621 連續", eb1.tax, 562.1);
  const eb2 = S.calcEstateTax({ total: 1333 + 138 + 11242, debt: 0, heirs: 1, hasSpouse: false, descendants: 0, parents: 0, siblings: 0, disabled: false, funeral: 138 });
  expect("遺產 邊界 11,242 連續", eb2.tax, 1405.25);
  const cap = S.calcEstateTax({ total: 2000, debt: 0, heirs: 1, hasSpouse: false, descendants: 0, parents: 5, siblings: 0, disabled: false, funeral: 500 });
  // 父母最多 2 人 276、喪葬上限 138 → 414；淨 2000−1333−414 = 253
  expect("遺產 父母上限、喪葬上限", cap.net, 253);
  const z = S.calcEstateTax({ total: 1000, debt: 0, heirs: 1, hasSpouse: false, descendants: 0, parents: 0, siblings: 0, disabled: false, funeral: 138 });
  expect("遺產 免稅額內", z.isExempt, true);
}

/* ── 6) 資料表 ── */
{
  const counties = Object.keys(D.IMPUTED_RATE);
  if (counties.length < 20) fail(`設算比率表只有 ${counties.length} 個縣市`);
  for (const c of counties) {
    for (const [d, v] of Object.entries(D.IMPUTED_RATE[c])) {
      if (!Number.isInteger(v) || v < 8 || v > 50) fail(`${c}${d} 比率 ${v} 不在 8～50`);
    }
  }
  const tc = D.IMPUTED_RATE["臺中市"];
  expect("臺中市 29 區", Object.keys(tc).length, 29);
  expect("梧棲區 18%", tc["梧棲區"], 18);
  expect("沙鹿區 23%", tc["沙鹿區"], 23);
  expect("清水區 17%", tc["清水區"], 17);
  expect("龍井區 21%", tc["龍井區"], 21);
  expect("imputedRateOf 梧棲", S.imputedRateOf("臺中市", "梧棲區"), 18);
  expect("imputedRateOf 查不到", S.imputedRateOf("臺中市", "不存在區"), null);
  expect("豪宅 tiers 4 個", D.LUXURY_TIERS.length, 4);
  expect("綜所稅級距 5 個", D.INCOME_TAX_BRACKETS.length, 5);
}

/* ── 持有期間 ── */
{
  const h = S.holdingOf("2020-05-15", "2026-05-14");
  expect("holding 差一天不滿 6 年", h?.sixYears, false);
  expect("holding 5 年 11 個月", `${h?.years}-${h?.months}`, "5-11");
  const h2 = S.holdingOf("2020-05-15", "2026-05-15");
  expect("holding 剛好 6 年", h2?.sixYears, true);
  expect("holding 顛倒回 null", S.holdingOf("2026-01-01", "2020-01-01"), null);
}

console.log(failures === 0 ? "\n✅ 賣方實拿速算 全部通過" : `\n❌ ${failures} 個問題`);
process.exit(failures === 0 ? 0 : 1);

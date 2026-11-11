/**
 * 賣方實拿速算 —— 純計算，不碰畫面（畫面在 app/seller-net/SellerNetCalculator.tsx）。
 *
 * 2026-11-11 系統擁有者：「我想做另一個工具放在賣方常用裡面：賣方實拿速算，跟這個網站做一樣」
 *   （參考頁是別家房仲的「賣屋損益試算」，三個分頁：出售／贈與／繼承）。
 *
 * 三個分頁的算法：
 *   出售 —— 看購入日期分三種稅制（seller-net-data.ts 檔頭有分界）：
 *     超舊制／舊制：算「財產交易所得」（房屋部分，併入綜所稅；土地只課土增稅），客戶自己選級距粗估所得稅；
 *     房地合一 2.0：**直接呼叫 land-tax.ts 的 calcLandTax**（跟 /tax 的房地合一稅試算同一套、同一份法條核對），
 *       這裡只補現金流：實拿＝成交價－賣屋仲介費－代書費－房地合一稅－土增稅；獲利＝實拿－（買價＋當初的購置成本）。
 *     兩個舊制達豪宅門檻改按 成交總價 × 房地比 × 20%。
 *   贈與 —— 年度累計贈與淨額扣免稅額後套三級稅率；受贈人另繳契稅 6%、贈與人繳土增稅；配偶贈與免稅。
 *   繼承 —— 遺產總額扣免稅額與各項扣除額後套三級稅率；繼承的土地免土增稅、房屋免契稅。
 *
 * ⚠️ 單位：進出都是「萬元」（客戶習慣講幾百萬），只有交給 calcLandTax 那段換成元再換回來。
 * ⚠️ 數字會變的都在 seller-net-data.ts，改完跑 `npm run check:seller-net`。
 * ⚠️ 刻意不做：舊制的綜所稅速算扣除（要知道他整年所得）、未成年卑親屬加計扣除、公司名下、預售屋。
 */
import {
  ASSUMED_EXPENSE_CAP,
  ASSUMED_EXPENSE_RATE,
  NEW_REGIME_FROM,
  SELF_USE_YEARS,
  calcLandTax,
  diffYearsMonths,
  type TaxResult,
} from "./land-tax";
import {
  ESTATE,
  GIFT,
  IMPUTED_RATE,
  LUXURY_TIERS,
  SUPER_OLD_CUTOFF,
  type Bracket,
  type LuxuryCode,
} from "./seller-net-data";

/* ───────────────────────── 共用 ───────────────────────── */

export type Regime = "superOld" | "old" | "new";

export const REGIME_LABEL: Record<Regime, { short: string; long: string }> = {
  superOld: { short: "超舊制", long: "101 年 7 月 31 日以前取得：房屋部分按「房屋評定現值 × 財政部核定設算比率」算財產交易所得，併入綜合所得稅" },
  old: { short: "舊制", long: "101 年 8 月 1 日～104 年 12 月 31 日取得：房屋部分按（成交價－買價）× 房地比核實計算財產交易所得，併入綜合所得稅" },
  new: { short: "房地合一 2.0", long: "105 年 1 月 1 日以後取得：適用房地合一稅 2.0，依持有期間分級課稅" },
};

/** YYYY-MM-DD → UTC Date；格式不對或 2 月 31 日這種假日期回 null */
export function parseDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

function addYears(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setUTCFullYear(x.getUTCFullYear() + n);
  return x;
}

/** 四捨五入到 0.1 萬（跟參考頁一樣的精度） */
export function r1(n: number): number {
  const v = Math.round(n * 10) / 10;
  return v === 0 ? 0 : v; // 不要 -0
}

/** 「1,234.5 萬」 */
export function fmtWan(n: number): string {
  return r1(n).toLocaleString("zh-TW", { maximumFractionDigits: 1 }) + " 萬";
}

/** 購入日期落在哪一種稅制；日期沒填或格式不對回 null */
export function regimeOf(buyDate: string): Regime | null {
  const d = parseDate(buyDate);
  if (!d) return null;
  if (d <= (parseDate(SUPER_OLD_CUTOFF) as Date)) return "superOld";
  if (d < (parseDate(NEW_REGIME_FROM) as Date)) return "old";
  return "new";
}

export type Holding = { years: number; months: number; label: string; sixYears: boolean };

/** 持有期間（給人看）＋ 是否已滿 6 年（自住優惠門檻）。日期缺一個或顛倒回 null */
export function holdingOf(buyDate: string, sellDate: string): Holding | null {
  const a = parseDate(buyDate);
  const b = parseDate(sellDate);
  if (!a || !b || b < a) return null;
  const { years, months } = diffYearsMonths(a, b);
  return {
    years,
    months,
    label: `${years} 年 ${months} 個月`,
    sixYears: b >= addYears(a, SELF_USE_YEARS),
  };
}

/* ───────────────────────── 豪宅門檻 ───────────────────────── */

export type LuxuryResult = {
  isLuxury: boolean;
  reasons: string[];
  tier: (typeof LUXURY_TIERS)[number];
  /** 不含車位每坪單價（萬），算不出來是 0 */
  perPing: number;
};

/**
 * 含車位總價 ≥ 門檻，或不含車位每坪 ≥ 門檻，達到其一就是高價住宅。
 * noParkingPrice 沒填就拿成交總價算每坪（跟參考頁一樣，寧可高估）。
 */
export function luxuryCheck(code: LuxuryCode, totalPrice: number, noParkingPrice: number | null, area: number | null): LuxuryResult {
  const tier = LUXURY_TIERS.find((t) => t.code === code) ?? LUXURY_TIERS[LUXURY_TIERS.length - 1];
  const np = noParkingPrice && noParkingPrice > 0 ? noParkingPrice : totalPrice;
  const perPing = area && area > 0 && np > 0 ? np / area : 0;
  const reasons: string[] = [];
  if (totalPrice > 0 && totalPrice >= tier.total) reasons.push(`含車位總價 ${fmtWan(totalPrice)} ≥ 門檻 ${fmtWan(tier.total)}`);
  if (perPing > 0 && perPing >= tier.perPing) reasons.push(`每坪單價 ${perPing.toFixed(1)} 萬 ≥ 門檻 ${tier.perPing} 萬`);
  return { isLuxury: reasons.length > 0, reasons, tier, perPing };
}

/** 超舊制：縣市＋行政區 → 設算比率 %；查不到回 null */
export function imputedRateOf(county: string, district: string): number | null {
  const rate = IMPUTED_RATE[county]?.[district];
  return typeof rate === "number" ? rate : null;
}

/* ───────────────────────── 舊制（超舊制／舊制） ───────────────────────── */

export type OldInput = {
  regime: "superOld" | "old";
  salePrice: number;
  buyPrice: number;
  /** 出售年度房屋稅單上的房屋評定現值（萬） */
  houseValue: number;
  /** 出售年度土地公告現值 × 面積（萬） */
  landValue: number;
  /** 超舊制用的設算比率 %（選行政區帶入、可手改） */
  imputedRate: number;
  luxuryCode: LuxuryCode;
  /** 建物坪數（不含車位），算每坪單價用 */
  area: number | null;
  /** 不含車位成交價（萬），沒填用成交總價 */
  noParkingPrice: number | null;
  /** 客戶預估的綜所稅級距 %，null＝還沒選 */
  bracketRate: number | null;
  agentFee: number;
  notaryFee: number;
  landTax: number;
  /** 當初買的成本合計（仲介、契稅、代書、裝修、其他），算獲利用 */
  buyCosts: number;
};

export type OldResult = {
  regime: "superOld" | "old";
  luxury: LuxuryResult;
  mode: "luxury" | "imputed" | "actual";
  /** 還缺哪些欄位才算得出財產交易所得（空陣列＝算得出來） */
  missing: string[];
  /** 房地比（房屋 ÷ 房屋＋土地），算不出來是 null */
  houseRatio: number | null;
  /** 財產交易所得（萬，≥0）；rawIncome 保留負值（舊制賠售） */
  income: number;
  rawIncome: number;
  /** 怎麼算的，畫面照列 */
  formula: string[];
  /** 選了級距才有：財產交易所得 × 級距稅率 */
  incomeTax: number | null;
  sellCosts: number;
  totalOut: number;
  netCash: number;
  invested: number;
  profit: number;
  roi: number;
  isProfit: boolean;
  notes: string[];
};

export function calcOldRegime(input: OldInput): OldResult {
  const sp = Math.max(0, input.salePrice || 0);
  const bp = Math.max(0, input.buyPrice || 0);
  const house = Math.max(0, input.houseValue || 0);
  const land = Math.max(0, input.landValue || 0);
  const luxury = luxuryCheck(input.luxuryCode, sp, input.noParkingPrice, input.area);
  const houseRatio = house + land > 0 ? house / (house + land) : null;
  const pct = houseRatio == null ? "" : `${(houseRatio * 100).toFixed(1)}%`;

  const missing: string[] = [];
  const formula: string[] = [];
  let mode: OldResult["mode"];
  let rawIncome = 0;

  if (luxury.isLuxury) {
    mode = "luxury";
    if (!sp) missing.push("預計成交總價");
    if (!house) missing.push("房屋評定現值");
    if (!land) missing.push("土地公告現值");
    if (missing.length === 0 && houseRatio != null) {
      rawIncome = sp * houseRatio * 0.2;
      formula.push(`財產交易所得 ＝ 成交總價 ${fmtWan(sp)} × 房地比 ${pct} × 20%`);
      formula.push(`房地比 ＝ 房屋評定現值 ${fmtWan(house)} ÷（${fmtWan(house)} ＋ ${fmtWan(land)}）＝ ${pct}`);
    }
  } else if (input.regime === "superOld") {
    mode = "imputed";
    const rate = Math.max(0, input.imputedRate || 0);
    if (!house) missing.push("房屋評定現值");
    if (!rate) missing.push("設算比率");
    if (missing.length === 0) {
      rawIncome = (house * rate) / 100;
      formula.push(`財產交易所得 ＝ 房屋評定現值 ${fmtWan(house)} × 設算比率 ${rate}%`);
    }
  } else {
    mode = "actual";
    if (!sp) missing.push("預計成交總價");
    if (!bp) missing.push("原始購入總價");
    if (!house) missing.push("房屋評定現值");
    if (missing.length === 0) {
      const ratio = houseRatio ?? 1;
      rawIncome = (sp - bp) * ratio;
      formula.push(`財產交易所得 ＝（成交總價 ${fmtWan(sp)} － 原始購入 ${fmtWan(bp)}）× 房地比 ${(ratio * 100).toFixed(1)}%`);
      formula.push(`房地比 ＝ 房屋評定現值 ${fmtWan(house)} ÷（${fmtWan(house)} ＋ ${fmtWan(land)}）`);
    }
  }

  const income = missing.length === 0 ? r1(Math.max(0, rawIncome)) : 0;
  const incomeTax = missing.length === 0 && input.bracketRate != null && input.bracketRate > 0 ? r1((income * input.bracketRate) / 100) : null;

  const sellCosts = Math.max(0, input.agentFee || 0) + Math.max(0, input.notaryFee || 0);
  const landTax = Math.max(0, input.landTax || 0);
  const totalOut = sellCosts + (incomeTax ?? 0) + landTax;
  const netCash = sp - totalOut;
  const invested = bp + Math.max(0, input.buyCosts || 0);
  const profit = netCash - invested;
  const roi = invested > 0 ? (profit / invested) * 100 : 0;

  const notes: string[] = [];
  if (luxury.isLuxury) notes.push("達高價住宅（豪宅）門檻，財產交易所得改按成交總價 × 房地比 × 20% 設算，不用設算比率或核實成本。");
  if (missing.length === 0 && rawIncome < 0) notes.push("算下來是賠售：財產交易損失可以在往後 3 年內扣抵財產交易所得，申報時記得提出。");
  notes.push("舊制只有房屋部分要併入當年度綜合所得稅；土地部分只課土地增值稅，不併入綜所稅。");
  if (incomeTax == null) notes.push("還沒選綜所稅級距，所以上面的實拿還沒扣所得稅。選了級距會用「財產交易所得 × 級距稅率」粗估。");
  notes.push("財產交易所得會跟你整年其他所得加在一起算，可能把你推到更高一級，請選「加上這筆之後」預估的級距。");

  return {
    regime: input.regime,
    luxury,
    mode,
    missing,
    houseRatio,
    income,
    rawIncome: r1(rawIncome),
    formula,
    incomeTax,
    sellCosts: r1(sellCosts),
    totalOut: r1(totalOut),
    netCash: r1(netCash),
    invested: r1(invested),
    profit: r1(profit),
    roi: r1(roi),
    isProfit: profit >= 0,
    notes,
  };
}

/* ───────────────────────── 房地合一 2.0 ───────────────────────── */

export type NewInput = {
  salePrice: number;
  buyPrice: number;
  buyDate: string;
  sellDate: string;
  buyAgentFee: number;
  buyDeedTax: number;
  buyNotaryFee: number;
  renovation: number;
  otherBuyCost: number;
  /** 土地漲價總數額（萬），土增稅單上有；不知道填 0，稅會是上限 */
  landIncrement: number;
  agentFee: number;
  notaryFee: number;
  landTax: number;
  /** 出售費用不列舉，改按成交價 3%（上限 30 萬）概算——只影響課稅所得，不影響現金 */
  useStd: boolean;
  selfUse: boolean;
  repurchase: { enabled: boolean; newPrice: number; newDate: string };
};

export type RepurchaseResult = {
  /** null＝日期沒填齊，判斷不了 */
  withinWindow: boolean | null;
  monthsApart: number | null;
  isFull: boolean;
  ratio: number;
  refund: number;
};

export type NewResult = {
  /** land-tax.ts 的原始結果（元） */
  tax: TaxResult;
  holding: Holding;
  totalBuyCost: number;
  actualSellCost: number;
  /** 成交價 3%、上限 30 萬 */
  stdAmount: number;
  expenseForTax: number;
  expenseMode: "actual" | "assumed";
  taxableIncome: number;
  exemption: number;
  taxAmount: number;
  rate: number;
  rateLabel: string;
  /** 沒勾概算、但概算比列舉的多：建議改用 */
  stdSuggestion: { listed: number; std: number; diff: number } | null;
  /** 勾了自住但不滿 6 年，實際沒套用（原因） */
  selfUseIgnored: string | null;
  totalOut: number;
  netCash: number;
  invested: number;
  profit: number;
  roi: number;
  isProfit: boolean;
  repurchase: RepurchaseResult | null;
  /** 各項支出（>0 的才列），畫分布圖用 */
  chart: { label: string; value: number }[];
  notes: string[];
  deadline: string;
};

const toYuan = (wan: number): number => Math.round(Math.max(0, wan || 0) * 10000);
const toWan = (yuan: number): number => yuan / 10000;

/**
 * 重購退稅：出售日前後 2 年內買新屋，新屋總價 ≥ 舊屋售價全額退、不足按比例退。
 * 這裡只估「可退的房地合一稅」，實際要在完成重購後向國稅局申請。
 */
export function calcRepurchase(salePrice: number, taxAmount: number, sellDate: string, newPrice: number, newDate: string): RepurchaseResult {
  const sell = parseDate(sellDate);
  const buy = parseDate(newDate);
  let withinWindow: boolean | null = null;
  let monthsApart: number | null = null;
  if (sell && buy) {
    withinWindow = buy >= addYears(sell, -2) && buy <= addYears(sell, 2);
    const [a, b] = buy < sell ? [buy, sell] : [sell, buy];
    const { years, months } = diffYearsMonths(a, b);
    monthsApart = years * 12 + months;
  }
  const sp = Math.max(0, salePrice || 0);
  const np = Math.max(0, newPrice || 0);
  const ratio = sp > 0 ? Math.min(1, np / sp) : 0;
  const isFull = sp > 0 && np >= sp;
  const refund = withinWindow === false ? 0 : r1(taxAmount * ratio);
  return { withinWindow, monthsApart, isFull, ratio, refund };
}

/** 會丟 land-tax.ts 的 TaxInputError（日期缺／顛倒／負數），畫面要接 */
export function calcNewRegime(input: NewInput): NewResult {
  const sp = Math.max(0, input.salePrice || 0);
  const bp = Math.max(0, input.buyPrice || 0);
  const totalBuyCost =
    Math.max(0, input.buyAgentFee || 0) +
    Math.max(0, input.buyDeedTax || 0) +
    Math.max(0, input.buyNotaryFee || 0) +
    Math.max(0, input.renovation || 0) +
    Math.max(0, input.otherBuyCost || 0);
  const agentFee = Math.max(0, input.agentFee || 0);
  const notaryFee = Math.max(0, input.notaryFee || 0);
  const landTax = Math.max(0, input.landTax || 0);
  const actualSellCost = agentFee + notaryFee;

  const tax = calcLandTax({
    acquiredAt: input.buyDate,
    soldAt: input.sellDate,
    price: toYuan(sp),
    cost: toYuan(bp + totalBuyCost),
    expense: input.useStd ? null : toYuan(actualSellCost),
    landIncrement: toYuan(input.landIncrement),
    residency: "resident",
    selfUse: input.selfUse,
    special: false,
  });
  if (tax.regime !== "new") throw new Error("calcNewRegime 只處理 105 年以後取得的房子，舊制請走 calcOldRegime");

  const holding = holdingOf(input.buyDate, input.sellDate) as Holding;
  const stdAmount = toWan(Math.min(Math.round(toYuan(sp) * ASSUMED_EXPENSE_RATE), ASSUMED_EXPENSE_CAP));
  const taxAmount = toWan(tax.tax);
  const stdSuggestion = !input.useStd && stdAmount > actualSellCost ? { listed: r1(actualSellCost), std: r1(stdAmount), diff: r1(stdAmount - actualSellCost) } : null;

  const totalOut = actualSellCost + taxAmount + landTax;
  const netCash = sp - totalOut;
  const invested = bp + totalBuyCost;
  const profit = netCash - invested;
  const roi = invested > 0 ? (profit / invested) * 100 : 0;

  const repurchase = input.repurchase.enabled && input.repurchase.newPrice > 0 ? calcRepurchase(sp, taxAmount, input.sellDate, input.repurchase.newPrice, input.repurchase.newDate) : null;

  const chart = [
    { label: "買屋仲介費", value: input.buyAgentFee || 0 },
    { label: "契稅＋代書費（買時）", value: (input.buyDeedTax || 0) + (input.buyNotaryFee || 0) },
    { label: "裝修費用", value: input.renovation || 0 },
    { label: "其他費用", value: input.otherBuyCost || 0 },
    { label: "賣屋仲介費", value: agentFee },
    { label: "代書相關費用", value: notaryFee },
    { label: "房地合一稅", value: taxAmount },
    { label: "土地增值稅", value: landTax },
  ]
    .map((x) => ({ label: x.label, value: r1(Math.max(0, x.value)) }))
    .filter((x) => x.value > 0);

  const notes: string[] = [];
  if (tax.expenseMode === "assumed") notes.push(`出售費用改按成交價 3%（上限 30 萬）概算 ${fmtWan(stdAmount)}，只用來降低課稅所得；實拿還是用你實際付的仲介費、代書費算。`);
  if (tax.taxableIncome <= 0) notes.push("算下來是賠售，房地合一稅為 0。這筆損失可以在往後 3 年內扣抵其他房地交易所得，申報時記得提出。");
  if ((input.landIncrement || 0) === 0) notes.push("土地漲價總數額填 0，稅是「上限」：土增稅單上的漲價總數額可以從課稅所得扣掉，填進去稅會更少。");
  notes.push("土地增值稅是另一個稅目，不列入房地合一稅的課稅所得；這裡用你填的金額直接從實拿扣掉，金額請洽代書估算。");

  return {
    tax,
    holding,
    totalBuyCost: r1(totalBuyCost),
    actualSellCost: r1(actualSellCost),
    stdAmount: r1(stdAmount),
    expenseForTax: r1(toWan(tax.expenseUsed)),
    expenseMode: tax.expenseMode,
    taxableIncome: r1(toWan(tax.taxableIncome)),
    exemption: r1(toWan(tax.exemption)),
    taxAmount: r1(taxAmount),
    rate: tax.rate,
    rateLabel: tax.rateLabel,
    stdSuggestion,
    selfUseIgnored: tax.ignored.selfUse,
    totalOut: r1(totalOut),
    netCash: r1(netCash),
    invested: r1(invested),
    profit: r1(profit),
    roi: r1(roi),
    isProfit: profit >= 0,
    repurchase,
    chart,
    notes,
    deadline: tax.deadline,
  };
}

/* ───────────────────────── 贈與稅 ───────────────────────── */

function bracketTax(net: number, brackets: readonly Bracket[]): { tax: number; rate: number } {
  if (net <= 0) return { tax: 0, rate: 0 };
  const b = brackets.find((x) => net <= x.upTo) ?? brackets[brackets.length - 1];
  return { tax: Math.max(0, net * b.rate - b.minus), rate: b.rate };
}

export type GiftInput = {
  landValue: number;
  houseValue: number;
  /** 本年度對同一受贈人之前已贈與的合計（萬） */
  priorGifts: number;
  landTax: number;
  toSpouse: boolean;
};

export type GiftResult = {
  total: number;
  deedTax: number;
  spouseExempt: boolean;
  cumulative: number;
  exemption: number;
  taxableNet: number;
  cumulativeTax: number;
  priorTax: number;
  giftTax: number;
  rate: number;
  rateLabel: string;
  grandTotal: number;
  isExempt: boolean;
};

export function calcGiftTax(input: GiftInput): GiftResult {
  const land = Math.max(0, input.landValue || 0);
  const house = Math.max(0, input.houseValue || 0);
  const prior = Math.max(0, input.priorGifts || 0);
  const landTax = Math.max(0, input.landTax || 0);
  const total = land + house;
  const deedTax = r1(house * GIFT.deedTaxRate);

  if (input.toSpouse) {
    return {
      total: r1(total),
      deedTax,
      spouseExempt: true,
      cumulative: r1(total + prior),
      exemption: GIFT.exemption,
      taxableNet: 0,
      cumulativeTax: 0,
      priorTax: 0,
      giftTax: 0,
      rate: 0,
      rateLabel: "配偶贈與免稅",
      grandTotal: r1(deedTax + landTax),
      isExempt: true,
    };
  }

  const cumulative = total + prior;
  const taxableNet = Math.max(0, cumulative - GIFT.exemption);
  const cum = bracketTax(taxableNet, GIFT.brackets);
  const priorNet = Math.max(0, prior - GIFT.exemption);
  const priorTax = r1(bracketTax(priorNet, GIFT.brackets).tax);
  const cumulativeTax = r1(cum.tax);
  const giftTax = Math.max(0, r1(cumulativeTax - priorTax));
  const isExempt = taxableNet === 0;
  return {
    total: r1(total),
    deedTax,
    spouseExempt: false,
    cumulative: r1(cumulative),
    exemption: GIFT.exemption,
    taxableNet: r1(taxableNet),
    cumulativeTax,
    priorTax,
    giftTax,
    rate: cum.rate,
    rateLabel: isExempt ? "年度免稅額內" : `稅率 ${Math.round(cum.rate * 100)}%`,
    grandTotal: r1(giftTax + deedTax + landTax),
    isExempt,
  };
}

/* ───────────────────────── 遺產稅 ───────────────────────── */

export type EstateInput = {
  total: number;
  debt: number;
  heirs: number;
  hasSpouse: boolean;
  descendants: number;
  parents: number;
  siblings: number;
  disabled: boolean;
  /** 喪葬費（萬），上限 ESTATE.funeralMax */
  funeral: number;
};

export type EstateResult = {
  exemption: number;
  deductions: { label: string; amount: number }[];
  totalDeductions: number;
  net: number;
  tax: number;
  rate: number;
  rateLabel: string;
  heirs: number;
  perHeir: number;
  isExempt: boolean;
};

export function calcEstateTax(input: EstateInput): EstateResult {
  const total = Math.max(0, input.total || 0);
  const debt = Math.max(0, input.debt || 0);
  const heirs = Math.max(1, Math.floor(input.heirs || 1));
  const descendants = Math.max(0, Math.floor(input.descendants || 0));
  const parents = Math.min(ESTATE.parentMax, Math.max(0, Math.floor(input.parents || 0)));
  const siblings = Math.max(0, Math.floor(input.siblings || 0));
  const funeral = Math.min(ESTATE.funeralMax, Math.max(0, input.funeral ?? ESTATE.funeralMax));

  const deductions: { label: string; amount: number }[] = [];
  if (input.hasSpouse) deductions.push({ label: "配偶扣除額", amount: ESTATE.spouse });
  if (descendants > 0) deductions.push({ label: `直系血親卑親屬（${descendants} 人 × ${ESTATE.descendant} 萬）`, amount: descendants * ESTATE.descendant });
  if (parents > 0) deductions.push({ label: `父母（${parents} 人 × ${ESTATE.parent} 萬）`, amount: parents * ESTATE.parent });
  if (siblings > 0) deductions.push({ label: `受扶養兄弟姊妹及祖父母（${siblings} 人 × ${ESTATE.sibling} 萬）`, amount: siblings * ESTATE.sibling });
  if (input.disabled) deductions.push({ label: "身心障礙特別扣除額", amount: ESTATE.disabled });
  deductions.push({ label: "喪葬費", amount: r1(funeral) });
  if (debt > 0) deductions.push({ label: "未償債務", amount: r1(debt) });

  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);
  const net = Math.max(0, total - ESTATE.exemption - totalDeductions);
  const b = bracketTax(net, ESTATE.brackets);
  const tax = r1(b.tax);
  const isExempt = net === 0;
  return {
    exemption: ESTATE.exemption,
    deductions,
    totalDeductions: r1(totalDeductions),
    net: r1(net),
    tax,
    rate: b.rate,
    rateLabel: isExempt ? "免稅額內，免徵" : `稅率 ${Math.round(b.rate * 100)}%`,
    heirs,
    perHeir: r1(tax / heirs),
    isExempt,
  };
}

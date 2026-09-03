/**
 * 青年安心成家購屋優惠貸款 3.0（青安 3.0）資格檢測與可貸金額試算 —— 純計算，不碰畫面。
 *
 * ⚠️ 規則逐條核對自官方來源（核對日見 RULES_CHECKED_AT），不是憑新聞印象寫的：
 *
 *   財政部國庫署「公股銀行辦理青年安心成家購屋優惠貸款問與答」（青安 3.0 問答集）
 *     https://www.nta.gov.tw/singlehtml/109
 *     年齡以「向銀行申請日」為準、所得用 MyData／國稅局所得清單查核、無自有住宅的
 *     查核範圍、限貸一次的起算點、總價「鑑價或買賣總價取孰高」、利息補貼逐年退場的
 *     百分比、115/8/1 起取消二段式與混合式，全部出自這份。
 *   財政部新聞稿「財政部青安貸款3.0，加碼支持婚育家庭」（115-07-16）
 *     https://www.mof.gov.tw/singlehtml/384fb3077bb349ea973e7fc6f13b6974?cntId=482aa9c142b34abc83750cb64c15cb11
 *   行政院院會議案「青年安心成家購屋優惠貸款3.0方案」（115-07-16）
 *     https://www.ey.gov.tw/Page/448DE008087A1971/1cb37b62-d127-4876-9cce-95016f49bcbe
 *   基準利率（中華郵政二年期定期儲金機動利率 1.72%，113/3/27 起）
 *     https://www.dgpa.gov.tw/eserver/information?uid=446&pid=11859
 *
 * 3.0 跟 2.0 差在哪（官方講法，客戶最常問的）：
 *   ・新增三道門檻：申貸時未滿 50 歲且「年齡＋年限」不逾 80、本人年所得不逾 200 萬、
 *     房屋總價分區上限（北市 3,500 萬／新北與新竹 2,500 萬／其他 2,000 萬）
 *   ・婚育加碼：新婚（申請日前 2 年內登記）1,200 萬、育有未成年子女（含胎兒）1,500 萬，
 *     一般仍是 1,000 萬；成數上限 8 成、年限 40 年、寬限期 5 年都沒變
 *   ・利息補貼改成「3＋3」：撥貸後 3 年補貼 2 碼（政府 1.5 碼＋公股銀行半碼），
 *     之後每年少半碼，第 7 年起回到合約利率
 *   ・只剩一段式機動利率（基準＋0.555%），二段式、混合式取消
 *   ・限貸一次：112/8/1 之後領過新青安或農安貸款的，不能再辦
 *   ・申辦 115/8/1～118/7/31，撥款最晚 118/10/31；以「向銀行送件日」為準，
 *     7/31 前送件的仍走 2.0（符合婚育加碼的可在撥貸前撤案重送）
 *
 * 刻意不做的（做了會給錯答案）：
 *   ・不算「銀行實際核貸成數」—— 8 成是上限，銀行看鑑價與信用條件常給更低
 *   ・不判斷自住切結、建物登記 6 個月內這類流程條件，只在 notes 提醒
 *   ・基準利率會浮動，這裡寫死核對當天的數字；郵儲利率一動，整條利率表跟著動
 *
 * 改完任何數字跑 `npm run check:youth`。
 */

import { annuity } from "@/lib/loan";

/** 規則最後核對日。改任何數字前先去上面的官方網址對一次，改完一起更新這裡 */
export const RULES_CHECKED_AT = "2026 年 9 月";

export const PROGRAM = {
  /** 申辦起日（民國） */
  applyFrom: "115 年 8 月 1 日",
  /** 申辦截止（民國） */
  applyUntil: "118 年 7 月 31 日",
  /** 撥款最晚（民國） */
  disburseUntil: "118 年 10 月 31 日",
} as const;

/** 借款人要成年（民法 18 歲） */
export const MIN_AGE = 18;
/** 申貸時要「未滿」50 歲 —— 50 歲當天就不行 */
export const MAX_AGE_EXCLUSIVE = 50;
/** 申貸年齡＋核貸年限不得逾 80 */
export const AGE_PLUS_TERM_CAP = 80;
/** 本人年所得總額上限（元），配偶不併計 */
export const INCOME_CAP = 2_000_000;
/** 貸款年限上限（年），含寬限期 */
export const MAX_YEARS = 40;
/** 寬限期上限（年） */
export const MAX_GRACE_YEARS = 5;
/** 最高成數 */
export const LTV = 0.8;

/** 中華郵政二年期定期儲金機動利率（%）。113/3/27 起 1.72%，之後沒動過 */
export const POSTAL_BASE_RATE = 1.72;
/** 一段式機動利率的固定加碼（%） */
export const SPREAD = 0.555;
/** 合約利率（%）＝ 基準＋加碼。補貼退場後就是繳這個 */
export const CONTRACT_RATE = Math.round((POSTAL_BASE_RATE + SPREAD) * 1000) / 1000;

/**
 * 第 1～6 年的補貼（%）。1 碼＝0.25%。
 * 前 3 年：政府 0.375%＋公股銀行減少調升 0.125%＝2 碼
 * 第 4 年：0.25%＋0.125%＝1.5 碼／第 5 年：0.125%＋0.125%＝1 碼／第 6 年：只剩銀行 0.125%＝半碼
 * 第 7 年起：0（回復原貸款利率）
 */
export const SUBSIDY_BY_YEAR = [0.5, 0.5, 0.5, 0.375, 0.25, 0.125] as const;

/** 撥貸後第 N 年（1 起算）的實際年利率（%） */
export function rateForYear(year: number): number {
  const subsidy = year >= 1 && year <= SUBSIDY_BY_YEAR.length ? SUBSIDY_BY_YEAR[year - 1] : 0;
  return Math.round((CONTRACT_RATE - subsidy) * 1000) / 1000;
}

/** 撥貸後前 3 年的利率（%），也就是大家講的「青安 1.775%」 */
export const FIRST_RATE = rateForYear(1);

export type Region = "other" | "newTaipeiHsinchu" | "taipei";

/** 房屋總價上限（元）。鑑價或買賣總價「取高者」不得超過 */
export const PRICE_CAP: Record<Region, { label: string; cap: number }> = {
  other: { label: "臺中市及其他縣市", cap: 20_000_000 },
  newTaipeiHsinchu: { label: "新北市、新竹縣（市）", cap: 25_000_000 },
  taipei: { label: "臺北市", cap: 35_000_000 },
};

export type Household = "general" | "newlywed" | "children";

/** 貸款額度上限（元） */
export const LOAN_CAP: Record<Household, { label: string; cap: number }> = {
  general: { label: "一般家庭", cap: 10_000_000 },
  newlywed: { label: "新婚家庭（申請日前 2 年內完成結婚登記）", cap: 12_000_000 },
  children: { label: "育有未成年子女家庭（含本人或配偶孕有胎兒）", cap: 15_000_000 },
};

export type YouthLoanInput = {
  /** 向銀行送件那天的足歲 */
  age: number;
  /** 借款人「本人」年所得總額是否超過 200 萬（配偶不併計） */
  incomeOverCap: boolean;
  /** 本人、配偶、未成年子女任一人名下有建物 */
  familyOwnsHome: boolean;
  /** 112/8/1 之後領過新青安（2.0）或農安貸款 */
  usedBefore: boolean;
  region: Region;
  /** 房屋總價（元）。鑑價比總價高的話請填鑑價 */
  price: number;
  household: Household;
  /** 想貸幾年 */
  years: number;
  /** 寬限期（年），沒有填 0 */
  graceYears: number;
  /** 想貸多少（元）。null ＝ 直接用可貸上限 */
  amount: number | null;
};

export type ScheduleRow = {
  /** 撥貸後第幾年起（1 起算） */
  fromYear: number;
  toYear: number;
  annualRate: number;
  /** 這段期間每月要繳（元，未四捨五入） */
  monthly: number;
  /** true ＝ 寬限期內只繳利息 */
  interestOnly: boolean;
  /** 這段補貼幾碼（給畫面標「補貼 2 碼」用） */
  subsidyTicks: number;
};

export type Step = { label: string; amount: number; note?: string };

export type YouthLoanResult = {
  eligible: boolean;
  /** 不符資格的原因，符合時為空陣列 */
  blockers: string[];
  /** 以年齡算出的最長年限（40 與 80－年齡取低） */
  maxYears: number;
  /** 可貸上限（元）＝ 額度上限與總價 8 成取低 */
  maxAmount: number;
  /** 卡住可貸上限的是「成數」還是「額度」 */
  binding: "ltv" | "cap";
  /** 實際拿來算月付的金額（元） */
  amount: number;
  years: number;
  graceYears: number;
  /** 撥貸後第一段的月付金（元） */
  firstMonthly: number;
  schedule: ScheduleRow[];
  totalInterest: number;
  totalPayment: number;
  steps: Step[];
  /** 輸入被自動修正的說明（年限超過上限之類） */
  warnings: string[];
  notes: string[];
};

export class YouthLoanInputError extends Error {}

/** 依年齡算最長年限：40 年與（80－年齡）取低，最少 1 年 */
export function maxYearsForAge(age: number): number {
  return Math.max(1, Math.min(MAX_YEARS, AGE_PLUS_TERM_CAP - Math.floor(age)));
}

/**
 * 逐段算月付金。利率每年可能不同（3＋3 退場），寬限期內只繳息。
 * 每一段用「當時的剩餘本金、剩餘期數」重算年金，跟銀行利率調整時的做法一樣。
 */
function buildSchedule(amount: number, years: number, graceYears: number): ScheduleRow[] {
  const total = Math.round(years * 12);
  const graceMonths = Math.round(graceYears * 12);
  const rows: ScheduleRow[] = [];
  let balance = amount;
  let month = 0;

  while (month < total) {
    const year = Math.floor(month / 12) + 1;
    const annualRate = rateForYear(year);
    const r = annualRate / 100 / 12;
    const interestOnly = month < graceMonths;
    // 一次走一個「貸款年」，遇到寬限期結束或貸款結束就提早停
    let end = Math.min(total, year * 12);
    if (interestOnly) end = Math.min(end, graceMonths);
    const k = end - month;

    let monthly: number;
    if (interestOnly) {
      monthly = balance * r;
    } else {
      monthly = annuity(balance, r, total - month);
      const growth = Math.pow(1 + r, k);
      balance = r === 0 ? balance - monthly * k : balance * growth - (monthly * (growth - 1)) / r;
    }

    const subsidyTicks = Math.round(((CONTRACT_RATE - annualRate) / 0.25) * 2) / 2;
    const last = rows[rows.length - 1];
    if (
      last &&
      last.interestOnly === interestOnly &&
      last.annualRate === annualRate &&
      Math.abs(last.monthly - monthly) < 0.5 &&
      last.toYear === year - 1
    ) {
      last.toYear = year;
    } else {
      rows.push({ fromYear: year, toYear: year, annualRate, monthly, interestOnly, subsidyTicks });
    }
    month = end;
  }
  return rows;
}

export function calcYouthLoan(input: YouthLoanInput): YouthLoanResult {
  const { age, incomeOverCap, familyOwnsHome, usedBefore, region, price, household } = input;
  if (!Number.isFinite(age) || age < 0) throw new YouthLoanInputError("年齡要填 0 以上的數字");
  if (!Number.isFinite(price) || price <= 0) throw new YouthLoanInputError("房屋總價要大於 0");
  if (!Number.isFinite(input.years) || input.years <= 0) throw new YouthLoanInputError("貸款年限要大於 0");
  if (!Number.isFinite(input.graceYears) || input.graceYears < 0) {
    throw new YouthLoanInputError("寬限期要填 0 以上的數字");
  }
  if (input.amount !== null && (!Number.isFinite(input.amount) || input.amount <= 0)) {
    throw new YouthLoanInputError("貸款金額要大於 0");
  }
  if (!PRICE_CAP[region]) throw new YouthLoanInputError("地區不對");
  if (!LOAN_CAP[household]) throw new YouthLoanInputError("家庭狀況不對");

  /* ── 資格 ── */
  const blockers: string[] = [];
  const wholeAge = Math.floor(age);
  if (wholeAge < MIN_AGE) {
    blockers.push(`借款人要成年（滿 ${MIN_AGE} 歲）才能申辦。`);
  } else if (wholeAge >= MAX_AGE_EXCLUSIVE) {
    blockers.push(
      `3.0 規定申貸時要未滿 ${MAX_AGE_EXCLUSIVE} 歲，以向銀行送件那天為準（送件後才滿 ${MAX_AGE_EXCLUSIVE} 歲沒關係）。`
    );
  }
  if (incomeOverCap) {
    blockers.push(
      "借款人本人年所得總額超過 200 萬元，不能申辦。這是只看本人、不併計配偶；銀行會用 MyData 或國稅局所得清單查核。"
    );
  }
  if (familyOwnsHome) {
    blockers.push(
      "本人、配偶或未成年子女名下有建物就不符。銀行查的是「全國財產稅總歸戶財產查詢清單」，三個人都要查無建物。"
    );
  }
  if (usedBefore) {
    blockers.push(
      "一生只能辦一次：112 年 8 月 1 日之後領過新青安（2.0）或農業金融機構的農安貸款，就不能再辦 3.0。"
    );
  }
  const priceRule = PRICE_CAP[region];
  if (price > priceRule.cap) {
    blockers.push(
      `房屋總價 ${wanLabel(price)} 萬超過${priceRule.label}的上限 ${wanLabel(priceRule.cap)} 萬（鑑價與買賣總價取高的那個不能超過）。`
    );
  }
  const eligible = blockers.length === 0;

  /* ── 年限 ── */
  const warnings: string[] = [];
  const maxYears = maxYearsForAge(wholeAge);
  let years = Math.floor(input.years);
  if (years > maxYears) {
    warnings.push(
      `你 ${wholeAge} 歲，年齡＋年限不能超過 ${AGE_PLUS_TERM_CAP}（且最長 ${MAX_YEARS} 年），最長只能貸 ${maxYears} 年，已改成 ${maxYears} 年來算。`
    );
    years = maxYears;
  }
  let graceYears = Math.floor(input.graceYears);
  if (graceYears > MAX_GRACE_YEARS) {
    warnings.push(`寬限期最長 ${MAX_GRACE_YEARS} 年，已改成 ${MAX_GRACE_YEARS} 年來算。`);
    graceYears = MAX_GRACE_YEARS;
  }
  if (graceYears >= years) {
    graceYears = Math.max(0, years - 1);
    warnings.push(`寬限期要短於貸款年限，已改成 ${graceYears} 年來算。`);
  }

  /* ── 可貸金額 ── */
  const ltvAmount = Math.round(price * LTV);
  const capRule = LOAN_CAP[household];
  const maxAmount = Math.min(ltvAmount, capRule.cap);
  const binding: "ltv" | "cap" = ltvAmount <= capRule.cap ? "ltv" : "cap";
  let amount = input.amount ?? maxAmount;
  if (amount > maxAmount) {
    warnings.push(`想貸的 ${wanLabel(amount)} 萬超過可貸上限 ${wanLabel(maxAmount)} 萬，已改用上限來算。`);
    amount = maxAmount;
  }

  /* ── 月付金 ── */
  const schedule = buildSchedule(amount, years, graceYears);
  const totalPayment = schedule.reduce((sum, row) => sum + row.monthly * (row.toYear - row.fromYear + 1) * 12, 0);
  const totalInterest = totalPayment - amount;

  const steps: Step[] = [
    { label: "房屋總價 × 80%", amount: ltvAmount, note: `青安最高成數 8 成（總價 ${wanLabel(price)} 萬）` },
    { label: "額度上限", amount: capRule.cap, note: capRule.label },
    {
      label: "＝ 可貸上限（兩者取低）",
      amount: maxAmount,
      note: binding === "ltv" ? "卡在成數：房子總價決定了能貸多少" : "卡在額度：房子再貴也只能貸到這個數",
    },
  ];
  if (amount !== maxAmount) steps.push({ label: "你想貸的金額", amount });
  steps.push({ label: "自備款至少", amount: price - amount, note: "總價扣掉貸款；契稅、代書、仲介費另計" });

  const notes: string[] = [
    `你 ${wholeAge} 歲，年齡＋年限不能超過 ${AGE_PLUS_TERM_CAP}，最長可貸 ${maxYears} 年（法定上限 ${MAX_YEARS} 年，含寬限期最長 ${MAX_GRACE_YEARS} 年）。`,
    `利率是一段式機動：郵儲二年期定儲機動利率 ${POSTAL_BASE_RATE}%＋0.555%＝${CONTRACT_RATE}%。撥貸後前 3 年政府補貼 1.5 碼、公股銀行減收半碼，實繳 ${FIRST_RATE}%；第 4 年起每年少半碼，第 7 年起回到 ${CONTRACT_RATE}%。郵儲利率一動，整條會跟著動。`,
    "只能向八家公股銀行申辦：臺灣銀行、土地銀行、合作金庫、第一銀行、華南銀行、彰化銀行、兆豐銀行、臺灣中小企銀。",
    "房子要登記在借款人本人名下，建物登記日期要在向銀行申請日前 6 個月內（或核准後 6 個月內完成登記）。已經過戶超過半年的房子辦不了。",
    "核貸時要簽自用住宅切結書：整層出租、分租、頂樓加蓋出租都不行；只出租屋頂裝太陽能不算。",
    `申辦到 ${PROGRAM.applyUntil}，撥款最晚 ${PROGRAM.disburseUntil}。以「向銀行送件日」為準，115 年 7 月 31 日前已送件的仍走 2.0；符合婚育加碼的可在撥貸前撤案重送。`,
    "月付金用本息平均攤還算。8 成是上限，銀行看鑑價與信用條件可能核更低；年限與寬限期也由銀行核定。",
  ];

  return {
    eligible,
    blockers,
    maxYears,
    maxAmount,
    binding,
    amount,
    years,
    graceYears,
    firstMonthly: schedule[0]?.monthly ?? 0,
    schedule,
    totalInterest,
    totalPayment,
    steps,
    warnings,
    notes,
  };
}

/** 元 → 「萬」字串，給錯誤訊息用（1,234.5 萬這種） */
function wanLabel(yuan: number): string {
  const w = yuan / 10_000;
  const rounded = Math.abs(w) >= 100 ? Math.round(w) : Math.round(w * 10) / 10;
  return rounded.toLocaleString("zh-TW");
}

/**
 * 房地合一稅 2.0 試算 —— 純計算，不碰畫面，方便單獨驗算。
 *
 * ⚠️ 這裡每一個數字都對過官方來源，改之前先確認法規真的變了：
 *
 *   稅率級距、自住優惠、20% 特殊情形
 *     所得稅法第 14 條之 4
 *     https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=G0340003&flno=14-4
 *
 *   計算公式、費用推計 3%／上限 30 萬、土地漲價總數額、申報期限
 *     財政部 房地合一稅制設計（個人）
 *     https://www.mof.gov.tw/houseandland/multiplehtml/de144e74630c4ac59f2d84a068c889c9
 *
 *   自住優惠四項條件
 *     財政部稅務入口網
 *     https://www.etax.nat.gov.tw/etwmain/alien-tax-service/alien-tax-faq/28VVDQM
 *
 *   非自願性因素七款
 *     財政部稅務入口網 問答 1813
 *     https://www.etax.nat.gov.tw/etwmain/tax-info/understanding/tax-q-and-a/national/individual-income-tax/house-tax-and-land-tax-consolidation-question/xvYPNOm
 *
 * 刻意不做的部分（做了會給錯答案，寧可講清楚請人問專業）：
 *   營利事業（公司名下）、預售屋與股份交易、重購退稅、繼承併計持有期間。
 */

/** 房地合一新制的門檻：105/1/1 以後取得的房地才適用 */
export const NEW_REGIME_FROM = "2016-01-01";

/** 自住優惠的免稅額（元） */
export const SELF_USE_EXEMPTION = 4_000_000;

/** 自住優惠要求「持有並居住連續滿 6 年」 */
export const SELF_USE_YEARS = 6;

/** 費用沒有單據時的推計比率與上限（元） */
export const ASSUMED_EXPENSE_RATE = 0.03;
export const ASSUMED_EXPENSE_CAP = 300_000;

export type Residency = "resident" | "nonResident";

/** 持有期間落在哪一段 */
export type HoldingBucket = "le2" | "le5" | "le10" | "gt10";

export type TaxInput = {
  /** 取得日（買賣＝完成所有權移轉登記日），YYYY-MM-DD */
  acquiredAt: string;
  /** 交易日（買賣＝訂定買賣契約日），YYYY-MM-DD */
  soldAt: string;
  /** 成交價額（房地合計） */
  price: number;
  /** 取得成本（買入價＋取得時的契稅代書費等＋能增加房屋價值的改良費） */
  cost: number;
  /** 相關費用。填 null 代表沒有單據，改用推計（成交價 3%、上限 30 萬） */
  expense: number | null;
  /** 土地漲價總數額（土地增值稅單上會有）。不知道就填 0，算出來會是稅額上限 */
  landIncrement: number;
  residency: Residency;
  /** 是否符合自住房地優惠的四項條件 */
  selfUse: boolean;
  /** 是否屬於非自願因素／合建分屋／都更危老（持有 5 年以下適用 20%） */
  special: boolean;
};

export type Step = { label: string; amount: number; note?: string };

export type TaxResult = {
  /** new = 房地合一新制；old = 舊制（105/1/1 前取得），這個試算不適用 */
  regime: "new" | "old";
  holding: { days: number; years: number; months: number; label: string; bucket: HoldingBucket };
  /** 實際採用的相關費用，以及是核實還是推計 */
  expenseUsed: number;
  expenseMode: "actual" | "assumed";
  /** 課稅所得（可能是負的，代表這筆是賠售） */
  taxableIncome: number;
  /** 自住優惠實際扣掉的免稅額 */
  exemption: number;
  /** 實際適用稅率 */
  rate: number;
  rateLabel: string;
  /** 應納稅額 */
  tax: number;
  /** 扣掉稅之後大概剩多少（成交價 − 取得成本 − 相關費用 − 稅） */
  netAfterTax: number;
  /** 計算過程，畫面直接照這個列，不要在畫面再算一次 */
  steps: Step[];
  /** 要提醒使用者的事 */
  notes: string[];
  /** 申報期限說明 */
  deadline: string;
};

function toDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  // 擋掉 2026-02-31 這種會被 Date 自動進位成 3/3 的假日期
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

function addYears(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setUTCFullYear(x.getUTCFullYear() + n);
  return x;
}

/**
 * 持有期間落在哪一段。
 * 法條寫「在二年以內」「超過二年，未逾五年」，所以邊界那一天算在前一段裡。
 */
export function bucketOf(acquired: Date, sold: Date): HoldingBucket {
  if (sold <= addYears(acquired, 2)) return "le2";
  if (sold <= addYears(acquired, 5)) return "le5";
  if (sold <= addYears(acquired, 10)) return "le10";
  return "gt10";
}

/**
 * 相差幾年幾個月。用日曆月相減，不要用「天數 ÷ 平均月長」——
 * 那樣 2024-01-01 到 2025-06-01 會算成 1 年 4 個月，實際是 1 年 5 個月。
 * 注意這只是給人看的文字，稅率級距一律看 bucketOf，不看這裡。
 */
export function diffYearsMonths(from: Date, to: Date): { years: number; months: number } {
  let years = to.getUTCFullYear() - from.getUTCFullYear();
  let months = to.getUTCMonth() - from.getUTCMonth();
  // 還沒過「同一天」就不算滿一個月
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years, months };
}

/** 給人看的持有期間說法。「持有」併進來，才不會出現「持有2 年以內」這種少一個空格的字 */
const BUCKET_LABEL: Record<HoldingBucket, string> = {
  le2: "持有 2 年以內",
  le5: "持有超過 2 年、未逾 5 年",
  le10: "持有超過 5 年、未逾 10 年",
  gt10: "持有超過 10 年",
};

/** 境內居住者的級距稅率（所得稅法 14-4 第三項第一款） */
const RESIDENT_RATE: Record<HoldingBucket, number> = { le2: 0.45, le5: 0.35, le10: 0.2, gt10: 0.15 };

/** 非境內居住者只有兩段，沒有 20% 與 15%（所得稅法 14-4 第三項第二款） */
const NON_RESIDENT_RATE: Record<HoldingBucket, number> = { le2: 0.45, le5: 0.35, le10: 0.35, gt10: 0.35 };

export class TaxInputError extends Error {}

/** 0 不要變成 -0：JS 的負零會被 toLocaleString 印成「-0」，畫面上很醜 */
function neg(n: number): number {
  return n === 0 ? 0 : -n;
}

function fmt(n: number): string {
  return n.toLocaleString("zh-TW");
}

export function calcLandTax(input: TaxInput): TaxResult {
  const acquired = toDate(input.acquiredAt);
  const sold = toDate(input.soldAt);
  if (!acquired) throw new TaxInputError("取得日期格式不對");
  if (!sold) throw new TaxInputError("出售日期格式不對");
  if (sold < acquired) throw new TaxInputError("出售日期不能早於取得日期");

  const positives: Array<[string, number]> = [
    ["成交價", input.price],
    ["取得成本", input.cost],
    ["土地漲價總數額", input.landIncrement],
  ];
  for (const [name, value] of positives) {
    if (!Number.isFinite(value) || value < 0) throw new TaxInputError(name + "要填 0 以上的數字");
  }
  if (input.expense !== null && (!Number.isFinite(input.expense) || input.expense < 0)) {
    throw new TaxInputError("相關費用要填 0 以上的數字");
  }

  const days = Math.round((sold.getTime() - acquired.getTime()) / 86_400_000);
  const bucket = bucketOf(acquired, sold);
  const { years, months } = diffYearsMonths(acquired, sold);
  const holding = {
    days,
    years,
    months,
    label: years > 0 ? years + " 年 " + months + " 個月" : months + " 個月",
    bucket,
  };

  const notes: string[] = [];
  const deadline =
    "完成所有權移轉登記日的次日起 30 天內，要向國稅局辦理房地合一稅申報 —— 不論賺賠、也不論有沒有稅要繳，都要申報。";

  // 105/1/1 之前取得的走舊制：房屋按財產交易所得併入綜所稅、土地只課土地增值稅。
  // 兩套算法完全不同，硬套會給出錯的數字，所以直接停在這裡。
  if (acquired < (toDate(NEW_REGIME_FROM) as Date)) {
    return {
      regime: "old",
      holding,
      expenseUsed: 0,
      expenseMode: "assumed",
      taxableIncome: 0,
      exemption: 0,
      rate: 0,
      rateLabel: "不適用房地合一稅",
      tax: 0,
      netAfterTax: 0,
      steps: [],
      notes: [
        "這間房子是民國 105 年（2016 年）1 月 1 日之前取得的，適用「舊制」：房屋部分按財產交易所得併入當年度綜合所得稅，土地部分只課土地增值稅。",
        "舊制的算法跟房地合一完全不同，這個試算幫不上忙。實際情況歡迎直接問我，或找會計師看。",
      ],
      deadline,
    };
  }

  // 相關費用：有單據就核實，沒有就按成交價 3%、上限 30 萬推計
  const assumed = Math.min(Math.round(input.price * ASSUMED_EXPENSE_RATE), ASSUMED_EXPENSE_CAP);
  const expenseMode: "actual" | "assumed" = input.expense === null ? "assumed" : "actual";
  const expenseUsed = expenseMode === "assumed" ? assumed : (input.expense as number);
  if (expenseMode === "actual" && expenseUsed < assumed) {
    notes.push(
      "你填的相關費用 " +
        fmt(expenseUsed) +
        " 元，比「沒有單據時的推計金額」" +
        fmt(assumed) +
        " 元還低。沒有單據時國稅局會按成交價 3%（上限 30 萬）認列，改用推計反而比較有利，可以切過去比比看。"
    );
  }

  const taxableIncome = input.price - input.cost - expenseUsed - input.landIncrement;

  const steps: Step[] = [
    { label: "成交價額", amount: input.price },
    {
      label: "減：取得成本",
      amount: neg(input.cost),
      note: "買入價，加上當時的契稅、印花稅、代書費、規費、仲介費，以及能增加房屋價值的改良費",
    },
    {
      label: "減：相關費用",
      amount: neg(expenseUsed),
      note:
        expenseMode === "assumed"
          ? "沒有單據，按成交價 3% 推計、上限 30 萬"
          : "這次賣屋付出的仲介費、代書費、印花稅等，核實認列",
    },
    {
      label: "減：土地漲價總數額",
      amount: neg(input.landIncrement),
      note: "土地增值稅單上的金額。這段漲價已經課過土地增值稅，不再重複課",
    },
    { label: "＝ 課稅所得", amount: taxableIncome },
  ];

  if (input.landIncrement === 0) {
    notes.push(
      "土地漲價總數額填 0，所以這個結果是「稅金的上限」。這筆金額可以從課稅所得裡扣掉，實際申報時填進去，稅會比這裡算的更少。"
    );
  }

  // 賠售不課稅，但虧損可以在之後 3 年內扣抵，這件事很多人不知道
  if (taxableIncome <= 0) {
    notes.push(
      "算下來是賠售，房地合一稅為 0。這筆交易損失可以在往後 3 年內，扣抵其他房地交易的所得，申報時記得一併提出。"
    );
    return {
      regime: "new",
      holding,
      expenseUsed,
      expenseMode,
      taxableIncome,
      exemption: 0,
      rate: 0,
      rateLabel: "賠售，無應納稅額",
      tax: 0,
      netAfterTax: input.price - input.cost - expenseUsed,
      steps,
      notes,
      deadline,
    };
  }

  const selfUseEligible = input.selfUse && sold >= addYears(acquired, SELF_USE_YEARS);
  if (input.selfUse && !selfUseEligible) {
    notes.push(
      "自住優惠要求「持有並設籍居住連續滿 6 年」，這筆的持有期間還不到 6 年，所以沒有套用，改用一般級距稅率。"
    );
  }

  let rate: number;
  let rateLabel: string;
  let exemption = 0;

  if (selfUseEligible) {
    exemption = Math.min(SELF_USE_EXEMPTION, taxableIncome);
    rate = 0.1;
    rateLabel = "自住優惠 10%（課稅所得 400 萬元以內免稅）";
    steps.push({ label: "減：自住優惠免稅額", amount: neg(exemption), note: "400 萬元以內免稅" });
  } else if (input.special && (bucket === "le2" || bucket === "le5")) {
    rate = 0.2;
    rateLabel = "20%（非自願因素／合建分屋／都更危老，持有 5 年以下適用）";
  } else {
    const table = input.residency === "resident" ? RESIDENT_RATE : NON_RESIDENT_RATE;
    rate = table[bucket];
    rateLabel =
      input.residency === "resident"
        ? Math.round(rate * 100) + "%（境內居住者，" + BUCKET_LABEL[bucket] + "）"
        : Math.round(rate * 100) + "%（非境內居住者，持有" + (bucket === "le2" ? " 2 年以內" : "超過 2 年") + "）";
    if (input.special) {
      notes.push(
        "非自願因素等情形的 20% 稅率，是給「持有 5 年以下」用的。這筆已經持有超過 5 年，一般級距稅率本來就等於或低於 20%，所以直接用級距稅率。"
      );
    }
  }

  const base = taxableIncome - exemption;
  const tax = Math.round(base * rate);
  steps.push({ label: "× 稅率 " + Math.round(rate * 100) + "%", amount: tax, note: rateLabel });

  if (input.residency === "nonResident") {
    notes.push("非中華民國境內居住者只有兩段稅率：持有 2 年以內 45%、超過 2 年 35%，沒有 20% 與 15% 的級距。");
  }
  notes.push("成交價與取得成本都要填「房地合計」的金額（房屋加土地一起），不要只填其中一項。");

  return {
    regime: "new",
    holding,
    expenseUsed,
    expenseMode,
    taxableIncome,
    exemption,
    rate,
    rateLabel,
    tax,
    netAfterTax: input.price - input.cost - expenseUsed - tax,
    steps,
    notes,
    deadline,
  };
}

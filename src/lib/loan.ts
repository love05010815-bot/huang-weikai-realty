/**
 * 房貸月付金試算（本息平均攤還）—— 純計算，不碰畫面。
 *
 * 這是數學，不是法規，所以不會過期。用的是標準的年金現值公式：
 *   月付金 = 本金 × 月利率 ÷ (1 − (1 + 月利率) ^ −期數)
 *
 * 寬限期內只繳利息不還本金，寬限期結束後，用「剩下的期數」重算月付金。
 * 這一點很多人不知道 —— 寬限期不是把還款拉長，是把後面的月付金推高。
 */

export type LoanInput = {
  /** 貸款金額（元） */
  amount: number;
  /** 年利率（%），例如 2.185 */
  annualRate: number;
  /** 貸款年限（年） */
  years: number;
  /** 寬限期（年），只繳息不還本。沒有就填 0 */
  graceYears: number;
};

export type LoanResult = {
  /** 寬限期內每月只繳的利息；沒有寬限期時為 null */
  gracePayment: number | null;
  /** 寬限期結束後（或一開始）的每月本息 */
  monthlyPayment: number;
  /** 總利息支出 */
  totalInterest: number;
  /** 本金加利息的總還款額 */
  totalPayment: number;
  /** 寬限期把月付金推高了多少；沒有寬限期時為 null */
  graceExtraPerMonth: number | null;
  notes: string[];
};

export class LoanInputError extends Error {}

/** 本息平均攤還的月付金。利率 0 的時候公式會除以 0，要另外處理 */
function annuity(principal: number, monthlyRate: number, periods: number): number {
  if (periods <= 0) return 0;
  if (monthlyRate === 0) return principal / periods;
  return (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -periods));
}

export function calcLoan(input: LoanInput): LoanResult {
  const { amount, annualRate, years, graceYears } = input;
  if (!Number.isFinite(amount) || amount <= 0) throw new LoanInputError("貸款金額要大於 0");
  if (!Number.isFinite(annualRate) || annualRate < 0) throw new LoanInputError("利率要填 0 以上的數字");
  if (!Number.isFinite(years) || years <= 0) throw new LoanInputError("貸款年限要大於 0");
  if (!Number.isFinite(graceYears) || graceYears < 0) throw new LoanInputError("寬限期要填 0 以上的數字");
  if (graceYears >= years) throw new LoanInputError("寬限期要短於貸款年限");

  const r = annualRate / 100 / 12;
  const n = Math.round(years * 12);
  const g = Math.round(graceYears * 12);

  const gracePayment = g > 0 ? amount * r : null;
  const monthlyPayment = annuity(amount, r, n - g);

  const graceInterest = g > 0 ? (gracePayment as number) * g : 0;
  const totalPayment = graceInterest + monthlyPayment * (n - g);
  const totalInterest = totalPayment - amount;

  // 沒有寬限期時，同樣條件下的月付金 —— 用來算寬限期把月付金推高多少
  const noGrace = annuity(amount, r, n);
  const graceExtraPerMonth = g > 0 ? monthlyPayment - noGrace : null;

  const notes: string[] = [];
  if (g > 0) {
    notes.push(
      "寬限期不是把還款期拉長，是把本金往後擠。這 " +
        graceYears +
        " 年只繳利息，期滿後要用剩下的 " +
        (years - graceYears) +
        " 年還完全部本金，月付金會比沒有寬限期時多 " +
        Math.round(graceExtraPerMonth as number).toLocaleString("zh-TW") +
        " 元。"
    );
  }
  notes.push("這是本息平均攤還（每月繳一樣多）。若選本金平均攤還，前期會繳比較多、總利息會比較少。");
  notes.push("實際利率、可貸成數與寬限期，由銀行依照個人條件核定，這裡只是先抓個大概。");

  return {
    gracePayment,
    monthlyPayment,
    totalInterest,
    totalPayment,
    graceExtraPerMonth,
    notes,
  };
}

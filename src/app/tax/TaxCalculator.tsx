"use client";

/**
 * 稅費試算的互動介面。
 *
 * 算法完全不寫在這裡 —— 房地合一在 src/lib/land-tax.ts、房貸在 src/lib/loan.ts，
 * 兩個都是純函式，可以單獨拿去驗算。這個檔只負責「收輸入、顯示結果」。
 * 稅率要改請改 land-tax.ts，那裡有官方出處。
 *
 * 金額一律用「萬」當輸入單位 —— 台灣人談房子就是講萬，
 * 逼客戶把 1300 萬換算成 13000000 再輸入，只會讓人打錯。
 * 旁邊即時顯示換算後的元，讓人確認自己沒少打一個零。
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { calcLandTax, type Residency, type TaxResult } from "@/lib/land-tax";
import { calcLoan, type LoanResult } from "@/lib/loan";
import styles from "./tax.module.css";
import home from "../home.module.css";

type Tab = "landTax" | "loan";

const YUAN_PER_WAN = 10_000;

function parseWan(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * YUAN_PER_WAN);
}

function money(n: number): string {
  return n.toLocaleString("zh-TW");
}

/** 大數字換算成「約 X 萬」，房仲跟客戶對話用的單位 */
function inWan(n: number): string {
  const w = n / YUAN_PER_WAN;
  const rounded = Math.abs(w) >= 100 ? Math.round(w) : Math.round(w * 10) / 10;
  return rounded.toLocaleString("zh-TW");
}

function todayISO(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function TaxCalculator() {
  const [tab, setTab] = useState<Tab>("landTax");
  return (
    <>
      <div className={styles.tabs} role="tablist" aria-label="選擇試算工具">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "landTax"}
          className={tab === "landTax" ? `${styles.tab} ${styles.tabOn}` : styles.tab}
          onClick={() => setTab("landTax")}
        >
          🏠 房地合一稅
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "loan"}
          className={tab === "loan" ? `${styles.tab} ${styles.tabOn}` : styles.tab}
          onClick={() => setTab("loan")}
        >
          🏦 房貸月付金
        </button>
      </div>

      {tab === "landTax" ? <LandTaxForm /> : <LoanForm />}
    </>
  );
}

/* ══════════════════ 房地合一稅 ══════════════════ */

function LandTaxForm() {
  const [acquiredAt, setAcquiredAt] = useState("");
  const [soldAt, setSoldAt] = useState("");
  const [priceWan, setPriceWan] = useState("");
  const [costWan, setCostWan] = useState("");
  const [expenseMode, setExpenseMode] = useState<"assumed" | "actual">("assumed");
  const [expenseWan, setExpenseWan] = useState("");
  const [landWan, setLandWan] = useState("");
  const [residency, setResidency] = useState<Residency>("resident");
  const [selfUse, setSelfUse] = useState(false);
  const [special, setSpecial] = useState(false);

  // 出售日預設今天。刻意在掛載後才填，不在 useState 的初始值 ——
  // 這頁是靜態產生的，把「今天」寫進初始值會讓伺服器與瀏覽器算出不同的 HTML。
  useEffect(() => {
    setSoldAt(todayISO());
  }, []);

  const outcome = useMemo(() => {
    const price = parseWan(priceWan);
    const cost = parseWan(costWan);
    if (!acquiredAt || !soldAt || price === null || cost === null) return null;
    try {
      const data = calcLandTax({
        acquiredAt,
        soldAt,
        price,
        cost,
        expense: expenseMode === "assumed" ? null : (parseWan(expenseWan) ?? 0),
        landIncrement: parseWan(landWan) ?? 0,
        residency,
        selfUse,
        special,
      });
      return { ok: true as const, data };
    } catch (e) {
      return { ok: false as const, message: e instanceof Error ? e.message : "輸入有誤" };
    }
  }, [acquiredAt, soldAt, priceWan, costWan, expenseMode, expenseWan, landWan, residency, selfUse, special]);

  return (
    <>
      <div className={styles.form}>
        <div className={styles.grid}>
          <Field label="取得日期" hint="買賣＝完成過戶登記日">
            <input
              className={styles.input}
              type="date"
              value={acquiredAt}
              onChange={(e) => setAcquiredAt(e.target.value)}
            />
          </Field>

          <Field label="出售日期" hint="買賣＝簽約日">
            <input className={styles.input} type="date" value={soldAt} onChange={(e) => setSoldAt(e.target.value)} />
          </Field>

          <MoneyField label="成交價" hint="房屋＋土地合計" value={priceWan} onChange={setPriceWan} placeholder="1300" />

          <MoneyField
            label="當初買入成本"
            hint="買價＋契稅代書費＋裝修改良費"
            value={costWan}
            onChange={setCostWan}
            placeholder="1000"
          />

          <div className={`${styles.field} ${styles.wide}`}>
            <span className={styles.label}>
              這次賣屋的相關費用
              <span className={styles.labelHint}>仲介費、代書費、印花稅等</span>
            </span>
            <div className={styles.seg}>
              <button
                type="button"
                className={expenseMode === "assumed" ? `${styles.segBtn} ${styles.segOn}` : styles.segBtn}
                onClick={() => setExpenseMode("assumed")}
              >
                我沒有留單據（按成交價 3% 推計，上限 30 萬）
              </button>
              <button
                type="button"
                className={expenseMode === "actual" ? `${styles.segBtn} ${styles.segOn}` : styles.segBtn}
                onClick={() => setExpenseMode("actual")}
              >
                我有單據，自己填
              </button>
            </div>
            {expenseMode === "actual" && (
              <MoneyInput value={expenseWan} onChange={setExpenseWan} placeholder="40" />
            )}
          </div>

          <MoneyField
            label="土地漲價總數額"
            hint="土地增值稅單上會有；不知道就留空"
            value={landWan}
            onChange={setLandWan}
            placeholder="0"
          />

          <Field label="賣方身分" hint="影響稅率級距">
            <div className={styles.seg}>
              <button
                type="button"
                className={residency === "resident" ? `${styles.segBtn} ${styles.segOn}` : styles.segBtn}
                onClick={() => setResidency("resident")}
              >
                境內居住者
              </button>
              <button
                type="button"
                className={residency === "nonResident" ? `${styles.segBtn} ${styles.segOn}` : styles.segBtn}
                onClick={() => setResidency("nonResident")}
              >
                非境內居住者
              </button>
            </div>
          </Field>

          <div className={`${styles.field} ${styles.wide}`}>
            <label className={styles.check}>
              <input type="checkbox" checked={selfUse} onChange={(e) => setSelfUse(e.target.checked)} />
              <span className={styles.checkBody}>
                <span className={styles.checkTitle}>符合自住優惠（400 萬免稅，超過部分 10%）</span>
                <span className={styles.checkDesc}>
                  下面四項要<strong>全部</strong>符合才算：
                  <ol>
                    <li>本人、配偶或未成年子女設有戶籍，並持有、居住連續滿 6 年</li>
                    <li>交易前 6 年內沒有出租</li>
                    <li>交易前 6 年內沒有供營業或執行業務使用</li>
                    <li>本人、配偶及未成年子女在交易前 6 年內沒用過這個優惠</li>
                  </ol>
                </span>
              </span>
            </label>
          </div>

          <div className={`${styles.field} ${styles.wide}`}>
            <label className={styles.check}>
              <input type="checkbox" checked={special} onChange={(e) => setSpecial(e.target.checked)} />
              <span className={styles.checkBody}>
                <span className={styles.checkTitle}>屬於非自願因素／合建分屋／都更危老（持有 5 年以下適用 20%）</span>
                <span className={styles.checkDesc}>
                  持有 5 年以下但屬於這些情形的，稅率不是 45% 或 35%，而是 20%。
                  <details className={styles.more}>
                    <summary>財政部認定的非自願性因素有哪七款？</summary>
                    <ol>
                      <li>在工作地買房設籍居住，後來因調職或非自願離職，必須離開原工作地而出售</li>
                      <li>依民法第 796 條，出售被他人越界建屋的那部分土地給房屋所有權人</li>
                      <li>無力清償債務（含欠稅），房地依法遭強制執行而移轉</li>
                      <li>本人、配偶、雙方父母、未成年子女或無謀生能力的成年子女，罹患重大疾病或重大意外傷害，必須賣房負擔醫藥費</li>
                      <li>取得家暴通常保護令，為躲避相對人而出售自住房地</li>
                      <li>與他人共有，其他共有人依土地法第 34 條之 1 未經同意就處分，導致必須一起賣掉自己的持分</li>
                      <li>繼承房地時一併繼承了以該房地抵押的未償債務，因而必須出售</li>
                    </ol>
                    <p>另外，自有土地與建商合建分回後 5 年內出售、參與都更或危老重建取得的房地 5 年內首次移轉，也是 20%。</p>
                  </details>
                </span>
              </span>
            </label>
          </div>
        </div>
      </div>

      {outcome === null && (
        <div className={styles.alert}>
          <p className={styles.alertTitle}>把上面四個欄位填一填，結果會自己跑出來</p>
          <p className={styles.alertBody}>
            最少要有<strong>取得日期、出售日期、成交價、當初買入成本</strong>。其他欄位留空也算得出來，只是會抓保守一點。
          </p>
        </div>
      )}

      {outcome && !outcome.ok && (
        <div className={styles.alert}>
          <p className={styles.alertTitle}>這樣算不出來</p>
          <p className={styles.alertBody}>{outcome.message}</p>
        </div>
      )}

      {outcome && outcome.ok && outcome.data.regime === "old" && (
        <div className={styles.alert}>
          <p className={styles.alertTitle}>這間適用「舊制」，不是房地合一稅</p>
          {outcome.data.notes.map((n) => (
            <p key={n} className={styles.alertBody}>
              {n}
            </p>
          ))}
          <div className={styles.cta}>
            <Link className={`${home.btn} ${home.btnPrimary}`} href="/card/booking">
              預約諮詢，我幫你看實際情況
            </Link>
          </div>
        </div>
      )}

      {outcome && outcome.ok && outcome.data.regime === "new" && <TaxResultCard result={outcome.data} />}
    </>
  );
}

function TaxResultCard({ result }: { result: TaxResult }) {
  return (
    <>
      <div className={styles.result}>
        <div className={styles.resultHead}>
          <div className={styles.resultLabel}>估計應納房地合一稅</div>
          <div className={styles.resultBig}>
            {money(result.tax)}
            <span className={styles.resultUnit}>元</span>
          </div>
          <div className={styles.resultSub}>約 {inWan(result.tax)} 萬元</div>
          <div className={styles.resultFacts}>
            <span className={styles.fact}>持有 {result.holding.label}</span>
            <span className={styles.fact}>{result.rateLabel}</span>
            <span className={styles.fact}>
              扣掉成本費用與稅，約剩 {inWan(result.netAfterTax)} 萬
            </span>
          </div>
        </div>

        <div className={styles.resultBody}>
          <p className={styles.stepsTitle}>怎麼算出來的</p>
          <table className={styles.steps}>
            <tbody>
              {result.steps.map((s) => {
                const isTotal = s.label.startsWith("＝") || s.label.startsWith("×");
                return (
                  <tr key={s.label} className={isTotal ? styles.stepTotal : undefined}>
                    <td className={styles.stepLabel}>
                      {s.label}
                      {s.note && <span className={styles.stepNote}>{s.note}</span>}
                    </td>
                    <td className={styles.stepAmount}>{money(s.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {result.notes.length > 0 && (
            <ul className={styles.notes}>
              {result.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}

          <p className={styles.deadline}>📅 {result.deadline}</p>

          {/* 客戶常常只截「結果」這一塊丟給別人看，所以免責要跟結果黏在一起，
              不能只放在頁面最下面 */}
          <p className={styles.inlineNote}>
            ⚠️ 本試算<strong>僅供參考</strong>，實際稅額<strong>以國稅局核定為準</strong>，不構成稅務意見。
          </p>
        </div>
      </div>

      <div className={styles.cta}>
        <p className={styles.ctaText}>算完想確認實際情況，或想知道這個價格在海線合不合理？</p>
        <Link className={`${home.btn} ${home.btnPrimary}`} href="/card/booking">
          預約諮詢
        </Link>
      </div>
    </>
  );
}

/* ══════════════════ 房貸月付金 ══════════════════ */

function LoanForm() {
  const [amountWan, setAmountWan] = useState("");
  const [rate, setRate] = useState("2.2");
  const [years, setYears] = useState("30");
  const [graceYears, setGraceYears] = useState("0");

  const outcome = useMemo(() => {
    const amount = parseWan(amountWan);
    if (amount === null || amount === 0) return null;
    try {
      const data = calcLoan({
        amount,
        annualRate: Number(rate),
        years: Number(years),
        graceYears: Number(graceYears),
      });
      return { ok: true as const, data };
    } catch (e) {
      return { ok: false as const, message: e instanceof Error ? e.message : "輸入有誤" };
    }
  }, [amountWan, rate, years, graceYears]);

  return (
    <>
      <div className={styles.form}>
        <div className={styles.grid}>
          <MoneyField label="貸款金額" hint="房價扣掉自備款" value={amountWan} onChange={setAmountWan} placeholder="1000" />

          <Field label="年利率" hint="填銀行給你的數字，例如 2.2">
            <div className={styles.amountWrap}>
              <input
                className={styles.input}
                type="number"
                inputMode="decimal"
                step="0.001"
                min="0"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
              <span className={styles.unit}>%</span>
            </div>
          </Field>

          <Field label="貸款年限" hint="常見 20、30、40 年">
            <div className={styles.amountWrap}>
              <input
                className={styles.input}
                type="number"
                inputMode="numeric"
                step="1"
                min="1"
                value={years}
                onChange={(e) => setYears(e.target.value)}
              />
              <span className={styles.unit}>年</span>
            </div>
          </Field>

          <Field label="寬限期" hint="只繳息不還本的年數，沒有就填 0">
            <div className={styles.amountWrap}>
              <input
                className={styles.input}
                type="number"
                inputMode="numeric"
                step="1"
                min="0"
                value={graceYears}
                onChange={(e) => setGraceYears(e.target.value)}
              />
              <span className={styles.unit}>年</span>
            </div>
          </Field>
        </div>
      </div>

      {outcome === null && (
        <div className={styles.alert}>
          <p className={styles.alertTitle}>填一下貸款金額，月付金就出來了</p>
          <p className={styles.alertBody}>利率、年限、寬限期已經先帶了常見值，你可以照銀行給的條件改。</p>
        </div>
      )}

      {outcome && !outcome.ok && (
        <div className={styles.alert}>
          <p className={styles.alertTitle}>這樣算不出來</p>
          <p className={styles.alertBody}>{outcome.message}</p>
        </div>
      )}

      {outcome && outcome.ok && <LoanResultCard result={outcome.data} />}
    </>
  );
}

function LoanResultCard({ result }: { result: LoanResult }) {
  const hasGrace = result.gracePayment !== null;
  return (
    <>
      <div className={styles.result}>
        <div className={styles.resultHead}>
          <div className={styles.resultLabel}>{hasGrace ? "寬限期結束後，每月要繳" : "每月本息攤還"}</div>
          <div className={styles.resultBig}>
            {money(Math.round(result.monthlyPayment))}
            <span className={styles.resultUnit}>元</span>
          </div>
          {hasGrace && (
            <div className={styles.resultSub}>
              寬限期內每月只繳利息 {money(Math.round(result.gracePayment as number))} 元
            </div>
          )}
          <div className={styles.resultFacts}>
            <span className={styles.fact}>總利息約 {inWan(result.totalInterest)} 萬</span>
            <span className={styles.fact}>本息總還款約 {inWan(result.totalPayment)} 萬</span>
          </div>
        </div>

        <div className={styles.resultBody}>
          <ul className={styles.notes}>
            {result.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <p className={styles.inlineNote}>
            ⚠️ 本試算<strong>僅供參考</strong>，實際利率、成數與寬限期<strong>以銀行核定為準</strong>。
          </p>
        </div>
      </div>

      <div className={styles.cta}>
        <p className={styles.ctaText}>月付金抓好了，接下來就是挑房子。</p>
        <Link className={`${home.btn} ${home.btnPrimary}`} href="/listings">
          看看目前的好案
        </Link>
      </div>
    </>
  );
}

/* ══════════════════ 共用的小元件 ══════════════════ */

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>
        {label}
        {hint && <span className={styles.labelHint}>{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function MoneyInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const yuan = parseWan(value);
  return (
    <>
      <div className={styles.amountWrap}>
        <input
          className={styles.input}
          type="number"
          inputMode="decimal"
          step="1"
          min="0"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className={styles.unit}>萬</span>
      </div>
      {/* 即時換算成元，讓人確認自己沒有少打或多打一個零 */}
      <span className={styles.echo}>{yuan !== null && yuan > 0 ? `= ${money(yuan)} 元` : ""}</span>
    </>
  );
}

function MoneyField({
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>
        {label}
        {hint && <span className={styles.labelHint}>{hint}</span>}
      </span>
      <MoneyInput value={value} onChange={onChange} placeholder={placeholder} />
    </label>
  );
}

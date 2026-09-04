"use client";

/**
 * 青安 3.0 資格檢測器 —— 「能不能辦、能貸多少、月付大概多少」三件事一次答。
 *
 * 算法在 src/lib/youth-loan.ts（純函式，門檻數字與官方出處都在那個檔頭），
 * 這裡只收輸入、顯示結果。門檻要改請改那邊，改完跑 npm run check:youth。
 *
 * 版型刻意做成「一題一卡、點選項」而不是一張表單：會來算青安的多半是第一次
 * 買房的年輕人、多半在手機上看，點比填快，而且每個選項底下都寫了「為什麼這樣問」。
 * 金額仍用「萬」當輸入單位，跟其他分頁一致。
 *
 * 2026-09-04 系統擁有者實測後回報「點完數字結果沒有跳出來」—— 兩個原因一起修：
 *   ① 四題選擇題原本沒有預設值，只填年齡和總價不會出結果，而「還差哪幾題」的提示
 *      在 7 張題卡的最下面，畫面上看不到。現在四題先帶最常見的答案（所得 200 萬以下、
 *      全家沒房、沒辦過、一般家庭），填完年齡和總價就出結果；結果卡上會把你的回答
 *      再列一次，讓人核對預設值對不對。
 *   ② 結果卡在 7 張題卡下面，桌機一個畫面裝不下、手機更遠。現在只要結果在畫面下方
 *      看不到，底下就浮一條摘要（符合／不符、可貸多少、月付多少），點了捲過去。
 *      這是專案鐵律「會改變狀態的操作一定要有看得見的回應」（見 learning_silent_failure_pattern）。
 *
 * 同日第二輪：不符資格時先給一塊紅色的「✗ 不符合資格」橫幅，底下接一份逐條 ✓／✗ 的
 * 「資格門檻快篩」（年齡、年齡＋年限、所得、總價、無自有住宅、一生一次、額度、其他條件），
 * 符合的那幾列也照樣列出來 —— 客戶要的是「我到底卡在哪一條」，不是一段話。
 * 符合資格時同一份清單放在結果卡裡，全部打勾。
 *
 * 地區預設「臺中市及其他縣市」—— 這個站的客戶九成在台中海線。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AGE_PLUS_TERM_CAP,
  calcYouthLoan,
  FIRST_RATE,
  LOAN_CAP,
  MAX_AGE_EXCLUSIVE,
  MAX_GRACE_YEARS,
  MAX_YEARS,
  maxYearsForAge,
  MIN_AGE,
  PRICE_CAP,
  PROGRAM,
  RULES_CHECKED_AT,
  SUBSIDY_TOTAL_PCT,
  type Check,
  type CheckStatus,
  type Household,
  type Region,
  type ScheduleRow,
  type YouthLoanResult,
} from "@/lib/youth-loan";
import styles from "./tax.module.css";
import home from "../home.module.css";

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

/** 快篩列的標籤去掉括號補充，給橫幅與底部摘要列用（「年齡（未滿 50 歲）」→「年齡」） */
function shortLabel(c: Check): string {
  return c.label.replace(/（.*$/, "");
}

const REGION_ITEMS: { value: Region; title: string; desc: string }[] = (["other", "newTaipeiHsinchu", "taipei"] as Region[]).map(
  (r) => ({
    value: r,
    title: PRICE_CAP[r].label,
    desc: `總價上限 ${inWan(PRICE_CAP[r].cap)} 萬`,
  })
);

const HOUSEHOLD_ITEMS: { value: Household; title: string; desc: string }[] = [
  { value: "general", title: "一般", desc: `額度最高 ${inWan(LOAN_CAP.general.cap)} 萬` },
  {
    value: "newlywed",
    title: "新婚：申請日前 2 年內完成結婚登記",
    desc: `額度最高 ${inWan(LOAN_CAP.newlywed.cap)} 萬。加碼的部分在婚姻關係消滅那天起停止利息補貼`,
  },
  {
    value: "children",
    title: "育有未成年子女，或本人／配偶懷孕中",
    desc: `額度最高 ${inWan(LOAN_CAP.children.cap)} 萬。離婚或單親者，未成年子女要與借款人同戶籍且有監護權；懷孕用孕婦健康手冊證明`,
  },
];

const HOUSEHOLD_SHORT: Record<Household, string> = {
  general: "一般家庭",
  newlywed: "新婚 2 年內",
  children: "育有未成年子女",
};

export default function YouthLoanForm() {
  const [age, setAge] = useState("");
  // 四題選擇題先帶最常見的答案，填完年齡和總價就出結果（理由見檔頭）
  const [incomeOverCap, setIncomeOverCap] = useState(false);
  const [familyOwnsHome, setFamilyOwnsHome] = useState(false);
  const [usedBefore, setUsedBefore] = useState(false);
  const [region, setRegion] = useState<Region>("other");
  const [priceWan, setPriceWan] = useState("");
  const [household, setHousehold] = useState<Household>("general");
  const [years, setYears] = useState("30");
  const [graceYears, setGraceYears] = useState("0");
  const [amountWan, setAmountWan] = useState("");

  const ageNum = age.trim() === "" || !Number.isFinite(Number(age)) ? null : Number(age);
  const price = parseWan(priceWan);
  const wantAmount = parseWan(amountWan);

  // 年齡一填就先講最長能貸幾年 —— 這是 3.0 最常被問的一題
  let ageHint = "";
  if (ageNum !== null) {
    if (ageNum < MIN_AGE) ageHint = `要滿 ${MIN_AGE} 歲才能當借款人`;
    else if (ageNum >= MAX_AGE_EXCLUSIVE) ageHint = `已滿 ${MAX_AGE_EXCLUSIVE} 歲，不符 3.0 的年齡門檻`;
    else if (ageNum <= AGE_PLUS_TERM_CAP - MAX_YEARS) ageHint = `最長可貸 ${MAX_YEARS} 年，不受「年齡＋年限 ≤ 80」影響`;
    else ageHint = `最長可貸 ${maxYearsForAge(ageNum)} 年（80 － ${Math.floor(ageNum)}）`;
  }

  const missing: string[] = [];
  if (ageNum === null) missing.push("年齡");
  if (price === null || price === 0) missing.push("房屋總價");

  const outcome = useMemo(() => {
    if (ageNum === null || price === null || price === 0) return null;
    try {
      const data = calcYouthLoan({
        age: ageNum,
        incomeOverCap,
        familyOwnsHome,
        usedBefore,
        region,
        price,
        household,
        years: Number(years),
        graceYears: Number(graceYears),
        amount: wantAmount || null,
      });
      return { ok: true as const, data };
    } catch (e) {
      return { ok: false as const, message: e instanceof Error ? e.message : "輸入有誤" };
    }
  }, [ageNum, incomeOverCap, familyOwnsHome, usedBefore, region, price, household, years, graceYears, wantAmount]);

  // 結果卡上把回答再列一次 —— 四題有預設值，要讓人一眼核對「這是不是我的情況」
  const recap =
    ageNum !== null && price !== null
      ? [
          `${Math.floor(ageNum)} 歲`,
          incomeOverCap ? "本人年所得超過 200 萬" : "本人年所得 200 萬以下",
          familyOwnsHome ? "全家名下有房" : "全家名下沒房",
          usedBefore ? "辦過青安" : "沒辦過青安",
          `${PRICE_CAP[region].label}・總價 ${inWan(price)} 萬`,
          HOUSEHOLD_SHORT[household],
        ].join("・")
      : "";

  /* ── 結果在畫面下方看不到時，底下浮一條摘要（理由見檔頭 ②） ── */
  const resultRef = useRef<HTMLDivElement>(null);
  const [resultPos, setResultPos] = useState<"below" | "visible" | "above">("below");
  useEffect(() => {
    const el = resultRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        setResultPos(entry.isIntersecting ? "visible" : entry.boundingClientRect.top < 0 ? "above" : "below");
      },
      // 上緣扣掉固定 header 的高度，被 header 蓋住不算看得到
      { rootMargin: "-80px 0px 0px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const showBar = outcome !== null && outcome.ok && resultPos === "below";
  const jumpToResult = () => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <>
      <div className={styles.notice}>
        <strong>青安 3.0 已於 {PROGRAM.applyFrom}上路</strong>，申辦到 {PROGRAM.applyUntil}（撥款最晚 {PROGRAM.disburseUntil}）。
        以「向銀行送件日」為準：7 月 31 日前已送件的仍走 2.0，符合新婚或育兒加碼的可在撥貸前撤案重送。
      </div>

      <div className={styles.form}>
        <p className={styles.quizIntro}>
          新制多了<strong>年齡、所得、總價</strong>三道門檻。填好<strong>年齡</strong>和<strong>房屋總價</strong>，
          結果就會跑出來；其他題已先帶最常見的答案，不是你的情況就點一下改。
        </p>

        <div className={styles.quiz}>
          <Question
            n={1}
            title="你的年齡？"
            desc={`以向銀行送件那天的足歲為準。3.0 新增：申貸時要未滿 ${MAX_AGE_EXCLUSIVE} 歲，而且「年齡＋貸款年限」加起來不能超過 ${AGE_PLUS_TERM_CAP}。`}
          >
            <div className={styles.qGrid}>
              <NumInput label="足歲" unit="歲" value={age} onChange={setAge} placeholder="35" min={0} max={99} />
            </div>
            <span className={styles.echo}>{ageHint}</span>
          </Question>

          <Question
            n={2}
            title="你「本人」的年所得？"
            desc="只看借款人本人，配偶不併計。銀行透過 MyData 或國稅局的「各類所得資料清單」查核；自營商可用資金流程或營業資料佐證。"
          >
            <Options
              name="本人年所得"
              value={incomeOverCap}
              onChange={setIncomeOverCap}
              items={[
                { value: false, title: "200 萬以下" },
                { value: true, title: "超過 200 萬", desc: "不符 3.0 的排富門檻" },
              ]}
            />
          </Question>

          <Question
            n={3}
            title="你們全家名下有房子嗎？"
            desc="本人、配偶、未成年子女的「全國財產稅總歸戶財產查詢清單」都要查無建物。這條 2.0 就有，不是新的。"
          >
            <Options
              name="名下有無自有住宅"
              value={familyOwnsHome}
              onChange={setFamilyOwnsHome}
              items={[
                { value: false, title: "都沒有", desc: "只有停車位或靈骨塔位的，銀行查核後可視為沒有房子" },
                { value: true, title: "有", desc: "全家任一人名下有建物就不符" },
              ]}
            />
          </Question>

          <Question n={4} title="你以前辦過青安貸款嗎？" desc="一生只能辦一次，而且跨版本只算一次。">
            <Options
              name="是否辦過青安"
              value={usedBefore}
              onChange={setUsedBefore}
              items={[
                { value: false, title: "沒辦過" },
                {
                  value: true,
                  title: "辦過",
                  desc: "112 年 8 月 1 日之後領過新青安（2.0），或在農業金融機構領過農安貸款，都不能再辦 3.0",
                },
              ]}
            />
          </Question>

          <Question
            n={5}
            title="房子在哪裡、總價多少？"
            desc="3.0 新增的總價門檻分三級。鑑價與買賣總價取高的那個不能超過上限；鑑價比成交價高的話，請填鑑價。"
          >
            <Options name="房屋所在地" value={region} onChange={setRegion} items={REGION_ITEMS} />
            <div className={styles.qGrid}>
              <NumInput label="房屋總價" unit="萬" value={priceWan} onChange={setPriceWan} placeholder="1200" min={0} />
            </div>
            <span className={styles.echo}>{price !== null && price > 0 ? `= ${money(price)} 元` : ""}</span>
          </Question>

          <Question
            n={6}
            title="你的婚育狀況？"
            desc="3.0 加碼：新婚與育兒家庭的額度比一般高，但成數一樣最高 8 成，房子總價還是會卡住能貸多少。"
          >
            <Options name="婚育狀況" value={household} onChange={setHousehold} items={HOUSEHOLD_ITEMS} />
          </Question>

          <Question
            n={7}
            title="想貸幾年、要不要寬限期？"
            desc={`最長 ${MAX_YEARS} 年、寬限期最長 ${MAX_GRACE_YEARS} 年；41 歲起會被「年齡＋年限 ≤ ${AGE_PLUS_TERM_CAP}」壓縮。想貸的金額留空，就直接用可貸上限來算。`}
          >
            <div className={styles.qGrid}>
              <NumInput label="貸款年限" unit="年" value={years} onChange={setYears} min={1} max={MAX_YEARS} />
              <NumInput label="寬限期（沒有填 0）" unit="年" value={graceYears} onChange={setGraceYears} min={0} max={MAX_GRACE_YEARS} />
              <NumInput label="想貸多少（選填）" unit="萬" value={amountWan} onChange={setAmountWan} placeholder="留空＝上限" min={0} />
            </div>
          </Question>
        </div>
      </div>

      {/* 結果區。外面包一層給 IntersectionObserver 盯著，判斷「結果在畫面外」 */}
      <div ref={resultRef} className={styles.resultAnchor}>
        {outcome === null && (
          <div className={styles.alert}>
            <p className={styles.alertTitle}>填好年齡和房屋總價，結果會自己跑出來</p>
            <p className={styles.alertBody}>
              還差：<strong>{missing.join("、")}</strong>。其他題已先帶最常見的答案（所得 200 萬以下、全家沒房、沒辦過、一般家庭），
              年限 30 年、沒有寬限期，都可以照自己的情況改。
            </p>
          </div>
        )}

        {outcome && !outcome.ok && (
          <div className={styles.alert}>
            <p className={styles.alertTitle}>這樣算不出來</p>
            <p className={styles.alertBody}>{outcome.message}</p>
          </div>
        )}

        {outcome && outcome.ok && !outcome.data.eligible && <Ineligible result={outcome.data} recap={recap} />}

        {outcome && outcome.ok && outcome.data.eligible && <YouthResultCard result={outcome.data} recap={recap} />}
      </div>

      {showBar && outcome && outcome.ok && (
        <button
          type="button"
          className={outcome.data.eligible ? styles.stickyBar : `${styles.stickyBar} ${styles.stickyBarFail}`}
          onClick={jumpToResult}
          aria-label="捲到檢測結果"
        >
          <span className={styles.stickyText}>
            {outcome.data.eligible
              ? `✅ 符合青安 3.0・可貸上限 ${inWan(outcome.data.maxAmount)} 萬・前 3 年月付約 ${money(Math.round(outcome.data.firstMonthly))} 元`
              : `✗ 不符合青安 3.0 資格：${outcome.data.checks.filter((c) => c.status === "fail").map(shortLabel).join("、")}`}
          </span>
          <span className={styles.stickyGo}>看結果 ↓</span>
        </button>
      )}
    </>
  );
}

/* ══════════════════ 結果 ══════════════════ */

const CHECK_GLYPH: Record<CheckStatus, string> = { ok: "✓", fail: "✗", fix: "!" };
const CHECK_TEXT: Record<CheckStatus, string> = { ok: "符合", fail: "不符", fix: "要調整" };

/** 資格門檻快篩：一道門檻一列，符合的也列出來，客戶要看的是「卡在哪一條」 */
function Checklist({ checks }: { checks: Check[] }) {
  const iconClass = (s: CheckStatus) =>
    s === "ok" ? styles.checkOk : s === "fail" ? styles.checkFail : styles.checkFix;
  return (
    <div className={styles.checks}>
      <p className={styles.stepsTitle}>資格門檻快篩</p>
      <ul className={styles.checkList}>
        {checks.map((c) => (
          <li key={c.key} className={styles.checkRow}>
            <span className={`${styles.checkIcon} ${iconClass(c.status)}`} role="img" aria-label={CHECK_TEXT[c.status]}>
              {CHECK_GLYPH[c.status]}
            </span>
            <span className={styles.checkText}>
              <strong className={c.status === "fail" ? styles.checkLabelFail : undefined}>{c.label}</strong>：{c.detail}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Ineligible({ result, recap }: { result: YouthLoanResult; recap: string }) {
  const fails = result.checks.filter((c) => c.status === "fail");
  return (
    <>
      <div className={styles.result}>
        {/* 先給一塊明顯的紅色橫幅，再列是哪幾條沒過 */}
        <div className={styles.failHead}>
          <div className={styles.resultLabel}>青安 3.0 資格檢測</div>
          <div className={styles.failBig}>✗ 不符合資格</div>
          <div className={styles.resultSub}>
            有 {fails.length} 項沒過：{fails.map(shortLabel).join("、")}
          </div>
        </div>

        <div className={styles.resultBody}>
          {recap && (
            <p className={styles.recap}>
              你的回答：<strong>{recap}</strong>
            </p>
          )}

          <Checklist checks={result.checks} />

          <p className={styles.inlineNote}>
            青安辦不了不代表買不了房：一般房貸沒有這幾道門檻，差別在利率與成數要看各銀行。
            把你的情況講給我聽，我幫你看還有哪些走法。
          </p>
        </div>
      </div>

      <div className={styles.cta}>
        <Link className={`${home.btn} ${home.btnPrimary}`} href="/card/booking">
          預約諮詢，我幫你看別的方案
        </Link>
      </div>
    </>
  );
}

function spanLabel(row: ScheduleRow): string {
  return row.fromYear === row.toYear ? `第 ${row.fromYear} 年` : `第 ${row.fromYear}～${row.toYear} 年`;
}

function YouthResultCard({ result, recap }: { result: YouthLoanResult; recap: string }) {
  const usingLess = result.amount !== result.maxAmount;
  return (
    <>
      <div className={styles.result}>
        <div className={styles.resultHead}>
          <div className={styles.resultLabel}>✓ 符合青安 3.0 資格・估計可貸上限</div>
          <div className={styles.resultBig}>
            {inWan(result.maxAmount)}
            <span className={styles.resultUnit}>萬</span>
          </div>
          <div className={styles.resultSub}>
            {usingLess ? `以你想貸的 ${inWan(result.amount)} 萬計：` : ""}
            前 3 年利率 {FIRST_RATE}%，每月約 {money(Math.round(result.firstMonthly))} 元
            {result.graceYears > 0 ? "（寬限期內只繳利息）" : ""}
          </div>
          <div className={styles.resultFacts}>
            <span className={styles.fact}>最長可貸 {result.maxYears} 年</span>
            <span className={styles.fact}>
              用 {result.years} 年{result.graceYears > 0 ? `・寬限 ${result.graceYears} 年` : ""}試算
            </span>
            <span className={styles.fact}>補貼 6 年約省 {inWan(result.subsidySaved)} 萬利息</span>
            <span className={styles.fact}>總利息約 {inWan(result.totalInterest)} 萬</span>
          </div>
        </div>

        <div className={styles.resultBody}>
          {recap && (
            <p className={styles.recap}>
              你的回答：<strong>{recap}</strong>
            </p>
          )}

          <Checklist checks={result.checks} />

          {/* 輸入被自動修正的（寬限期太長），結果卡上面要講 —— 使用者填的跟算的不一樣會以為算錯 */}
          {result.warnings.length > 0 && (
            <div className={styles.resultWarn}>
              {result.warnings.map((w) => (
                <p key={w}>⚠️ {w}</p>
              ))}
            </div>
          )}

          <p className={styles.stepsTitle}>可貸多少怎麼算</p>
          <table className={styles.steps}>
            <tbody>
              {result.steps.map((s) => (
                <tr key={s.label} className={s.label.startsWith("＝") ? styles.stepTotal : undefined}>
                  <td className={styles.stepLabel}>
                    {s.label}
                    {s.note && <span className={styles.stepNote}>{s.note}</span>}
                  </td>
                  <td className={styles.stepAmount}>{money(s.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className={`${styles.stepsTitle} ${styles.sectionGap}`}>月付金怎麼變（補貼「3＋3」逐年退場）</p>
          <table className={styles.steps}>
            <tbody>
              {result.schedule.map((row) => (
                <tr key={row.fromYear}>
                  <td className={styles.stepLabel}>
                    {spanLabel(row)}
                    <span className={styles.stepNote}>
                      利率 {row.annualRate}%
                      {row.subsidyTicks > 0 ? `・補貼 ${row.subsidyTicks} 碼` : "・補貼退場，回到合約利率"}
                      {row.interestOnly ? "・寬限期只繳利息" : ""}
                    </span>
                  </td>
                  <td className={styles.stepAmount}>
                    {money(Math.round(row.monthly))}
                    <span className={styles.stepNote}>元／月</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className={styles.benefit}>
            💰 利息補貼 6 年合計約省 <strong>{money(Math.round(result.subsidySaved))} 元</strong>（約 {inWan(result.subsidySaved)} 萬）。
            官方懶人包用「貸款金額 × {SUBSIDY_TOTAL_PCT}%」粗估是 {inWan(result.subsidySavedRough)} 萬；這裡逐月照餘額算，本金逐月在減少，所以略少一點。
          </p>

          <ul className={styles.notes}>
            {result.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>

          {/* 客戶常常只截「結果」這一塊丟給別人看，所以免責要跟結果黏在一起 */}
          <p className={styles.inlineNote}>
            ⚠️ 本試算<strong>僅供參考</strong>，能不能核貸、成數與利率<strong>以承辦公股銀行審核為準</strong>；
            基準利率會隨郵儲利率浮動。規則最後核對於 {RULES_CHECKED_AT}。
          </p>
        </div>
      </div>

      <div className={styles.cta}>
        <p className={styles.ctaText}>算完想確認銀行實際能核多少，或想找總價在門檻內的好案？</p>
        <Link className={`${home.btn} ${home.btnPrimary}`} href="/card/booking">
          預約諮詢
        </Link>
      </div>
    </>
  );
}

/* ══════════════════ 題卡與選項 ══════════════════ */

function Question({ n, title, desc, children }: { n: number; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className={styles.q} aria-label={`第 ${n} 題 ${title}`}>
      <div className={styles.qHead}>
        <span className={styles.qNum} aria-hidden>
          {n}
        </span>
        <div className={styles.qText}>
          <h3 className={styles.qTitle}>{title}</h3>
          {desc && <p className={styles.qDesc}>{desc}</p>}
        </div>
      </div>
      <div className={styles.qBody}>{children}</div>
    </section>
  );
}

function Options<T extends string | boolean>({
  name,
  value,
  onChange,
  items,
}: {
  name: string;
  value: T | null;
  onChange: (v: T) => void;
  items: { value: T; title: string; desc?: string }[];
}) {
  return (
    <div className={styles.opts} role="radiogroup" aria-label={name}>
      {items.map((it) => {
        const on = value === it.value;
        return (
          <button
            key={String(it.value)}
            type="button"
            role="radio"
            aria-checked={on}
            className={on ? `${styles.opt} ${styles.optOn}` : styles.opt}
            onClick={() => onChange(it.value)}
          >
            <span className={styles.optBody}>
              <span className={styles.optTitle}>{it.title}</span>
              {it.desc && <span className={styles.optDesc}>{it.desc}</span>}
            </span>
            <span className={styles.optMark} aria-hidden>
              {on ? "✓" : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function NumInput({
  label,
  unit,
  value,
  onChange,
  placeholder,
  min,
  max,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  min?: number;
  max?: number;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.labelHint}>{label}</span>
      <div className={styles.amountWrap}>
        <input
          className={styles.input}
          type="number"
          inputMode="numeric"
          step="1"
          min={min}
          max={max}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className={styles.unit}>{unit}</span>
      </div>
    </label>
  );
}

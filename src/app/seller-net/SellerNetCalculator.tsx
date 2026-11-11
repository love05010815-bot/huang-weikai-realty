"use client";

/**
 * 賣方實拿速算 —— 畫面。三個分頁：出售（賣方實拿）／贈與稅／遺產稅。
 *
 * 算法完全不寫在這裡：src/lib/seller-net.ts（數字在 seller-net-data.ts，改完跑 `npm run check:seller-net`）。
 * 表單欄位、三種稅制、豪宅門檻、自住／重購退稅、3% 概算、贈與、繼承，都照系統擁有者給的參考頁做；
 * 跟參考頁不同的兩點：① 不用按「開始試算」，填到哪算到哪；② 舊制也算實拿（參考頁舊制只算所得，不算實拿）。
 *
 * 狀態只存客戶打的原文（字串），每次 render 從原文算，永遠不會不同步。
 * ⚠️ 結果在畫面外的老毛病（這個站被回報過六次）：表單很長，結果出現時不在畫面裡就浮一條「看結果 ↓」。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { TaxInputError } from "@/lib/land-tax";
import {
  REGIME_LABEL,
  calcEstateTax,
  calcGiftTax,
  calcNewRegime,
  calcOldRegime,
  fmtWan,
  holdingOf,
  imputedRateOf,
  r1,
  regimeOf,
  type NewResult,
  type OldResult,
} from "@/lib/seller-net";
import { ESTATE, GIFT, IMPUTED_COUNTIES, IMPUTED_RATE, INCOME_TAX_BRACKETS, LUXURY_TIERS, type LuxuryCode } from "@/lib/seller-net-data";
import tax from "../tax/tax.module.css";
import s from "./seller-net.module.css";

type Tab = "sell" | "gift" | "estate";

const num = (v: string): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const numOrNull = (v: string): number | null => (v.trim() === "" ? null : num(v));
const W = fmtWan;
const signedPct = (n: number) => `${n >= 0 ? "+" : ""}${r1(n)}%`;

function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const CHART_COLORS = ["#2fa894", "#7ac7b8", "#f2b84b", "#e08a3c", "#1d5c76", "#6b8fb0", "#b91c1c", "#c2410c"];

/** 「淨額 2,811 萬以下 10%、2,811～5,621 萬 15%、超過 5,621 萬 20%」——從資料表長出來，數字改了這裡會跟著變 */
function bracketText(brackets: readonly { upTo: number; rate: number }[], noun: string): string {
  const w = (n: number) => n.toLocaleString("zh-TW");
  return brackets
    .map((b, i) => {
      const pct = `${Math.round(b.rate * 100)}%`;
      if (i === 0) return `${noun} ${w(b.upTo)} 萬以下 ${pct}`;
      const prev = brackets[i - 1].upTo;
      return b.upTo === Infinity ? `超過 ${w(prev)} 萬 ${pct}` : `${w(prev)}～${w(b.upTo)} 萬 ${pct}`;
    })
    .join("、");
}

/* ───────── 小元件 ───────── */

function Field({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={wide ? `${tax.field} ${tax.wide}` : tax.field}>
      <span className={tax.label}>
        {label}
        {hint ? <span className={tax.labelHint}>{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

function NumInput({ value, onChange, placeholder, step = "1" }: { value: string; onChange: (v: string) => void; placeholder?: string; step?: string }) {
  return <input className={tax.input} type="number" inputMode="decimal" min="0" step={step} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />;
}

function Check({ on, disabled, title, desc, onToggle }: { on: boolean; disabled?: boolean; title: string; desc?: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`${s.chk} ${on && !disabled ? s.chkOn : ""} ${disabled ? s.chkOff : ""}`}
      aria-pressed={on && !disabled}
      disabled={disabled}
      onClick={onToggle}
    >
      <span className={s.chkBox} aria-hidden="true">
        {on && !disabled ? "✓" : ""}
      </span>
      <span>
        <span className={s.chkTitle}>{title}</span>
        {desc ? <span className={s.chkDesc}>{desc}</span> : null}
      </span>
    </button>
  );
}

function Row({ label, amount, note, tag, tagKind, total, negative }: { label: string; amount: string; note?: string; tag?: string; tagKind?: "warn" | "bad"; total?: boolean; negative?: boolean }) {
  return (
    <tr className={total ? tax.stepTotal : undefined}>
      <td>
        <span className={tax.stepLabel}>
          {label}
          {tag ? <span className={`${s.tag} ${tagKind === "warn" ? s.tagWarn : tagKind === "bad" ? s.tagBad : ""}`}>{tag}</span> : null}
        </span>
        {note ? <span className={tax.stepNote}>{note}</span> : null}
      </td>
      <td className={negative ? `${tax.stepAmount} ${s.negative}` : tax.stepAmount}>{amount}</td>
    </tr>
  );
}

function Sec({ title }: { title: string }) {
  return (
    <tr className={s.sectionRow}>
      <td colSpan={2}>{title}</td>
    </tr>
  );
}

function Metric({ label, value, sub, kind }: { label: string; value: string; sub?: string; kind?: "good" | "bad" }) {
  return (
    <div className={`${s.metric} ${kind === "good" ? s.metricGood : kind === "bad" ? s.metricBad : ""}`}>
      <div className={s.metricLabel}>{label}</div>
      <div className={s.metricVal}>{value}</div>
      {sub ? <div className={s.metricSub}>{sub}</div> : null}
    </div>
  );
}

/* ───────── 出售 ───────── */

type SellForm = {
  salePrice: string;
  buyPrice: string;
  buyDate: string;
  sellDate: string;
  houseValue: string;
  landValue: string;
  county: string;
  district: string;
  imputedRate: string;
  luxuryCode: LuxuryCode;
  area: string;
  noParkingPrice: string;
  bracketRate: string;
  buyAgentFee: string;
  buyDeedTax: string;
  buyNotaryFee: string;
  renovation: string;
  otherBuyCost: string;
  landIncrement: string;
  buyCostsOld: string;
  agentFee: string;
  notaryFee: string;
  landTax: string;
  useStd: boolean;
  selfUse: boolean;
  repurchase: boolean;
  newPrice: string;
  newDate: string;
};

const SELL0: SellForm = {
  salePrice: "",
  buyPrice: "",
  buyDate: "",
  sellDate: "",
  houseValue: "",
  landValue: "",
  county: "臺中市",
  district: "",
  imputedRate: "",
  luxuryCode: "major",
  area: "",
  noParkingPrice: "",
  bracketRate: "",
  buyAgentFee: "",
  buyDeedTax: "",
  buyNotaryFee: "",
  renovation: "",
  otherBuyCost: "",
  landIncrement: "",
  buyCostsOld: "",
  agentFee: "",
  notaryFee: "",
  landTax: "",
  useStd: false,
  selfUse: false,
  repurchase: false,
  newPrice: "",
  newDate: "",
};

function SellTab({ onResult }: { onResult: (text: string | null) => void }) {
  const [f, setF] = useState<SellForm>(SELL0);
  const up = (patch: Partial<SellForm>) => setF((prev) => ({ ...prev, ...patch }));

  // 預計售出日期預設今天。在 effect 裡設，SSR 跟瀏覽器的「今天」才不會對不上
  useEffect(() => {
    setF((prev) => (prev.sellDate ? prev : { ...prev, sellDate: todayISO() }));
  }, []);

  const regime = regimeOf(f.buyDate);
  const holding = holdingOf(f.buyDate, f.sellDate);
  const sp = num(f.salePrice);
  const bp = num(f.buyPrice);
  const selfUseAllowed = !holding || holding.sixYears;

  const oldRes: OldResult | null = useMemo(() => {
    if (regime !== "superOld" && regime !== "old") return null;
    return calcOldRegime({
      regime,
      salePrice: sp,
      buyPrice: bp,
      houseValue: num(f.houseValue),
      landValue: num(f.landValue),
      imputedRate: num(f.imputedRate),
      luxuryCode: f.luxuryCode,
      area: numOrNull(f.area),
      noParkingPrice: numOrNull(f.noParkingPrice),
      bracketRate: numOrNull(f.bracketRate),
      agentFee: num(f.agentFee),
      notaryFee: num(f.notaryFee),
      landTax: num(f.landTax),
      buyCosts: num(f.buyCostsOld),
    });
  }, [regime, sp, bp, f]);

  const { newRes, newErr, newMissing } = useMemo(() => {
    if (regime !== "new") return { newRes: null as NewResult | null, newErr: null as string | null, newMissing: [] as string[] };
    const missing: string[] = [];
    if (!sp) missing.push("預計成交總價");
    if (!bp) missing.push("原始購入總價");
    if (!f.sellDate) missing.push("預計售出日期");
    if (missing.length) return { newRes: null, newErr: null, newMissing: missing };
    try {
      const r = calcNewRegime({
        salePrice: sp,
        buyPrice: bp,
        buyDate: f.buyDate,
        sellDate: f.sellDate,
        buyAgentFee: num(f.buyAgentFee),
        buyDeedTax: num(f.buyDeedTax),
        buyNotaryFee: num(f.buyNotaryFee),
        renovation: num(f.renovation),
        otherBuyCost: num(f.otherBuyCost),
        landIncrement: num(f.landIncrement),
        agentFee: num(f.agentFee),
        notaryFee: num(f.notaryFee),
        landTax: num(f.landTax),
        useStd: f.useStd,
        selfUse: f.selfUse && selfUseAllowed,
        repurchase: { enabled: f.repurchase, newPrice: num(f.newPrice), newDate: f.newDate },
      });
      return { newRes: r, newErr: null, newMissing: [] };
    } catch (e) {
      return { newRes: null, newErr: e instanceof TaxInputError ? e.message : "算不出來，請檢查填的數字", newMissing: [] };
    }
  }, [regime, sp, bp, f, selfUseAllowed]);

  const netCash = newRes ? newRes.netCash : oldRes && oldRes.missing.length === 0 ? oldRes.netCash : null;
  useEffect(() => {
    onResult(netCash == null ? null : `屋主實拿 ${W(netCash)}`);
  }, [netCash, onResult]);

  const districts = Object.keys(IMPUTED_RATE[f.county] ?? {});
  const stdAmount = Math.min(sp * 0.03, 30);

  return (
    <>
      <div className={tax.form}>
        <h3 className={s.sectionTitle}>交易基本資料</h3>
        <div className={tax.grid}>
          <Field label="預計成交總價" hint="萬元，含車位">
            <NumInput value={f.salePrice} onChange={(v) => up({ salePrice: v })} placeholder="例：1500" />
          </Field>
          <Field label="原始購入總價" hint="萬元">
            <NumInput value={f.buyPrice} onChange={(v) => up({ buyPrice: v })} placeholder="例：900" />
          </Field>
          <Field label="購入日期" hint="完成過戶登記那天">
            <input className={tax.input} type="date" value={f.buyDate} onChange={(e) => up({ buyDate: e.target.value })} />
          </Field>
          <Field label="預計售出日期" hint="預設今天，可改">
            <input className={tax.input} type="date" value={f.sellDate} onChange={(e) => up({ sellDate: e.target.value })} />
          </Field>
        </div>

        {regime ? (
          <div className={`${s.regime} ${regime === "old" ? s.regimeOld : regime === "superOld" ? s.regimeSuperOld : ""}`}>
            <span className={s.regimeBadge}>{REGIME_LABEL[regime].short}</span>
            <span>
              {REGIME_LABEL[regime].long}
              {holding ? `。持有 ${holding.label}${f.sellDate ? "（到預計售出日）" : ""}` : ""}
            </span>
          </div>
        ) : f.buyDate ? (
          <div className={`${s.status} ${s.statusBad}`}>購入日期格式不對，請重選。</div>
        ) : null}

        {/* ── 舊制欄位 ── */}
        {regime === "superOld" || regime === "old" ? (
          <>
            <h3 className={s.sectionTitle}>財產交易所得（房屋部分）</h3>
            <p className={s.sectionHint}>
              {regime === "superOld" ? "超舊制用「房屋評定現值 × 財政部核定設算比率」算；選行政區會自動帶比率，稅局給了別的數字就直接改。" : "舊制用（成交價－買價）× 房地比核實計算，土地部分免稅。"}
              達豪宅門檻改按成交總價 × 房地比 × 20%。
            </p>
            <div className={tax.grid}>
              <Field label="房屋評定現值" hint="萬元，看出售年度房屋稅單">
                <NumInput value={f.houseValue} onChange={(v) => up({ houseValue: v })} placeholder="查房屋稅單" step="0.1" />
              </Field>
              <Field label="土地公告現值" hint="萬元，出售年度公告現值 × 面積">
                <NumInput value={f.landValue} onChange={(v) => up({ landValue: v })} placeholder="查土地謄本" step="0.1" />
              </Field>
              {regime === "superOld" ? (
                <>
                  <Field label="縣市">
                    <select className={tax.input} value={f.county} onChange={(e) => up({ county: e.target.value, district: "", imputedRate: "" })}>
                      {IMPUTED_COUNTIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="行政區" hint="選了會自動帶設算比率">
                    <select
                      className={tax.input}
                      value={f.district}
                      onChange={(e) => {
                        const d = e.target.value;
                        const rate = imputedRateOf(f.county, d);
                        up({ district: d, imputedRate: rate == null ? "" : String(rate) });
                      }}
                    >
                      <option value="">請選擇行政區</option>
                      {districts.map((d) => (
                        <option key={d} value={d}>
                          {d}（{IMPUTED_RATE[f.county][d]}%）
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="財政部核定設算比率" hint="%，可手動修改">
                    <NumInput value={f.imputedRate} onChange={(v) => up({ imputedRate: v })} placeholder="選行政區後自動帶入" />
                  </Field>
                </>
              ) : null}
            </div>

            <h3 className={s.sectionTitle}>豪宅門檻判斷</h3>
            <p className={s.sectionHint}>含車位總價或不含車位每坪單價達門檻其一，就改用豪宅公式（稅率 20%）。</p>
            <div className={s.grid3}>
              <Field label="縣市別" hint="決定門檻">
                <select className={tax.input} value={f.luxuryCode} onChange={(e) => up({ luxuryCode: e.target.value as LuxuryCode })}>
                  {LUXURY_TIERS.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.label}（總價 ≥ {t.total.toLocaleString("zh-TW")} 萬／每坪 ≥ {t.perPing} 萬）
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="建物坪數" hint="不含車位，算每坪用">
                <NumInput value={f.area} onChange={(v) => up({ area: v })} placeholder="例：40" step="0.1" />
              </Field>
              <Field label="不含車位成交價" hint="萬元，留空用成交總價">
                <NumInput value={f.noParkingPrice} onChange={(v) => up({ noParkingPrice: v })} placeholder="留空則以成交總價計算" />
              </Field>
            </div>
            {oldRes && sp > 0 ? (
              <div className={`${s.status} ${oldRes.luxury.isLuxury ? s.statusBad : s.statusOk}`}>
                {oldRes.luxury.isLuxury ? (
                  <>
                    ⚠ <strong>達豪宅門檻</strong>，改用豪宅公式：成交總價 × 房地比 × 20%
                    {oldRes.luxury.reasons.map((r) => (
                      <span key={r}>
                        <br />▸ {r}
                      </span>
                    ))}
                  </>
                ) : (
                  <>✓ 未達豪宅門檻，{regime === "superOld" ? "適用設算比率" : "用核實計算"}</>
                )}
              </div>
            ) : null}

            <h3 className={s.sectionTitle}>併入綜合所得稅</h3>
            <p className={s.sectionHint}>財產交易所得會跟你整年其他所得加在一起，可能把你推到更高一級——請選「加上這筆之後」預估的級距。</p>
            <div className={tax.grid}>
              <Field label="預計當年度適用稅率級距" hint="選了才會算所得稅">
                <select className={tax.input} value={f.bracketRate} onChange={(e) => up({ bracketRate: e.target.value })}>
                  <option value="">請選擇級距</option>
                  {INCOME_TAX_BRACKETS.map((b) => (
                    <option key={b.rate} value={String(b.rate)}>
                      {b.rate}%　{b.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="當初的購置成本合計" hint="萬元，仲介費＋契稅＋代書＋裝修，算獲利用">
                <NumInput value={f.buyCostsOld} onChange={(v) => up({ buyCostsOld: v })} placeholder="0" step="0.1" />
              </Field>
            </div>
          </>
        ) : null}

        {/* ── 房地合一：購置成本 ── */}
        {regime === "new" ? (
          <>
            <h3 className={s.sectionTitle}>購置成本</h3>
            <p className={s.sectionHint}>當初買的時候付的錢，都可以從課稅所得裡扣掉（要有單據）。沒有就填 0。</p>
            <div className={s.grid3}>
              <Field label="買屋仲介費" hint="萬元">
                <NumInput value={f.buyAgentFee} onChange={(v) => up({ buyAgentFee: v })} placeholder="0" step="0.1" />
              </Field>
              <Field label="契稅" hint="萬元，買方繳的">
                <NumInput value={f.buyDeedTax} onChange={(v) => up({ buyDeedTax: v })} placeholder="0" step="0.1" />
              </Field>
              <Field label="代書費（購屋時）" hint="萬元">
                <NumInput value={f.buyNotaryFee} onChange={(v) => up({ buyNotaryFee: v })} placeholder="0" step="0.1" />
              </Field>
              <Field label="裝修費用" hint="萬元，能增加房屋價值的">
                <NumInput value={f.renovation} onChange={(v) => up({ renovation: v })} placeholder="0" step="0.1" />
              </Field>
              <Field label="其他費用" hint="萬元">
                <NumInput value={f.otherBuyCost} onChange={(v) => up({ otherBuyCost: v })} placeholder="0" step="0.1" />
              </Field>
              <Field label="土地漲價總數額" hint="萬元，土增稅單上有">
                <NumInput value={f.landIncrement} onChange={(v) => up({ landIncrement: v })} placeholder="0" step="0.1" />
              </Field>
            </div>
          </>
        ) : null}

        {/* ── 出售費用（三種稅制都有） ── */}
        {regime ? (
          <>
            <h3 className={s.sectionTitle}>出售費用</h3>
            <div className={s.grid3}>
              <Field label="賣屋仲介費" hint="萬元，依你簽的服務費">
                <NumInput value={f.agentFee} onChange={(v) => up({ agentFee: v })} placeholder="0" step="0.1" />
              </Field>
              <Field label="代書相關費用" hint="萬元，簽約、塗銷、履保">
                <NumInput value={f.notaryFee} onChange={(v) => up({ notaryFee: v })} placeholder="0" step="0.1" />
              </Field>
              <Field label="土地增值稅" hint="萬元，洽代書估算">
                <NumInput value={f.landTax} onChange={(v) => up({ landTax: v })} placeholder="0" step="0.1" />
              </Field>
            </div>

            {regime === "new" ? (
              <>
                <div style={{ marginTop: 14 }}>
                  <Check
                    on={f.useStd}
                    title="出售費用不列舉，改用成交價 3% 概算（上限 30 萬）"
                    desc={`仲介費、代書費拿不出單據時，國稅局按成交價 × 3%、上限 30 萬認列費用${sp > 0 ? `——這筆是 ${W(stdAmount)}` : ""}。只用來降低課稅所得，實拿還是用上面填的實際費用算。預售屋轉讓不適用。`}
                    onToggle={() => up({ useStd: !f.useStd })}
                  />
                </div>
                {newRes?.stdSuggestion ? (
                  <div className={`${s.status} ${s.statusWarn}`}>
                    💡 你列舉的出售費用 <strong>{W(newRes.stdSuggestion.listed)}</strong> 比法定概算 <strong>{W(newRes.stdSuggestion.std)}</strong> 少，改用概算可以多扣
                    <strong> {W(newRes.stdSuggestion.diff)}</strong>，稅會更低。
                    <button type="button" className={s.statusBtn} onClick={() => up({ useStd: true })}>
                      改用概算
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}

        {/* ── 房地合一：稅務優惠 ── */}
        {regime === "new" ? (
          <>
            <h3 className={s.sectionTitle}>稅務優惠</h3>
            <div className={tax.opts}>
              <Check
                on={f.selfUse}
                disabled={!selfUseAllowed}
                title="自住優惠：本人、配偶或未成年子女設籍並實際居住滿 6 年，期間沒出租、沒營業"
                desc="課稅所得 400 萬元以內免稅，超過的部分按 10%。要用「實際入住日」算，裝潢期間、旅居國外都要扣掉。"
                onToggle={() => up({ selfUse: !f.selfUse })}
              />
              {holding ? (
                <div className={`${s.status} ${holding.sixYears ? s.statusOk : s.statusBad}`} style={{ marginTop: 0 }}>
                  {holding.sixYears
                    ? `✓ 持有 ${holding.label}，已達 6 年門檻，請確認實際居住天數也滿 6 年再勾。`
                    : `⚠ 購入到預計售出共 ${holding.label}，未達 6 年，自住優惠不能勾。`}
                </div>
              ) : null}
              <Check
                on={f.repurchase}
                title="重購退稅：出售前後 2 年內再買自住的新房子，申請退還房地合一稅"
                desc="新屋總價 ≥ 這次售價可全額退；比售價低的按比例退。新屋要本人、配偶或未成年子女自住。"
                onToggle={() => up({ repurchase: !f.repurchase })}
              />
              {f.repurchase ? (
                <>
                  <div className={tax.grid}>
                    <Field label="預計購買新屋總價" hint="萬元">
                      <NumInput value={f.newPrice} onChange={(v) => up({ newPrice: v })} placeholder="例：2000" />
                    </Field>
                    <Field label="預計購買日期" hint="要在售出日前後 2 年內">
                      <input className={tax.input} type="date" value={f.newDate} onChange={(e) => up({ newDate: e.target.value })} />
                    </Field>
                  </div>
                  {newRes?.repurchase ? (
                    <div className={`${s.status} ${newRes.repurchase.withinWindow === false ? s.statusBad : newRes.repurchase.isFull ? s.statusOk : s.statusWarn}`} style={{ marginTop: 0 }}>
                      {newRes.repurchase.withinWindow == null ? (
                        <>填了預計購買日期才能判斷是否在 2 年內。</>
                      ) : newRes.repurchase.withinWindow ? (
                        <>距售出日 {newRes.repurchase.monthsApart} 個月，<strong>在 2 年內 ✓</strong></>
                      ) : (
                        <>距售出日 {newRes.repurchase.monthsApart} 個月，<strong>超過 2 年，不符合重購退稅資格</strong></>
                      )}
                      {newRes.repurchase.withinWindow !== false ? (
                        <>
                          <br />
                          退稅類型：<strong>{newRes.repurchase.isFull ? "全額退稅" : `比例退稅（${Math.round(newRes.repurchase.ratio * 100)}%）`}</strong>
                          <br />
                          {newRes.taxAmount > 0 ? (
                            <>
                              預估可退房地合一稅：<strong>{W(newRes.repurchase.refund)}</strong>（完成重購後向國稅局申請）
                            </>
                          ) : (
                            <>目前算出來的房地合一稅是 0，沒有稅可退。</>
                          )}
                        </>
                      ) : null}
                    </div>
                  ) : f.newPrice ? null : (
                    <div className={`${s.status} ${s.statusWarn}`} style={{ marginTop: 0 }}>
                      填新屋總價就會估可退的稅。
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      {/* ───── 結果 ───── */}
      {!regime ? (
        <div className={tax.alert}>
          <p className={tax.alertTitle}>填好成交總價、購入總價和購入日期，結果會直接出現在下面</p>
          <p className={tax.alertBody}>購入日期決定走舊制還是房地合一，填了會多出對應的欄位。</p>
        </div>
      ) : regime === "new" ? (
        newErr ? (
          <div className={tax.alert}>
            <p className={tax.alertTitle}>{newErr}</p>
          </div>
        ) : !newRes ? (
          <div className={tax.alert}>
            <p className={tax.alertTitle}>還缺：{newMissing.join("、")}</p>
            <p className={tax.alertBody}>填好就會算；費用類的沒有就留 0。</p>
          </div>
        ) : (
          <NewResultView r={newRes} sp={sp} />
        )
      ) : oldRes ? (
        <OldResultView r={oldRes} sp={sp} />
      ) : null}
    </>
  );
}

function ChartBar({ items }: { items: { label: string; value: number }[] }) {
  const total = items.reduce((a, b) => a + b.value, 0);
  if (total <= 0) return null;
  return (
    <>
      <div className={s.bar} role="img" aria-label="各項支出分布">
        {items.map((it, i) => (
          <div key={it.label} className={s.barSeg} style={{ width: `${(it.value / total) * 100}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} title={`${it.label} ${W(it.value)}`} />
        ))}
      </div>
      <ul className={s.legend}>
        {items.map((it, i) => (
          <li key={it.label}>
            <span className={s.swatch} style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
            {it.label} {W(it.value)}（{((it.value / total) * 100).toFixed(1)}%）
          </li>
        ))}
      </ul>
    </>
  );
}

function ProfitBanner({ isProfit, profit, invested, roi, holdingLabel }: { isProfit: boolean; profit: number; invested: number; roi: number; holdingLabel: string }) {
  return (
    <div className={`${s.banner} ${isProfit ? "" : s.bannerLoss}`}>
      <div>
        <div className={s.bannerLabel}>{isProfit ? "屋主實際獲利" : "屋主實際虧損"}</div>
        <div className={s.bannerBig}>
          {isProfit ? "" : "－"}
          {W(Math.abs(profit))}
        </div>
        <div className={s.bannerSub}>買入總成本 {W(invested)}，扣除所有稅費後</div>
      </div>
      <div className={s.bannerSide}>
        <div className={s.bannerLabel}>投資報酬率</div>
        <div className={s.bannerRoi}>{signedPct(roi)}</div>
        <div className={s.bannerSub}>{holdingLabel}</div>
      </div>
    </div>
  );
}

function NewResultView({ r, sp }: { r: NewResult; sp: number }) {
  return (
    <div className={s.results} id="seller-net-result">
      <ProfitBanner isProfit={r.isProfit} profit={r.profit} invested={r.invested} roi={r.roi} holdingLabel={`持有 ${r.holding.label}`} />
      <div className={s.metrics}>
        <Metric label="預計成交總價" value={W(sp)} />
        <Metric label="全部稅費支出" value={W(r.totalOut)} sub={sp > 0 ? `佔成交價 ${r1((r.totalOut / sp) * 100)}%` : undefined} />
        <Metric label="屋主實拿現金" value={W(r.netCash)} sub="扣完仲介費、代書費、稅" kind="good" />
        <Metric label="房地合一稅率" value={`${Math.round(r.rate * 100)}%`} sub={r.rateLabel} />
      </div>

      <div className={s.tableWrap}>
        <h3 className={s.tableTitle}>完整損益明細</h3>
        <table className={tax.steps}>
          <tbody>
            <Row label="預計成交總價" amount={W(sp)} total />
            <Sec title="購置成本" />
            <Row label="原始購入價格" amount={`－ ${W(r.invested - r.totalBuyCost)}`} />
            {r.totalBuyCost > 0 ? <Row label="買屋時的仲介費、契稅、代書費、裝修、其他" amount={`－ ${W(r.totalBuyCost)}`} /> : null}
            <Sec title="出售費用" />
            <Row label="賣屋仲介費＋代書相關費用" amount={`－ ${W(r.actualSellCost)}`} note="實際付出的錢，實拿用這個算" />
            {r.expenseMode === "assumed" ? <Row label="費用概算（成交價 3%、上限 30 萬）" amount={W(r.expenseForTax)} tag="只用來抵課稅所得" tagKind="warn" /> : null}
            <Sec title="稅務" />
            <Row label="房地合一課稅所得" amount={W(Math.max(0, r.taxableIncome))} note={r.taxableIncome < 0 ? `實際算出來是 ${W(r.taxableIncome)}（賠售），稅為 0` : "成交價－取得成本－費用－土地漲價總數額"} />
            {r.exemption > 0 ? <Row label="自住優惠免稅額" amount={`－ ${W(r.exemption)}`} /> : null}
            <Row label="房地合一稅" amount={`－ ${W(r.taxAmount)}`} tag={r.rateLabel} tagKind={r.taxAmount > 0 ? "bad" : undefined} />
            {r.chart.find((c) => c.label === "土地增值稅") ? <Row label="土地增值稅" amount={`－ ${W(r.chart.find((c) => c.label === "土地增值稅")!.value)}`} tag="不列入房地合一稅" tagKind="warn" /> : null}
            <Row label="屋主實拿現金" amount={W(r.netCash)} total />
            <Row label="實際獲利（扣除買入總成本）" amount={`${r.isProfit ? "＋ " : "－ "}${W(Math.abs(r.profit))}`} total negative={!r.isProfit} />
          </tbody>
        </table>
        {r.chart.length > 0 ? (
          <>
            <h3 className={s.tableTitle} style={{ marginTop: 18 }}>
              各項支出分布
            </h3>
            <ChartBar items={r.chart} />
          </>
        ) : null}
        <ul className={tax.notes}>
          {r.selfUseIgnored ? <li>⚠️ 你勾了自住優惠，但{r.selfUseIgnored}</li> : null}
          {r.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <p className={s.deadline}>📅 {r.deadline}</p>
      </div>
    </div>
  );
}

function OldResultView({ r, sp }: { r: OldResult; sp: number }) {
  const ready = r.missing.length === 0;
  return (
    <div className={s.results} id="seller-net-result">
      <div className={`${s.formulaCard} ${r.mode === "luxury" ? s.formulaCardLux : ""}`}>
        <div style={{ fontSize: 12, fontWeight: 900, color: r.mode === "luxury" ? "#c2410c" : "var(--primary)", letterSpacing: ".06em" }}>
          {r.mode === "luxury" ? "⚡ 豪宅公式" : REGIME_LABEL[r.regime].short}試算結果
        </div>
        {ready ? (
          <>
            {r.formula.map((line) => (
              <div key={line}>{line}</div>
            ))}
            <div className={s.formulaBig}>
              財產交易所得（房屋部分，併入綜所稅）＝ {W(r.income)}
              {r.rawIncome < 0 ? <span className={`${s.tag} ${s.tagWarn}`}>賠售，所得以 0 計</span> : null}
            </div>
            <div>
              {r.incomeTax == null ? (
                <span className={`${s.tag} ${s.tagWarn}`}>還沒選綜所稅級距，所得稅先當 0</span>
              ) : (
                <>
                  預估應繳所得稅 ＝ 財產交易所得 × 級距稅率 ＝ <strong>{W(r.incomeTax)}</strong>
                </>
              )}
            </div>
          </>
        ) : (
          <div>還缺：{r.missing.join("、")}，填好才算得出財產交易所得。</div>
        )}
      </div>

      {ready ? (
        <>
          <div style={{ marginTop: 16 }}>
            <ProfitBanner isProfit={r.isProfit} profit={r.profit} invested={r.invested} roi={r.roi} holdingLabel={REGIME_LABEL[r.regime].short} />
          </div>
          <div className={s.metrics}>
            <Metric label="預計成交總價" value={W(sp)} />
            <Metric label="全部稅費支出" value={W(r.totalOut)} sub={sp > 0 ? `佔成交價 ${r1((r.totalOut / sp) * 100)}%` : undefined} />
            <Metric label="屋主實拿現金" value={W(r.netCash)} sub={r.incomeTax == null ? "還沒扣所得稅" : "扣完仲介費、代書費、稅"} kind="good" />
            <Metric label="財產交易所得" value={W(r.income)} sub={r.incomeTax == null ? "併入綜所稅" : `所得稅約 ${W(r.incomeTax)}`} />
          </div>
          <div className={s.tableWrap}>
            <h3 className={s.tableTitle}>完整損益明細</h3>
            <table className={tax.steps}>
              <tbody>
                <Row label="預計成交總價" amount={W(sp)} total />
                <Sec title="出售費用" />
                <Row label="賣屋仲介費＋代書相關費用" amount={`－ ${W(r.sellCosts)}`} />
                <Sec title="稅務" />
                <Row label="財產交易所得（房屋部分）" amount={W(r.income)} note="併入當年度綜合所得稅；土地部分免稅" />
                <Row label="預估所得稅" amount={r.incomeTax == null ? "未選級距" : `－ ${W(r.incomeTax)}`} tag={r.incomeTax == null ? "先當 0" : undefined} tagKind="warn" />
                <Row label="土地增值稅" amount={`－ ${W(r.totalOut - r.sellCosts - (r.incomeTax ?? 0))}`} tag="另一個稅目" tagKind="warn" />
                <Row label="屋主實拿現金" amount={W(r.netCash)} total />
                <Row label="實際獲利（扣除買價與購置成本）" amount={`${r.isProfit ? "＋ " : "－ "}${W(Math.abs(r.profit))}`} total negative={!r.isProfit} />
              </tbody>
            </table>
            <ul className={tax.notes}>
              {r.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ───────── 贈與 ───────── */

function GiftTab() {
  const [g, setG] = useState({ land: "", house: "", prior: "", landTax: "", spouse: false });
  const r = useMemo(() => {
    if (!num(g.land) && !num(g.house)) return null;
    return calcGiftTax({ landValue: num(g.land), houseValue: num(g.house), priorGifts: num(g.prior), landTax: num(g.landTax), toSpouse: g.spouse });
  }, [g]);

  return (
    <>
      <div className={tax.form}>
        <h3 className={s.sectionTitle}>贈與財產資料</h3>
        <p className={s.sectionHint}>贈與不動產是用公告現值、評定現值算，不是市價。免稅額每人每年 {GIFT.exemption} 萬，同一年對同一個人的贈與要累計。</p>
        <div className={tax.grid}>
          <Field label="土地公告現值" hint="萬元，公告現值 × 面積">
            <NumInput value={g.land} onChange={(v) => setG({ ...g, land: v })} placeholder="例：200" step="0.1" />
          </Field>
          <Field label="房屋評定現值" hint="萬元，看房屋稅單">
            <NumInput value={g.house} onChange={(v) => setG({ ...g, house: v })} placeholder="例：100" step="0.1" />
          </Field>
          <Field label="本年度已累計贈與金額" hint="萬元，之前送過的合計">
            <NumInput value={g.prior} onChange={(v) => setG({ ...g, prior: v })} placeholder="0" step="0.1" />
          </Field>
          <Field label="土地增值稅" hint="萬元，贈與人繳，洽代書估">
            <NumInput value={g.landTax} onChange={(v) => setG({ ...g, landTax: v })} placeholder="0" step="0.1" />
          </Field>
        </div>
        <div style={{ marginTop: 14 }}>
          <Check on={g.spouse} title="贈與對象是配偶" desc="配偶之間的贈與依法免贈與稅，但還是要申報；受贈的一方要繳契稅、送的一方要繳土增稅。" onToggle={() => setG({ ...g, spouse: !g.spouse })} />
        </div>
      </div>

      {!r ? (
        <div className={tax.alert}>
          <p className={tax.alertTitle}>填土地公告現值或房屋評定現值，結果會直接出現在下面</p>
          <p className={tax.alertBody}>稅率：{bracketText(GIFT.brackets, "課稅贈與淨額")}。</p>
        </div>
      ) : (
        <div className={s.results}>
          <div className={s.tiles}>
            <Metric label="本次應納贈與稅" value={W(r.giftTax)} sub={r.rateLabel} kind={r.giftTax > 0 ? "bad" : "good"} />
            <Metric label="契稅（受贈人繳）" value={W(r.deedTax)} sub="房屋評定現值 × 6%" />
            <Metric label="土地增值稅（贈與人繳）" value={W(num(g.landTax))} sub="贈與視同移轉" />
            <Metric label="三稅合計" value={W(r.grandTotal)} sub="贈與稅＋契稅＋土增稅" kind={r.grandTotal > 0 ? "bad" : "good"} />
          </div>
          <div className={s.tableWrap}>
            <table className={tax.steps}>
              <tbody>
                <Sec title="財產估算" />
                <Row label="土地公告現值" amount={W(num(g.land))} />
                <Row label="房屋評定現值" amount={W(num(g.house))} />
                <Row label="本次贈與財產總值" amount={W(r.total)} total />
                <Sec title="贈與稅計算" />
                {r.spouseExempt ? (
                  <Row label="配偶贈與" amount="免稅" note="遺產及贈與稅法第 20 條" />
                ) : (
                  <>
                    <Row label="年度累計贈與總額（含本次）" amount={W(r.cumulative)} />
                    <Row label="免稅額" amount={`－ ${W(r.exemption)}`} />
                    <Row label="課稅贈與淨額" amount={W(r.taxableNet)} />
                    <Row label="應納贈與稅（累計）" amount={W(r.cumulativeTax)} />
                    {r.priorTax > 0 ? <Row label="扣除前次已納贈與稅" amount={`－ ${W(r.priorTax)}`} /> : null}
                    <Row label="本次應補繳贈與稅" amount={W(r.giftTax)} total />
                  </>
                )}
                <Sec title="其他稅費" />
                <Row label="契稅（受贈人繳，房屋評定現值 × 6%）" amount={W(r.deedTax)} />
                <Row label="土地增值稅（贈與人繳）" amount={W(num(g.landTax))} />
                <Row label="三稅合計" amount={W(r.grandTotal)} total />
              </tbody>
            </table>
            <ul className={tax.notes}>
              <li>贈與不動產以土地公告現值與房屋評定現值認定，不是市場成交價。</li>
              <li>同一年度對同一個人的贈與要累計算免稅額；分年、分人送，稅會不一樣，要規劃直接問我。</li>
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

/* ───────── 繼承 ───────── */

function EstateTab() {
  const [e, setE] = useState({ total: "", debt: "", heirs: "1", spouse: false, descendants: "", parents: "", siblings: "", disabled: false, funeral: String(ESTATE.funeralMax) });
  const r = useMemo(() => {
    if (!num(e.total)) return null;
    return calcEstateTax({
      total: num(e.total),
      debt: num(e.debt),
      heirs: num(e.heirs) || 1,
      hasSpouse: e.spouse,
      descendants: num(e.descendants),
      parents: num(e.parents),
      siblings: num(e.siblings),
      disabled: e.disabled,
      funeral: e.funeral.trim() === "" ? ESTATE.funeralMax : num(e.funeral),
    });
  }, [e]);

  return (
    <>
      <div className={tax.form}>
        <h3 className={s.sectionTitle}>遺產基本資料</h3>
        <p className={s.sectionHint}>不動產用公告現值、評定現值算；存款、股票等照價值填。免稅額 {ESTATE.exemption.toLocaleString("zh-TW")} 萬，再扣各項扣除額才課稅。</p>
        <div className={s.grid3}>
          <Field label="遺產總額" hint="萬元，房地產＋存款＋股票等">
            <NumInput value={e.total} onChange={(v) => setE({ ...e, total: v })} placeholder="例：3000" />
          </Field>
          <Field label="未償債務" hint="萬元，貸款、欠稅等">
            <NumInput value={e.debt} onChange={(v) => setE({ ...e, debt: v })} placeholder="0" step="0.1" />
          </Field>
          <Field label="繼承人人數" hint="算每人平均分攤用">
            <NumInput value={e.heirs} onChange={(v) => setE({ ...e, heirs: v })} placeholder="1" />
          </Field>
        </div>

        <h3 className={s.sectionTitle}>扣除額設定</h3>
        <div className={tax.opts}>
          <Check on={e.spouse} title={`有配偶：配偶扣除額 ${ESTATE.spouse} 萬元`} onToggle={() => setE({ ...e, spouse: !e.spouse })} />
          <Check on={e.disabled} title={`身心障礙特別扣除額 ${ESTATE.disabled} 萬元`} desc="被繼承人或繼承人有重度以上身心障礙" onToggle={() => setE({ ...e, disabled: !e.disabled })} />
        </div>
        <div className={s.grid3} style={{ marginTop: 14 }}>
          <Field label="直系血親卑親屬人數" hint={`每人 ${ESTATE.descendant} 萬，子女、孫子女`}>
            <NumInput value={e.descendants} onChange={(v) => setE({ ...e, descendants: v })} placeholder="0" />
          </Field>
          <Field label="父母人數" hint={`每人 ${ESTATE.parent} 萬，最多 2 人`}>
            <NumInput value={e.parents} onChange={(v) => setE({ ...e, parents: v })} placeholder="0" />
          </Field>
          <Field label="受扶養兄弟姊妹／祖父母人數" hint={`每人 ${ESTATE.sibling} 萬`}>
            <NumInput value={e.siblings} onChange={(v) => setE({ ...e, siblings: v })} placeholder="0" />
          </Field>
          <Field label="喪葬費" hint={`萬元，上限 ${ESTATE.funeralMax} 萬`}>
            <NumInput value={e.funeral} onChange={(v) => setE({ ...e, funeral: v })} placeholder={String(ESTATE.funeralMax)} step="0.1" />
          </Field>
        </div>
      </div>

      {!r ? (
        <div className={tax.alert}>
          <p className={tax.alertTitle}>填遺產總額，結果會直接出現在下面</p>
          <p className={tax.alertBody}>稅率：{bracketText(ESTATE.brackets, "遺產淨額")}。繼承的土地免土增稅、房屋免契稅。</p>
        </div>
      ) : (
        <div className={s.results}>
          <div className={s.tiles}>
            <Metric label="應納遺產稅" value={W(r.tax)} sub={r.rateLabel} kind={r.tax > 0 ? "bad" : "good"} />
            <Metric label="遺產淨額" value={W(r.net)} sub="課稅基礎" />
            <Metric label="免稅額＋扣除額" value={W(r.exemption + r.totalDeductions)} sub="合計可扣除" />
            <Metric label="每位繼承人平均" value={W(r.perHeir)} sub={`共 ${r.heirs} 位`} />
          </div>
          <div className={s.tableWrap}>
            <table className={tax.steps}>
              <tbody>
                <Sec title="遺產與免稅" />
                <Row label="遺產總額" amount={W(num(e.total))} />
                <Row label="免稅額" amount={`－ ${W(r.exemption)}`} />
                <Sec title="各項扣除額" />
                {r.deductions.map((d) => (
                  <Row key={d.label} label={d.label} amount={`－ ${W(d.amount)}`} />
                ))}
                <Sec title="稅額計算" />
                <Row label="遺產淨額" amount={W(r.net)} />
                <Row label="適用稅率" amount={r.isExempt ? "免徵" : `${Math.round(r.rate * 100)}%`} />
                <Row label="應納遺產稅" amount={W(r.tax)} total />
                {r.heirs > 1 ? <Row label={`每位繼承人平均分攤（共 ${r.heirs} 人）`} amount={W(r.perHeir)} /> : null}
              </tbody>
            </table>
            <ul className={tax.notes}>
              <li>直系血親卑親屬有未成年人的，可以再加計到成年的年數差額，這裡沒算，請代書確認。</li>
              <li>繼承取得的土地免土地增值稅、房屋免契稅，但遺產稅要在被繼承人死亡日起 6 個月內申報。</li>
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

/* ───────── 外殼：分頁＋浮條 ───────── */

export default function SellerNetCalculator() {
  const [tab, setTab] = useState<Tab>("sell");
  const [resultText, setResultText] = useState<string | null>(null);
  const [resultVisible, setResultVisible] = useState(true);

  // 結果區塊不在畫面裡 → 底下浮一條
  useEffect(() => {
    if (tab !== "sell" || !resultText) {
      setResultVisible(true);
      return;
    }
    const el = document.getElementById("seller-net-result");
    if (!el) return;
    const io = new IntersectionObserver((entries) => setResultVisible(entries[0]?.isIntersecting ?? true), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, [tab, resultText]);

  return (
    <>
      <div className={tax.tabs}>
        <button type="button" className={tab === "sell" ? `${tax.tab} ${tax.tabOn}` : tax.tab} onClick={() => setTab("sell")}>
          💰 出售・賣方實拿
        </button>
        <button type="button" className={tab === "gift" ? `${tax.tab} ${tax.tabOn}` : tax.tab} onClick={() => setTab("gift")}>
          🎁 贈與稅
        </button>
        <button type="button" className={tab === "estate" ? `${tax.tab} ${tax.tabOn}` : tax.tab} onClick={() => setTab("estate")}>
          🏛️ 遺產稅
        </button>
      </div>

      {tab === "sell" ? <SellTab onResult={setResultText} /> : tab === "gift" ? <GiftTab /> : <EstateTab />}

      {tab === "sell" && resultText && !resultVisible ? (
        <button type="button" className={tax.stickyBar} onClick={() => document.getElementById("seller-net-result")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
          <span className={tax.stickyText}>{resultText}</span>
          <span className={tax.stickyGo}>看結果 ↓</span>
        </button>
      ) : null}
    </>
  );
}

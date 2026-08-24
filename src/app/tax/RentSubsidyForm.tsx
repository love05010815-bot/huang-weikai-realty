"use client";

/**
 * 租金補貼試算表單。
 *
 * 算法在 src/lib/rent-subsidy.ts，是純函式、跟這裡的畫面完全分開 ——
 * 規則怎麼來的、每個數字的出處都寫在那個檔案的檔頭。
 *
 * 這個補貼制度比房地合一稅複雜的地方：分級表逐縣市不同，縣市內又可能
 * 再分兩組行政區，所以表單是「先選縣市 → 動態長出行政區選項」，不是
 * 一次把所有欄位都攤開。
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  calcRentSubsidy,
  listCities,
  SOCIAL_DISADVANTAGE_ITEMS,
  type EconomicStatus,
  type MarriageStatus,
} from "@/lib/rent-subsidy";
import styles from "./tax.module.css";
import home from "../home.module.css";

const CITIES = listCities();

function money(n: number): string {
  return n.toLocaleString("zh-TW");
}

export default function RentSubsidyForm() {
  const [isCitizen, setIsCitizen] = useState(true);
  const [isAdult, setIsAdult] = useState(true);
  const [age, setAge] = useState("30");
  const [selfCount, setSelfCount] = useState("1");
  const [childrenCount, setChildrenCount] = useState("0");
  const [unbornCount, setUnbornCount] = useState("0");
  const [wardsCount, setWardsCount] = useState("0");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState<string | null>(null);
  const [ownsHome, setOwnsHome] = useState(false);
  const [incomeBelowLimit, setIncomeBelowLimit] = useState<boolean | null>(null);
  const [hasOtherSubsidy, setHasOtherSubsidy] = useState(false);
  const [marriage, setMarriage] = useState<MarriageStatus>("married");
  const [economicStatus, setEconomicStatus] = useState<EconomicStatus>("none");
  const [socialItems, setSocialItems] = useState<Set<string>>(new Set());

  const cityOption = CITIES.find((c) => c.city === city);
  const needsDistrict = !!cityOption?.districts;

  const toggleSocial = (item: string) => {
    setSocialItems((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  };

  const outcome = useMemo(() => {
    if (!city) return null;
    if (needsDistrict && !district) return null;
    if (incomeBelowLimit === null) return null;
    const self = Number(selfCount) || 0;
    const children = Number(childrenCount) || 0;
    const unborn = Number(unbornCount) || 0;
    const wards = Number(wardsCount) || 0;

    return calcRentSubsidy({
      isCitizen,
      isAdult,
      age: Number(age) || 0,
      family: { self, children, unborn, wards },
      city,
      district: needsDistrict ? district : null,
      ownsHome,
      incomeBelowLimit,
      hasOtherSubsidy,
      marriage,
      economicStatus,
      isSociallyDisadvantaged: socialItems.size > 0,
    });
  }, [
    isCitizen,
    isAdult,
    age,
    selfCount,
    childrenCount,
    unbornCount,
    wardsCount,
    city,
    district,
    needsDistrict,
    ownsHome,
    incomeBelowLimit,
    hasOtherSubsidy,
    marriage,
    economicStatus,
    socialItems,
  ]);

  return (
    <>
      <div className={styles.form}>
        <div className={styles.grid}>
          <Field label="國籍與戶籍">
            <div className={styles.seg}>
              <button
                type="button"
                className={isCitizen ? `${styles.segBtn} ${styles.segOn}` : styles.segBtn}
                onClick={() => setIsCitizen(true)}
              >
                中華民國國民且在國內設籍
              </button>
              <button
                type="button"
                className={!isCitizen ? `${styles.segBtn} ${styles.segOn}` : styles.segBtn}
                onClick={() => setIsCitizen(false)}
              >
                不是
              </button>
            </div>
          </Field>

          <Field label="是否已成年">
            <div className={styles.seg}>
              <button
                type="button"
                className={isAdult ? `${styles.segBtn} ${styles.segOn}` : styles.segBtn}
                onClick={() => setIsAdult(true)}
              >
                已成年
              </button>
              <button
                type="button"
                className={!isAdult ? `${styles.segBtn} ${styles.segOn}` : styles.segBtn}
                onClick={() => setIsAdult(false)}
              >
                未成年
              </button>
            </div>
          </Field>

          <NumField label="申請人年齡" hint="影響單身青年與分級" value={age} onChange={setAge} placeholder="30" />

          <div className={`${styles.field} ${styles.wide}`}>
            <span className={styles.label}>
              家庭成員人數
              <span className={styles.labelHint}>各項填 0 表示沒有</span>
            </span>
            <div className={styles.grid} style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
              <NumField label="本人＋配偶" value={selfCount} onChange={setSelfCount} placeholder="1" small />
              <NumField label="未成年子女" value={childrenCount} onChange={setChildrenCount} placeholder="0" small />
              <NumField label="孕有胎兒" value={unbornCount} onChange={setUnbornCount} placeholder="0" small />
              <NumField label="其他受監護人" value={wardsCount} onChange={setWardsCount} placeholder="0" small />
            </div>
          </div>

          <Field label="租賃房屋所在縣市" hint="須已租屋">
            <select
              className={styles.input}
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                setDistrict(null);
                setIncomeBelowLimit(null);
              }}
            >
              <option value="">請選擇</option>
              {CITIES.map((c) => (
                <option key={c.city} value={c.city}>
                  {c.city}
                </option>
              ))}
            </select>
          </Field>

          {needsDistrict && (
            <Field label="租賃房屋所在行政區">
              <select
                className={styles.input}
                value={district ?? ""}
                onChange={(e) => setDistrict(e.target.value || null)}
              >
                <option value="">請選擇</option>
                {cityOption?.districts?.map((d) => (
                  <option key={d} value={d}>
                    {d.length > 24 ? d.slice(0, 24) + "…" : d}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <div className={`${styles.field} ${styles.wide}`}>
            <label className={styles.check}>
              <input type="checkbox" checked={ownsHome} onChange={(e) => setOwnsHome(e.target.checked)} />
              <span className={styles.checkBody}>
                <span className={styles.checkTitle}>家庭成員單獨持有房屋，或持有共有房屋且持份合計為全部</span>
                <span className={styles.checkDesc}>符合這項就不能申請租金補貼，勾了會直接告訴你不符資格。</span>
              </span>
            </label>
          </div>

          {city && (
            <div className={`${styles.field} ${styles.wide}`}>
              <span className={styles.label}>
                每人每月平均所得
                <span className={styles.labelHint}>
                  {cityOption ? `要低於 ${money(cityOption.incomeLimit)} 元（${city}的門檻）` : ""}
                </span>
              </span>
              <div className={styles.seg}>
                <button
                  type="button"
                  className={incomeBelowLimit === true ? `${styles.segBtn} ${styles.segOn}` : styles.segBtn}
                  onClick={() => setIncomeBelowLimit(true)}
                >
                  低於門檻
                </button>
                <button
                  type="button"
                  className={incomeBelowLimit === false ? `${styles.segBtn} ${styles.segOn}` : styles.segBtn}
                  onClick={() => setIncomeBelowLimit(false)}
                >
                  超過門檻
                </button>
              </div>
            </div>
          )}

          <div className={`${styles.field} ${styles.wide}`}>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={hasOtherSubsidy}
                onChange={(e) => setHasOtherSubsidy(e.target.checked)}
              />
              <span className={styles.checkBody}>
                <span className={styles.checkTitle}>家庭成員已享有其他住宅相關協助</span>
                <span className={styles.checkDesc}>
                  例如自購或修繕住宅貸款利息補貼、承租政府直接興建社會住宅。符合這項不能同時領租金補貼。
                </span>
              </span>
            </label>
          </div>

          <Field label="申請人婚姻狀態">
            <div className={styles.seg}>
              <button
                type="button"
                className={marriage === "single" ? `${styles.segBtn} ${styles.segOn}` : styles.segBtn}
                onClick={() => setMarriage("single")}
              >
                單身
              </button>
              <button
                type="button"
                className={marriage === "newlywed" ? `${styles.segBtn} ${styles.segOn}` : styles.segBtn}
                onClick={() => setMarriage("newlywed")}
              >
                新婚
              </button>
              <button
                type="button"
                className={marriage === "married" ? `${styles.segBtn} ${styles.segOn}` : styles.segBtn}
                onClick={() => setMarriage("married")}
              >
                已婚
              </button>
            </div>
            <span className={styles.labelHint}>新婚＝申請日前二年內結婚</span>
          </Field>

          <Field label="經濟弱勢身分">
            <div className={styles.seg}>
              <button
                type="button"
                className={economicStatus === "none" ? `${styles.segBtn} ${styles.segOn}` : styles.segBtn}
                onClick={() => setEconomicStatus("none")}
              >
                皆非
              </button>
              <button
                type="button"
                className={economicStatus === "low" ? `${styles.segBtn} ${styles.segOn}` : styles.segBtn}
                onClick={() => setEconomicStatus("low")}
              >
                低收入戶
              </button>
              <button
                type="button"
                className={economicStatus === "middle" ? `${styles.segBtn} ${styles.segOn}` : styles.segBtn}
                onClick={() => setEconomicStatus("middle")}
              >
                中低收入戶
              </button>
            </div>
          </Field>

          <div className={`${styles.field} ${styles.wide}`}>
            <span className={styles.label}>社會弱勢身分（可複選，符合其中一項就算）</span>
            <div className={styles.checkGrid}>
              {SOCIAL_DISADVANTAGE_ITEMS.map((item) => (
                <label key={item} className={styles.checkSmall}>
                  <input type="checkbox" checked={socialItems.has(item)} onChange={() => toggleSocial(item)} />
                  <span>{item}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {!outcome && (
        <div className={styles.alert}>
          <p className={styles.alertTitle}>把租賃縣市、行政區與所得欄位填完，結果會自己跑出來</p>
          <p className={styles.alertBody}>其他欄位已經先帶了常見值（成年、單身、無弱勢身分），可以照實際情況改。</p>
        </div>
      )}

      {outcome && !outcome.eligible && (
        <div className={styles.alert}>
          <p className={styles.alertTitle}>這樣不符合申請資格</p>
          <p className={styles.alertBody}>{outcome.reason}</p>
        </div>
      )}

      {outcome && outcome.eligible && (
        <div className={styles.result}>
          <div className={styles.resultHead}>
            <div className={styles.resultLabel}>估計每月可領租金補貼</div>
            <div className={styles.resultBig}>
              {money(outcome.monthlyAmount)}
              <span className={styles.resultUnit}>元 / 月</span>
            </div>
            <div className={styles.resultSub}>
              {outcome.city}
              {outcome.district !== outcome.city ? `・${outcome.district}` : ""}・第 {outcome.level} 級
            </div>
            <div className={styles.resultFacts}>
              <span className={styles.fact}>基礎金額 {money(outcome.baseAmount)} 元</span>
              <span className={styles.fact}>加碼 {outcome.scale} 倍</span>
            </div>
          </div>

          <div className={styles.resultBody}>
            <div className={styles.resultWarn}>
              <p>
                ⚠️ 這是「如果核准會拿到多少」的試算，<strong>不代表一定核准</strong>。
                超過各縣市當年度辦理戶數時會用評點制排序，最後結果由審查單位認定。
              </p>
            </div>

            <p className={styles.stepsTitle}>怎麼算出來的</p>
            <table className={styles.steps}>
              <tbody>
                <tr>
                  <td className={styles.stepLabel}>
                    分級基礎金額
                    <span className={styles.stepNote}>第 {outcome.level} 級・依家庭人數與經濟弱勢身分判斷</span>
                  </td>
                  <td className={styles.stepAmount}>{money(outcome.baseAmount)}</td>
                </tr>
                <tr className={styles.stepTotal}>
                  <td className={styles.stepLabel}>
                    × 加碼倍率 {outcome.scale} 倍
                    <span className={styles.stepNote}>
                      {outcome.scaleReasons.length > 0
                        ? outcome.scaleReasons.map((r) => `${r.label}（${r.scale} 倍）`).join("、") + "，多項符合時擇高"
                        : "沒有符合任何加碼身分"}
                    </span>
                  </td>
                  <td className={styles.stepAmount}>{money(outcome.monthlyAmount)}</td>
                </tr>
              </tbody>
            </table>

            <ul className={styles.notes}>
              {outcome.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {outcome && outcome.eligible && (
        <div className={styles.cta}>
          <p className={styles.ctaText}>算完想確認實際情況，或想找符合條件的物件？</p>
          <Link className={`${home.btn} ${home.btnPrimary}`} href="/card/booking">
            預約諮詢
          </Link>
        </div>
      )}
    </>
  );
}

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

function NumField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  small,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  small?: boolean;
}) {
  return (
    <label className={styles.field}>
      <span className={small ? styles.labelHint : styles.label}>
        {label}
        {hint && <span className={styles.labelHint}>{hint}</span>}
      </span>
      <input
        className={styles.input}
        type="number"
        inputMode="numeric"
        min="0"
        step="1"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

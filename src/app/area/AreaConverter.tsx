"use client";

/**
 * 地籍面積單位換算 —— 畫面。
 *
 * 2026-10-01 系統擁有者：「輸入 50 平方公尺，其他單位要自動對應出相對的答案」。
 * 所以不是「選來源單位、選目標單位、按換算」那種三步驟，而是七格並排、
 * 打哪一格其他六格立刻跟著變。
 *
 * 算法完全不寫在這裡 —— 在 src/lib/area-units.ts（改係數跑 `npm run check:area`）。
 *
 * 狀態只存「正在輸入的那一格是哪個單位＋他打的原文」：
 *   - 原文照存，不要在他打字時幫他重排格式（打到「15.」就被改成「15」會很惱人）
 *   - 其他六格每次 render 從原文算出來，不另外存，所以永遠不會不同步
 */
import { useMemo, useState } from "react";
import { AREA_UNITS, type AreaUnit, convertArea, formatArea, parseAreaInput } from "@/lib/area-units";
import styles from "../tax/tax.module.css";
import area from "./area.module.css";

type Source = { unit: AreaUnit; text: string };

/** 「不知道要打什麼？」的範例，順序是客戶最常問的 */
const EXAMPLES: { unit: AreaUnit; text: string; label: string }[] = [
  { unit: "sqm", text: "50", label: "50 平方公尺" },
  { unit: "ping", text: "30", label: "30 坪" },
  { unit: "fen", text: "1", label: "1 分地" },
  { unit: "jia", text: "1", label: "1 甲地" },
  { unit: "hectare", text: "1", label: "1 公頃" },
];

const GROUPS: { key: "metric" | "taiwan"; title: string }[] = [
  { key: "metric", title: "公制（謄本、權狀用的）" },
  { key: "taiwan", title: "台灣慣用（坪、甲、分）" },
];

export default function AreaConverter() {
  const [source, setSource] = useState<Source>({ unit: "sqm", text: "" });
  const [copyMsg, setCopyMsg] = useState("");

  const parsed = useMemo(() => parseAreaInput(source.text), [source.text]);

  // null ＝ 還沒輸入；"bad" ＝ 打了但不是數字；其他 ＝ 七格的數字
  const values = useMemo(() => {
    if (parsed === null) return null;
    if (Number.isNaN(parsed)) return "bad" as const;
    return convertArea(parsed, source.unit);
  }, [parsed, source.unit]);

  const sourceDef = AREA_UNITS.find((u) => u.key === source.unit)!;
  const summaryLines =
    values && values !== "bad"
      ? AREA_UNITS.filter((u) => u.key !== source.unit).map((u) => `${formatArea(values[u.key])} ${u.label}`)
      : [];

  function display(unit: AreaUnit): string {
    if (unit === source.unit) return source.text;
    if (!values || values === "bad") return "";
    return formatArea(values[unit]);
  }

  function onChange(unit: AreaUnit, text: string) {
    setSource({ unit, text });
    setCopyMsg("");
  }

  function clear() {
    setSource({ unit: source.unit, text: "" });
    setCopyMsg("");
  }

  async function copy() {
    if (!summaryLines.length) return;
    const text = `${source.text.trim()} ${sourceDef.label} ＝ ${summaryLines.join("、")}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopyMsg("已複製，可以直接貼到 LINE");
    } catch {
      setCopyMsg("瀏覽器不讓複製，請自己選取上面的數字");
    }
  }

  return (
    <>
      <div className={styles.form}>
        <div className={area.examples}>
          <span className={area.examplesLabel}>先試試看：</span>
          {EXAMPLES.map((ex) => (
            <button key={ex.label} type="button" className={area.exampleBtn} onClick={() => onChange(ex.unit, ex.text)}>
              {ex.label}
            </button>
          ))}
        </div>

        <div className={styles.grid}>
          {GROUPS.map((group) => (
            <GroupBlock key={group.key} title={group.title}>
              {AREA_UNITS.filter((u) => u.group === group.key).map((u) => (
                <label key={u.key} className={styles.field}>
                  <span className={styles.label}>
                    {u.label}
                    <span className={styles.labelHint}>{u.hint}</span>
                  </span>
                  <div className={styles.amountWrap}>
                    <input
                      className={u.key === source.unit ? `${styles.input} ${area.inputOn}` : styles.input}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0"
                      value={display(u.key)}
                      onChange={(e) => onChange(u.key, e.target.value)}
                      onFocus={(e) => e.currentTarget.select()}
                      aria-label={`${u.label}`}
                    />
                    <span className={styles.unit}>{u.label}</span>
                  </div>
                </label>
              ))}
            </GroupBlock>
          ))}
        </div>

        <div className={area.actions}>
          <button type="button" className={area.actionBtn} onClick={clear} disabled={source.text === ""}>
            清除
          </button>
          <button type="button" className={area.actionBtn} onClick={copy} disabled={summaryLines.length === 0}>
            複製結果
          </button>
          {copyMsg && <span className={area.actionMsg}>{copyMsg}</span>}
        </div>
      </div>

      {values === null && (
        <div className={styles.alert}>
          <p className={styles.alertTitle}>在任何一格打數字，其他六格就會自動算出來</p>
          <p className={styles.alertBody}>
            例如在「平方公尺」打 50，坪、公畝、公頃、平方公里、甲、分都會同時對應出來；改打「坪」那格也一樣。
          </p>
        </div>
      )}

      {values === "bad" && (
        <div className={styles.alert}>
          <p className={styles.alertTitle}>這格只能打數字</p>
          <p className={styles.alertBody}>可以有小數點和千分位逗號，不能有負號或文字。</p>
        </div>
      )}

      {values && values !== "bad" && (
        <div className={area.summary} aria-live="polite">
          <div className={area.summaryHead}>
            <div className={area.summaryLabel}>換算結果</div>
            <div className={area.summaryBig}>
              {formatArea(values[source.unit])}
              <small>{sourceDef.label}</small>
            </div>
          </div>
          <dl className={area.summaryList}>
            {AREA_UNITS.filter((u) => u.key !== source.unit).map((u) => (
              <div key={u.key} className={area.summaryItem}>
                <dt>{u.label}</dt>
                <dd>{formatArea(values[u.key])}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <h2 className={area.refTitle}>常用對照</h2>
      <ul className={area.refTable}>
        <li>
          <b>1 平方公尺</b> ＝ <code>0.3025</code> 坪
        </li>
        <li>
          <b>1 坪</b> ＝ <code>3.3058</code> 平方公尺
        </li>
        <li>
          <b>1 公頃</b> ＝ <code>10,000</code> 平方公尺 ＝ <code>3,025</code> 坪 ＝ <code>1.03102</code> 甲
        </li>
        <li>
          <b>1 甲</b> ＝ <code>10</code> 分 ＝ <code>2,934</code> 坪 ＝ <code>0.96992</code> 公頃
        </li>
        <li>
          <b>1 分</b> ＝ <code>293.4</code> 坪 ＝ <code>969.92</code> 平方公尺
        </li>
        <li>
          <b>1 公畝</b> ＝ <code>100</code> 平方公尺 ＝ <code>30.25</code> 坪
        </li>
        <li>
          <b>1 平方公里</b> ＝ <code>100</code> 公頃
        </li>
      </ul>
    </>
  );
}

/** 分組小標＋底下的欄位。小標自己佔一整列，欄位照 grid 排兩欄。 */
function GroupBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <div className={area.groupTitle}>{title}</div>
      {children}
    </>
  );
}

"use client";

/**
 * 統一發票兌獎 —— 畫面。
 *
 * 2026-11-19 系統擁有者：「我想做一個統一發票兌獎工具在我的免費小工具內」。
 *
 * 用法照大家對發票的習慣：一疊發票，一張一張只看末 3 碼。
 *   ・打滿 3 碼當場出結果；沒中就直接打下一張（第 4 個數字自動當成新的一張，不用按清除）
 *   ・末 3 碼對到了才問前 5 碼（游標自己跳過去），補完告訴他是幾獎
 *   ・整串 8 碼貼進來也行，自動拆成前 5＋末 3
 * 結果就印在輸入框正下方（這個專案的老問題：結果開在畫面外等於沒反應）。
 *
 * 規則不寫在這裡 —— 在 src/lib/invoice-lottery.ts（改完跑 `npm run check:invoice`）。
 * 對過的清單只放在這一頁的記憶體裡，重新整理就沒了；發票號碼不送出、不存任何地方。
 */
import { useEffect, useRef, useState } from "react";
import {
  amountText,
  checkFull,
  checkTail,
  claimStatus,
  type ClaimStatus,
  type InvoiceDraw,
  nextDraw,
  onlyDigits,
  PRIZES,
  rocDateText,
  taipeiToday,
  type TailHit,
  type Win,
} from "@/lib/invoice-lottery";
import styles from "../tax/tax.module.css";
import inv from "./invoice.module.css";

type Entry = { id: number; drawIdx: number; tail: string; front: string };

type Outcome =
  /** 沒中。nearBig＝末 3 碼跟特別獎／特獎一樣、補完整號碼後確定沒中（要解釋為什麼） */
  | { kind: "miss"; nearBig: boolean }
  /** 中了。final＝已補完整號碼、獎別確定；否則是「至少六獎」 */
  | { kind: "win"; win: Win; final: boolean }
  /** 末 3 碼只跟特別獎／特獎一樣，還沒補完整號碼 */
  | { kind: "maybe"; hits: TailHit[] };

const HIT_NAME: Record<TailHit["kind"], string> = { special: "特別獎", grand: "特獎", first: "頭獎", extraSixth: "增開六獎" };

function outcomeOf(entry: Entry, draw: InvoiceDraw): Outcome {
  if (entry.front.length === 5) {
    const win = checkFull(entry.front + entry.tail, draw);
    return win ? { kind: "win", win, final: true } : { kind: "miss", nearBig: checkTail(entry.tail, draw).verdict === "maybe" };
  }
  const tail = checkTail(entry.tail, draw);
  if (tail.verdict === "miss") return { kind: "miss", nearBig: false };
  if (tail.verdict === "maybe") return { kind: "maybe", hits: tail.hits };
  // 末 3 碼同頭獎或增開六獎：先當最小的那個獎
  const hit = tail.hits.find((h) => h.kind === "first" || h.kind === "extraSixth")!;
  const prize = hit.kind === "first" ? "sixth" : "extraSixth";
  return { kind: "win", win: { prize, name: PRIZES[prize].name, amount: PRIZES[prize].amount, matched: hit.number }, final: false };
}

const STATUS_TEXT: Record<ClaimStatus, string> = {
  open: "領獎期間內",
  notYet: "還沒開始領獎",
  expired: "已過領獎期限",
  unknown: "",
};

export default function InvoiceChecker({ draws, source }: { draws: InvoiceDraw[]; source: "page" | "rss" }) {
  const [drawIdx, setDrawIdx] = useState(0);
  const [tail, setTail] = useState("");
  const [front, setFront] = useState("");
  const [log, setLog] = useState<Entry[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  // 「今天」只在瀏覽器算：這頁是一小時重生一次的靜態頁，伺服器算的日期在領獎最後一天前後會差到
  const [today, setToday] = useState<string | null>(null);
  const tailRef = useRef<HTMLInputElement>(null);
  const frontRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);

  useEffect(() => {
    setToday(taipeiToday());
  }, []);

  const draw = draws[drawIdx];
  const statusOf = (d: InvoiceDraw): ClaimStatus => (today ? claimStatus(d, today) : "unknown");
  const status = statusOf(draw);

  const active = activeId === null ? null : (log.find((e) => e.id === activeId) ?? null);
  const outcome = active ? outcomeOf(active, draws[active.drawIdx]) : null;
  // 末 3 碼有對到東西就一直留著「前 5 碼」那格（補完也留著，打錯可以改）
  const showFront = active !== null && checkTail(active.tail, draws[active.drawIdx]).verdict !== "miss";

  // 末 3 碼對到了 → 游標跳到「前 5 碼」那格
  useEffect(() => {
    if (showFront && front.length < 5) frontRef.current?.focus();
    // 只在換了一張的時候跳，補前 5 碼的過程不要一直搶游標
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  function commit(newTail: string, newFront: string) {
    const id = nextId.current++;
    setLog((prev) => [{ id, drawIdx, tail: newTail, front: newFront }, ...prev]);
    setActiveId(id);
  }

  function onTailChange(raw: string) {
    let d = onlyDigits(raw);
    if (d.length >= 8) {
      // 整串 8 碼貼進來：拆成前 5＋末 3
      const full = d.slice(0, 8);
      setTail(full.slice(5));
      setFront(full.slice(0, 5));
      commit(full.slice(5), full.slice(0, 5));
      return;
    }
    // 已經滿 3 碼又繼續打：多出來的當成下一張
    if (d.length > 3) d = d.slice(3, 6);
    setTail(d);
    setFront("");
    if (d.length === 3) commit(d, "");
    else setActiveId(null);
  }

  function onFrontChange(raw: string) {
    const d = onlyDigits(raw).slice(0, 5);
    setFront(d);
    if (activeId === null) return;
    const value = d.length === 5 ? d : "";
    setLog((prev) => prev.map((e) => (e.id === activeId ? { ...e, front: value } : e)));
  }

  function nextOne() {
    setTail("");
    setFront("");
    setActiveId(null);
    tailRef.current?.focus();
  }

  function pickDraw(idx: number) {
    setDrawIdx(idx);
    setTail("");
    setFront("");
    setActiveId(null);
  }

  // 這張中獎號碼表上，哪幾組號碼被現在這張發票對到（整列標起來）
  const hitNumbers = new Set<string>();
  if (active && active.drawIdx === drawIdx && outcome) {
    if (outcome.kind === "win") hitNumbers.add(outcome.win.matched);
    if (outcome.kind === "maybe") outcome.hits.forEach((h) => hitNumbers.add(h.number));
  }

  // 統計：過期那一期的不算進金額
  const rows = log.map((e) => ({ entry: e, draw: draws[e.drawIdx], outcome: outcomeOf(e, draws[e.drawIdx]), expired: statusOf(draws[e.drawIdx]) === "expired" }));
  const wins = rows.filter((r) => r.outcome.kind === "win" && !r.expired);
  const total = wins.reduce((sum, r) => sum + (r.outcome.kind === "win" ? r.outcome.win.amount : 0), 0);
  const totalIsFloor = wins.some((r) => r.outcome.kind === "win" && !r.outcome.final);
  const upcoming = nextDraw(draws[0]);

  return (
    <>
      <div className={styles.form}>
        {/* 期別 */}
        <div className={inv.periodRow}>
          <span className={inv.periodLabel}>對哪一期</span>
          <div className={inv.periods} role="group" aria-label="選擇發票期別">
            {draws.map((d, i) => {
              const s = statusOf(d);
              return (
                <button
                  key={d.label}
                  type="button"
                  className={i === drawIdx ? `${inv.periodBtn} ${inv.periodOn}` : inv.periodBtn}
                  aria-pressed={i === drawIdx}
                  onClick={() => pickDraw(i)}
                >
                  <b>{d.label}</b>
                  <small>
                    {i === 0 ? "最新一期" : "上一期"}
                    {s === "expired" || s === "notYet" ? `・${STATUS_TEXT[s]}` : ""}
                  </small>
                </button>
              );
            })}
          </div>
        </div>
        <p className={inv.periodNote}>
          發票上印的月份是哪兩個月，就選哪一期。{upcoming.firstMonth}–{upcoming.firstMonth + 1} 月的發票要等 {upcoming.drawMonth} 月 25
          日開獎，開獎後這頁會自動換成新號碼。
        </p>

        {status === "expired" && (
          <div className={inv.expired} role="status">
            ⚠️ {draw.label}這一期已經過了領獎期限（到 {draw.claimTo ? rocDateText(draw.claimTo) : ""}），現在對中也領不到。
          </div>
        )}

        {/* 輸入 */}
        <div className={inv.entry}>
          <label className={inv.entryField}>
            <span className={styles.label}>
              發票末 3 碼
              <span className={styles.labelHint}>打滿 3 碼就出結果，沒中直接打下一張</span>
            </span>
            <input
              ref={tailRef}
              className={`${styles.input} ${inv.bigInput}`}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              // 點回來就全選：直接打新的 3 碼會蓋掉舊的，游標落在中間也不會插出怪號碼
              onFocus={(e) => e.currentTarget.select()}
              placeholder="例：835"
              value={tail}
              onChange={(e) => onTailChange(e.target.value)}
              aria-label="發票號碼末 3 碼"
              aria-describedby="invoice-result"
            />
          </label>

          {showFront && active && (
            <label className={inv.entryField}>
              <span className={styles.label}>
                再補前 5 碼
                <span className={styles.labelHint}>
                  英文字母後面那 8 個數字的前 5 個（□□□□□-{active.tail}）
                </span>
              </span>
              <input
                ref={frontRef}
                className={`${styles.input} ${inv.bigInput} ${inv.frontInput}`}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                onFocus={(e) => e.currentTarget.select()}
                placeholder="前 5 碼"
                value={front}
                onChange={(e) => onFrontChange(e.target.value)}
                aria-label="發票號碼前 5 碼"
                aria-describedby="invoice-result"
              />
            </label>
          )}
        </div>

        {/* 結果：就在輸入框正下方 */}
        <div id="invoice-result" className={inv.resultSlot} aria-live="polite">
          {!active && tail.length === 0 && <p className={inv.hint}>看發票上英文字母後面的 8 個數字，只要打最後 3 個（不用從頭打 8 碼）。</p>}
          {!active && tail.length > 0 && <p className={inv.hint}>還差 {3 - tail.length} 碼…</p>}

          {active && outcome?.kind === "miss" && (
            <div className={`${inv.result} ${inv.resultMiss}`}>
              <p className={inv.resultTitle}>
                {active.front}
                {active.front ? "" : "末 3 碼 "}
                {active.tail}：沒中
              </p>
              <p className={inv.resultBody}>
                {outcome.nearBig
                  ? "只有末 3 碼跟特別獎或特獎一樣，那兩個獎要 8 碼全部相同才算。"
                  : `跟${draws[active.drawIdx].label}的中獎號碼都對不上。直接打下一張的末 3 碼就好。`}
              </p>
            </div>
          )}

          {active && outcome?.kind === "maybe" && (
            <div className={`${inv.result} ${inv.resultMaybe}`}>
              <p className={inv.resultTitle}>末 3 碼 {active.tail}：先別丟，補前 5 碼確認</p>
              <p className={inv.resultBody}>
                末 3 碼跟{outcome.hits.map((h) => HIT_NAME[h.kind]).join("、")}一樣，但{outcome.hits.map((h) => HIT_NAME[h.kind]).join("、")}
                要 8 碼全部相同才中，請在上面補前 5 碼。
              </p>
            </div>
          )}

          {active && outcome?.kind === "win" && (
            <div className={`${inv.result} ${inv.resultWin}`}>
              <p className={inv.resultTitle}>
                🎉 {outcome.final ? `${active.front}${active.tail}：中${outcome.win.name}` : `末 3 碼 ${active.tail}：中獎了`}
              </p>
              <p className={inv.resultAmount}>
                {outcome.final ? "" : "至少 "}
                {amountText(outcome.win.amount)}
              </p>
              <p className={inv.resultBody}>
                {outcome.final
                  ? `${PRIZES[outcome.win.prize].rule}（對中的號碼：${outcome.win.matched}）。`
                  : outcome.win.prize === "extraSixth"
                    ? `末 3 碼跟增開六獎 ${outcome.win.matched} 一樣。在上面補前 5 碼，看看有沒有同時對中更大的獎。`
                    : `末 3 碼跟頭獎 ${outcome.win.matched} 一樣，至少是${outcome.win.name}。在上面補前 5 碼，看看有沒有更大的獎。`}
                {statusOf(draws[active.drawIdx]) === "expired" && " ⚠️ 但這一期已過領獎期限，領不到了。"}
                {statusOf(draws[active.drawIdx]) === "notYet" &&
                  draws[active.drawIdx].claimFrom &&
                  ` ${rocDateText(draws[active.drawIdx].claimFrom!)}起可以領。`}
              </p>
            </div>
          )}

          {active && (
            <button type="button" className={inv.nextBtn} onClick={nextOne}>
              對下一張
            </button>
          )}
        </div>
      </div>

      {/* 這一期的中獎號碼 */}
      <h2 className={inv.blockTitle}>{draw.label}中獎號碼</h2>
      <div className={inv.board}>
        <NumberRow name="特別獎" prize="1,000 萬元" numbers={[draw.special]} hit={hitNumbers} tailOnly={false} />
        <NumberRow name="特獎" prize="200 萬元" numbers={[draw.grand]} hit={hitNumbers} tailOnly={false} />
        <NumberRow name="頭獎" prize="20 萬元" numbers={draw.firsts} hit={hitNumbers} tailOnly />
        {draw.extraSixth.length > 0 && <NumberRow name="增開六獎" prize="200 元" numbers={draw.extraSixth} hit={hitNumbers} tailOnly />}
        <div className={inv.boardFoot}>
          {draw.claimFrom && draw.claimTo ? (
            <>
              領獎期間：{rocDateText(draw.claimFrom)} ～ {rocDateText(draw.claimTo)}
              {status !== "unknown" && (
                <span className={status === "open" ? `${inv.chip} ${inv.chipOk}` : `${inv.chip} ${inv.chipWarn}`}>{STATUS_TEXT[status]}</span>
              )}
            </>
          ) : (
            <>領獎期間請看財政部公告{source === "rss" ? "（官方號碼單暫時讀不到，這份號碼來自財政部 RSS）" : ""}</>
          )}
        </div>
      </div>

      <ul className={inv.ladder}>
        <li>
          <b>特別獎、特獎</b>：8 碼全部相同才中，沒有「末幾碼」的獎。
        </li>
        <li>
          <b>頭獎</b>的三組號碼從最後一碼往前比：末 3 碼相同 <code>200 元</code>、末 4 碼 <code>1,000 元</code>、末 5 碼 <code>4,000 元</code>、末 6 碼{" "}
          <code>1 萬元</code>、末 7 碼 <code>4 萬元</code>、8 碼全中 <code>20 萬元</code>。
        </li>
      </ul>

      {/* 對過的清單 */}
      {rows.length > 0 && (
        <>
          <div className={inv.logHead}>
            <h2 className={inv.blockTitle}>這次對過的 {rows.length} 張</h2>
            <button type="button" className={inv.clearBtn} onClick={() => { setLog([]); nextOne(); }}>
              清空清單
            </button>
          </div>
          <div className={inv.total}>
            {wins.length > 0 ? (
              <>
                中 <b>{wins.length}</b> 張，合計{totalIsFloor ? "至少" : ""} <b>{amountText(total)}</b>
                {totalIsFloor && <small>（有幾張還沒補前 5 碼，先用六獎算）</small>}
              </>
            ) : (
              <>目前還沒有中獎的。</>
            )}
          </div>
          <ul className={inv.log}>
            {rows.map(({ entry, draw: d, outcome: o, expired }) => (
              <li key={entry.id} className={o.kind === "win" ? inv.logWin : undefined}>
                <span className={inv.logNum}>
                  {entry.front ? entry.front : "□□□□□"}
                  <b>{entry.tail}</b>
                </span>
                <span className={inv.logPeriod}>{d.label}</span>
                <span className={inv.logResult}>
                  {o.kind === "miss" && "沒中"}
                  {o.kind === "maybe" && "要補前 5 碼才知道"}
                  {o.kind === "win" && `${o.final ? o.win.name : "至少六獎"} ${amountText(o.win.amount)}${expired ? "（已過期，不計）" : ""}`}
                </span>
              </li>
            ))}
          </ul>
          <p className={inv.logNote}>這份清單只留在這個畫面上，重新整理就清掉；發票號碼不會送出去，也不會存起來。</p>
        </>
      )}
    </>
  );
}

/** 中獎號碼表的一列。末 3 碼標紅（頭獎、增開六獎是「對末 3 碼」的，特別獎特獎也照官方號碼單整組標紅） */
function NumberRow({ name, prize, numbers, hit, tailOnly }: { name: string; prize: string; numbers: string[]; hit: Set<string>; tailOnly: boolean }) {
  return (
    <div className={inv.boardRow}>
      <div className={inv.boardName}>
        {name}
        <small>{prize}</small>
      </div>
      <div className={inv.boardNums}>
        {numbers.map((n) => {
          const head = tailOnly && n.length > 3 ? n.slice(0, n.length - 3) : "";
          const red = tailOnly && n.length > 3 ? n.slice(-3) : n;
          return (
            <span key={n} className={hit.has(n) ? `${inv.num} ${inv.numHit}` : inv.num}>
              {head}
              <em>{red}</em>
            </span>
          );
        })}
      </div>
    </div>
  );
}

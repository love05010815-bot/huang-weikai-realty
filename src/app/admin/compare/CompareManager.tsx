"use client";

/**
 * /admin/compare —— 競品分析的操作介面。
 *
 * 流程：貼上 591 整頁複製 → 確認表（可改）→ 四段分析 → 複製整段傳給屋主。
 *
 * 🔴 **確認表不是裝飾，是保命符。** 辨識器不可能 100% 對，差別在於「它猜錯了你
 *    知不知道」。所有數字都能當場改，改完整份分析立刻重算 —— 錯的數字不會默默
 *    走到屋主眼前。要簡化這一頁的話，先砍別的。
 *
 * 🔴 **貼進來的東西只留在瀏覽器記憶體，不上傳、不進資料庫。** 目前刻意沒有存檔
 *    功能：591 的資料每週都在變，存起來的舊資料拿去跟屋主講會比沒有更糟。
 *
 * ⚠️ 這裡的資料流是「就地修改 rows 再 setRows([...rows])」，不是不可變更新。
 *    因為去重／合併是整批互相影響的（改一列的樓層會改變別列的分組），
 *    每次都深拷貝反而更難追。改這一頁時記得：改完 rows 一定要呼叫 refresh()。
 */

import { useMemo, useState } from "react";
import { Icon } from "@/app/admin/_ui/icons";
import {
  computeUnit,
  detectDupes,
  parseMany,
  toNum,
  type ParkingKind,
  type RivalRow,
} from "@/lib/rival-parser";
import {
  LISTING_ABS,
  MAXCHARS,
  VIEW_ABS,
  analyze,
  buildConclusion,
  buildDiagnostic,
  buildPlainText,
  buildUnits,
  diagnose,
  diffSentence,
  fmtFloor,
  fmtPark,
  n1,
  sortUnits,
  type Analysis,
  type Answers,
  type RivalUnit,
} from "@/lib/rival-analysis";
import { COMPARE_THEME } from "./theme";
import styles from "./compare.module.css";

type YesNo = "yes" | "no" | null;


const PARKING_OPTIONS: ParkingKind[] = ["平面", "機械", "有", "無"];

/** 確認表的欄位。型態固定顯示 —— 混到別墅會把整份判讀帶偏，要看得見才改得掉。 */
const FIELDS: { k: keyof RivalRow; label: string; kind: "text" | "num" | "park"; w: string }[] = [
  { k: "community", label: "社區", kind: "text", w: "w12" },
  { k: "price", label: "開價(萬)", kind: "num", w: "w6" },
  { k: "area", label: "建坪", kind: "num", w: "w6" },
  { k: "floor", label: "樓層", kind: "num", w: "w5" },
  { k: "totalFloor", label: "總樓", kind: "num", w: "w5" },
  { k: "rooms", label: "房", kind: "num", w: "w5" },
  { k: "buildingType", label: "型態", kind: "text", w: "w7" },
  { k: "ageText", label: "屋齡", kind: "text", w: "w6" },
  { k: "parking", label: "車位", kind: "park", w: "w6" },
  { k: "views", label: "瀏覽", kind: "num", w: "w5" },
  { k: "agency", label: "刊登公司", kind: "text", w: "w12" },
];

export default function CompareManager() {
  const [mineText, setMineText] = useState("");
  const [rivalText, setRivalText] = useState("");
  const [call, setCall] = useState<YesNo>(null);
  const [view, setView] = useState<YesNo>(null);
  const [offer, setOffer] = useState<YesNo>(null);
  const [rows, setRows] = useState<RivalRow[] | null>(null);
  const [tick, setTick] = useState(0); // rows 就地修改後靠它強制重算
  const [showPlain, setShowPlain] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const refresh = () => setTick((t) => t + 1);

  function runParse() {
    const mine = parseMany(mineText).map(computeUnit);
    const rivals = parseMany(rivalText).map(computeUnit);
    if (mine.length > 1) {
      mine[0].warn.push(`「我的物件」框裡貼了 ${mine.length} 筆，我只取第一筆，其餘請剪到競品框`);
    }
    const self = mine.slice(0, 1);
    self.forEach((r) => (r.isSelf = true));
    rivals.forEach((r) => (r.isSelf = false));
    const next = self.concat(rivals);
    detectDupes(next);
    setRows(next);
    setShowPlain(false);
    refresh();
  }

  const answers: Answers = { call, view, offer };

  const result = useMemo(() => {
    if (!rows || !rows.length) return null;
    const units = buildUnits(rows);
    const A = analyze(units, rows);
    const dx = diagnose(A, answers);
    const C = buildConclusion(A, dx);
    return { units, A, dx, C, plain: buildPlainText(A, dx, C) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, tick, call, view, offer]);

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600);
  }

  return (
    <div className={styles.wrap} style={COMPARE_THEME}>
      <PasteCard
        mineText={mineText}
        rivalText={rivalText}
        onMine={setMineText}
        onRival={setRivalText}
      />

      <section className={styles.card}>
        <h2 className={styles.h2}>三個只有你知道的狀況</h2>
        <p className={styles.hint}>591 上查不到這三件事，但第四段「卡在哪」要靠它們才判得準。</p>
        <Question label="1. 有沒有買方打電話來問這一戶？" value={call} onChange={setCall} yes="有" no="沒有" />
        <Question label="2. 有沒有實際帶看過？" value={view} onChange={setView} yes="有帶看" no="約不到" />
        <Question label="3. 帶看之後有沒有人出價？" value={offer} onChange={setOffer} yes="有出價" no="沒出價" />
      </section>

      <div className={styles.runbar}>
        <button type="button" className={styles.run} onClick={runParse} disabled={!mineText.trim() && !rivalText.trim()}>
          <Icon name="radar" size={18} /> 辨識並分析
        </button>
        {!mineText.trim() && !rivalText.trim() ? (
          <span className={styles.runhint}>兩個框都是空的 —— 先到 591 物件頁 Ctrl+A 全選、Ctrl+C 複製再貼進來。</span>
        ) : null}
      </div>

      {result ? (
        <>
          <ConfirmTable rows={rows!} A={result.A} onChange={refresh} onReparse={runParse} onCopyDiag={() => copy(buildDiagnostic(rows!), "diag")} copied={copied === "diag"} />
          <Section1 A={result.A} />
          <Section2 A={result.A} />
          <Section3 A={result.A} />
          <Section4 dx={result.dx} />
          {result.C ? (
            <section className={`${styles.card} ${styles.sec}`}>
              <h2 className={styles.sech}>給屋主的結論</h2>
              <div className={styles.concl}>
                {result.C.body}
                <br />
                <br />
                <span className={styles.tail}>{result.C.tail}</span>
              </div>
              <p className={styles.cap} style={{ margin: "10px 0 0" }}>
                共 {result.C.count} 字{result.C.count <= MAXCHARS ? "（未超過 200 字）" : "（超過 200 字）"}
              </p>
            </section>
          ) : null}

          <section className={`${styles.card} ${styles.sec}`}>
            <h2 className={styles.sech}>傳給屋主</h2>
            <p className={styles.cap}>上面四段加結論，整理成一段可以直接貼到 LINE 的文字。</p>
            <div className={styles.btnrow}>
              <button type="button" className={styles.run} onClick={() => copy(result.plain, "all")}>
                <Icon name="list" size={16} /> {copied === "all" ? "已複製 ✓" : "複製整段分析"}
              </button>
              <button type="button" className={styles.ghost} onClick={() => setShowPlain((v) => !v)}>
                {showPlain ? "收起來" : "先看看內容"}
              </button>
            </div>
            {showPlain ? <pre className={styles.plain}>{result.plain}</pre> : null}
          </section>
        </>
      ) : null}
    </div>
  );
}

/* ---------------- 貼上區 ---------------- */

function PasteCard({
  mineText, rivalText, onMine, onRival,
}: { mineText: string; rivalText: string; onMine: (v: string) => void; onRival: (v: string) => void }) {
  return (
    <>
      <section className={styles.card}>
        <h2 className={styles.h2}>
          我的物件 <span className={`${styles.tag} ${styles.tagSelf}`}>本案</span>
        </h2>
        <p className={styles.hint}>
          到你那一戶的 591 頁面按 <b>Ctrl+A</b> 全選、<b>Ctrl+C</b> 複製，直接貼進來就好，不用挑欄位。
        </p>
        <textarea className={styles.taSmall} value={mineText} onChange={(e) => onMine(e.target.value)}
          placeholder="Ctrl+A 全選 → Ctrl+C 複製 → 在這裡 Ctrl+V 貼上" />
      </section>

      <section className={styles.card}>
        <h2 className={styles.h2}>
          競品 <span className={styles.tag}>同社區在賣的</span>
        </h2>
        <p className={styles.hint}>
          一筆一筆貼進來，<b>可以全部貼在同一個框裡</b>，我會自己切開。重複刊登的同一戶不用先整理。
        </p>
        <textarea className={styles.taBig} value={rivalText} onChange={(e) => onRival(e.target.value)}
          placeholder="第一筆貼上，換行，第二筆再貼上……全部堆在這裡就好" />
      </section>
    </>
  );
}

function Question({
  label, value, onChange, yes, no,
}: { label: string; value: YesNo; onChange: (v: YesNo) => void; yes: string; no: string }) {
  return (
    <div className={styles.qrow}>
      <div className={styles.qlabel}>{label}</div>
      <div className={styles.opts}>
        {([["yes", yes], ["no", no]] as const).map(([v, text]) => (
          <button key={v} type="button"
            className={value === v ? `${styles.opt} ${styles.optOn}` : styles.opt}
            onClick={() => onChange(value === v ? null : v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- 確認表 ---------------- */

function collectIssues(rows: RivalRow[]) {
  const out: { row: number; txt: string; hard: boolean }[] = [];
  rows.forEach((r, i) => {
    const who = `第 ${i + 1} 列${r.isSelf ? "（本案）" : ""}${r.id ? " " + r.id : ""}`;
    r.warn.forEach((w) => out.push({ row: i, txt: `${who}：${w}`, hard: true }));

    const miss: string[] = [];
    if (r.price == null) miss.push("開價");
    if (!r.area) miss.push("建坪");
    if (r.floor == null) miss.push("樓層");
    if (r.views == null) miss.push("瀏覽數");
    if (r.rooms == null) miss.push("房數");
    if (miss.length) {
      out.push({ row: i, txt: `${who}：沒抓到 ${miss.join("、")}，請直接在表格上補`, hard: miss.includes("開價") || miss.includes("建坪") });
    }
    // 有車位卻沒標「含價」：單價會跟含車位的那幾戶差一截，比起來像特別便宜
    if (r.parking !== "無" && !r.parkingInPrice) {
      out.push({
        row: i,
        txt: `${who}：有${r.parking}車位，但沒有標「含價」。如果車位價已經含在開價裡，請把車位欄旁邊的「含價」勾起來，否則單價無法跟其他戶對齊`,
        hard: false,
      });
    }
  });
  return out;
}

function ConfirmTable({
  rows, A, onChange, onReparse, onCopyDiag, copied,
}: {
  rows: RivalRow[]; A: Analysis; onChange: () => void; onReparse: () => void;
  onCopyDiag: () => void; copied: boolean;
}) {
  const issues = collectIssues(rows);
  const hard = issues.filter((x) => x.hard);
  const soft = issues.filter((x) => !x.hard);
  const badRows = new Set(hard.map((x) => x.row));
  const maybes = rows.filter((r) => r.isDupFollower && !r.dupHighConf);
  const undecided = maybes.filter((r) => !r.merge);

  const set = (r: RivalRow, k: keyof RivalRow, v: string | number | boolean | null) => {
    Object.assign(r, { [k]: v });
    if (k === "ageText") r.age = /個月|月內|新成屋|全新/.test(String(v)) ? 0 : toNum(v);
    if (k === "price" || k === "area") {
      r.warn = [];
      computeUnit(r);
    }
    if (k === "community" || k === "floor" || k === "area") detectDupes(rows);
    onChange();
  };

  return (
    <section className={styles.card}>
      <h2 className={styles.h2}>
        確認表 <span className={styles.tag}>數字可以直接點進去改</span>
      </h2>
      <p className={styles.hint}>
        這一步的目的是<b>讓你在傳給屋主之前，先看到我抓成什麼樣</b>。有錯就直接改，下面的分析會馬上跟著重算。
      </p>

      <div className={styles.stats}>
        <Stat k="貼上筆數" v={A.pastedCount} />
        <Stat k="去重後真實戶數" v={A.realUnits} />
        <Stat k="本案被幾家刊登" v={A.selfListingCount ?? "—"} hot={(A.selfListingCount ?? 0) > 1} />
        <Stat k="社區在售筆數" v={A.communityListings ?? "—"} hot={A.supplyFlood} />
      </div>

      {!A.self ? (
        <div className={`${styles.alert} ${styles.alertBad}`}>
          <b>還沒讀到「我的物件」。</b>請把你自己那一戶的 591 頁面複製，貼到上面第一個框。
        </div>
      ) : null}

      {hard.length ? (
        <div className={`${styles.alert} ${styles.alertBad}`}>
          <b>這幾列我抓錯或抓不到，請先修：</b>
          <ul>{hard.map((x, i) => <li key={i}>{x.txt}</li>)}</ul>
        </div>
      ) : null}
      {soft.length ? (
        <div className={`${styles.alert} ${styles.alertWarn}`}>
          <b>這幾列有缺，補了會更準：</b>
          <ul>{soft.map((x, i) => <li key={i}>{x.txt}</li>)}</ul>
        </div>
      ) : null}
      {!hard.length && !soft.length && A.self ? (
        <div className={`${styles.alert} ${styles.alertOk}`}>
          <b>{A.pastedCount} 筆全部辨識成功，欄位沒有缺漏。</b>
          我算的單價和 591 頁面自己顯示的單價互相對得上，代表開價和坪數沒有抓錯。
        </div>
      ) : null}

      {maybes.length ? (
        <div className={`${styles.alert} ${styles.alertWarn}`}>
          <b>
            {undecided.length
              ? `有 ${undecided.length} 筆「疑似同一戶，但開價對不上」，我沒有自動合併，等你判斷。`
              : "你已確認以下這筆是同一戶（開價本來對不上，已依你的判斷合併）。"}
          </b>
          <ul>
            {maybes.map((r, i) => {
              const lead = rows.find((x) => x.groupId === r.groupId && !x.isDupFollower);
              const lo = Math.min(r.price ?? Infinity, lead?.price ?? Infinity);
              const parkDiff = lead && r.parking !== lead.parking;
              return (
                <li key={i}>
                  {r.merge ? "✅ " : "❓ "}
                  同樣在 <b>{r.floor} 樓</b>、建坪 {r.area}／{lead?.area ?? "?"}，但開價{" "}
                  <b>{r.price ?? "?"} 萬</b> vs <b>{lead?.price ?? "?"} 萬</b>
                  {r.dupPriceGap ? `（差 ${Math.abs(r.dupPriceGap)} 萬）` : ""}
                  {parkDiff ? <>；<b>車位也不同</b>：{r.parking} vs {lead!.parking}</> : null}
                  {r.merge ? <> → 表上以 <b>{lo} 萬</b>那一筆為準{parkDiff ? "，車位跟著顯示成那一筆的" : ""}</> : null}
                </li>
              );
            })}
          </ul>
          {undecided.length
            ? "最常見的原因是其中一家降價了、另一家還沒更新（這時低的那個才是現在的行情）；也可能是車位拆賣、談法不同，或根本是兩戶不同的房子。確定是同一戶的話，把「合併」勾起來 —— 合併後會以最低的開價為準。"
            : "合併後以最低開價那一筆為代表，因為那才是買方現在在 591 上找得到的價格。瀏覽數則是各刊登相加。"}
        </div>
      ) : null}

      <div className={styles.tblbox}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th title="取消勾選 = 這不是同一戶">合併</th>
              <th>標記</th>
              {FIELDS.map((f) => <th key={String(f.k)}>{f.label}</th>)}
              <th>單價</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const cls = [
                r.isSelf ? styles.rowSelf : r.groupSize > 1 ? styles.rowDup : "",
                badRows.has(i) ? styles.rowBad : "",
              ].filter(Boolean).join(" ");
              const noPark = r.parking === "無";
              return (
                <tr key={i} className={cls}>
                  <td style={{ textAlign: "center" }}>
                    {r.isDupFollower ? (
                      <input type="checkbox" checked={r.merge}
                        title="勾起來 = 跟上面同一戶，不重複計算"
                        onChange={(e) => { r.merge = e.target.checked; onChange(); }} />
                    ) : <span className={styles.dash}>—</span>}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {r.isSelf ? <span className={`${styles.badge} ${styles.badgeSelf}`}>本案</span>
                      : r.groupSize > 1
                        ? (r.dupHighConf || rows.some((x) => x.groupId === r.groupId && x.isDupFollower && x.dupHighConf)
                            ? <span className={`${styles.badge} ${styles.badgeDup}`} title="開價一致，很可能是同一戶">同 {r.groupId + 1} 戶</span>
                            : <span className={`${styles.badge} ${styles.badgeMaybe}`} title="條件相符但開價對不上，需要你判斷">疑似 {r.groupId + 1}?</span>)
                        : <span className={`${styles.badge} ${styles.badgeUni}`}>競品</span>}
                  </td>

                  {FIELDS.map((f) => {
                    const v = r[f.k];
                    if (f.kind === "park") {
                      return (
                        <td key={String(f.k)} className={styles.parkcell}>
                          <select className={`${styles.cell} ${styles[f.w]}`} value={r.parking}
                            onChange={(e) => set(r, "parking", e.target.value as ParkingKind)}>
                            {PARKING_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                          <label className={noPark ? `${styles.incl} ${styles.inclOff}` : styles.incl}
                            title="車位價已經含在開價裡（單價才能跟別戶直接比）">
                            <input type="checkbox" disabled={noPark} checked={!noPark && r.parkingInPrice}
                              onChange={(e) => set(r, "parkingInPrice", e.target.checked)} />
                            含價
                          </label>
                        </td>
                      );
                    }
                    return (
                      <td key={String(f.k)} className={f.kind === "num" ? styles.num : undefined}>
                        <input className={`${styles.cell} ${styles[f.w]}`}
                          title={v == null ? "" : String(v)}
                          value={v == null ? "" : String(v)}
                          onChange={(e) => set(r, f.k, f.kind === "num"
                            ? (e.target.value.trim() === "" ? null : toNum(e.target.value))
                            : e.target.value)} />
                      </td>
                    );
                  })}

                  <td className={`${styles.num} ${styles.unitCell}`}>
                    {r.unit == null ? "—" : r.unit.toFixed(1)}
                    {r.parkingInPrice && r.parking !== "無" ? (
                      <><br /><span className={`${styles.badge} ${styles.badgeUni}`}>含車位</span></>
                    ) : null}
                  </td>
                  <td>
                    <button type="button" className={styles.del} title="刪掉這一列"
                      onClick={() => { rows.splice(i, 1); detectDupes(rows); onChange(); }}>
                      <Icon name="trash" size={14} aria-label="刪除這一列" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={styles.btnrow} style={{ marginTop: 12 }}>
        <button type="button" className={styles.ghost} onClick={onReparse}>重新辨識（丟掉我改過的內容）</button>
        <button type="button" className={styles.ghost} onClick={onCopyDiag}
          title="把每一列「我實際讀到什麼」加原始文字複製起來">
          {copied ? "已複製 ✓" : "哪一欄抓錯了？複製原文給 Claude"}
        </button>
      </div>
    </section>
  );
}

function Stat({ k, v, hot }: { k: string; v: React.ReactNode; hot?: boolean }) {
  return (
    <div className={hot ? `${styles.stat} ${styles.statHot}` : styles.stat}>
      <div className={styles.statK}>{k}</div>
      <div className={styles.statV}>{v}</div>
    </div>
  );
}

/* ---------------- 第一段：比較表 ---------------- */

function Section1({ A }: { A: Analysis }) {
  const self = A.self;
  if (!self) return null;
  const ordered = sortUnits(A.units);
  const priced = ordered.filter((u) => u.unit != null);
  const rank = self.unit != null ? priced.filter((u) => !u.isSelf && u.unit! < self.unit!).length + 1 : null;

  // 型態只有在混雜時才多開一欄 —— 全部同型態時這一欄沒有資訊，只是佔位
  const showType = A.types.length > 1;
  const withPark = A.units.filter((u) => u.parkingInPrice).length;
  const noPark = A.units.length - withPark;
  const noneCount = A.units.filter((u) => u.parking === "無").length;

  return (
    <section className={`${styles.card} ${styles.sec}`}>
      <h2 className={styles.sech}>第一段：比較表</h2>
      <p className={styles.cap}>
        同社區在售 <b>{A.units.length} 戶</b>
        {A.units.length !== A.pastedCount ? `（${A.pastedCount} 筆刊登去重後）` : ""}。
        本案單價 <b>{self.unit == null ? "—" : self.unit.toFixed(1)} 萬/坪</b>
        {rank && priced.length > 1 ? <>，在 {priced.length} 戶中<b>由低到高排第 {rank}</b></> : null}。
      </p>

      <div className={styles.tblbox}>
        <table className={`${styles.table} ${styles.cmp}`}>
          <thead>
            <tr>
              <th>社區</th>
              <th className={styles.r}>開價<br /><span className={styles.u}>萬</span></th>
              <th className={styles.r}>單價<br /><span className={styles.u}>萬/坪</span></th>
              <th className={styles.r}>建坪</th>
              <th className={styles.r}>樓層</th>
              {showType ? <th>型態</th> : null}
              <th className={styles.r}>屋齡</th>
              <th>車位</th>
              <th className={styles.r}>瀏覽數</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((u, i) => {
              const off = showType && !!A.selfType && !!u.buildingType && u.buildingType !== A.selfType;
              return (
                <tr key={i} className={[u.isSelf ? styles.cmpSelf : "", off ? styles.cmpOff : ""].filter(Boolean).join(" ")}>
                  <td>
                    {u.isSelf ? <span className={`${styles.badge} ${styles.badgeSelf}`}>本案</span> : null}{" "}
                    {u.community || "—"}
                  </td>
                  <td className={styles.r}>{u.price == null ? "—" : u.price.toLocaleString()}</td>
                  <td className={styles.r}>
                    <b>{u.unit == null ? "—" : u.unit.toFixed(1)}</b>
                    {u.parkingInPrice && u.parking !== "無" ? (
                      <><br /><span className={`${styles.badge} ${styles.badgePark}`}>含車位</span></>
                    ) : null}
                  </td>
                  <td className={styles.r}>{u.area ?? "—"}</td>
                  <td className={styles.r}>{fmtFloor(u)}</td>
                  {showType ? (
                    <td>
                      {u.buildingType || "—"}
                      {off ? <> <span className={`${styles.badge} ${styles.badgeOff}`}>不同產品</span></> : null}
                    </td>
                  ) : null}
                  <td className={styles.r}>{u.ageText || "—"}</td>
                  <td>{fmtPark(u)}</td>
                  <td className={styles.r}>
                    {u.views == null ? "—" : u.views.toLocaleString()}
                    {u.listingCount > 1 ? (
                      <><br /><span className={`${styles.badge} ${styles.badgeMulti}`}>{u.listingCount} 家合計</span></>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={styles.note}>
        {A.offType.length && A.selfType ? (
          <p>
            🚨 <b>表中混了不同產品</b>：本案是<b>{A.selfType}</b>，另有 {A.offType.length} 戶是{" "}
            {A.offType.map((u) => `${u.buildingType}（${u.price} 萬）`).join("、")}。
            <b>不同產品的單價不能相提並論</b>，而且它們會把「其他在售戶的瀏覽中位數」一起拉動，
            連帶影響第三段與第四段的判讀。<b>建議在上面的確認表把它們刪掉，只留同型態的。</b>
          </p>
        ) : null}
        {withPark && noPark ? (
          <p>⚠️ 表中有 <b>{withPark} 戶的單價含車位、{noPark} 戶不含</b>，兩者<b>不能直接比</b>（含車位的單價把車位坪數算進分母，看起來會比較低）。</p>
        ) : withPark ? (
          <p>本表全部都是<b>含車位</b>的單價（車位坪數已計入建坪），彼此可以直接比。</p>
        ) : null}
        {noneCount && noneCount < A.units.length ? (
          <p>其中 <b>{noneCount} 戶沒有車位</b>，產品條件跟有車位的那幾戶不同。</p>
        ) : null}
        {A.units.some((u) => u.listingCount > 1) ? (
          <p>標「N 家合計」的，是同一戶被多家仲介同時刊登，已合併成一戶，瀏覽數為各刊登相加。</p>
        ) : null}
        {A.units.filter((u) => u.otherPrices.length && u.price != null).map((u, i) => (
          <p key={i}>
            ⚠️ {u.isSelf ? <b>本案</b> : `${u.floor} 樓那一戶`}同時被刊在 <b>{u.price!.toLocaleString()} 萬</b> 與{" "}
            {u.otherPrices.map((p) => `${p.toLocaleString()} 萬`).join("、")}
            （價差 <b>{(u.otherPrices[u.otherPrices.length - 1] - u.price!).toLocaleString()} 萬</b>）。
            表上取<b>最低的</b> —— 若是降價後有一家沒更新，低的才是現在的行情，而買方在 591 上也找得到那一則。
          </p>
        ))}
      </div>
    </section>
  );
}

/* ---------------- 第二段：貼身對手 ---------------- */

function Section2({ A }: { A: Analysis }) {
  const s = A.self;
  if (!s) return null;
  if (!A.rival) {
    return (
      <section className={`${styles.card} ${styles.sec}`}>
        <h2 className={styles.sech}>第二段：貼身對手</h2>
        <div className={`${styles.alert} ${styles.alertWarn}`}>競品裡沒有可以比較的物件（缺開價或建坪，算不出單價）。</div>
      </section>
    );
  }
  const both = A.twin != null && !A.twinSameAsRival;
  const cols: [string, RivalUnit][] = both ? [["單價最接近", A.rival], ["條件最像", A.twin!]] : [["貼身對手", A.rival]];

  const numRows: [string, keyof RivalUnit, number][] = [
    ["開價（萬）", "price", 0],
    ["單價（萬/坪）", "unit", 1],
    ["建坪", "area", 1],
    ["樓層", "floor", 0],
    ["瀏覽數", "views", 0],
  ];

  return (
    <section className={`${styles.card} ${styles.sec}`}>
      <h2 className={styles.sech}>第二段：貼身對手</h2>
      {A.rivalIsOtherBuilding ? (
        <div className={`${styles.alert} ${styles.alertBad}`}>
          🚨 <b>競品裡沒有同型態的物件</b>，這一戶是 {A.rival.buildingType || "?"}、本案是 {A.selfType || "?"}，
          <b>不是同一種產品，不能拿來當比價對手</b>。
        </div>
      ) : null}
      <p className={styles.cap}>
        {A.rivalIsOtherType ? (
          <>
            <b>⚠️ 競品裡沒有同房型的物件</b>，以下這戶是 {A.rival.rooms ?? "?"} 房、本案是 {s.rooms ?? "?"} 房，不是同一批買方，參考價值有限。
          </>
        ) : (
          <>
            從 {A.sameTypeCount} 戶同房型的競品中挑出{both ? "兩戶" : "一戶"}：<b>單價跟你最接近的</b>（證明行情就在這裡）
            {both ? <>，和<b>條件跟你最像的</b>（證明一模一樣的東西別人賣多少）。</> : "，它同時也是條件跟你最像的那一戶。"}
          </>
        )}
      </p>

      <div className={styles.tblbox}>
        <table className={`${styles.table} ${styles.vs}`}>
          <thead>
            <tr>
              <th />
              <th className={styles.r}>本案</th>
              {cols.map(([label]) => <th key={label} className={styles.r}>{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {numRows.map(([label, k, dec]) => {
              const sv = s[k] as number | null;
              return (
                <tr key={label}>
                  <td>{label}</td>
                  <td className={styles.r}><b>{sv == null ? "—" : sv.toLocaleString()}</b></td>
                  {cols.map(([lab, u]) => {
                    const v = u[k] as number | null;
                    const d = v != null && sv != null ? (dec ? n1(v - sv) : Math.round(v - sv)) : null;
                    return (
                      <td key={lab} className={styles.r}>
                        {v == null ? "—" : v.toLocaleString()}
                        {d ? <span className={d < 0 ? styles.dn : styles.up}> {d > 0 ? "+" : ""}{d.toLocaleString()}</span> : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            <tr>
              <td>屋齡</td>
              <td className={styles.r}><b>{s.ageText || "—"}</b></td>
              {cols.map(([lab, u]) => <td key={lab} className={styles.r}>{u.ageText || "—"}</td>)}
            </tr>
            <tr>
              <td>車位</td>
              <td className={styles.r}><b>{fmtPark(s)}</b></td>
              {cols.map(([lab, u]) => <td key={lab} className={styles.r}>{fmtPark(u)}</td>)}
            </tr>
          </tbody>
        </table>
      </div>

      {cols.map(([label, u]) => (
        <div key={label} className={styles.oneline}>
          <span className={`${styles.tag} ${styles.tagOn}`}>{label}</span> {diffSentence(u, s)}
        </div>
      ))}

      <div className={styles.note}>
        <p>
          買方比價的時候就是拿這{both ? "兩" : "一"}戶來壓本案的價格。
          {both
            ? <><b>單價最接近</b>那戶決定「行情落在哪裡」；<b>條件最像</b>那戶決定「一模一樣的東西，別人開多少」。兩戶的開價一高一低時，中間那段就是實際可以談的空間。</>
            : <>這一戶的條件與開價，等於是本案在市場上的<b>參考天花板</b>。</>}
        </p>
      </div>
    </section>
  );
}

/* ---------------- 第三段：體質檢測 ---------------- */

function CheckRow({ label, value, verdict, tone }: { label: React.ReactNode; value: React.ReactNode; verdict: React.ReactNode; tone?: "bad" | "good" }) {
  const cls = tone === "bad" ? styles.chkBad : tone === "good" ? styles.chkGood : styles.chkNa;
  return (
    <tr className={cls}>
      <td>{label}</td>
      <td className={styles.r}><b>{value}</b></td>
      <td>{verdict}</td>
    </tr>
  );
}

function Section3({ A }: { A: Analysis }) {
  if (!A.self) return null;
  return (
    <section className={`${styles.card} ${styles.sec}`}>
      <h2 className={styles.sech}>第三段：體質檢測</h2>

      <h3 className={styles.subh}>
        供給面<span className={styles.thr}>門檻：刊登家數 ≥ {LISTING_ABS} 家 → 供給氾濫</span>
      </h3>
      <div className={styles.tblbox}>
        <table className={`${styles.table} ${styles.chk}`}>
          <tbody>
            {A.communityListings != null ? (
              <CheckRow label="社區在售筆數（591 顯示，含重複刊登）" value={`${A.communityListings.toLocaleString()} 筆`}
                tone={A.supplyFlood ? "bad" : "good"}
                verdict={A.supplyFlood ? <>🔴 <b>超過 {LISTING_ABS} 家門檻 —— 供給氾濫，這一區賣壓大</b></> : <>✅ 未達 {LISTING_ABS} 家門檻</>} />
            ) : (
              <CheckRow label="社區在售筆數" value="—" verdict="貼上的內容沒有社區資訊，無法判斷整區供給" />
            )}
            {A.communityCuts != null ? (
              <CheckRow label="社區已降價戶數" value={`${A.communityCuts.toLocaleString()} 間`}
                tone={A.communityCuts > 0 ? "bad" : "good"}
                verdict={A.communityCuts > 0
                  ? <>🔻 <b>已有 {A.communityCuts} 戶撐不住開始降價</b>{A.cutPct != null ? `，佔在售 ${A.cutPct}%` : ""} —— 賣壓的直接證據</>
                  : "目前沒有人降價"} />
            ) : null}
            {A.communityNew != null ? (
              <CheckRow label="近半個月新上架" value={`${A.communityNew.toLocaleString()} 間`}
                tone={A.newPct != null && A.newPct >= 10 ? "bad" : undefined}
                verdict={<>新供給進來的速度{A.newPct != null ? `，佔在售 ${A.newPct}%` : ""}{A.newPct != null && A.newPct >= 10 ? <> —— <b>上架速度快，供給還在增加</b></> : null}</>} />
            ) : null}
            {A.communityOwner != null ? (
              <CheckRow label="屋主自售" value={`${A.communityOwner.toLocaleString()} 間`}
                verdict={`沒有透過仲介、自己刊登的戶數${A.ownerPct != null ? `，佔在售 ${A.ownerPct}%` : ""}`} />
            ) : null}
            <CheckRow label="你比對的真實在售戶數" value={`${A.realUnits} 戶`}
              verdict={A.dupRate > 0 ? `由 ${A.pastedCount} 筆刊登去重而來，重複率 ${A.dupRate}%` : `${A.pastedCount} 筆刊登，沒有重複`} />
            <CheckRow label="本案被幾家仲介刊登" value={`${A.selfListingCount} 家`}
              tone={A.selfOverListed ? "bad" : "good"}
              verdict={A.selfOverListed
                ? <>🔴 <b>單一戶就被 {A.selfListingCount} 家刊登，同一戶重複曝光反而稀釋詢問</b></>
                : <>✅ 未達 {LISTING_ABS} 家門檻</>} />
          </tbody>
        </table>
      </div>
      {A.communityListings != null && A.supplyFlood ? (
        <div className={styles.note}>
          <p>
            ⚠️ <b>{A.communityListings.toLocaleString()} 筆是含重複刊登的數字</b>，實際戶數會比這個少。
            但就算按你抽樣的重複率 {A.dupRate}% 打折，也遠遠超過 {LISTING_ABS} 的門檻 —— 這個結論不受去重影響。
          </p>
        </div>
      ) : null}

      <h3 className={styles.subh} style={{ marginTop: 22 }}>
        熱度面<span className={styles.thr}>門檻：累積瀏覽 ≥ {VIEW_ABS} → 有熱度</span>
      </h3>
      <div className={styles.tblbox}>
        <table className={`${styles.table} ${styles.chk}`}>
          <tbody>
            <CheckRow
              label={`本案累積瀏覽${(A.self.listingCount ?? 1) > 1 ? `（${A.self.listingCount} 家合計）` : ""}`}
              value={A.selfViews == null ? "—" : `${A.selfViews.toLocaleString()} 次`}
              tone={A.heatAbsPass ? "good" : "bad"}
              verdict={A.heatAbsPass
                ? <>✅ <b>達到 {VIEW_ABS} 次門檻 —— 有熱度，市場有在看這間房</b></>
                : <>❌ 未達 {VIEW_ABS} 次的絕對門檻</>} />
            {A.othersMedian != null && A.ratio != null ? (
              <CheckRow label="其他在售戶的瀏覽中位數" value={`${A.othersMedian.toLocaleString()} 次`}
                tone={A.heatLevel === "high" ? "good" : A.heatLevel === "low" ? "bad" : undefined}
                verdict={<>本案是中位數的 <b>{Math.round(A.ratio * 100)}%</b> —— {A.heatLevel === "high" ? <>🟢 <b>高於同社區水準</b></> : A.heatLevel === "mid" ? "🟡 與同社區相當" : <>🔴 <b>低於同社區水準</b></>}</>} />
            ) : null}
            {A.viewRank ? (
              <CheckRow label="本案瀏覽名次" value={`第 ${A.viewRank} 高`}
                tone={A.viewRank === A.viewRanked && A.viewRanked > 1 ? "bad" : undefined}
                verdict={<>共 {A.viewRanked} 戶{A.viewRank === A.viewRanked && A.viewRanked > 1 ? <> —— 🔴 <b>全場最後一名</b></> : null}</>} />
            ) : null}
            {A.communityViews != null ? (
              <CheckRow label="社區頁瀏覽人數" value={`${A.communityViews.toLocaleString()} 人`}
                verdict={<>整個社區的關注度參考。⚠️ <b>這是社區頁本身的瀏覽人數，跟上面各物件的瀏覽是不同的計數，不能拿來相比。</b></>} />
            ) : null}
          </tbody>
        </table>
      </div>

      {A.offType.length ? (
        <div className={styles.note}>
          <p>
            🚨 <b>上面的中位數混進了 {A.offType.length} 戶不同產品</b>（{A.offType.map((u) => u.buildingType).join("、")}，本案是 {A.selfType}）。
            <b>不同產品的瀏覽量會把中位數帶偏，連帶改變第四段的判讀。</b>請先到確認表把它們刪掉，再看這一段的結論。
          </p>
        </div>
      ) : null}
      {A.absMeaningless ? (
        <div className={styles.note}>
          <p>
            ⚠️ <b>這個社區沒有任何一戶達到 {VIEW_ABS} 次</b>（最高 {A.maxViews.toLocaleString()} 次）。
            {VIEW_ABS} 這個數字是別的市場的標準，套在這裡會把每一戶都判成「曝光不足」，<b>在這個社區沒有鑑別度</b>。
            判斷熱度請以上面「相對於同社區」的比較為準。
          </p>
        </div>
      ) : null}
    </section>
  );
}

/* ---------------- 第四段：判讀 ---------------- */

function Section4({ dx }: { dx: ReturnType<typeof diagnose> }) {
  if (dx.key === "nodata") return null;
  return (
    <section className={`${styles.card} ${styles.sec}`}>
      <h2 className={styles.sech}>第四段：判讀卡在哪</h2>
      {dx.key === "needanswer" ? (
        <div className={`${styles.alert} ${styles.alertWarn}`}><b>{dx.title}</b><br />{dx.body}</div>
      ) : (
        <>
          <div className={dx.tone === "ok" ? `${styles.verdict} ${styles.verdictOk}` : `${styles.verdict} ${styles.verdictBad}`}>
            <div className={styles.vk}>結論</div>
            <div className={styles.vt}>{dx.title}</div>
            {dx.why ? <div className={styles.vw}>{dx.why}</div> : null}
          </div>
          <p className={styles.vbody}>{dx.body}</p>
          {dx.todo?.length ? (
            <div className={styles.note}>
              <b>接下來該做的：</b>
              <ol>{dx.todo.map((t, i) => <li key={i}>{t}</li>)}</ol>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

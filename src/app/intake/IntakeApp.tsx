"use client";
/**
 * 手機快速建檔的畫面：記一位 → 原地看到符合幾間 → 傳給客戶；也看得到已建立的客戶名單、自己客人的預約。
 *
 * 畫面切換、不換頁、不登入：金鑰跟著每一次 server action 一起送，伺服器那邊驗。
 *   form        填一位（新建，或從名單／結果按「改條件」進來編輯）
 *   list        客戶名單（2026-09-26 他要的）：搜姓名或電話，點一位就開結果；往左滑露出「刪除」（2026-10-05，SwipeRow）；
 *               預算／區域／型態三排標籤篩選（2026-10-05，規則在 lib/match/buyer-filter.ts）
 *   result      這位的資料、符合幾間、傳給客戶
 *   viewings    自己客人的預約看屋（2026-10-05 同事版加的：同事沒有後台，預約只能在這裡看）；
 *               同事在這裡開手機通知（PushSetup，Web Push）
 *   colleagues  同事管理（只有本人的連結有）：新增、停用、重新產生連結、刪除
 * 表單（BuyerEditor）、傳給客戶（ShareToBuyer）、物件清單（MatchList）都跟後台共用，只換淺色樣式。
 *
 * 同事版（2026-10-05）：同一個頁面、不同金鑰。who.colleague 為 true 時名單是那位同事自己的，
 * 「從官方帳號推播」那顆按鈕不給（同事的客人不碰官方帳號）、「同事」那一頁也沒有。
 */
import { useEffect, useState } from "react";
import BuyerEditor from "@/app/admin/match/buyers/BuyerEditor";
import MatchList from "@/app/match/MatchList";
import matchStyles from "@/app/match/match.module.css";
import type { MatchMeta } from "@/app/match/preference-state";
import ShareToBuyer from "@/app/match/ShareToBuyer";
import {
  intakeAddColleagueAction,
  intakeColleaguesAction,
  intakeDeleteAction,
  intakeDeleteColleagueAction,
  intakeListAction,
  intakeOpenAction,
  intakePushAction,
  intakeRotateColleagueKeyAction,
  intakeSaveAction,
  intakeSetColleagueAction,
  intakeViewingsAction,
  type IntakeSaveResult,
} from "@/lib/actions/intake";
import { BUDGET_TIERS, EMPTY_FILTER, budgetCounts, distinctCounts, isFilterActive, matchesFilter, toggleIn, type RowFilter } from "@/lib/match/buyer-filter";
import type { IntakeColleagueRow, IntakeRow, IntakeViewingRow } from "@/lib/match/intake";
import { lineText } from "@/lib/match/line-via";
import intakeStyles from "./intake.module.css";
import PushSetup from "./PushSetup";
import SwipeRow from "./SwipeRow";

/** 表單類的 class 用 /match 的淺色版，其餘（按鈕列、結果區、名單）用這一頁自己的；同名以這一頁為準 */
const styles = { ...matchStyles, ...intakeStyles };

type Saved = Extract<IntakeSaveResult, { ok: true }>;
type View = "form" | "list" | "result" | "viewings" | "colleagues";

/** 這條連結是誰的：本人（可以管同事、可以推播）還是同事；同事的話還帶手機通知用的公鑰 */
export type IntakeWho = {
  colleague: boolean;
  name: string;
  /** Web Push 的 VAPID 公鑰（只有同事的連結有；空字串 = 通知服務沒準備好） */
  pushPublicKey: string;
};

const fmtDay = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric" }) : "";

/** 預約狀態的小標籤顏色：確認／完成綠、取消紅、其餘灰 */
const statusTag = (status: string) => (status === "cancelled" ? styles.tagOff : status === "confirmed" || status === "done" ? styles.tagOn : "");

export default function IntakeApp({ intakeKey, meta, who, initialView }: { intakeKey: string; meta: MatchMeta; who: IntakeWho; initialView?: "viewings" }) {
  const [view, setView] = useState<View>(initialView ?? "form");
  const [saved, setSaved] = useState<Saved | null>(null);
  const [editing, setEditing] = useState(false);
  // 名單只在要看的時候才撈；存過一筆就清掉，下次再撈才是新的
  const [rows, setRows] = useState<IntakeRow[] | null>(null);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  // 預算／區域／型態篩選（換畫面不會清掉，回名單還在）
  const [filter, setFilter] = useState<RowFilter>(EMPTY_FILTER);
  const [opening, setOpening] = useState<string | null>(null);
  // 名單往左滑刪除：哪一列現在是打開的（一次只開一列）、哪一列正在刪、刪完的提示
  const [openId, setOpenId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  // 預約看屋（每次進來重撈，客人可能剛按了預約）
  const [viewings, setViewings] = useState<IntakeViewingRow[] | null>(null);
  const [viewingsError, setViewingsError] = useState<string | null>(null);
  // 同事管理（只有本人）
  const [colleagues, setColleagues] = useState<IntakeColleagueRow[] | null>(null);
  const [colleaguesError, setColleaguesError] = useState<string | null>(null);
  const [cMsg, setCMsg] = useState<string | null>(null);
  const [cName, setCName] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cLine, setCLine] = useState("");
  const [cBusy, setCBusy] = useState(false);

  const top = () => window.scrollTo({ top: 0 });

  // 從手機通知點進來（?v=viewings）：一開始就落在「預約」，順便把預約撈進來
  useEffect(() => {
    if (initialView === "viewings") void goViewings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function goList() {
    setView("list");
    top();
    if (rows) return;
    setRowsError(null);
    const r = await intakeListAction(intakeKey);
    if (r.ok) setRows(r.rows);
    else setRowsError(r.error);
  }

  function goNew() {
    setSaved(null);
    setEditing(false);
    setFlash(null);
    setView("form");
    top();
  }

  async function goViewings() {
    setView("viewings");
    top();
    setViewings(null);
    setViewingsError(null);
    const r = await intakeViewingsAction(intakeKey);
    if (r.ok) setViewings(r.rows);
    else setViewingsError(r.error);
  }

  async function goColleagues() {
    setView("colleagues");
    top();
    setCMsg(null);
    if (colleagues) return;
    setColleaguesError(null);
    const r = await intakeColleaguesAction(intakeKey);
    if (r.ok) setColleagues(r.rows);
    else setColleaguesError(r.error);
  }

  async function open(id: string) {
    setOpening(id);
    setOpenId(null);
    setRowsError(null);
    setFlash(null);
    const r = await intakeOpenAction(intakeKey, id);
    setOpening(null);
    if (!r.ok) {
      setRowsError(r.error);
      return;
    }
    setSaved(r);
    setEditing(false);
    setView("result");
    top();
  }

  /** 名單上往左滑、按兩下「刪除」之後。伺服器拒絕（名下有預約）就把理由放在名單上面。 */
  async function remove(r: IntakeRow) {
    setDeleting(r.id);
    setRowsError(null);
    const res = await intakeDeleteAction(intakeKey, r.id);
    setDeleting(null);
    setOpenId(null);
    if (!res.ok) {
      setRowsError(res.error);
      return;
    }
    setRows((cur) => (cur ?? []).filter((x) => x.id !== r.id));
    if (saved?.buyer.id === r.id) setSaved(null);
    setFlash(`已刪掉「${r.name || r.phone}」`);
  }

  async function copyText(text: string, label: string, setter: (s: string | null) => void) {
    try {
      await navigator.clipboard.writeText(text);
      setter(`${label}已複製。`);
    } catch {
      setter("這個瀏覽器不讓我複製，請長按文字自己複製。");
    }
  }

  // ---------------------------------------------------------------- 同事管理
  async function addColleague(e: React.FormEvent) {
    e.preventDefault();
    setCBusy(true);
    setCMsg(null);
    const r = await intakeAddColleagueAction(intakeKey, { name: cName, phone: cPhone, line: cLine });
    setCBusy(false);
    if (!r.ok) {
      setCMsg(r.error);
      return;
    }
    setColleagues(r.rows);
    setCName("");
    setCPhone("");
    setCLine("");
    setCMsg(`已新增「${r.created.name}」。把下面他的連結傳給他：用手機打開 →「加入主畫面」→ 從主畫面開 →「預約」→「開啟手機通知」。`);
  }

  async function toggleColleague(c: IntakeColleagueRow) {
    if (c.active && !window.confirm(`停用「${c.name}」？他的連結立刻失效，他的客人點舊連結會改走官方帳號。`)) return;
    setCMsg(null);
    const r = await intakeSetColleagueAction(intakeKey, c.id, { active: !c.active });
    if (!r.ok) {
      setCMsg(r.error);
      return;
    }
    setColleagues(r.rows);
  }

  async function rotateColleague(c: IntakeColleagueRow) {
    if (!window.confirm(`重新產生「${c.name}」的連結？舊的立刻失效，他手機桌面那個要重新加。`)) return;
    setCMsg(null);
    const r = await intakeRotateColleagueKeyAction(intakeKey, c.id);
    if (!r.ok) {
      setCMsg(r.error);
      return;
    }
    setColleagues(r.rows);
    setCMsg(`「${c.name}」的連結換新了，記得把新的傳給他。`);
  }

  async function removeColleague(c: IntakeColleagueRow) {
    if (!window.confirm(`刪掉「${c.name}」？`)) return;
    setCMsg(null);
    const r = await intakeDeleteColleagueAction(intakeKey, c.id);
    if (!r.ok) {
      setCMsg(r.error);
      return;
    }
    setColleagues(r.rows);
    setCMsg(`已刪掉「${c.name}」。`);
  }

  const filtering = isFilterActive(filter);
  const filtered = (rows ?? []).filter((r) => {
    if (!matchesFilter(r, filter)) return false;
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return r.name.toLowerCase().includes(s) || r.lineName.toLowerCase().includes(s) || r.phone.includes(s.replace(/\D/g, "") || s) || (r.summary ?? "").includes(s);
  });
  // 三排標籤：預算固定幾段，區域／型態只放名單裡真的有人選的，各標幾位
  const districtChips = distinctCounts(rows ?? [], "districts");
  const typeChips = distinctCounts(rows ?? [], "types");
  const budgetChipCounts = budgetCounts(rows ?? []);
  const chipClass = (on: boolean) => `${styles.fchip} ${on ? styles.fchipOn : ""}`;

  const subText =
    view === "list"
      ? `客戶名單${rows ? `（${filtering || q.trim() ? `符合 ${filtered.length}／${rows.length}` : rows.length}）` : ""}`
      : view === "result"
        ? "存好了"
        : view === "viewings"
          ? `預約看屋${viewings ? `（${viewings.length}）` : ""}`
          : view === "colleagues"
            ? "同事名單：每人一條自己的連結，客人各管各的"
            : who.colleague
              ? `${who.name}的客戶 · 接到來電就記`
              : "接到來電就記，存好直接看配對";

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <div>
          <h1 className={styles.title}>代客建檔</h1>
          <p className={styles.sub}>{subText}</p>
        </div>
        <div className={styles.headBtns}>
          <button type="button" className={`${styles.headBtn} ${view === "form" && !editing ? styles.headBtnOn : ""}`} onClick={goNew}>
            ＋ 記一位
          </button>
          <button type="button" className={`${styles.headBtn} ${view === "list" ? styles.headBtnOn : ""}`} onClick={goList}>
            客戶名單
          </button>
          <button type="button" className={`${styles.headBtn} ${view === "viewings" ? styles.headBtnOn : ""}`} onClick={goViewings}>
            預約
          </button>
          {!who.colleague && (
            <button type="button" className={`${styles.headBtn} ${view === "colleagues" ? styles.headBtnOn : ""}`} onClick={goColleagues}>
              同事
            </button>
          )}
        </div>
      </div>

      {view === "form" && (
        <BuyerEditor
          key={editing && saved ? saved.buyer.id : "new"}
          meta={meta}
          styles={styles}
          buyer={editing && saved ? { id: saved.buyer.id, name: saved.buyer.name, phone: saved.buyer.phone, note: saved.buyer.note, lineVia: saved.buyer.lineVia, lineName: saved.buyer.lineName, preference: saved.buyer.preference } : null}
          onSave={(id, values) => intakeSaveAction(intakeKey, id, values)}
          afterSave={(r) => {
            if (r.ok) {
              setSaved(r);
              setEditing(false);
              setRows(null);
              setView("result");
              top();
            }
          }}
          onCancel={
            editing
              ? () => {
                  setEditing(false);
                  setView("result");
                }
              : undefined
          }
        />
      )}

      {view === "list" && (
        <div className={styles.wrap}>
          {rowsError && <p className={styles.msg}>{rowsError}</p>}
          {flash && <p className={styles.msg}>{flash}</p>}
          <input className={styles.search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜姓名、電話或條件" inputMode="search" />
          {rows && rows.length > 0 && (
            <div className={styles.filters}>
              <div className={styles.filterRow}>
                <span className={styles.filterLabel}>預算</span>
                <div className={styles.filterChips}>
                  {BUDGET_TIERS.map((t) => (
                    <button
                      key={String(t.value)}
                      type="button"
                      className={chipClass(filter.budget === t.value)}
                      aria-pressed={filter.budget === t.value}
                      onClick={() => setFilter((f) => ({ ...f, budget: f.budget === t.value ? "" : t.value }))}
                    >
                      {t.label}
                      <i className={styles.fchipN}>{budgetChipCounts.get(t.value) ?? 0}</i>
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.filterRow}>
                <span className={styles.filterLabel}>區域</span>
                <div className={styles.filterChips}>
                  {districtChips.length === 0 && <span className={styles.filterNone}>還沒有人選區域</span>}
                  {districtChips.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      className={chipClass(filter.districts.includes(c.value))}
                      aria-pressed={filter.districts.includes(c.value)}
                      onClick={() => setFilter((f) => ({ ...f, districts: toggleIn(f.districts, c.value) }))}
                    >
                      {c.value.replace(/區$/, "")}
                      <i className={styles.fchipN}>{c.count}</i>
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.filterRow}>
                <span className={styles.filterLabel}>型態</span>
                <div className={styles.filterChips}>
                  {typeChips.length === 0 && <span className={styles.filterNone}>還沒有人選型態</span>}
                  {typeChips.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      className={chipClass(filter.types.includes(c.value))}
                      aria-pressed={filter.types.includes(c.value)}
                      onClick={() => setFilter((f) => ({ ...f, types: toggleIn(f.types, c.value) }))}
                    >
                      {c.value}
                      <i className={styles.fchipN}>{c.count}</i>
                    </button>
                  ))}
                </div>
              </div>
              {filtering && (
                <p className={styles.filterInfo}>
                  符合 {filtered.length} 位（沒填那一項的客人視為不限，也會列出來）
                  <button type="button" className={styles.filterClear} onClick={() => setFilter(EMPTY_FILTER)}>
                    清除篩選
                  </button>
                </p>
              )}
            </div>
          )}
          {rows && rows.length > 0 && <p className={styles.swipeHint}>往左滑可以刪除</p>}
          {!rows && !rowsError ? (
            <p className={styles.muted}>讀取中…</p>
          ) : filtered.length === 0 ? (
            <p className={styles.muted}>{rows && rows.length ? "沒有符合的。" : "還沒有任何買方，按「＋ 記一位」開始。"}</p>
          ) : (
            <div className={styles.rows}>
              {filtered.map((r) => (
                <SwipeRow
                  key={r.id}
                  styles={styles}
                  open={openId === r.id}
                  onOpenChange={(o) => setOpenId((cur) => (o ? r.id : cur === r.id ? null : cur))}
                  onDelete={() => remove(r)}
                  deleting={deleting === r.id}
                >
                  <button type="button" className={styles.row} onClick={() => open(r.id)} disabled={opening === r.id}>
                    <div className={styles.rowTop}>
                      <span className={styles.rowName}>{r.name || "（未填姓名）"}</span>
                      <span className={styles.rowPhone}>{r.phone}</span>
                    </div>
                    <p className={styles.rowSummary}>{r.summary ?? "還沒填條件"}</p>
                    <div className={styles.rowMeta}>
                      {r.linked ? <span className={`${styles.tag} ${r.followed ? styles.tagOn : ""}`}>{r.followed ? "LINE 已綁" : "LINE 已封鎖"}</span> : <span className={styles.tag}>未綁 LINE</span>}
                      {lineText(r.lineVia, r.lineName) && <span className={styles.tag}>{lineText(r.lineVia, r.lineName)}</span>}
                      {r.note && <span>📝 {r.note.length > 24 ? `${r.note.slice(0, 24)}…` : r.note}</span>}
                      <span>{opening === r.id ? "開啟中…" : fmtDay(r.updatedAt)}</span>
                    </div>
                  </button>
                </SwipeRow>
              ))}
            </div>
          )}
        </div>
      )}

      {view === "result" && saved && (
        <div className={styles.wrap}>
          {saved.merged && <p className={styles.msg}>這支電話原本就有資料（可能是客戶自己在網站留過條件），已經合併更新到同一筆。</p>}

          <div className={styles.card}>
            <h2 className={styles.name}>{saved.buyer.name || "（未填姓名）"}</h2>
            <a className={styles.phone} href={`tel:${saved.buyer.phone}`}>
              {saved.buyer.phone}
            </a>
            {lineText(saved.buyer.lineVia, saved.buyer.lineName) && <p className={styles.lineInfo}>💬 {lineText(saved.buyer.lineVia, saved.buyer.lineName)}</p>}
            {saved.buyer.note && <p className={styles.note}>{saved.buyer.note}</p>}
            <p className={styles.sectionTitle} style={{ marginTop: 14 }}>
              購屋需求
            </p>
            <p className={styles.summary}>{saved.brief.summary ?? "還沒填條件"}</p>
            <div className={styles.actions}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={() => {
                  setEditing(true);
                  setView("form");
                  top();
                }}
              >
                改條件
              </button>
              <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={goList}>
                回名單
              </button>
              <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={goNew}>
                再記一位
              </button>
            </div>
          </div>

          <div className={styles.card}>
            <p className={styles.sectionTitle}>傳給客戶</p>
            <ShareToBuyer
              styles={styles}
              buyerName={saved.buyer.name || "客戶"}
              link={saved.brief.link}
              message={saved.brief.message}
              matched={saved.brief.matched}
              canPush={!who.colleague && saved.buyer.linked && saved.buyer.followed}
              onPush={() => intakePushAction(intakeKey, saved.buyer.id)}
            />
          </div>

          <div className={styles.card}>
            <p className={styles.sectionTitle}>配對結果</p>
            <MatchList styles={styles} matches={saved.brief.matches} matched={saved.brief.matched} total={saved.brief.total} hasPreference={Boolean(saved.buyer.preference)} />
          </div>
        </div>
      )}

      {view === "viewings" && (
        <div className={styles.wrap}>
          {viewingsError && <p className={styles.msg}>{viewingsError}</p>}
          {who.colleague && <PushSetup intakeKey={intakeKey} publicKey={who.pushPublicKey} styles={styles} />}
          {!viewings && !viewingsError ? (
            <p className={styles.muted}>讀取中…</p>
          ) : viewings && viewings.length === 0 ? (
            <p className={styles.muted}>還沒有預約。客人在專屬連結裡按「預約看屋」之後，會出現在這裡。</p>
          ) : (
            <div className={styles.rows}>
              {(viewings ?? []).map((v) => (
                <div key={v.id} className={styles.vrow}>
                  <div className={styles.rowTop}>
                    <span className={styles.rowName}>{v.name}</span>
                    <span className={`${styles.tag} ${statusTag(v.status)}`}>{v.statusLabel}</span>
                  </div>
                  <div className={styles.vlist}>
                    {v.listings.map((l) => (
                      <div key={l.id} className={styles.vitem}>
                        {l.sourceUrl ? (
                          <a className={styles.vtitle} href={l.sourceUrl} target="_blank" rel="noopener noreferrer">
                            {l.title} ↗
                          </a>
                        ) : (
                          <span className={styles.vtitle}>{l.title}</span>
                        )}
                        <span className={styles.vaddr}>
                          {l.address || "（地址不詳）"}
                          {l.price > 0 ? ` · ${l.price.toLocaleString("zh-TW")} 萬` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className={styles.rowMeta}>
                    <span>🕒 {v.preferredAt || "時間待安排"}</span>
                    <a className={styles.rowPhone} href={`tel:${v.phone}`}>
                      {v.phone}
                    </a>
                    <span>{v.code}</span>
                    <span>{fmtDay(v.createdAt)}</span>
                  </div>
                  {v.note && <p className={styles.rowSummary}>📝 {v.note}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {view === "colleagues" && !who.colleague && (
        <div className={styles.wrap}>
          {cMsg && <p className={styles.msg}>{cMsg}</p>}
          <form className={styles.card} onSubmit={addColleague} noValidate>
            <p className={styles.sectionTitle}>新增同事</p>
            <label className={styles.field}>
              稱呼
              <input className={styles.input} value={cName} onChange={(e) => setCName(e.target.value)} placeholder="例如：王小明" autoComplete="off" />
            </label>
            <label className={styles.field}>
              電話（客人看得到）
              <input className={styles.input} type="tel" inputMode="tel" value={cPhone} onChange={(e) => setCPhone(e.target.value)} placeholder="0912345678" autoComplete="off" />
            </label>
            <label className={styles.field}>
              LINE ID 或加好友連結（客人看得到）
              <input className={styles.input} value={cLine} onChange={(e) => setCLine(e.target.value)} placeholder="例如：abc123，或 https://line.me/ti/p/…" autoComplete="off" />
            </label>
            <p className={styles.hint}>客人在配對頁、預約完成頁看到的就是這三樣。LINE 連結從同事手機的 LINE「加入好友 → 邀請 → 分享連結」複製最保險。</p>
            <div className={styles.actions}>
              <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={cBusy}>
                {cBusy ? "新增中…" : "新增，產生他的連結"}
              </button>
            </div>
          </form>
          {!colleagues && !colleaguesError ? (
            <p className={styles.muted}>讀取中…</p>
          ) : colleagues && colleagues.length === 0 ? (
            <p className={styles.muted}>還沒有同事。</p>
          ) : (
            <div className={styles.rows}>
              {(colleagues ?? []).map((c) => (
                <div key={c.id} className={`${styles.vrow} ${c.active ? "" : styles.vrowOff}`}>
                  <div className={styles.rowTop}>
                    <span className={styles.rowName}>{c.name}</span>
                    <span className={`${styles.tag} ${c.active ? styles.tagOn : styles.tagOff}`}>{c.active ? "啟用中" : "已停用"}</span>
                  </div>
                  <div className={styles.rowMeta}>
                    <span>{c.phone || "沒填電話"}</span>
                    <span>{c.lineUrl ? "LINE ✔" : "沒填 LINE"}</span>
                    <span>{c.buyers} 位客人</span>
                    <span>{fmtDay(c.createdAt)} 加入</span>
                    <span>{c.pushDevices > 0 ? `🔔 手機通知已開（${c.pushDevices} 支）` : "🔕 還沒開手機通知"}</span>
                  </div>
                  <p className={styles.curl}>{c.url}</p>
                  <div className={styles.actions}>
                    <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => copyText(c.url, `${c.name}的連結`, setCMsg)}>
                      複製連結
                    </button>
                    <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => toggleColleague(c)}>
                      {c.active ? "停用" : "啟用"}
                    </button>
                    <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => rotateColleague(c)}>
                      重新產生連結
                    </button>
                    {c.buyers === 0 && (
                      <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => removeColleague(c)}>
                        刪除
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

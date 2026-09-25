"use client";
/**
 * 手機快速建檔的畫面：記一位 → 原地看到符合幾間 → 傳給客戶；也看得到已建立的客戶名單。
 *
 * 三個畫面切換、不換頁、不登入：金鑰跟著每一次 server action 一起送，伺服器那邊驗。
 *   form    填一位（新建，或從名單／結果按「改條件」進來編輯）
 *   list    客戶名單（2026-09-26 他要的）：搜姓名或電話，點一位就開結果
 *   result  這位的資料、符合幾間、傳給客戶
 * 表單（BuyerEditor）、傳給客戶（ShareToBuyer）、物件清單（MatchList）都跟後台共用，只換淺色樣式。
 */
import { useState } from "react";
import BuyerEditor from "@/app/admin/match/buyers/BuyerEditor";
import MatchList from "@/app/match/MatchList";
import matchStyles from "@/app/match/match.module.css";
import type { MatchMeta } from "@/app/match/preference-state";
import ShareToBuyer from "@/app/match/ShareToBuyer";
import { intakeListAction, intakeOpenAction, intakePushAction, intakeSaveAction, type IntakeSaveResult } from "@/lib/actions/intake";
import type { IntakeRow } from "@/lib/match/intake";
import intakeStyles from "./intake.module.css";

/** 表單類的 class 用 /match 的淺色版，其餘（按鈕列、結果區、名單）用這一頁自己的；同名以這一頁為準 */
const styles = { ...matchStyles, ...intakeStyles };

type Saved = Extract<IntakeSaveResult, { ok: true }>;
type View = "form" | "list" | "result";

const fmtDay = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric" }) : "";

export default function IntakeApp({ intakeKey, meta }: { intakeKey: string; meta: MatchMeta }) {
  const [view, setView] = useState<View>("form");
  const [saved, setSaved] = useState<Saved | null>(null);
  const [editing, setEditing] = useState(false);
  // 名單只在要看的時候才撈；存過一筆就清掉，下次再撈才是新的
  const [rows, setRows] = useState<IntakeRow[] | null>(null);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [opening, setOpening] = useState<string | null>(null);

  const top = () => window.scrollTo({ top: 0 });

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
    setView("form");
    top();
  }

  async function open(id: string) {
    setOpening(id);
    setRowsError(null);
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

  const filtered = (rows ?? []).filter((r) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return r.name.toLowerCase().includes(s) || r.phone.includes(s.replace(/\D/g, "") || s) || (r.summary ?? "").includes(s);
  });

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <div>
          <h1 className={styles.title}>代客建檔</h1>
          <p className={styles.sub}>{view === "list" ? `客戶名單${rows ? `（${rows.length}）` : ""}` : view === "result" ? "存好了" : "接到來電就記，存好直接看配對"}</p>
        </div>
        <div className={styles.headBtns}>
          <button type="button" className={`${styles.headBtn} ${view === "form" && !editing ? styles.headBtnOn : ""}`} onClick={goNew}>
            ＋ 記一位
          </button>
          <button type="button" className={`${styles.headBtn} ${view === "list" ? styles.headBtnOn : ""}`} onClick={goList}>
            客戶名單
          </button>
        </div>
      </div>

      {view === "form" && (
        <BuyerEditor
          key={editing && saved ? saved.buyer.id : "new"}
          meta={meta}
          styles={styles}
          buyer={editing && saved ? { id: saved.buyer.id, name: saved.buyer.name, phone: saved.buyer.phone, note: saved.buyer.note, preference: saved.buyer.preference } : null}
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
          <input className={styles.search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜姓名、電話或條件" inputMode="search" />
          {!rows && !rowsError ? (
            <p className={styles.muted}>讀取中…</p>
          ) : filtered.length === 0 ? (
            <p className={styles.muted}>{rows && rows.length ? "沒有符合的。" : "還沒有任何買方，按「＋ 記一位」開始。"}</p>
          ) : (
            <div className={styles.rows}>
              {filtered.map((r) => (
                <button key={r.id} type="button" className={styles.row} onClick={() => open(r.id)} disabled={opening === r.id}>
                  <div className={styles.rowTop}>
                    <span className={styles.rowName}>{r.name || "（未填姓名）"}</span>
                    <span className={styles.rowPhone}>{r.phone}</span>
                  </div>
                  <p className={styles.rowSummary}>{r.summary ?? "還沒填條件"}</p>
                  <div className={styles.rowMeta}>
                    {r.linked ? <span className={`${styles.tag} ${r.followed ? styles.tagOn : ""}`}>{r.followed ? "LINE 已綁" : "LINE 已封鎖"}</span> : <span className={styles.tag}>未綁 LINE</span>}
                    {r.note && <span>📝 {r.note.length > 24 ? `${r.note.slice(0, 24)}…` : r.note}</span>}
                    <span>{opening === r.id ? "開啟中…" : fmtDay(r.updatedAt)}</span>
                  </div>
                </button>
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
              canPush={saved.buyer.linked && saved.buyer.followed}
              onPush={() => intakePushAction(intakeKey, saved.buyer.id)}
            />
          </div>

          <div className={styles.card}>
            <p className={styles.sectionTitle}>配對結果</p>
            <MatchList styles={styles} matches={saved.brief.matches} matched={saved.brief.matched} total={saved.brief.total} hasPreference={Boolean(saved.buyer.preference)} />
          </div>
        </div>
      )}
    </div>
  );
}

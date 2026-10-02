"use client";

/**
 * 社區銷售報告書後台的互動面。三步驟排成一條直線，訊息就印在按鈕旁邊那一列（不要只印在頁首）。
 *
 * ① 選社區：打關鍵字（案名／建商／區）挑一個，選完收成一行。
 * ② 複製指令：選好當下就跟伺服器拿這個建案的指令（在伺服器組，不用把 786 案的資料送進瀏覽器），
 *    按一下複製；複製失敗（瀏覽器擋剪貼簿）就把全文攤開讓他手動選。
 * ③ 貼回結果：貼 ChatGPT 的回覆 → 「解析並預覽」在瀏覽器裡先解一次（lib/project-report.ts 純函式），
 *    預覽就是前台那一頁的版面（ReportBody 共用）→ 存草稿或發佈（伺服器會再解析一次）。
 *    已經有報告書的社區，選到時貼回框會帶出目前那版的 JSON，可以直接改字再存。
 *
 * 樣式沿用精選好案那一份 CSS（listings-admin.module.css），跟其他後台頁一致。
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CHIP, CIS, type ChipTone } from "@/app/admin/_components/cis";
import { Icon } from "@/app/admin/_ui/icons";
import { PROJECTS } from "@/data/port-projects";
import { parseReportPaste, REPORT_LABEL, reportHref, stampLabel, type ParsedReport } from "@/lib/project-report";
import type { ReportRecord } from "@/lib/project-reports";
import type { PublicMapListing } from "@/lib/map-listings";
import { deleteReportAction, getReportPromptAction, saveReportAction, setReportStatusAction } from "@/lib/actions/project-reports";
import ReportBody from "@/app/map/report/[projectId]/ReportBody";
import styles from "@/app/admin/listings/listings-admin.module.css";

export type ReportProjectOption = {
  id: string;
  name: string;
  builder: string;
  areaLabel: string;
  /** 我在這個建案目前有幾件在售 */
  mineCount: number;
};

type Props = {
  reports: ReportRecord[];
  options: ReportProjectOption[];
  listingsByProject: Record<string, PublicMapListing[]>;
  /** 網址帶 ?project=<id> 進來（例如從別頁連過來）就直接選好 */
  focus: string | null;
  siteUrl: string;
};

type Msg = { tone: ChipTone; text: string };

/** 他的 ChatGPT。開新分頁，不要把後台頁面蓋掉（貼回來還要用）。 */
const CHATGPT_URL = "https://chatgpt.com/";

function chipStyle(tone: ChipTone): React.CSSProperties {
  const c = CHIP[tone];
  return { background: c.bg, color: c.color, borderColor: c.border };
}

/** Date → 「10/02 14:35」 */
function shortStamp(d: Date | null): string {
  if (!d) return "";
  const tw = new Date(d.getTime() + 8 * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(tw.getUTCMonth() + 1)}/${p(tw.getUTCDate())} ${p(tw.getUTCHours())}:${p(tw.getUTCMinutes())}`;
}

export default function ReportsManager({ reports, options, listingsByProject, focus, siteUrl }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string>(() => (focus && options.some((o) => o.id === focus) ? focus : ""));
  const [projQuery, setProjQuery] = useState("");
  const [prompt, setPrompt] = useState<string | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [preview, setPreview] = useState<ParsedReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [listMsg, setListMsg] = useState<Record<string, Msg>>({});

  const byId = useMemo(() => new Map(reports.map((r) => [r.projectId, r])), [reports]);
  const selected = useMemo(() => options.find((o) => o.id === selectedId) ?? null, [options, selectedId]);
  const selectedProject = useMemo(() => PROJECTS.find((p) => p.id === selectedId) ?? null, [selectedId]);
  const existing = selectedId ? (byId.get(selectedId) ?? null) : null;

  const matches = useMemo(() => {
    const q = projQuery.trim();
    const pool = q ? options.filter((o) => `${o.name}${o.builder}${o.areaLabel}`.includes(q)) : options;
    return pool.slice(0, 20);
  }, [options, projQuery]);

  const published = reports.filter((r) => r.status === "published").length;

  // 換了建案：重新拿指令、把既有那版的 JSON 放進貼回框（可以直接改字再存）、清掉上一個的預覽與訊息。
  // 刻意只看 selectedId —— 同一個建案存檔後 reports 會變，但不該把他正在編輯的框蓋掉。
  useEffect(() => {
    if (!selectedId) return;
    let alive = true;
    setPrompt(null);
    setPromptError(null);
    setShowPrompt(false);
    setPreview(null);
    setMsg(null);
    const current = byId.get(selectedId);
    setPasteText(current ? JSON.stringify(current.data, null, 2) : "");
    void getReportPromptAction(selectedId).then((r) => {
      if (!alive) return;
      if (r.ok) setPrompt(r.prompt);
      else setPromptError(r.error);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  function pick(id: string) {
    setSelectedId(id);
    setProjQuery("");
  }

  async function copyPrompt() {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setMsg({ tone: "success", text: "指令已複製。到 ChatGPT 貼上送出，等它回一段 JSON 後整段複製，回來貼進下面「③ 貼回結果」的框。" });
    } catch {
      setShowPrompt(true);
      setMsg({ tone: "danger", text: "複製失敗（瀏覽器擋了剪貼簿）。指令全文已攤開在下面，請手動全選複製。" });
    }
  }

  function runPreview() {
    const r = parseReportPaste(pasteText);
    setPreview(r);
    if (!r.ok) {
      setMsg({ tone: "danger", text: r.error });
      return;
    }
    const n = r.warnings.length + r.risks.length;
    setMsg(
      n > 0
        ? { tone: "warn", text: `已解析，有 ${n} 項提醒（下面黃框）。往下看預覽，確認沒問題再存。` }
        : { tone: "success", text: "已解析、沒有提醒。往下看預覽，確認沒問題再存。" },
    );
  }

  async function save(publish: boolean) {
    if (!selectedId) return;
    setBusy(true);
    const r = await saveReportAction(selectedId, pasteText, publish);
    setBusy(false);
    if (!r.ok) {
      setMsg({ tone: "danger", text: r.error ?? "存檔失敗" });
      return;
    }
    setPreview(parseReportPaste(pasteText));
    setMsg(
      publish
        ? { tone: "success", text: `已發佈。前台網址 ${siteUrl}${r.href ?? reportHref(selectedId)}；/map 點這個建案也會出現入口。` }
        : { tone: "success", text: "已存成草稿。前台看不到、/map 也沒有入口，確認好再按「發佈到前台」。" },
    );
    startTransition(() => router.refresh());
  }

  async function toggleStatus(r: ReportRecord) {
    const next = r.status === "published" ? "draft" : "published";
    const res = await setReportStatusAction(r.projectId, next);
    setListMsg((m) => ({
      ...m,
      [r.projectId]: res.ok
        ? { tone: "success", text: next === "published" ? "已發佈，前台與 /map 入口都開了。" : "已下架，前台看不到了（資料還在，隨時可以再發佈）。" }
        : { tone: "danger", text: res.error ?? "失敗" },
    }));
    if (res.ok) startTransition(() => router.refresh());
  }

  async function remove(r: ReportRecord) {
    const name = options.find((o) => o.id === r.projectId)?.name ?? r.projectId;
    if (!window.confirm(`刪掉「${name}」的${REPORT_LABEL}？前台頁會變成 404，要再做得重新貼一次。`)) return;
    const res = await deleteReportAction(r.projectId);
    if (!res.ok) {
      setListMsg((m) => ({ ...m, [r.projectId]: { tone: "danger", text: res.error ?? "刪除失敗" } }));
      return;
    }
    if (r.projectId === selectedId) {
      setPasteText("");
      setPreview(null);
      setMsg({ tone: "neutral", text: "這份已刪除。" });
    }
    startTransition(() => router.refresh());
  }

  async function copyUrl(id: string) {
    const url = `${siteUrl}${reportHref(id)}`;
    try {
      await navigator.clipboard.writeText(url);
      setListMsg((m) => ({ ...m, [id]: { tone: "success", text: `已複製：${url}` } }));
    } catch {
      setListMsg((m) => ({ ...m, [id]: { tone: "danger", text: `複製失敗，網址是 ${url}` } }));
    }
  }

  const card: React.CSSProperties = {
    marginTop: 14,
    padding: "14px 16px",
    border: `1px solid ${CIS.cardBorder}`,
    borderRadius: CIS.radius,
    background: CIS.card,
  };
  const h3: React.CSSProperties = { margin: "0 0 8px", fontSize: 15.5, fontWeight: 800, color: CIS.text };
  const help: React.CSSProperties = { margin: "0 0 10px", fontSize: 13.5, lineHeight: 1.7, color: CIS.textMute };
  const btnBase: React.CSSProperties = { borderColor: CIS.cardBorder, color: CIS.textSub };
  const btnPrimary: React.CSSProperties = { borderColor: CIS.blue, color: CIS.blue };
  const btnQuiet: React.CSSProperties = { borderColor: CIS.divider, color: CIS.textMute, fontSize: 13 };
  const btnDanger: React.CSSProperties = { borderColor: CHIP.danger.border, color: CHIP.danger.color };
  const fieldStyle: React.CSSProperties = { background: CIS.bgSoft, borderColor: CIS.cardBorder, color: CIS.text };
  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
    padding: "10px 12px",
    border: `1px solid ${CIS.cardBorder}`,
    borderRadius: CIS.radiusSm,
    background: CIS.bgSoft,
  };

  return (
    <>
      <div className={styles.summaryRow}>
        {[
          { label: `份${REPORT_LABEL}`, value: reports.length },
          { label: "已發佈（前台看得到）", value: published },
          { label: "草稿", value: reports.length - published },
        ].map((x) => (
          <div key={x.label} className={styles.summary} style={{ borderColor: CIS.cardBorder, background: CIS.card }}>
            <div className={styles.summaryLabel} style={{ color: CIS.textMute }}>
              {x.label}
            </div>
            <div className={styles.summaryValue} style={{ color: CIS.text }}>
              {x.value}
            </div>
          </div>
        ))}
      </div>

      {/* ① 選社區 */}
      <section style={card}>
        <h3 style={h3}>① 選社區</h3>
        {selected ? (
          <div style={rowStyle}>
            <span style={{ fontSize: 15 }}>
              <b>{selected.name}</b>
              <span style={{ color: CIS.textMute }}>{`　${selected.builder}・${selected.areaLabel}・我在售 ${selected.mineCount} 件`}</span>
              {existing && (
                <span className={styles.chip} style={{ ...chipStyle(existing.status === "published" ? "success" : "warn"), marginLeft: 10 }}>
                  {existing.status === "published" ? "已發佈" : "草稿"}
                </span>
              )}
            </span>
            <button type="button" className={styles.btn} style={btnBase} onClick={() => pick("")}>
              換一個
            </button>
          </div>
        ) : (
          <>
            <p style={help}>{`打關鍵字找建案（共 ${options.length} 個，案名、建商、區都能搜），按 Enter 選第一筆。已有報告書的排前面。`}</p>
            <input
              className={styles.input}
              style={{ ...fieldStyle, width: "100%" }}
              type="text"
              placeholder="例如：遠雄、好好窩、沙鹿車站"
              value={projQuery}
              onChange={(e) => setProjQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                if (matches[0]) pick(matches[0].id);
              }}
            />
            {matches.length === 0 ? (
              <p style={{ ...help, marginTop: 8 }}>沒有符合的建案。少打幾個字試試。</p>
            ) : (
              <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "grid", gap: 6 }}>
                {matches.map((o) => {
                  const r = byId.get(o.id);
                  return (
                    <li key={o.id} style={rowStyle}>
                      <span>
                        <b>{o.name}</b>
                        <span style={{ color: CIS.textMute, fontSize: 13 }}>{`　${o.builder}・${o.areaLabel}${o.mineCount ? `・在售 ${o.mineCount}` : ""}`}</span>
                        {r && (
                          <span className={styles.chip} style={{ ...chipStyle(r.status === "published" ? "success" : "warn"), marginLeft: 8 }}>
                            {r.status === "published" ? "已發佈" : "草稿"}
                          </span>
                        )}
                      </span>
                      <button type="button" className={styles.btn} style={btnPrimary} onClick={() => pick(o.id)}>
                        選這個
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </section>

      {selected && selectedProject && (
        <section style={card}>
          <h3 style={h3}>② 複製指令 → 貼進 ChatGPT</h3>
          <p style={help}>
            指令裡已經帶了這個建案在總表上的資料、要查的十項、不能寫的字，以及要回的 JSON 格式。ChatGPT 回完後把整段（含 ``` 那幾行）複製回來就好。
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.btn} style={btnPrimary} disabled={!prompt} onClick={copyPrompt}>
              <Icon name="copy" size={14} />
              {prompt ? "複製指令" : promptError ? "指令讀不到" : "指令準備中…"}
            </button>
            <a className={styles.btn} style={btnBase} href={CHATGPT_URL} target="_blank" rel="noopener noreferrer">
              開 ChatGPT ↗
            </a>
            <button type="button" className={styles.btn} style={btnQuiet} disabled={!prompt} onClick={() => setShowPrompt((v) => !v)}>
              {showPrompt ? "收起指令全文" : "看指令全文"}
            </button>
          </div>
          {promptError && (
            <p className={styles.msg} style={{ color: CHIP.danger.color }}>
              {promptError}
            </p>
          )}
          {showPrompt && prompt && (
            <textarea readOnly className={styles.textarea} style={{ ...fieldStyle, width: "100%", minHeight: 260, marginTop: 8 }} value={prompt} />
          )}

          <h3 style={{ ...h3, marginTop: 18 }}>③ 貼回結果</h3>
          <p style={help}>
            {existing
              ? "下面是目前這版的資料，可以直接改字再存；要整份重做就清空、貼新的回覆。"
              : "把 ChatGPT 的回覆整段貼在這裡，按「解析並預覽」。"}
          </p>
          <textarea
            className={styles.textarea}
            style={{ ...fieldStyle, width: "100%", minHeight: 220 }}
            placeholder="在這裡貼上 ChatGPT 的回答（一段 JSON）…"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
          <div className={styles.actions}>
            <button type="button" className={styles.btn} style={btnBase} disabled={busy || pasteText.trim().length < 20} onClick={runPreview}>
              <Icon name="success" size={14} />
              解析並預覽
            </button>
            <button type="button" className={styles.btn} style={btnBase} disabled={busy || pasteText.trim().length < 20} onClick={() => save(false)}>
              存成草稿
            </button>
            <button type="button" className={styles.btn} style={btnPrimary} disabled={busy || pasteText.trim().length < 20} onClick={() => save(true)}>
              <Icon name="success" size={14} />
              發佈到前台
            </button>
            {existing && (
              <>
                {existing.status === "published" && (
                  <a className={styles.btn} style={btnBase} href={reportHref(existing.projectId)} target="_blank" rel="noopener noreferrer">
                    開前台頁 ↗
                  </a>
                )}
                <button type="button" className={styles.btn} style={btnQuiet} onClick={() => copyUrl(existing.projectId)}>
                  <Icon name="link" size={14} />
                  複製網址
                </button>
                <button type="button" className={styles.btn} style={btnQuiet} disabled={busy} onClick={() => toggleStatus(existing)}>
                  {existing.status === "published" ? "下架" : "發佈這版"}
                </button>
                <button type="button" className={styles.btn} style={btnDanger} disabled={busy} onClick={() => remove(existing)}>
                  刪除
                </button>
              </>
            )}
          </div>
          {msg && (
            <p className={styles.msg} style={{ color: CHIP[msg.tone].color }}>
              {msg.text}
            </p>
          )}
          {existing && listMsg[existing.projectId] && (
            <p className={styles.msg} style={{ color: CHIP[listMsg[existing.projectId].tone].color }}>
              {listMsg[existing.projectId].text}
            </p>
          )}

          {preview?.ok && (preview.warnings.length > 0 || preview.risks.length > 0) && (
            <div className={styles.riskBox}>
              {preview.warnings.length > 0 && (
                <>
                  <b>提醒（不擋存檔，但前台會照這樣顯示）</b>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                    {preview.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </>
              )}
              {preview.risks.length > 0 && (
                <>
                  <b style={{ display: "block", marginTop: preview.warnings.length ? 10 : 0 }}>⚠️ 公平交易法要小心的字</b>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                    {preview.risks.map((r) => (
                      <li key={r.word}>
                        <b>{r.word}</b>：{r.why}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          {preview?.ok && (
            <>
              <p style={{ ...help, marginTop: 14 }}>👇 預覽（跟前台一模一樣，可以捲動）</p>
              <div style={{ background: "#fff", borderRadius: 12, overflow: "auto", maxHeight: "72vh", border: `1px solid ${CIS.cardBorder}` }}>
                <ReportBody
                  project={selectedProject}
                  data={preview.data}
                  listings={listingsByProject[selectedId] ?? []}
                  stamp={stampLabel(existing?.publishedAt ?? new Date())}
                  preview
                />
              </div>
            </>
          )}
        </section>
      )}

      {/* 已有的報告書 */}
      <section style={card}>
        <h3 style={h3}>{`已建立的${REPORT_LABEL}（${reports.length}）`}</h3>
        {reports.length === 0 ? (
          <p style={help}>還沒有。從上面「① 選社區」開始。</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
            {reports.map((r) => {
              const o = options.find((x) => x.id === r.projectId);
              const m = listMsg[r.projectId];
              return (
                <li key={r.projectId} style={{ ...rowStyle, alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <b style={{ fontSize: 15 }}>{o?.name ?? r.projectId}</b>
                    <span className={styles.chip} style={{ ...chipStyle(r.status === "published" ? "success" : "warn"), marginLeft: 8 }}>
                      {r.status === "published" ? "已發佈" : "草稿"}
                    </span>
                    <div style={{ color: CIS.textMute, fontSize: 12.5, marginTop: 2 }}>
                      {o ? `${o.builder}・${o.areaLabel}` : "（建案總表裡找不到這個 id）"}
                      {`　更新 ${shortStamp(r.updatedAt)}`}
                      {r.publishedAt ? `　發佈 ${shortStamp(r.publishedAt)}` : ""}
                      {r.data.tagline ? `　「${r.data.tagline}」` : ""}
                    </div>
                    {m && (
                      <div className={styles.msg} style={{ color: CHIP[m.tone].color, marginTop: 4 }}>
                        {m.text}
                      </div>
                    )}
                  </div>
                  <div className={styles.actions} style={{ margin: 0 }}>
                    <button type="button" className={styles.btn} style={btnPrimary} onClick={() => { pick(r.projectId); window.scrollTo({ top: 0 }); }}>
                      編輯
                    </button>
                    {r.status === "published" && (
                      <a className={styles.btn} style={btnBase} href={reportHref(r.projectId)} target="_blank" rel="noopener noreferrer">
                        前台 ↗
                      </a>
                    )}
                    <button type="button" className={styles.btn} style={btnQuiet} onClick={() => copyUrl(r.projectId)}>
                      複製網址
                    </button>
                    <button type="button" className={styles.btn} style={btnQuiet} onClick={() => toggleStatus(r)}>
                      {r.status === "published" ? "下架" : "發佈"}
                    </button>
                    <button type="button" className={styles.btn} style={btnDanger} onClick={() => remove(r)}>
                      刪除
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

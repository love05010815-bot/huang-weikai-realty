"use client";

/**
 * 房產新聞後台的清單：篩選、「拿去做」、立即抓取。
 *
 * 樣式沿用精選好案那一份（`listings-admin.module.css`）—— 後台每一頁長得一樣才像同一套系統。
 * ⚠️ 改那份 CSS 會同時影響精選好案、影音與這一頁。
 *
 * 每一則只有一顆「拿去做」：按下去選「改寫成知識文章」或「翻拍成短影音」，
 * 選完就排進「待產文案」（/admin/content）並直接跳過去。
 * 9/15 他說原本那排「要改寫／已完成／隱藏／看全文／複製」都不需要，已拿掉；
 * 全文與複製移到待產文案那一頁 —— 那裡才是他動手改寫的地方。
 *
 * 清單本身由 server 端排好（海線 → 中部 → 全台，各區新到舊），這裡只做篩選與分組顯示。
 */

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { CHIP, CIS, type ChipTone } from "@/app/admin/_components/cis";
import { Icon, type IconName } from "@/app/admin/_ui/icons";
import { NEWS_REGION_LABEL, NEWS_REGION_ORDER, type NewsRegion } from "@/config/news";
import { addNewsTaskAction, runNewsFetchAction } from "@/lib/actions/news";
import { NEWS_LINES, NEWS_LINE_LABEL, type NewsLine, type NewsRecord, type NewsRunRecord } from "@/lib/news";
import styles from "@/app/admin/listings/listings-admin.module.css";

type Props = {
  items: NewsRecord[];
  counts: Record<NewsRegion, number>;
  latestRun: NewsRunRecord | null;
};

/** 「還沒排的」是預設 —— 排進待產文案的就從這裡消失，去那一頁看。 */
type StatusFilter = "new" | "picked" | "done" | "all";
const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  new: "還沒排的",
  picked: "已排入待產",
  done: "已完成",
  all: "全部",
};

const REGION_TONE: Record<NewsRegion, ChipTone> = { coast: "warn", central: "info", national: "neutral" };
const LINE_TONE: Record<NewsLine, ChipTone> = { article: "info", video: "warn" };
const LINE_ICON: Record<NewsLine, IconName> = { article: "edit", video: "video" };
const LINE_ACTION: Record<NewsLine, string> = { article: "改寫成知識文章", video: "翻拍成短影音" };

/** epoch 毫秒 → 台北時間 `MM/DD HH:MM` */
function taipeiShort(ms: number): string {
  const s = new Date(ms + 8 * 60 * 60 * 1000).toISOString();
  return `${s.slice(5, 7)}/${s.slice(8, 10)} ${s.slice(11, 16)}`;
}

/** `YYYY-MM-DD HH:MM:SS` → `MM/DD HH:MM` */
function shortStamp(stamp: string | null): string {
  if (!stamp) return "";
  return `${stamp.slice(5, 7)}/${stamp.slice(8, 10)} ${stamp.slice(11, 16)}`;
}

function excerpt(item: NewsRecord, limit = 140): string {
  const text = (item.content || item.summary || "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}…`;
}

function chipStyle(tone: ChipTone): React.CSSProperties {
  const c = CHIP[tone];
  return { background: c.bg, color: c.color, borderColor: c.border };
}

export default function NewsManager({ items, counts, latestRun }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [region, setRegion] = useState<"all" | NewsRegion>("all");
  const [status, setStatus] = useState<StatusFilter>("new");
  const [query, setQuery] = useState("");
  /** 哪一則的「要做成什麼？」選項打開著 */
  const [chooser, setChooser] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [msg, setMsg] = useState<{ tone: ChipTone; text: string } | null>(null);

  const visible = useMemo(() => {
    const q = query.trim();
    return items.filter((it) => {
      if (region !== "all" && it.region !== region) return false;
      if (status === "all" ? it.status === "hidden" : it.status !== status) return false;
      if (q && !`${it.title} ${it.source} ${it.summary}`.includes(q)) return false;
      return true;
    });
  }, [items, region, status, query]);

  const grouped = useMemo(() => {
    const map: Record<NewsRegion, NewsRecord[]> = { coast: [], central: [], national: [] };
    for (const it of visible) map[it.region].push(it);
    return map;
  }, [visible]);

  async function pick(it: NewsRecord, line: NewsLine) {
    setBusyId(it.id);
    const r = await addNewsTaskAction(it.id, line);
    setBusyId(null);
    if (!r.ok || !r.taskId) {
      setMsg({ tone: "danger", text: r.error || "排入失敗" });
      return;
    }
    setChooser(null);
    setMsg({ tone: "success", text: `已排進待產文案（${NEWS_LINE_LABEL[line]}），帶你過去…` });
    router.push(`/admin/content?focus=${encodeURIComponent(r.taskId)}`);
  }

  async function fetchNow() {
    setFetching(true);
    setMsg({ tone: "info", text: "抓取中… 通常 20 到 50 秒，別關掉這一頁。" });
    const r = await runNewsFetchAction();
    setFetching(false);
    if (!r.ok) {
      setMsg({ tone: "danger", text: r.error || "抓取失敗" });
      return;
    }
    setMsg({ tone: "success", text: `完成：${r.summary}` });
    startTransition(() => router.refresh());
  }

  const runText = latestRun
    ? `${taipeiShort(latestRun.startedMs)} ${latestRun.trigger === "manual" ? "手動" : "自動"}・` +
      (latestRun.status === "success"
        ? `抓到 ${latestRun.found} 則、新增 ${latestRun.inserted} 則`
        : latestRun.status === "error"
          ? "失敗"
          : "進行中")
    : "還沒抓過";

  const btnBase: React.CSSProperties = { borderColor: CIS.cardBorder, color: CIS.textSub };
  const btnPrimary: React.CSSProperties = { borderColor: CIS.blue, color: CIS.blue };
  const fieldStyle: React.CSSProperties = { background: CIS.bgSoft, borderColor: CIS.cardBorder, color: CIS.text };

  return (
    <>
      {/* 上方三個數字＋上次抓取 */}
      <div className={styles.summaryRow}>
        {NEWS_REGION_ORDER.map((r) => (
          <div key={r} className={styles.summary} style={{ borderColor: CIS.cardBorder, background: CIS.card }}>
            <div className={styles.summaryLabel} style={{ color: CIS.textMute }}>
              {NEWS_REGION_LABEL[r]}
            </div>
            <div className={styles.summaryValue}>{counts[r]}</div>
          </div>
        ))}
        <div className={styles.summary} style={{ borderColor: CIS.cardBorder, background: CIS.card }}>
          <div className={styles.summaryLabel} style={{ color: CIS.textMute }}>
            上次抓取
          </div>
          <div className={styles.summaryValue} style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.6 }}>
            {runText}
          </div>
        </div>
      </div>

      {/* 篩選列 */}
      <div className={styles.actions}>
        <select className={styles.select} style={{ ...fieldStyle, width: "auto", minHeight: 38 }} value={region} onChange={(e) => setRegion(e.target.value as "all" | NewsRegion)}>
          <option value="all">全部地區</option>
          {NEWS_REGION_ORDER.map((r) => (
            <option key={r} value={r}>
              {NEWS_REGION_LABEL[r]}
            </option>
          ))}
        </select>
        <select className={styles.select} style={{ ...fieldStyle, width: "auto", minHeight: 38 }} value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
          {(Object.keys(STATUS_FILTER_LABEL) as StatusFilter[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_FILTER_LABEL[s]}
            </option>
          ))}
        </select>
        <input
          className={styles.input}
          style={{ ...fieldStyle, width: 220, minHeight: 38 }}
          placeholder="搜標題、來源"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className={styles.spacer} />
        <button type="button" className={styles.btn} style={btnPrimary} onClick={fetchNow} disabled={fetching || pending}>
          <Icon name="refresh" size={15} />
          {fetching ? "抓取中…" : "立即抓取"}
        </button>
      </div>

      {msg && (
        <p className={styles.msg} style={{ color: CHIP[msg.tone].color }}>
          {msg.text}
        </p>
      )}

      {latestRun?.log && (
        <details style={{ marginTop: 10, color: CIS.textMute, fontSize: 13.5 }}>
          <summary style={{ cursor: "pointer" }}>上次抓取的過程（各來源抓到幾則、濾掉幾則、全文抓到幾則）</summary>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              font: "inherit",
              lineHeight: 1.7,
              margin: "8px 0 0",
              padding: "10px 12px",
              border: `1px solid ${CIS.divider}`,
              borderRadius: 8,
              background: CIS.bgSoft,
              maxHeight: 260,
              overflow: "auto",
            }}
          >
            {latestRun.log}
          </pre>
        </details>
      )}

      {visible.length === 0 && (
        <div className={styles.notice} style={{ borderColor: CIS.cardBorder, color: CIS.textMute }}>
          {items.length === 0
            ? "還沒有任何新聞。按右上角「立即抓取」抓第一批，或等明天早上自動抓。"
            : status === "new"
              ? "沒有還沒排的新聞了。排進去的在左側「待產文案」；要看全部把篩選改成「全部」。"
              : "這個篩選條件底下沒有新聞。"}
        </div>
      )}

      {NEWS_REGION_ORDER.map((r) => {
        const rows = grouped[r];
        if (rows.length === 0) return null;
        return (
          <section key={r} style={{ marginTop: 22 }}>
            <h2 style={{ margin: "0 0 10px", fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
              <span className={styles.chip} style={chipStyle(REGION_TONE[r])}>
                {NEWS_REGION_LABEL[r]}
              </span>
              <span style={{ color: CIS.textMute, fontSize: 14, fontWeight: 500 }}>{rows.length} 則</span>
            </h2>
            <div className={styles.list}>
              {rows.map((it) => {
                const busy = busyId === it.id;
                const choosing = chooser === it.id;
                return (
                  <article key={it.id} className={styles.row} style={{ borderColor: CIS.cardBorder, background: CIS.card }}>
                    <div className={styles.rowBody}>
                      <div className={styles.rowHead}>
                        <h3 className={styles.rowTitle}>
                          <a href={it.url} target="_blank" rel="noopener noreferrer" style={{ color: CIS.text, textDecoration: "none" }}>
                            {it.title}
                          </a>
                        </h3>
                        {it.tasks.map((t) => (
                          <span key={t.line} className={styles.chip} style={chipStyle(t.status === "done" ? "success" : LINE_TONE[t.line])}>
                            {NEWS_LINE_LABEL[t.line]}
                            {t.status === "done" ? " 已完成" : " 待做"}
                          </span>
                        ))}
                      </div>
                      <div className={styles.rowMeta} style={{ color: CIS.textMute }}>
                        {[it.source, shortStamp(it.publishedAt) || `抓於 ${shortStamp(it.fetchedAt)}`].filter(Boolean).join(" · ")}
                        {!it.content && <span style={{ marginLeft: 8 }}>（只有標題，點標題看原文）</span>}
                      </div>
                      {excerpt(it) && (
                        <p className={styles.msg} style={{ color: CIS.textSub, marginTop: 8 }}>
                          {excerpt(it)}
                        </p>
                      )}
                      <div className={styles.actions}>
                        {choosing ? (
                          <>
                            <span style={{ alignSelf: "center", color: CIS.textMute, fontSize: 13.5 }}>要做成什麼？</span>
                            {NEWS_LINES.map((line) => {
                              const queued = it.tasks.find((t) => t.line === line && t.status === "todo");
                              return (
                                <button
                                  key={line}
                                  type="button"
                                  className={styles.btn}
                                  style={queued ? btnBase : btnPrimary}
                                  disabled={busy || !!queued}
                                  onClick={() => pick(it, line)}
                                >
                                  <Icon name={LINE_ICON[line]} size={14} />
                                  {queued ? `${NEWS_LINE_LABEL[line]}已排入` : LINE_ACTION[line]}
                                </button>
                              );
                            })}
                            <button type="button" className={styles.btn} style={btnBase} disabled={busy} onClick={() => setChooser(null)}>
                              取消
                            </button>
                          </>
                        ) : (
                          <button type="button" className={styles.btn} style={btnPrimary} disabled={busy} onClick={() => setChooser(it.id)}>
                            <Icon name="add" size={14} />
                            {busy ? "排入中…" : "拿去做"}
                          </button>
                        )}
                        <a className={styles.btn} style={btnBase} href={it.url} target="_blank" rel="noopener noreferrer">
                          <Icon name="link" size={14} />
                          原文
                        </a>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}

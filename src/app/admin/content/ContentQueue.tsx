"use client";

/**
 * 待產文案的清單：從「房產新聞」按「拿去做」排進來的題，知識文章與短影音各自一筆。
 *
 * 這裡是他真正動手改寫、拍片的地方，所以全文與複製放在這（房產新聞那頁沒有）。
 * 做完按「完成」；不做了按「退回」—— 退回會把這條線刪掉，
 * 新聞沒有別條線就回到房產新聞的「還沒排的」。
 *
 * 從房產新聞按過來時網址帶 `?focus=<題的 id>`：那一筆會框起來、捲到畫面中間，
 * 而且狀態篩選會自動切到它所在的那一邊（不然剛完成的題按過來會「找不到」）。
 *
 * 樣式沿用精選好案那一份 CSS（`listings-admin.module.css`），跟其他後台頁一致。
 */

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { CHIP, CIS, type ChipTone } from "@/app/admin/_components/cis";
import { Icon } from "@/app/admin/_ui/icons";
import { NEWS_REGION_LABEL, type NewsRegion } from "@/config/news";
import { removeNewsTaskAction, setNewsTaskStatusAction } from "@/lib/actions/news";
import {
  NEWS_LINES,
  NEWS_LINE_LABEL,
  type NewsLine,
  type NewsTaskCounts,
  type NewsTaskRecord,
  type NewsTaskStatus,
} from "@/lib/news";
import styles from "@/app/admin/listings/listings-admin.module.css";

type Props = {
  tasks: NewsTaskRecord[];
  counts: NewsTaskCounts;
  /** 從房產新聞按「拿去做」帶過來的那一題 */
  focus: string | null;
};

type StatusFilter = NewsTaskStatus | "all";
const STATUS_FILTER_LABEL: Record<StatusFilter, string> = { todo: "待做", done: "已完成", all: "全部" };

const LINE_TONE: Record<NewsLine, ChipTone> = { article: "info", video: "warn" };
const REGION_TONE: Record<NewsRegion, ChipTone> = { coast: "warn", central: "info", national: "neutral" };

/** `YYYY-MM-DD HH:MM:SS` → `MM/DD HH:MM` */
function shortStamp(stamp: string | null): string {
  if (!stamp) return "";
  return `${stamp.slice(5, 7)}/${stamp.slice(8, 10)} ${stamp.slice(11, 16)}`;
}

function excerpt(t: NewsTaskRecord, limit = 200): string {
  const text = (t.news.content || t.news.summary || "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}…`;
}

function chipStyle(tone: ChipTone): React.CSSProperties {
  const c = CHIP[tone];
  return { background: c.bg, color: c.color, borderColor: c.border };
}

export default function ContentQueue({ tasks, counts, focus }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const focused = focus ? tasks.find((t) => t.id === focus) : undefined;
  const [line, setLine] = useState<"all" | NewsLine>("all");
  const [status, setStatus] = useState<StatusFilter>(focused?.status ?? "todo");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: ChipTone; text: string } | null>(null);

  // 剛從房產新聞按過來：捲到那一題
  useEffect(() => {
    if (!focus) return;
    const el = document.getElementById(`task-${focus}`);
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focus]);

  const visible = useMemo(
    () => tasks.filter((t) => (line === "all" || t.line === line) && (status === "all" || t.status === status)),
    [tasks, line, status],
  );

  async function run(id: string, action: () => Promise<{ ok: boolean; error?: string }>, doneText: string) {
    setBusyId(id);
    const r = await action();
    setBusyId(null);
    if (!r.ok) {
      setMsg({ tone: "danger", text: r.error || "存檔失敗" });
      return;
    }
    setMsg({ tone: "success", text: doneText });
    startTransition(() => router.refresh());
  }

  function remove(t: NewsTaskRecord) {
    const ok = window.confirm(`退回「${t.news.title}」的${NEWS_LINE_LABEL[t.line]}？這條線會刪掉，新聞回到房產新聞的清單。`);
    if (!ok) return;
    void run(t.id, () => removeNewsTaskAction(t.id), "已退回。");
  }

  async function copyTask(t: NewsTaskRecord) {
    const body = t.news.content || t.news.summary || "";
    const text = `${t.news.title}\n${[t.news.source, shortStamp(t.news.publishedAt)].filter(Boolean).join(" · ")}\n${t.news.url}\n\n${body}`;
    try {
      await navigator.clipboard.writeText(text);
      setMsg({ tone: "success", text: "已複製標題、來源、連結與全文。" });
    } catch {
      setMsg({ tone: "danger", text: "複製失敗，請手動選取。" });
    }
  }

  const btnBase: React.CSSProperties = { borderColor: CIS.cardBorder, color: CIS.textSub };
  const btnPrimary: React.CSSProperties = { borderColor: CIS.blue, color: CIS.blue };
  const fieldStyle: React.CSSProperties = { background: CIS.bgSoft, borderColor: CIS.cardBorder, color: CIS.text };

  return (
    <>
      {/* 上方數字：兩條線各還有幾題、做完幾題 */}
      <div className={styles.summaryRow}>
        {NEWS_LINES.map((l) => (
          <div key={l} className={styles.summary} style={{ borderColor: CIS.cardBorder, background: CIS.card }}>
            <div className={styles.summaryLabel} style={{ color: CIS.textMute }}>
              待做・{NEWS_LINE_LABEL[l]}
            </div>
            <div className={styles.summaryValue}>{counts.todo[l]}</div>
          </div>
        ))}
        <div className={styles.summary} style={{ borderColor: CIS.cardBorder, background: CIS.card }}>
          <div className={styles.summaryLabel} style={{ color: CIS.textMute }}>
            已完成
          </div>
          <div className={styles.summaryValue}>{counts.done}</div>
        </div>
      </div>

      {/* 篩選列 */}
      <div className={styles.actions}>
        <select className={styles.select} style={{ ...fieldStyle, width: "auto", minHeight: 38 }} value={line} onChange={(e) => setLine(e.target.value as "all" | NewsLine)}>
          <option value="all">兩條線都看</option>
          {NEWS_LINES.map((l) => (
            <option key={l} value={l}>
              {NEWS_LINE_LABEL[l]}
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
        <span className={styles.spacer} />
        <a className={styles.btn} style={btnBase} href="/admin/news">
          <Icon name="news" size={14} />
          去房產新聞挑題
        </a>
      </div>

      {msg && (
        <p className={styles.msg} style={{ color: CHIP[msg.tone].color }}>
          {msg.text}
        </p>
      )}

      {visible.length === 0 && (
        <div className={styles.notice} style={{ borderColor: CIS.cardBorder, color: CIS.textMute }}>
          {tasks.length === 0
            ? "還沒有題目。到左側「房產新聞」看到想做的，按「拿去做」選知識文章或短影音，就會出現在這裡。"
            : "這個篩選條件底下沒有題目。"}
        </div>
      )}

      <div className={styles.list} style={{ marginTop: 16 }}>
        {visible.map((t) => {
          const open = !!expanded[t.id];
          const busy = busyId === t.id || pending;
          const isFocus = t.id === focus;
          const otherLines = t.news.tasks.filter((x) => x.line !== t.line);
          return (
            <article
              key={t.id}
              id={`task-${t.id}`}
              className={styles.row}
              style={{
                borderColor: isFocus ? CIS.blue : CIS.cardBorder,
                background: CIS.card,
                boxShadow: isFocus ? `0 0 0 2px ${CIS.blue}55` : undefined,
              }}
            >
              <div className={styles.rowBody}>
                <div className={styles.rowHead}>
                  <h3 className={styles.rowTitle}>
                    <a href={t.news.url} target="_blank" rel="noopener noreferrer" style={{ color: CIS.text, textDecoration: "none" }}>
                      {t.news.title}
                    </a>
                  </h3>
                  <span className={styles.chip} style={chipStyle(LINE_TONE[t.line])}>
                    {NEWS_LINE_LABEL[t.line]}
                  </span>
                  <span className={styles.chip} style={chipStyle(t.status === "done" ? "success" : "neutral")}>
                    {t.status === "done" ? "已完成" : "待做"}
                  </span>
                  <span className={styles.chip} style={chipStyle(REGION_TONE[t.news.region])}>
                    {NEWS_REGION_LABEL[t.news.region]}
                  </span>
                </div>
                <div className={styles.rowMeta} style={{ color: CIS.textMute }}>
                  {[t.news.source, shortStamp(t.news.publishedAt) || `抓於 ${shortStamp(t.news.fetchedAt)}`, `${shortStamp(t.createdAt)} 排入`]
                    .filter(Boolean)
                    .join(" · ")}
                  {otherLines.length > 0 && (
                    <span style={{ marginLeft: 8 }}>
                      （這則也排了{otherLines.map((x) => NEWS_LINE_LABEL[x.line]).join("、")}）
                    </span>
                  )}
                  {!t.news.content && <span style={{ marginLeft: 8 }}>（沒抓到全文，請開原文）</span>}
                </div>
                {!open && excerpt(t) && (
                  <p className={styles.msg} style={{ color: CIS.textSub, marginTop: 8 }}>
                    {excerpt(t)}
                  </p>
                )}
                {open && (
                  <pre
                    style={{
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      font: "inherit",
                      lineHeight: 1.8,
                      color: CIS.textSub,
                      margin: "10px 0 0",
                      padding: "12px 14px",
                      border: `1px solid ${CIS.divider}`,
                      borderRadius: 8,
                      background: CIS.bgSoft,
                      maxHeight: 520,
                      overflow: "auto",
                    }}
                  >
                    {t.news.content || t.news.summary || "（沒有抓到內文，請開原文）"}
                  </pre>
                )}
                <div className={styles.actions}>
                  <button type="button" className={styles.btn} style={btnBase} onClick={() => setExpanded((s) => ({ ...s, [t.id]: !open }))}>
                    {open ? "收起" : "看全文"}
                  </button>
                  <button type="button" className={styles.btn} style={btnBase} onClick={() => copyTask(t)}>
                    <Icon name="copy" size={14} />
                    複製全文
                  </button>
                  <a className={styles.btn} style={btnBase} href={t.news.url} target="_blank" rel="noopener noreferrer">
                    <Icon name="link" size={14} />
                    原文
                  </a>
                  {t.status === "todo" ? (
                    <button
                      type="button"
                      className={styles.btn}
                      style={btnPrimary}
                      disabled={busy}
                      onClick={() => run(t.id, () => setNewsTaskStatusAction(t.id, "done"), `${NEWS_LINE_LABEL[t.line]}標成已完成。`)}
                    >
                      <Icon name="success" size={14} />
                      完成
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.btn}
                      style={btnBase}
                      disabled={busy}
                      onClick={() => run(t.id, () => setNewsTaskStatusAction(t.id, "todo"), "已放回待做。")}
                    >
                      <Icon name="undo" size={14} />
                      放回待做
                    </button>
                  )}
                  <button type="button" className={styles.btn} style={btnBase} disabled={busy} onClick={() => remove(t)}>
                    <Icon name="trash" size={14} />
                    退回
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

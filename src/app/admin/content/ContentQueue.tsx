"use client";

/**
 * 待產文案的清單：從「房產新聞」按「拿去做」排進來的題，知識文章與短影音各自一筆。
 *
 * 這裡是他真正動手的地方，所以全文與複製放在這（房產新聞那頁沒有）。
 * 每一題有「派工寫稿」：一鍵把原文交給 ChatGPT，照 src/config/copywriter.ts 的規則寫
 * （知識文章＝六個平台各一版；短影音＝三個版本，各有 15 字標題、黃金三秒鉤子、1 分鐘口播稿）。
 * 每按一次多一版、舊版留著可以切換比較；字數是後台自己數的，模型自己報的數字不可信。
 *
 * 做完按「完成」；不做了按「退回」—— 退回會把這條線（連同文案）刪掉，
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
import { generateDraftAction, removeNewsTaskAction, setNewsTaskStatusAction } from "@/lib/actions/news";
import { analyzeDraft, type DraftStats } from "@/lib/copywriter-text";
import {
  NEWS_LINES,
  NEWS_LINE_LABEL,
  type NewsDraftRecord,
  type NewsLine,
  type NewsTaskCounts,
  type NewsTaskRecord,
  type NewsTaskStatus,
} from "@/lib/news";
import styles from "@/app/admin/listings/listings-admin.module.css";

type Props = {
  tasks: NewsTaskRecord[];
  counts: NewsTaskCounts;
  /** 每一題的文案（題的 id → 文案，最新的在前） */
  drafts: Record<string, NewsDraftRecord[]>;
  /** 有沒有設 OPENAI_API_KEY；沒有就把按鈕鎖起來、上面講怎麼設 */
  configured: boolean;
  /** 目前會用的模型名稱（顯示用） */
  model: string;
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

const preStyle: React.CSSProperties = {
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
  overflow: "auto",
};

/** 字數那一行：知識文章看每個平台有沒有超過上限；短影音看每版講幾秒。 */
function StatsLine({ stats }: { stats: DraftStats }) {
  const base: React.CSSProperties = { marginRight: 14, whiteSpace: "nowrap" };
  if (stats.line === "article") {
    return (
      <p className={styles.msg} style={{ color: CIS.textMute, marginTop: 8, lineHeight: 1.9 }}>
        {stats.platforms.map((p) => (
          <span key={p.rule.key} style={{ ...base, color: p.over ? CHIP.danger.color : p.found ? CIS.textSub : CHIP.warn.color }}>
            {p.rule.heading} {p.found ? `${p.chars} 字` : "沒切出來"}
            {p.found && p.rule.hardLimit ? `／上限 ${p.rule.hardLimit}` : ""}
            {p.over ? " ⚠️ 超過" : ""}
          </span>
        ))}
      </p>
    );
  }
  if (stats.scripts.length === 0) {
    return (
      <p className={styles.msg} style={{ color: CHIP.warn.color, marginTop: 8 }}>
        沒找到 ``` 圍起來的口播文稿，字數沒法算；再派工一次通常會照格式寫。
      </p>
    );
  }
  return (
    <p className={styles.msg} style={{ color: CIS.textMute, marginTop: 8, lineHeight: 1.9 }}>
      {stats.scripts.map((s, i) => (
        <span key={`${s.label}-${i}`} style={{ ...base, color: s.seconds > 60 ? CHIP.danger.color : CIS.textSub }}>
          {s.label} {s.chars} 字（約 {s.seconds} 秒{s.seconds > 60 ? "，超過 1 分鐘 ⚠️" : ""}）
        </span>
      ))}
    </p>
  );
}

function DraftPanel({
  task,
  list,
  selectedId,
  onSelect,
  onCopy,
}: {
  task: NewsTaskRecord;
  list: NewsDraftRecord[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  onCopy: (d: NewsDraftRecord) => void;
}) {
  const draft = list.find((d) => d.id === selectedId) ?? list[0];
  const version = list.length - list.indexOf(draft);
  const stats = useMemo(() => analyzeDraft(task.line, draft.content), [task.line, draft.content]);
  const fieldStyle: React.CSSProperties = { background: CIS.card, borderColor: CIS.cardBorder, color: CIS.text };
  return (
    <div style={{ marginTop: 12, padding: "12px 14px", border: `1px solid ${CIS.cardBorder}`, borderRadius: 10, background: CIS.bgSoft }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", color: CIS.textMute, fontSize: 13.5 }}>
        <b style={{ color: CIS.text, fontSize: 14.5 }}>✍️ ChatGPT 寫的{NEWS_LINE_LABEL[task.line]}</b>
        {list.length > 1 ? (
          <select className={styles.select} style={{ ...fieldStyle, width: "auto", minHeight: 32, fontSize: 13 }} value={draft.id} onChange={(e) => onSelect(e.target.value)}>
            {list.map((d, i) => (
              <option key={d.id} value={d.id}>
                第 {list.length - i} 版 · {shortStamp(d.createdAt)}
              </option>
            ))}
          </select>
        ) : (
          <span>
            第 {version} 版 · {shortStamp(draft.createdAt)}
          </span>
        )}
        <span>
          {draft.model} · 花 {Math.max(1, Math.round(draft.ms / 1000))} 秒
        </span>
        <span className={styles.spacer} />
        <button type="button" className={styles.btn} style={{ borderColor: CIS.blue, color: CIS.blue }} onClick={() => onCopy(draft)}>
          <Icon name="copy" size={14} />
          複製文案
        </button>
      </div>
      {draft.truncated && (
        <p className={styles.msg} style={{ color: CHIP.warn.color, marginTop: 8 }}>
          ⚠️ 這版被字數上限截斷了，結尾可能不完整；再派工一次通常會好。
        </p>
      )}
      <StatsLine stats={stats} />
      <pre style={{ ...preStyle, background: CIS.card, maxHeight: 720 }}>{draft.content}</pre>
    </div>
  );
}

export default function ContentQueue({ tasks, counts, drafts, configured, model, focus }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const focused = focus ? tasks.find((t) => t.id === focus) : undefined;
  const [line, setLine] = useState<"all" | NewsLine>("all");
  const [status, setStatus] = useState<StatusFilter>(focused?.status ?? "todo");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  /** 每一題目前看的是哪一版文案（沒選就是最新那版） */
  const [selectedDraft, setSelectedDraft] = useState<Record<string, string>>({});
  /** 剛寫好、伺服器還沒重新讀回來的文案，先塞進畫面 */
  const [freshDrafts, setFreshDrafts] = useState<NewsDraftRecord[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [writingId, setWritingId] = useState<string | null>(null);
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

  /** 伺服器給的文案＋剛寫好的，同一筆不重複 */
  const allDrafts = useMemo(() => {
    const map: Record<string, NewsDraftRecord[]> = {};
    for (const [taskId, list] of Object.entries(drafts)) map[taskId] = [...list];
    for (const d of freshDrafts) {
      const list = map[d.taskId] ?? (map[d.taskId] = []);
      if (!list.some((x) => x.id === d.id)) list.unshift(d);
    }
    return map;
  }, [drafts, freshDrafts]);

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
    const n = allDrafts[t.id]?.length ?? 0;
    const ok = window.confirm(
      `退回「${t.news.title}」的${NEWS_LINE_LABEL[t.line]}？這條線會刪掉${n ? `（連同 ${n} 版文案）` : ""}，新聞回到房產新聞的清單。`,
    );
    if (!ok) return;
    void run(t.id, () => removeNewsTaskAction(t.id), "已退回。");
  }

  async function write(t: NewsTaskRecord) {
    setWritingId(t.id);
    setMsg({ tone: "info", text: `派工中… ChatGPT（${model}）通常 20 到 50 秒，別關掉這一頁。` });
    const r = await generateDraftAction(t.id);
    setWritingId(null);
    if (!r.ok || !r.draft) {
      setMsg({ tone: "danger", text: r.error || "寫稿失敗" });
      return;
    }
    const draft = r.draft;
    setFreshDrafts((s) => [draft, ...s]);
    setSelectedDraft((s) => ({ ...s, [t.id]: draft.id }));
    setMsg({ tone: "success", text: `寫好了，花 ${Math.max(1, Math.round(draft.ms / 1000))} 秒。字數後台自己數過，看下面那一行。` });
    startTransition(() => router.refresh());
  }

  async function copyText(text: string, doneText: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMsg({ tone: "success", text: doneText });
    } catch {
      setMsg({ tone: "danger", text: "複製失敗，請手動選取。" });
    }
  }

  function copySource(t: NewsTaskRecord) {
    const body = t.news.content || t.news.summary || "";
    void copyText(
      `${t.news.title}\n${[t.news.source, shortStamp(t.news.publishedAt)].filter(Boolean).join(" · ")}\n${t.news.url}\n\n${body}`,
      "已複製標題、來源、連結與全文。",
    );
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

      {!configured && (
        <div className={styles.notice} style={{ borderColor: "rgba(245,158,11,0.45)", color: CHIP.warn.color, marginTop: 14 }}>
          「派工寫稿」還沒接上 ChatGPT。到 Vercel → 這個專案 → Settings → Environment Variables 加一個
          <code style={{ margin: "0 4px" }}>OPENAI_API_KEY</code>（platform.openai.com → API keys 建立），存檔後重新部署一次按鈕就會動。
          ChatGPT Plus 的訂閱不包含 API，API 要另外儲值，一篇文案約新台幣 1 元上下。
        </div>
      )}

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
          const writing = writingId === t.id;
          const busy = busyId === t.id || pending || writing;
          const isFocus = t.id === focus;
          const otherLines = t.news.tasks.filter((x) => x.line !== t.line);
          const list = allDrafts[t.id] ?? [];
          const hasSource = !!(t.news.content || t.news.summary);
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
                  {list.length > 0 && (
                    <span className={styles.chip} style={chipStyle("success")}>
                      文案 {list.length} 版
                    </span>
                  )}
                </div>
                <div className={styles.rowMeta} style={{ color: CIS.textMute }}>
                  {[t.news.source, shortStamp(t.news.publishedAt) || `抓於 ${shortStamp(t.news.fetchedAt)}`, `${shortStamp(t.createdAt)} 排入`]
                    .filter(Boolean)
                    .join(" · ")}
                  {otherLines.length > 0 && (
                    <span style={{ marginLeft: 8 }}>（這則也排了{otherLines.map((x) => NEWS_LINE_LABEL[x.line]).join("、")}）</span>
                  )}
                  {!hasSource && <span style={{ marginLeft: 8 }}>（沒抓到內文，派工會寫不出東西，請開原文）</span>}
                </div>
                {!open && excerpt(t) && (
                  <p className={styles.msg} style={{ color: CIS.textSub, marginTop: 8 }}>
                    {excerpt(t)}
                  </p>
                )}
                {open && <pre style={{ ...preStyle, maxHeight: 520 }}>{t.news.content || t.news.summary || "（沒有抓到內文，請開原文）"}</pre>}
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.btn}
                    style={configured && hasSource ? btnPrimary : btnBase}
                    disabled={busy || !configured || !hasSource}
                    title={!configured ? "還沒設 OPENAI_API_KEY" : !hasSource ? "這則沒抓到內文" : `交給 ${model} 寫`}
                    onClick={() => write(t)}
                  >
                    <Icon name="ai" size={14} />
                    {writing ? "寫稿中…" : list.length > 0 ? "再派工一次" : "派工寫稿"}
                  </button>
                  <button type="button" className={styles.btn} style={btnBase} onClick={() => setExpanded((s) => ({ ...s, [t.id]: !open }))}>
                    {open ? "收起原文" : "看原文全文"}
                  </button>
                  <button type="button" className={styles.btn} style={btnBase} onClick={() => copySource(t)}>
                    <Icon name="copy" size={14} />
                    複製原文
                  </button>
                  <a className={styles.btn} style={btnBase} href={t.news.url} target="_blank" rel="noopener noreferrer">
                    <Icon name="link" size={14} />
                    原文
                  </a>
                  {t.status === "todo" ? (
                    <button
                      type="button"
                      className={styles.btn}
                      style={btnBase}
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
                {list.length > 0 && (
                  <DraftPanel
                    task={t}
                    list={list}
                    selectedId={selectedDraft[t.id]}
                    onSelect={(id) => setSelectedDraft((s) => ({ ...s, [t.id]: id }))}
                    onCopy={(d) => void copyText(d.content, "已複製整份文案。")}
                  />
                )}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

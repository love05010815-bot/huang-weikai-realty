"use client";

/**
 * 待產文案的清單：從「房產新聞」按「拿去做」排進來的題，知識文章與短影音各自一筆。
 *
 * ## 寫稿有兩條路，預設走免費那條
 *
 * 1. **免費（主要）**：按「複製指令」把整段提示詞（身分、平台規範、原文）複製起來，
 *    貼進他自己的 ChatGPT 跑，再把結果貼回「貼回結果」存成一版文案。不用金鑰、不花錢。
 * 2. **自動（要錢）**：「自動派工」直接呼叫 OpenAI API。2026-09-16 他的帳戶沒額度，
 *    按下去會回「沒有額度」；他哪天儲值了就會動，所以按鈕留著、只是降級成次要。
 *
 * 兩條路存進同一張表、同一個畫面、同一套字數檢查（字數一律後台自己數，不信模型報的）。
 *
 * 做完按「完成」；不做了按「退回」—— 退回會把這條線（連同文案）刪掉，
 * 新聞沒有別條線就回到房產新聞的「還沒排的」。
 *
 * ## 放到前台（2026-09-18 加）
 *
 * 知識文章那條線在**上面那排按鈕**（複製指令 → 開 ChatGPT → 貼回結果 → 放到前台）
 * 最後有一顆「放到前台」：挑一個平台的版本（預設 Facebook，那版最像一篇文章），
 * 按下去會存成 `/news` 的一篇**草稿**、跳到 `/admin/posts`。
 * 刻意不直接發佈 —— 模型寫的東西他一定要自己看過一遍，而且還沒配封面圖。
 * 短影音那條線不走這裡（口播稿不是給人讀的文章），拍好之後上 `/admin/videos`。
 *
 * 🔴 **那顆按鈕一定要留在那一排。** 2026-09-18 第一版放在下面「寫好的文案」那一塊裡，
 *    結果被上一題那塊 720px 高的文稿擋住，他直接回報「沒看到放到前台按鈕」——
 *    按鈕存在但在畫面外，跟不存在是一樣的（這個專案第四次踩同一個坑）。
 *    還沒有文案時按鈕是灰的，滑過去會說「要先有一版文案」，而不是整顆消失。
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
import { COPYWRITER, PLATFORM_RULES, manualPrompt } from "@/config/copywriter";
import { NEWS_REGION_LABEL, type NewsRegion } from "@/config/news";
import { generateDraftAction, removeNewsTaskAction, saveManualDraftAction, setNewsTaskStatusAction } from "@/lib/actions/news";
import { savePostAction } from "@/lib/actions/posts";
import { analyzeDraft, draftSection, draftTitleCandidates, type DraftStats } from "@/lib/copywriter-text";
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
  /** 有沒有設 OPENAI_API_KEY。沒有的話「自動派工」整顆不給按 */
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

/** 他的 ChatGPT。開新分頁，不要把後台頁面蓋掉（貼回來還要用）。 */
const CHATGPT_URL = "https://chatgpt.com/";

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
        沒找到 ``` 圍起來的口播文稿，字數沒法算。把 ChatGPT 的回答整段貼回來（含 ``` 那幾行）就會算了。
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

/**
 * 「放到前台」預設帶哪一段。
 * 2026-09-25 起文案裡有專門給官網寫的「## 官網文章」（900～1500 字、【】小標），預設帶它。
 * 舊文案（那天以前存的）沒有這一段 —— 按下去會被擋下來、叫他改選 Facebook 那一版，不會壞。
 */
const DEFAULT_PUBLISH_SECTION = "官網文章";

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
        <b style={{ color: CIS.text, fontSize: 14.5 }}>✍️ 寫好的{NEWS_LINE_LABEL[task.line]}</b>
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
        <span>{draft.model}</span>
        {draft.ms > 0 && <span>花 {Math.max(1, Math.round(draft.ms / 1000))} 秒</span>}
        <span className={styles.spacer} />
        <button type="button" className={styles.btn} style={{ borderColor: CIS.blue, color: CIS.blue }} onClick={() => onCopy(draft)}>
          <Icon name="copy" size={14} />
          複製文案
        </button>
      </div>
      {draft.truncated && (
        <p className={styles.msg} style={{ color: CHIP.warn.color, marginTop: 8 }}>
          ⚠️ 這版被字數上限截斷了，結尾可能不完整；再寫一次通常會好。
        </p>
      )}
      <StatsLine stats={stats} />

      {/* 短影音那條線的產出是口播稿，不是給人讀的文章 —— 拍好之後走「影音」後台。
          知識文章的「放到前台」**不在這裡**，在上面那排按鈕裡（見檔頭）。 */}
      {task.line === "video" ? (
        <p className={styles.msg} style={{ color: CIS.textMute, marginTop: 10 }}>
          短影音拍好之後放到「影音」後台（/admin/videos），前台會出現在影音專區。
        </p>
      ) : null}

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
  /** 每一題「放到前台」要帶哪一個平台的版本（沒選就是 Facebook） */
  const [publishSection, setPublishSection] = useState<Record<string, string>>({});
  /** 剛寫好、伺服器還沒重新讀回來的文案，先塞進畫面 */
  const [freshDrafts, setFreshDrafts] = useState<NewsDraftRecord[]>([]);
  /** 哪一題打開了「貼回結果」的框 */
  const [pastingId, setPastingId] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");
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

  async function copyText(text: string, doneText: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMsg({ tone: "success", text: doneText });
      return true;
    } catch {
      setMsg({ tone: "danger", text: "複製失敗，請手動選取。" });
      return false;
    }
  }

  /** 免費那條路的第一步：把整段指令複製起來，準備貼進 ChatGPT。 */
  async function copyPrompt(t: NewsTaskRecord) {
    const text = (t.news.content || t.news.summary || "").trim();
    if (!text) {
      setMsg({ tone: "danger", text: "這則只有標題、沒抓到內文，寫不出東西。請開原文自己看。" });
      return;
    }
    const prompt = manualPrompt(t.line, {
      title: t.news.title,
      source: t.news.source,
      publishedAt: t.news.publishedAt,
      url: t.news.url,
      text: text.slice(0, COPYWRITER.MAX_SOURCE_CHARS),
    });
    const ok = await copyText(prompt, "指令已複製。到 ChatGPT 貼上送出，寫好後整段複製，回來按「貼回結果」。");
    if (ok) setPastingId(t.id);
  }

  /** 免費那條路的最後一步：把 ChatGPT 的回答存成一版文案。 */
  async function savePaste(t: NewsTaskRecord) {
    setBusyId(t.id);
    const r = await saveManualDraftAction(t.id, pasteText);
    setBusyId(null);
    if (!r.ok || !r.draft) {
      setMsg({ tone: "danger", text: r.error || "存檔失敗" });
      return;
    }
    const draft = r.draft;
    setFreshDrafts((s) => [draft, ...s]);
    setSelectedDraft((s) => ({ ...s, [t.id]: draft.id }));
    setPastingId(null);
    setPasteText("");
    setMsg({ tone: "success", text: "存好了。字數是後台自己數的，看下面那一行有沒有超過。" });
    startTransition(() => router.refresh());
  }

  /** 要錢那條路：直接呼叫 OpenAI。 */
  async function write(t: NewsTaskRecord) {
    setWritingId(t.id);
    setMsg({ tone: "info", text: `自動寫稿中… ${model} 通常 20 到 50 秒，別關掉這一頁。` });
    const r = await generateDraftAction(t.id);
    setWritingId(null);
    if (!r.ok || !r.draft) {
      setMsg({ tone: "danger", text: r.error || "寫稿失敗" });
      return;
    }
    const draft = r.draft;
    setFreshDrafts((s) => [draft, ...s]);
    setSelectedDraft((s) => ({ ...s, [t.id]: draft.id }));
    setMsg({ tone: "success", text: `寫好了，花 ${Math.max(1, Math.round(draft.ms / 1000))} 秒。` });
    startTransition(() => router.refresh());
  }

  /**
   * 「放到前台」：把這一版文案的某一段存成 `/news` 的一篇**草稿**，然後跳到房產消息後台。
   *
   * 刻意不直接發佈 —— 模型寫的東西他一定要自己看過一遍（紅線、數字、口氣），
   * 而且還沒配封面圖。那一頁會帶 `?focus=` 自動展開這一篇。
   *
   * 標題優先用文案裡的「標題候選」第一個；沒有就用原新聞標題（他再自己改）。
   */
  async function publishToSite(t: NewsTaskRecord, d: NewsDraftRecord, section: string) {
    let body = (section === "__all__" ? d.content : draftSection(d.content, section)).trim();
    // 2026-09-25 以前存的文案沒有「## 官網文章」這一段。預設值挖不到就退回 Facebook 那版，
    // 不要為了一個新預設值讓舊文案全部卡住；他自己明確選的平台挖不到才報錯。
    if (!body && section === DEFAULT_PUBLISH_SECTION) body = draftSection(d.content, "Facebook").trim();
    if (!body) {
      setMsg({
        tone: "danger",
        text: `這一版裡找不到「${section}」那一段（ChatGPT 可能沒照「## 平台名」的格式寫）。改選「整篇全部」，或到前台後台自己貼。`,
      });
      return;
    }
    setBusyId(t.id);
    const res = await savePostAction(null, {
      // 從新聞改寫來的多半是政策／成數／稅制異動，先歸「房市快訊」，他在編輯頁可以改成「房產知識」
      category: "news",
      title: draftTitleCandidates(d.content)[0] || t.news.title,
      summary: "",
      body,
      coverUrl: "",
      sourceUrl: t.news.url,
      sourceName: t.news.source,
      status: "draft",
      pinned: false,
      publishedAt: "",
      taskId: t.id,
    });
    setBusyId(null);
    if (!res.ok || !res.id) {
      setMsg({ tone: "danger", text: res.error || "放不上去" });
      return;
    }
    router.push(`/admin/posts?focus=${res.id}`);
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
  const btnQuiet: React.CSSProperties = { borderColor: CIS.divider, color: CIS.textMute, fontSize: 13 };
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

      <div className={styles.notice} style={{ borderColor: CIS.cardBorder, color: CIS.textMute, marginTop: 14 }}>
        <b style={{ color: CIS.text }}>寫稿流程（免費）</b>：按 <b>複製指令</b> → 開 ChatGPT 貼上送出 → 把它寫的整段複製 → 回來按{" "}
        <b>貼回結果</b> 存檔。指令裡已經包含原文、平台字數規範跟你的口吻設定，不用再多打字。
        旁邊的「自動派工」是直接叫 OpenAI 的 API 寫，不用複製貼上，但那是<b>付費</b>的，要先在 platform.openai.com 儲值才會動。
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
          const writing = writingId === t.id;
          const busy = busyId === t.id || pending || writing;
          const isFocus = t.id === focus;
          const pasting = pastingId === t.id;
          const otherLines = t.news.tasks.filter((x) => x.line !== t.line);
          const list = allDrafts[t.id] ?? [];
          /** 目前選的那一版文案（沒選就是最新那版）。沒有文案的話「放到前台」不給按。 */
          const latestDraft = list.find((d) => d.id === selectedDraft[t.id]) ?? list[0];
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
                  {!hasSource && <span style={{ marginLeft: 8 }}>（沒抓到內文，寫不出東西，請開原文）</span>}
                </div>
                {!open && excerpt(t) && (
                  <p className={styles.msg} style={{ color: CIS.textSub, marginTop: 8 }}>
                    {excerpt(t)}
                  </p>
                )}
                {open && <pre style={{ ...preStyle, maxHeight: 520 }}>{t.news.content || t.news.summary || "（沒有抓到內文，請開原文）"}</pre>}

                {/* 第一排：寫這一題 */}
                <div className={styles.actions}>
                  <button type="button" className={styles.btn} style={hasSource ? btnPrimary : btnBase} disabled={busy || !hasSource} onClick={() => copyPrompt(t)}>
                    <Icon name="copy" size={14} />
                    複製指令
                  </button>
                  <a className={styles.btn} style={btnBase} href={CHATGPT_URL} target="_blank" rel="noopener noreferrer">
                    <Icon name="ai" size={14} />
                    開 ChatGPT
                  </a>
                  <button
                    type="button"
                    className={styles.btn}
                    style={pasting ? btnPrimary : btnBase}
                    disabled={busy}
                    onClick={() => {
                      setPastingId(pasting ? null : t.id);
                      setPasteText("");
                    }}
                  >
                    <Icon name="edit" size={14} />
                    {pasting ? "收起貼回框" : "貼回結果"}
                  </button>

                  {/* ---------- 放到前台 ----------
                      🔴 這顆**一定要放在這一排**（複製指令 → 開 ChatGPT → 貼回結果 → 放到前台，
                         就是他實際做事的順序）。2026-09-18 第一版放在下面「寫好的文案」那一塊裡，
                         結果被上一題那塊 720px 高的文稿擋住，他直接回報「沒看到放到前台按鈕」——
                         按鈕存在但在畫面外，跟不存在是一樣的。
                      知識文章才有；短影音的產出是口播稿，走 /admin/videos。 */}
                  {t.line === "article" ? (
                    <>
                      <select
                        className={styles.select}
                        style={{ ...fieldStyle, width: "auto", minHeight: 38, fontSize: 13 }}
                        value={publishSection[t.id] ?? DEFAULT_PUBLISH_SECTION}
                        disabled={busy || !latestDraft}
                        title="要把哪一個平台的版本放到前台"
                        onChange={(e) => setPublishSection((s) => ({ ...s, [t.id]: e.target.value }))}
                      >
                        {PLATFORM_RULES.map((p) => (
                          <option key={p.key} value={p.heading}>
                            {p.heading} 那一版
                          </option>
                        ))}
                        <option value="__all__">整篇全部</option>
                      </select>
                      <button
                        type="button"
                        className={styles.btn}
                        style={
                          latestDraft
                            ? { borderColor: CHIP.success.border, color: CHIP.success.color }
                            : { ...btnQuiet, fontSize: 14 }
                        }
                        disabled={busy || !latestDraft}
                        title={
                          latestDraft
                            ? "存成前台『房產消息』的草稿，跳過去潤稿、配封面圖，再按發佈"
                            : "要先有一版文案：複製指令 → 貼進 ChatGPT → 貼回結果"
                        }
                        onClick={() =>
                          latestDraft &&
                          void publishToSite(t, latestDraft, publishSection[t.id] ?? DEFAULT_PUBLISH_SECTION)
                        }
                      >
                        <Icon name="rocket" size={14} />
                        放到前台
                      </button>
                    </>
                  ) : null}

                  <span className={styles.spacer} />
                  <button
                    type="button"
                    className={styles.btn}
                    style={btnQuiet}
                    disabled={busy || !configured || !hasSource}
                    title={!configured ? "還沒設 OPENAI_API_KEY" : !hasSource ? "這則沒抓到內文" : `直接叫 ${model} 寫，要 OpenAI 有額度`}
                    onClick={() => write(t)}
                  >
                    {writing ? "自動寫稿中…" : "自動派工（付費）"}
                  </button>
                </div>

                {pasting && (
                  <div style={{ marginTop: 10, padding: "12px 14px", border: `1px solid ${CIS.blue}55`, borderRadius: 10, background: CIS.bgSoft }}>
                    <p className={styles.msg} style={{ color: CIS.textSub, margin: "0 0 8px" }}>
                      把 ChatGPT 寫好的內容<b>整段</b>複製貼在這裡（含「## 版本 A」「```」那些行，字數才算得出來），再按「存成文案」。
                    </p>
                    <textarea
                      className={styles.textarea}
                      style={{ ...fieldStyle, width: "100%", minHeight: 200 }}
                      placeholder="在這裡貼上 ChatGPT 的回答…"
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                    />
                    <div className={styles.actions}>
                      <button type="button" className={styles.btn} style={btnPrimary} disabled={busy || pasteText.trim().length < 20} onClick={() => savePaste(t)}>
                        <Icon name="save" size={14} />
                        存成文案
                      </button>
                      <button
                        type="button"
                        className={styles.btn}
                        style={btnBase}
                        disabled={busy}
                        onClick={() => {
                          setPastingId(null);
                          setPasteText("");
                        }}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}

                {/* 第二排：這一題的資料與狀態 */}
                <div className={styles.actions}>
                  <button type="button" className={styles.btn} style={btnBase} onClick={() => setExpanded((s) => ({ ...s, [t.id]: !open }))}>
                    {open ? "收起原文" : "看原文全文"}
                  </button>
                  <button type="button" className={styles.btn} style={btnBase} onClick={() => copySource(t)}>
                    <Icon name="copy" size={14} />
                    只複製原文
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

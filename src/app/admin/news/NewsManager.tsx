"use client";

/**
 * 房產新聞後台的清單：篩選、標記狀態、看全文、複製、立即抓取。
 *
 * 樣式沿用精選好案那一份（`listings-admin.module.css`）—— 後台每一頁長得一樣才像同一套系統。
 * ⚠️ 改那份 CSS 會同時影響精選好案、影音與這一頁。
 *
 * 狀態是「你處理到哪」：未處理 → 要改寫 → 已完成；不想看的按隱藏。
 * 清單本身由 server 端排好（海線 → 中部 → 全台，各區新到舊），這裡只做篩選與分組顯示。
 */

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { CHIP, CIS, type ChipTone } from "@/app/admin/_components/cis";
import { Icon } from "@/app/admin/_ui/icons";
import { NEWS_REGION_LABEL, NEWS_REGION_ORDER, type NewsRegion } from "@/config/news";
import { runNewsFetchAction, setNewsStatusAction } from "@/lib/actions/news";
import { NEWS_STATUS_LABEL, type NewsRecord, type NewsRunRecord, type NewsStatus } from "@/lib/news";
import styles from "@/app/admin/listings/listings-admin.module.css";

type Props = {
  items: NewsRecord[];
  counts: Record<NewsRegion, number>;
  latestRun: NewsRunRecord | null;
};

type StatusFilter = "active" | NewsStatus;

const REGION_TONE: Record<NewsRegion, ChipTone> = { coast: "warn", central: "info", national: "neutral" };
const STATUS_TONE: Record<NewsStatus, ChipTone> = { new: "neutral", picked: "warn", done: "success", hidden: "neutral" };

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
  const [status, setStatus] = useState<StatusFilter>("active");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [msg, setMsg] = useState<{ tone: ChipTone; text: string } | null>(null);

  const visible = useMemo(() => {
    const q = query.trim();
    return items.filter((it) => {
      if (region !== "all" && it.region !== region) return false;
      if (status === "active" ? it.status === "hidden" : it.status !== status) return false;
      if (q && !`${it.title} ${it.source} ${it.summary}`.includes(q)) return false;
      return true;
    });
  }, [items, region, status, query]);

  const grouped = useMemo(() => {
    const map: Record<NewsRegion, NewsRecord[]> = { coast: [], central: [], national: [] };
    for (const it of visible) map[it.region].push(it);
    return map;
  }, [visible]);

  async function changeStatus(id: string, next: NewsStatus) {
    setBusyId(id);
    const r = await setNewsStatusAction(id, next);
    setBusyId(null);
    if (!r.ok) {
      setMsg({ tone: "danger", text: r.error || "存檔失敗" });
      return;
    }
    startTransition(() => router.refresh());
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

  async function copyItem(it: NewsRecord) {
    const body = it.content || it.summary || "";
    const text = `${it.title}\n${[it.source, shortStamp(it.publishedAt)].filter(Boolean).join(" · ")}\n${it.url}\n\n${body}`;
    try {
      await navigator.clipboard.writeText(text);
      setMsg({ tone: "success", text: "已複製標題、來源、連結與內文。" });
    } catch {
      setMsg({ tone: "danger", text: "複製失敗，請手動選取。" });
    }
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
          <option value="active">未隱藏的</option>
          <option value="new">未處理</option>
          <option value="picked">要改寫</option>
          <option value="done">已完成</option>
          <option value="hidden">已隱藏</option>
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
                const open = !!expanded[it.id];
                const busy = busyId === it.id;
                return (
                  <article key={it.id} className={styles.row} style={{ borderColor: CIS.cardBorder, background: CIS.card }}>
                    <div className={styles.rowBody}>
                      <div className={styles.rowHead}>
                        <h3 className={styles.rowTitle}>
                          <a href={it.url} target="_blank" rel="noopener noreferrer" style={{ color: CIS.text, textDecoration: "none" }}>
                            {it.title}
                          </a>
                        </h3>
                        <span className={styles.chip} style={chipStyle(STATUS_TONE[it.status])}>
                          {NEWS_STATUS_LABEL[it.status]}
                        </span>
                      </div>
                      <div className={styles.rowMeta} style={{ color: CIS.textMute }}>
                        {[it.source, shortStamp(it.publishedAt) || `抓於 ${shortStamp(it.fetchedAt)}`].filter(Boolean).join(" · ")}
                        {!it.content && <span style={{ marginLeft: 8 }}>（只有標題，點標題看原文）</span>}
                      </div>
                      {!open && excerpt(it) && (
                        <p className={styles.msg} style={{ color: CIS.textSub, marginTop: 8 }}>
                          {excerpt(it)}
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
                            maxHeight: 420,
                            overflow: "auto",
                          }}
                        >
                          {it.content || it.summary || "（沒有抓到內文，請開原文）"}
                        </pre>
                      )}
                      <div className={styles.actions}>
                        {it.status !== "picked" && (
                          <button type="button" className={styles.btn} style={btnPrimary} disabled={busy} onClick={() => changeStatus(it.id, "picked")}>
                            <Icon name="edit" size={14} />
                            要改寫
                          </button>
                        )}
                        {it.status !== "done" && (
                          <button type="button" className={styles.btn} style={btnBase} disabled={busy} onClick={() => changeStatus(it.id, "done")}>
                            <Icon name="success" size={14} />
                            已完成
                          </button>
                        )}
                        {it.status !== "hidden" ? (
                          <button type="button" className={styles.btn} style={btnBase} disabled={busy} onClick={() => changeStatus(it.id, "hidden")}>
                            隱藏
                          </button>
                        ) : (
                          <button type="button" className={styles.btn} style={btnBase} disabled={busy} onClick={() => changeStatus(it.id, "new")}>
                            <Icon name="undo" size={14} />
                            復原
                          </button>
                        )}
                        <button type="button" className={styles.btn} style={btnBase} onClick={() => setExpanded((s) => ({ ...s, [it.id]: !open }))}>
                          {open ? "收起" : "看全文"}
                        </button>
                        <button type="button" className={styles.btn} style={btnBase} onClick={() => copyItem(it)}>
                          <Icon name="copy" size={14} />
                          複製
                        </button>
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

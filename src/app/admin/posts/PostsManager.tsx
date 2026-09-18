"use client";

/**
 * 房產消息後台：寫、配圖、發佈到前台 `/news`。
 *
 * ## 兩條進來的路，同一個表單
 *
 *   ① 從「待產文案」按「放到前台」—— 會先建一篇**草稿**，然後跳到這裡、
 *      網址帶 `?focus=<文章 id>`，那一筆自動展開成表單、捲到畫面中間。
 *   ② 直接按「寫一篇新的」貼上去（他自己在外面寫好的文案就走這條）。
 *
 * ## 三件刻意這樣做的事
 *
 * 1. **預覽跟前台跑同一支渲染**（`PostBody` ＋ `news.module.css` 的 `.body`）。
 *    另外寫一份簡化預覽的話，預覽與正式頁永遠有機會長得不一樣，
 *    而他只會在客戶看到之後才發現。
 *
 * 2. **存檔訊息貼在按鈕旁邊**，不是只放在頁面最上面。內文欄位很長，
 *    捲到下面按存檔時，上面的訊息在畫面外 —— 那就是「按了沒反應」。
 *
 * 3. **新文章預設是草稿**。發佈是另一個明確的動作（表單裡的狀態，或列表上那顆
 *    「發佈」）—— 免得他只是想先存起來，結果客戶已經看到半成品。
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { CHIP, CIS } from "@/app/admin/_components/cis";
import { Icon } from "@/app/admin/_ui/icons";
import PostBody from "@/app/_ui/PostBody";
import {
  deletePostAction,
  savePostAction,
  setPostPinnedAction,
  setPostStatusAction,
} from "@/lib/actions/posts";
import {
  POST_CATEGORIES,
  POST_CATEGORY_META,
  POST_STATUS_LABEL,
  type PostCategory,
  type PostRecord,
  type PostStatus,
} from "@/lib/posts";
import { postCharCount, postExcerpt } from "@/lib/posts-text";
import { uploadPhotos } from "@/lib/photo-upload-client";
import styles from "@/app/admin/listings/listings-admin.module.css";
import nw from "@/app/news/news.module.css";

type Props = { initial: PostRecord[]; focus: string | null };

type FormState = {
  category: PostCategory;
  status: PostStatus;
  title: string;
  summary: string;
  body: string;
  coverUrl: string;
  sourceUrl: string;
  sourceName: string;
  pinned: boolean;
  /** `YYYY-MM-DD`。時分秒沿用原本那筆，新的用現在 */
  date: string;
};

type StatusFilter = PostStatus | "all";
const STATUS_FILTER_LABEL: Record<StatusFilter, string> = { all: "全部", published: "已發佈", draft: "草稿" };

/** 台北時間的今天 `YYYY-MM-DD`。⚠️ 這台電腦的系統時區不是台北，一律用 UTC 換算。 */
function taipeiToday(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** 台北時間的現在 `HH:MM:SS` */
function taipeiTime(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(11, 19);
}

const EMPTY: FormState = {
  category: "news",
  status: "draft",
  title: "",
  summary: "",
  body: "",
  coverUrl: "",
  sourceUrl: "",
  sourceName: "",
  pinned: false,
  date: "",
};

function toForm(row: PostRecord): FormState {
  return {
    category: row.category,
    status: row.status,
    title: row.title,
    summary: row.summary,
    body: row.body,
    coverUrl: row.coverUrl,
    sourceUrl: row.sourceUrl,
    sourceName: row.sourceName,
    pinned: row.pinned,
    date: row.publishedAt.slice(0, 10),
  };
}

export default function PostsManager({ initial, focus }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const counts = useMemo(() => {
    const published = initial.filter((r) => r.status === "published").length;
    return { all: initial.length, published, draft: initial.length - published };
  }, [initial]);

  const rows = useMemo(
    () => (filter === "all" ? initial : initial.filter((r) => r.status === filter)),
    [initial, filter],
  );

  /**
   * 從「待產文案」帶 `?focus=` 過來：直接展開那一筆。
   * ⚠️ 只在第一次跑（依 focus 值），不然他關掉表單之後又會被打開。
   */
  useEffect(() => {
    if (!focus) return;
    const row = initial.find((r) => r.id === focus);
    if (!row) return;
    setEditing(row.id);
    setForm(toForm(row));
    setMsg({ ok: true, text: "已經從待產文案帶過來，存成草稿了。確認標題與內容、配一張封面圖，再按發佈。" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  /** 表單一打開就捲進畫面 —— 長清單裡按「編輯」，表單常常開在畫面外。 */
  useEffect(() => {
    if (!editing) return;
    const t = setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
    return () => clearTimeout(t);
  }, [editing]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function openNew() {
    setEditing("new");
    setForm({ ...EMPTY, date: taipeiToday() });
    setMsg(null);
  }

  function openEdit(row: PostRecord) {
    setEditing(row.id);
    setForm(toForm(row));
    setMsg(null);
  }

  function closeForm() {
    setEditing(null);
    setMsg(null);
  }

  /** 封面圖：走精選好案那支上傳 API（瀏覽器先縮圖、一張一張送）。 */
  async function pickCover(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setMsg(null);
    try {
      const { urls, failed } = await uploadPhotos([files[0]]);
      if (urls[0]) {
        set("coverUrl", urls[0]);
        setMsg({ ok: true, text: "封面圖上傳好了。記得按下面的「存檔」才會存進去。" });
      } else {
        setMsg({ ok: false, text: `封面圖上傳失敗：${failed[0]?.error ?? "伺服器沒有回傳網址"}` });
      }
    } catch (e) {
      setMsg({ ok: false, text: `封面圖上傳失敗：${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function save() {
    const id = editing === "new" ? null : editing;
    const original = id ? initial.find((r) => r.id === id) : null;
    // 日期他只挑到「天」，時分秒沿用原本那筆（新的用現在）——
    // 同一天發兩篇時，排序才不會兩篇並列、每次重新整理順序都不一樣。
    const time = original ? original.publishedAt.slice(11, 19) || taipeiTime() : taipeiTime();
    const publishedAt = form.date ? `${form.date} ${time}` : "";

    startTransition(async () => {
      const res = await savePostAction(id, {
        category: form.category,
        title: form.title,
        summary: form.summary,
        body: form.body,
        coverUrl: form.coverUrl,
        sourceUrl: form.sourceUrl,
        sourceName: form.sourceName,
        status: form.status,
        pinned: form.pinned,
        publishedAt,
        taskId: original?.taskId ?? "",
      });
      if (!res.ok) {
        setMsg({ ok: false, text: res.error ?? "存不起來" });
        return;
      }
      setMsg({
        ok: true,
        text:
          form.status === "published"
            ? `存好了，客戶現在就看得到：/news/${res.slug ?? ""}`
            : "存成草稿了。前台還看不到，要發佈的話把狀態改成「已發佈」再存一次。",
      });
      setEditing(null);
      router.refresh();
    });
  }

  function publish(row: PostRecord, next: PostStatus) {
    startTransition(async () => {
      const res = await setPostStatusAction(row.id, next);
      setMsg(
        res.ok
          ? {
              ok: true,
              text:
                next === "published"
                  ? `「${row.title}」已經發佈，客戶看得到了。`
                  : `「${row.title}」收回成草稿，前台已經看不到。`,
            }
          : { ok: false, text: res.error ?? "改不動" },
      );
      if (res.ok) router.refresh();
    });
  }

  function togglePin(row: PostRecord) {
    startTransition(async () => {
      const res = await setPostPinnedAction(row.id, !row.pinned);
      if (!res.ok) setMsg({ ok: false, text: res.error ?? "改不動" });
      else router.refresh();
    });
  }

  function remove(row: PostRecord) {
    if (
      !window.confirm(
        `確定要刪掉「${row.title}」嗎？刪掉就找不回來了。\n\n只是不想給客戶看的話，按「收回」變成草稿就好。`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await deletePostAction(row.id);
      setMsg(res.ok ? { ok: true, text: `「${row.title}」已刪除。` } : { ok: false, text: res.error ?? "刪不掉" });
      if (res.ok) {
        setEditing(null);
        router.refresh();
      }
    });
  }

  const inputStyle: React.CSSProperties = {
    background: CIS.bgSoft,
    borderColor: CIS.cardBorder,
    color: CIS.text,
  };

  const busy = pending || uploading;

  function MsgLine({ compact }: { compact?: boolean }) {
    if (!msg) return null;
    return (
      <div
        className={styles.msg}
        style={{
          color: msg.ok ? CHIP.success.color : CHIP.danger.color,
          marginTop: compact ? 10 : 0,
          marginBottom: compact ? 0 : 14,
          lineHeight: 1.7,
        }}
      >
        {msg.ok ? "✓ " : "⚠️ "}
        {msg.text}
      </div>
    );
  }

  function renderForm() {
    const chars = postCharCount(form.body);
    const autoSummary = postExcerpt(form.body);
    return (
      <div ref={formRef}>
        <div className={styles.subtitle} style={{ color: CIS.text, margin: "0 0 12px", fontSize: 15 }}>
          {editing === "new"
            ? "寫一篇新的"
            : `正在編輯：${initial.find((r) => r.id === editing)?.title ?? "這篇文章"}`}
        </div>

        <div className={styles.formGrid}>
          <div className={styles.field}>
            <label className={styles.label} style={{ color: CIS.textSub }} htmlFor="post-category">
              分類
            </label>
            <select
              id="post-category"
              className={styles.select}
              style={inputStyle}
              value={form.category}
              onChange={(e) => set("category", e.target.value as PostCategory)}
            >
              {POST_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {POST_CATEGORY_META[c].label}
                </option>
              ))}
            </select>
            <div className={styles.hint} style={{ color: CIS.textMute }}>
              前台上面那排切換照這個分。政策、成數、稅制異動走「房市快訊」；教人怎麼做的走「房產知識」。
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} style={{ color: CIS.textSub }} htmlFor="post-status">
              狀態
            </label>
            <select
              id="post-status"
              className={styles.select}
              style={inputStyle}
              value={form.status}
              onChange={(e) => set("status", e.target.value as PostStatus)}
            >
              <option value="draft">草稿（客戶看不到）</option>
              <option value="published">已發佈（客戶看得到）</option>
            </select>
            <div className={styles.hint} style={{ color: CIS.textMute }}>
              草稿只有你看得到，網址也打不開。改成「已發佈」再存檔，前台立刻就有。
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} style={{ color: CIS.textSub }} htmlFor="post-date">
              對外顯示的日期
            </label>
            <input
              id="post-date"
              type="date"
              className={styles.input}
              style={inputStyle}
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
            />
            <div className={styles.hint} style={{ color: CIS.textMute }}>
              列表照這個日期排（新的在前）。補舊文章時記得改成當初的日期，不然它會佔著最上面。
            </div>
          </div>

          <div className={`${styles.field} ${styles.fieldWide}`}>
            <label className={styles.label} style={{ color: CIS.textSub }} htmlFor="post-title">
              標題
            </label>
            <input
              id="post-title"
              className={styles.input}
              style={inputStyle}
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="例：第二戶房貸放寬到 7 成，換屋族的自備款壓力差多少？"
            />
            <div className={styles.hint} style={{ color: CIS.textMute }}>
              客戶在 Google 跟 LINE 預覽看到的就是這一行。用他們會打出來的字（區域名、房貸、成數），
              不要用「重磅」「震撼」這種標題黨。目前 {form.title.trim().length} 字，建議 30 字內。
            </div>
          </div>

          <div className={`${styles.field} ${styles.fieldWide}`}>
            <label className={styles.label} style={{ color: CIS.textSub }} htmlFor="post-summary">
              摘要（可留白）
            </label>
            <textarea
              id="post-summary"
              className={styles.textarea}
              style={{ ...inputStyle, minHeight: 70 }}
              value={form.summary}
              onChange={(e) => set("summary", e.target.value)}
              placeholder="列表卡片與 LINE 連結預覽會顯示這段。留白的話系統自己從內文開頭截。"
            />
            <div className={styles.hint} style={{ color: CIS.textMute }}>
              留白會自動用：「{autoSummary || "（內文還是空的）"}」
            </div>
          </div>

          <div className={`${styles.field} ${styles.fieldWide}`}>
            <label className={styles.label} style={{ color: CIS.textSub }} htmlFor="post-body">
              內文
            </label>
            <textarea
              id="post-body"
              className={styles.textarea}
              style={{ ...inputStyle, minHeight: 320, lineHeight: 1.9 }}
              value={form.body}
              onChange={(e) => set("body", e.target.value)}
              placeholder={"從 FB 貼文或 ChatGPT 直接複製貼上就好，換行會照你貼的樣子呈現。\n\n【這樣寫會變成小標】\n- 這樣寫會變成項目符號\n**這樣寫會變粗體**，網址貼上去會自動變連結。"}
            />
            <div className={styles.hint} style={{ color: CIS.textMute }}>
              共 {chars} 字。<b style={{ color: CIS.textSub }}>你怎麼換行，前台就怎麼換行</b> —— 不會被合併成一整段，
              emoji 開頭的行也會照原樣排。下面的預覽跟前台是同一套排版，以它為準。
            </div>
          </div>

          <div className={`${styles.field} ${styles.fieldWide}`}>
            <span className={styles.label} style={{ color: CIS.textSub }}>
              封面圖
            </span>
            <div className={styles.photoAddRow}>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => pickCover(e.target.files)}
              />
              <button
                type="button"
                className={styles.btn}
                style={{ borderColor: CIS.cardBorder, color: CIS.text }}
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                <Icon name="image" size={15} />
                {uploading ? "上傳中…" : form.coverUrl ? "換一張" : "選一張圖"}
              </button>
              {form.coverUrl ? (
                <button
                  type="button"
                  className={styles.btn}
                  style={{ borderColor: CIS.cardBorder, color: CIS.textMute }}
                  disabled={busy}
                  onClick={() => set("coverUrl", "")}
                >
                  <Icon name="trash" size={15} />
                  拿掉封面
                </button>
              ) : null}
            </div>
            {form.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={form.coverUrl}
                alt=""
                style={{ marginTop: 10, width: 260, borderRadius: 8, border: `1px solid ${CIS.cardBorder}` }}
              />
            ) : null}
            <div className={styles.hint} style={{ color: CIS.textMute }}>
              客戶把連結貼到 LINE／FB 時，預覽圖就是這張（建議 16:9，例如 1200×675）。
              沒有的話前台會畫一張帶標題的底板，不會破圖，但連結預覽就只有文字。
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} style={{ color: CIS.textSub }} htmlFor="post-source-name">
              原文出處名稱（可留白）
            </label>
            <input
              id="post-source-name"
              className={styles.input}
              style={inputStyle}
              value={form.sourceName}
              onChange={(e) => set("sourceName", e.target.value)}
              placeholder="例：經濟日報"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} style={{ color: CIS.textSub }} htmlFor="post-source-url">
              原文連結（可留白）
            </label>
            <input
              id="post-source-url"
              className={styles.input}
              style={inputStyle}
              value={form.sourceUrl}
              onChange={(e) => set("sourceUrl", e.target.value)}
              placeholder="https://…"
            />
            <div className={styles.hint} style={{ color: CIS.textMute }}>
              從新聞改寫的就附上來源，客戶想自己查得到。自己寫的知識文章留白就好。
            </div>
          </div>

          <div className={`${styles.field} ${styles.fieldWide}`}>
            <label
              className={styles.label}
              style={{ color: CIS.textSub, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
            >
              <input type="checkbox" checked={form.pinned} onChange={(e) => set("pinned", e.target.checked)} />
              置頂（永遠排在最前面）
            </label>
          </div>
        </div>

        {/* ---------- 預覽：跟前台同一支渲染 ---------- */}
        <div style={{ marginTop: 18 }}>
          <div className={styles.subtitle} style={{ color: CIS.textSub, margin: "0 0 8px", fontSize: 14 }}>
            前台長這樣（這塊跟客戶看到的是同一套排版）
          </div>
          <div
            style={{
              background: "#fff",
              color: "#22323F",
              borderRadius: 12,
              padding: "22px 24px",
              maxHeight: 460,
              overflow: "auto",
            }}
          >
            <h2 style={{ margin: "0 0 10px", fontSize: 24, fontWeight: 900, lineHeight: 1.45 }}>
              {form.title.trim() || "（還沒有標題）"}
            </h2>
            {form.summary.trim() ? <p className={nw.articleLead}>{form.summary.trim()}</p> : null}
            {form.body.trim() ? (
              <PostBody body={form.body} className={nw.body} />
            ) : (
              <p style={{ color: "#5B6B73" }}>（內文還是空的）</p>
            )}
          </div>
        </div>

        <div className={styles.formActions}>
          <button
            type="button"
            className={styles.btn}
            style={{ borderColor: CIS.blue, background: CIS.blue, color: "#fff" }}
            disabled={busy}
            onClick={save}
          >
            <Icon name="save" size={15} />
            {uploading ? "等封面圖上傳完…" : pending ? "存檔中…" : "存檔"}
          </button>
          <button
            type="button"
            className={styles.btn}
            style={{ borderColor: CIS.cardBorder, color: CIS.textSub }}
            disabled={busy}
            onClick={closeForm}
          >
            取消
          </button>
          {/* 訊息貼在按鈕旁邊 —— 內文欄位很長，只放頁面最上面的話等於看不到 */}
          <MsgLine compact />
        </div>
      </div>
    );
  }

  return (
    <>
      <MsgLine />

      <div className={styles.summaryRow}>
        {(["all", "published", "draft"] as StatusFilter[]).map((key) => (
          <button
            key={key}
            type="button"
            className={styles.summary}
            style={{
              background: filter === key ? CIS.cardHover : CIS.card,
              borderColor: filter === key ? CIS.blue : CIS.cardBorder,
              cursor: "pointer",
              textAlign: "left",
            }}
            onClick={() => setFilter(key)}
          >
            <div className={styles.summaryLabel} style={{ color: CIS.textMute }}>
              {STATUS_FILTER_LABEL[key]}
            </div>
            <div className={styles.summaryValue} style={{ color: CIS.text }}>
              {counts[key]}
            </div>
          </button>
        ))}
      </div>

      <button
        type="button"
        className={styles.btn}
        style={{ borderColor: CIS.cardBorder, color: CIS.text, margin: "16px 0" }}
        onClick={openNew}
        disabled={editing === "new"}
      >
        <Icon name="add" size={15} />
        寫一篇新的
      </button>

      {editing === "new" ? (
        <div className={styles.form} style={{ background: CIS.card, borderColor: CIS.blue, marginBottom: 16 }}>
          {renderForm()}
        </div>
      ) : null}

      <div className={styles.list}>
        {initial.length === 0 ? (
          <div className={styles.notice} style={{ borderColor: CIS.cardBorder, color: CIS.textMute }}>
            還沒有任何文章。按上面的「寫一篇新的」，或到「待產文案」把改寫好的稿按「放到前台」。
          </div>
        ) : null}

        {rows.length === 0 && initial.length > 0 ? (
          <div className={styles.notice} style={{ borderColor: CIS.cardBorder, color: CIS.textMute }}>
            這個狀態底下沒有文章。
          </div>
        ) : null}

        {rows.map((row) => {
          if (editing === row.id) {
            return (
              <div key={row.id} className={styles.form} style={{ background: CIS.card, borderColor: CIS.blue }}>
                {renderForm()}
              </div>
            );
          }

          const draft = row.status === "draft";
          return (
            <div
              key={row.id}
              className={`${styles.row}${draft ? ` ${styles.rowSold}` : ""}`}
              style={{ background: CIS.card, borderColor: CIS.cardBorder }}
            >
              {row.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className={styles.thumb} src={row.coverUrl} alt="" width={132} height={88} />
              ) : (
                <div className={`${styles.thumb} ${styles.thumbEmpty}`} style={{ color: CIS.textMute }}>
                  沒有封面圖
                </div>
              )}

              <div className={styles.rowBody}>
                <div className={styles.rowHead}>
                  <h2 className={styles.rowTitle}>{row.title}</h2>
                  <span
                    className={styles.chip}
                    style={{
                      background: row.category === "knowledge" ? CHIP.info.bg : CHIP.warn.bg,
                      borderColor: row.category === "knowledge" ? CHIP.info.border : CHIP.warn.border,
                      color: row.category === "knowledge" ? CHIP.info.color : CHIP.warn.color,
                    }}
                  >
                    {POST_CATEGORY_META[row.category].label}
                  </span>
                  <span
                    className={styles.chip}
                    style={{
                      background: draft ? CHIP.neutral.bg : CHIP.success.bg,
                      borderColor: draft ? CHIP.neutral.border : CHIP.success.border,
                      color: draft ? CHIP.neutral.color : CHIP.success.color,
                    }}
                  >
                    {POST_STATUS_LABEL[row.status]}
                  </span>
                  {row.pinned ? (
                    <span
                      className={styles.chip}
                      style={{ background: CHIP.warn.bg, borderColor: CHIP.warn.border, color: CHIP.warn.color }}
                    >
                      📌 置頂
                    </span>
                  ) : null}
                </div>

                <div className={styles.rowMeta} style={{ color: CIS.textMute }}>
                  {row.publishedAt.slice(0, 10)}
                  　·　/news/{row.slug}
                  {row.taskId ? "　·　來自待產文案" : ""}
                </div>

                <p className={styles.points} style={{ listStyle: "none", paddingLeft: 0, color: CIS.textSub }}>
                  {row.summary.trim() || postExcerpt(row.body)}
                </p>

                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.btn}
                    style={{ borderColor: CIS.cardBorder, color: CIS.text }}
                    disabled={busy}
                    onClick={() => openEdit(row)}
                  >
                    <Icon name="edit" size={15} />
                    編輯
                  </button>

                  <button
                    type="button"
                    className={styles.btn}
                    style={{
                      borderColor: draft ? CHIP.success.border : CIS.cardBorder,
                      color: draft ? CHIP.success.color : CIS.textSub,
                    }}
                    disabled={busy}
                    onClick={() => publish(row, draft ? "published" : "draft")}
                  >
                    <Icon name={draft ? "rocket" : "bounce"} size={15} />
                    {draft ? "發佈到前台" : "收回成草稿"}
                  </button>

                  <button
                    type="button"
                    className={styles.btn}
                    style={{ borderColor: CIS.cardBorder, color: row.pinned ? CHIP.warn.color : CIS.textSub }}
                    disabled={busy}
                    onClick={() => togglePin(row)}
                  >
                    <Icon name="pin" size={15} />
                    {row.pinned ? "取消置頂" : "置頂"}
                  </button>

                  {row.status === "published" ? (
                    <Link
                      className={styles.btn}
                      style={{ borderColor: CIS.cardBorder, color: CIS.textSub }}
                      href={`/news/${row.slug}`}
                      target="_blank"
                    >
                      <Icon name="externalLink" size={15} />
                      看前台
                    </Link>
                  ) : null}

                  <span className={styles.spacer} />

                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnIcon}`}
                    style={{ borderColor: CHIP.danger.border, color: CHIP.danger.color }}
                    disabled={busy}
                    onClick={() => remove(row)}
                    title="刪除"
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

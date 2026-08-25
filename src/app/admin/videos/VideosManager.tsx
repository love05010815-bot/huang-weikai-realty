"use client";

/**
 * 影音後台的清單與表單。
 *
 * 樣式沿用精選好案那一份（`listings-admin.module.css`）—— 兩頁的操作長得一樣，
 * 各做一套只會讓後台看起來像兩個不同的系統。
 * ⚠️ 改那份 CSS 會同時影響精選好案與這一頁。
 *
 * 分類是「先分區、區內再排序」：上下移只跟同分類的鄰居換，
 * 不然按一下上移會跳到別的分類去，看起來像壞掉。
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CIS } from "@/app/admin/_components/cis";
import { Icon } from "@/app/admin/_ui/icons";
import {
  CATEGORY_META,
  VIDEO_CATEGORIES,
  parseYoutubeId,
  youtubeThumbnail,
  type VideoCategory,
  type VideoRecord,
  type VideoStatus,
} from "@/lib/videos";
import {
  deleteVideoAction,
  moveVideoAction,
  saveVideoAction,
  setVideoStatusAction,
} from "@/lib/actions/videos";
import styles from "@/app/admin/listings/listings-admin.module.css";

type FormState = {
  category: VideoCategory;
  title: string;
  url: string;
  summary: string;
  status: VideoStatus;
};

const emptyForm: FormState = {
  category: "knowledge",
  title: "",
  url: "",
  summary: "",
  status: "active",
};

const inputStyle = {
  background: CIS.bg,
  borderColor: CIS.cardBorder,
  color: CIS.text,
};

export default function VideosManager({ initial }: { initial: VideoRecord[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  function openNew() {
    setForm(emptyForm);
    setEditing("new");
    setMsg(null);
  }

  function openEdit(row: VideoRecord) {
    setForm({
      category: row.category,
      title: row.title,
      url: row.url,
      summary: row.summary,
      status: row.status,
    });
    setEditing(row.id);
    setMsg(null);
  }

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) {
    setBusy(key);
    setMsg(null);
    const res = await fn();
    setBusy(null);
    if (res.ok) {
      setMsg({ ok: true, text: okText });
      router.refresh();
    } else {
      setMsg({ ok: false, text: res.error || "沒成功，再試一次" });
    }
    return res.ok;
  }

  async function save() {
    const id = editing === "new" ? null : editing;
    const ok = await run("save", () => saveVideoAction(id, form), "存好了，前台已經變了");
    if (ok) setEditing(null);
  }

  // 貼上網址當下就告訴你認不認得出來 —— 存完才發現嵌不進去太晚了
  const previewId = parseYoutubeId(form.url);

  return (
    <>
      {msg ? (
        <div
          className={styles.msg}
          style={
            msg.ok
              ? { background: "rgba(34,197,94,.12)", borderColor: "rgba(34,197,94,.35)", color: "#4ade80" }
              : { background: "rgba(244,63,94,.1)", borderColor: "rgba(244,63,94,.35)", color: "#fb7185" }
          }
        >
          {msg.text}
        </div>
      ) : null}

      {editing === null ? (
        <button
          type="button"
          className={styles.btn}
          style={{ borderColor: CIS.cardBorder, color: CIS.text, marginBottom: 16 }}
          onClick={openNew}
        >
          <Icon name="add" size={15} />
          新增影片
        </button>
      ) : (
        <div className={styles.form} style={{ background: CIS.card, borderColor: CIS.cardBorder }}>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label className={styles.label} style={{ color: CIS.textSub }} htmlFor="vid-category">
                分類
              </label>
              <select
                id="vid-category"
                className={styles.select}
                style={inputStyle}
                value={form.category}
                onChange={(e) => set("category", e.target.value as VideoCategory)}
              >
                {VIDEO_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_META[c].label}
                  </option>
                ))}
              </select>
              <div className={styles.hint} style={{ color: CIS.textMute }}>
                前台是分成兩區顯示的，選錯就會出現在另一區。
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label} style={{ color: CIS.textSub }} htmlFor="vid-status">
                狀態
              </label>
              <select
                id="vid-status"
                className={styles.select}
                style={inputStyle}
                value={form.status}
                onChange={(e) => set("status", e.target.value as VideoStatus)}
              >
                <option value="active">上架中</option>
                <option value="hidden">隱藏</option>
              </select>
              <div className={styles.hint} style={{ color: CIS.textMute }}>
                隱藏＝留著資料但客戶看不到，之後想放回來不用重打。
              </div>
            </div>

            <div className={`${styles.field} ${styles.fieldWide}`}>
              <label className={styles.label} style={{ color: CIS.textSub }} htmlFor="vid-title">
                標題
              </label>
              <input
                id="vid-title"
                className={styles.input}
                style={inputStyle}
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="例：買房前一定要知道的三件事"
              />
            </div>

            <div className={`${styles.field} ${styles.fieldWide}`}>
              <label className={styles.label} style={{ color: CIS.textSub }} htmlFor="vid-url">
                影片網址
              </label>
              <input
                id="vid-url"
                className={styles.input}
                style={inputStyle}
                value={form.url}
                onChange={(e) => set("url", e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
              />
              <div className={styles.hint} style={{ color: CIS.textMute }}>
                {form.url.trim() === "" ? (
                  "YouTube 的 watch、youtu.be、Shorts 三種網址都認得。FB／IG 的也可以貼。"
                ) : previewId ? (
                  <span style={{ color: "#4ade80" }}>
                    ✓ 認出 YouTube 影片（{previewId}），前台可以直接播，縮圖自動有
                  </span>
                ) : (
                  <span style={{ color: "#fbbf24" }}>
                    ⚠️ 不是 YouTube 網址（或格式不對）。還是可以存，但前台嵌不進來 ——
                    卡片會變成「點了開新分頁」，也沒有縮圖。
                  </span>
                )}
              </div>
            </div>

            <div className={`${styles.field} ${styles.fieldWide}`}>
              <label className={styles.label} style={{ color: CIS.textSub }} htmlFor="vid-summary">
                一句話說明（可留空）
              </label>
              <textarea
                id="vid-summary"
                className={styles.textarea}
                style={inputStyle}
                rows={2}
                value={form.summary}
                onChange={(e) => set("summary", e.target.value)}
                placeholder="這支影片在講什麼、看完能帶走什麼"
              />
            </div>

            {previewId ? (
              <div className={`${styles.field} ${styles.fieldWide}`}>
                <span className={styles.label} style={{ color: CIS.textSub }}>
                  縮圖預覽
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className={styles.previewThumb}
                  src={youtubeThumbnail(previewId)}
                  alt=""
                  width={320}
                  height={180}
                />
              </div>
            ) : null}
          </div>

          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.btn}
              style={{ borderColor: CIS.cardBorder, color: CIS.text }}
              onClick={save}
              disabled={busy === "save"}
            >
              <Icon name="save" size={15} />
              {busy === "save" ? "存檔中…" : "存檔"}
            </button>
            <button
              type="button"
              className={styles.btn}
              style={{ borderColor: CIS.cardBorder, color: CIS.textMute }}
              onClick={() => {
                setEditing(null);
                setMsg(null);
              }}
              disabled={busy === "save"}
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div className={styles.list}>
        {initial.length === 0 ? (
          <div className={styles.notice} style={{ borderColor: CIS.cardBorder, color: CIS.textMute }}>
            還沒有任何影片。按上面的「新增影片」貼一條 YouTube 網址就好。
          </div>
        ) : null}

        {VIDEO_CATEGORIES.map((category) => {
          const rows = initial.filter((r) => r.category === category);
          if (rows.length === 0) return null;
          return (
            <div key={category}>
              <div className={styles.subtitle} style={{ color: CIS.textSub, margin: "18px 0 8px" }}>
                {CATEGORY_META[category].label}（{rows.length}）
              </div>

              {rows.map((row, index) => {
                const hidden = row.status === "hidden";
                return (
                  <div
                    key={row.id}
                    className={`${styles.row}${hidden ? ` ${styles.rowSold}` : ""}`}
                    style={{ background: CIS.card, borderColor: CIS.cardBorder }}
                  >
                    <div className={styles.thumbWrap}>
                      {row.videoId ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className={styles.thumb} src={youtubeThumbnail(row.videoId)} alt="" width={160} height={90} />
                      ) : (
                        <div className={styles.thumbEmpty} style={{ color: CIS.textMute }}>
                          無縮圖
                        </div>
                      )}
                    </div>

                    <div className={styles.rowBody}>
                      <div className={styles.rowHead}>
                        <h2 className={styles.rowTitle}>{row.title}</h2>
                        {hidden ? (
                          <span
                            className={styles.chip}
                            style={{ background: "rgba(255,255,255,.06)", borderColor: CIS.cardBorder, color: CIS.textMute }}
                          >
                            隱藏中
                          </span>
                        ) : null}
                        {!row.videoId ? (
                          <span
                            className={styles.chip}
                            style={{ background: "rgba(245,158,11,.15)", borderColor: "rgba(245,158,11,.35)", color: "#fbbf24" }}
                          >
                            只能連出去
                          </span>
                        ) : null}
                      </div>

                      <div className={styles.rowMeta} style={{ color: CIS.textMute }}>
                        <a href={row.url} target="_blank" rel="noopener noreferrer" style={{ color: CIS.blueSoft }}>
                          {row.url.length > 60 ? `${row.url.slice(0, 60)}…` : row.url} ↗
                        </a>
                      </div>

                      {row.summary ? (
                        <ul className={styles.points} style={{ color: CIS.textSub }}>
                          <li>{row.summary}</li>
                        </ul>
                      ) : null}

                      <div className={styles.actions}>
                        <button
                          type="button"
                          className={styles.btn}
                          style={{ borderColor: CIS.cardBorder, color: CIS.text }}
                          onClick={() => openEdit(row)}
                        >
                          <Icon name="edit" size={15} />
                          編輯
                        </button>

                        <button
                          type="button"
                          className={styles.btn}
                          style={{ borderColor: CIS.cardBorder, color: CIS.textSub }}
                          disabled={busy === `status-${row.id}`}
                          onClick={() =>
                            run(
                              `status-${row.id}`,
                              () => setVideoStatusAction(row.id, hidden ? "active" : "hidden"),
                              hidden ? "已重新上架" : "已隱藏，客戶看不到了",
                            )
                          }
                        >
                          <Icon name={hidden ? "success" : "pause"} size={15} />
                          {hidden ? "重新上架" : "隱藏"}
                        </button>

                        <span className={styles.spacer} />

                        <button
                          type="button"
                          className={styles.btnIcon}
                          style={{ borderColor: CIS.cardBorder, color: CIS.textSub }}
                          aria-label="上移"
                          disabled={index === 0 || busy === `move-${row.id}`}
                          onClick={() => run(`move-${row.id}`, () => moveVideoAction(row.id, "up"), "順序改好了")}
                        >
                          <Icon name="chevronUp" size={15} />
                        </button>
                        <button
                          type="button"
                          className={styles.btnIcon}
                          style={{ borderColor: CIS.cardBorder, color: CIS.textSub }}
                          aria-label="下移"
                          disabled={index === rows.length - 1 || busy === `move-${row.id}`}
                          onClick={() => run(`move-${row.id}`, () => moveVideoAction(row.id, "down"), "順序改好了")}
                        >
                          <Icon name="chevronDown" size={15} />
                        </button>

                        <button
                          type="button"
                          className={styles.btnIcon}
                          style={{ borderColor: "rgba(244,63,94,.35)", color: "#fb7185" }}
                          aria-label="刪除"
                          disabled={busy === `del-${row.id}`}
                          onClick={() => {
                            // 影片不像物件 —— 物件成交要下架不能刪（怕查不到賣過什麼），
                            // 影片刪掉就刪掉。還是問一次，手滑的成本是要重打一次。
                            if (!window.confirm(`確定要刪掉「${row.title}」嗎？想留著以後再放的話按「隱藏」就好。`)) return;
                            void run(`del-${row.id}`, () => deleteVideoAction(row.id), "刪掉了");
                          }}
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}

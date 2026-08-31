"use client";

/**
 * 影音後台的清單與表單。
 *
 * 樣式沿用精選好案那一份（`listings-admin.module.css`）—— 兩頁的操作長得一樣，
 * 各做一套只會讓後台看起來像兩個不同的系統。
 * ⚠️ 改那份 CSS 會同時影響精選好案與這一頁。
 *
 * ⚠️ 2026-08-26 拿掉了上移／下移箭頭：排序改成只看「影片日期」由新到舊，
 * 交換 sort_order 已經不會改變任何順序，留著就是一顆按了沒反應的按鈕。
 */

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { CIS } from "@/app/admin/_components/cis";
import { Icon } from "@/app/admin/_ui/icons";
import {
  ALLOWED_VIDEO_TYPES,
  CATEGORY_META,
  MAX_VIDEO_UPLOAD_BYTES,
  VIDEO_CATEGORIES,
  parseYoutubeId,
  youtubeThumbnail,
  type VideoCategory,
  type VideoRecord,
  type VideoSource,
  type VideoStatus,
} from "@/lib/videos";
import {
  deleteVideoAction,
  saveVideoAction,
  setVideoPinnedAction,
  setVideoStatusAction,
} from "@/lib/actions/videos";
import type { VideoViewStats } from "@/lib/video-views";
import styles from "@/app/admin/listings/listings-admin.module.css";

type FormState = {
  category: VideoCategory;
  title: string;
  url: string;
  source: VideoSource;
  posterUrl: string;
  bytes: number | null;
  summary: string;
  publishedAt: string;
  status: VideoStatus;
};

/** 台北時間的今天，`YYYY-MM-DD`（新增影片時的預設日期） */
function todayTaipei(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const emptyForm: FormState = {
  category: "knowledge",
  title: "",
  url: "",
  source: "youtube",
  posterUrl: "",
  bytes: null,
  summary: "",
  publishedAt: "",
  status: "active",
};

const MAX_MB = Math.round(MAX_VIDEO_UPLOAD_BYTES / 1024 / 1024);

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

/**
 * 在瀏覽器端從影片檔截一張封面圖。
 *
 * 為什麼要截：前台的 `<video>` 用 `preload="none"`，**沒人按播放就一個 byte
 * 都不下載**（Hobby 方案的流量額度很有限，這是最有效的一道保護）。
 * 但那樣就沒有畫面可看了，所以要有一張封面圖頂著。
 *
 * ⚠️ 順帶還有一個好處：**這裡截不出來，代表瀏覽器根本解不了這個檔**
 * （最常見是 iPhone 直出的 HEVC .mov）。客戶的瀏覽器多半也播不了 ——
 * 在上傳當下就發現，比等客戶回報「影片不會動」好太多。
 */
async function capturePoster(file: File): Promise<Blob | null> {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  video.src = objectUrl;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("decode-failed"));
      window.setTimeout(() => reject(new Error("timeout")), 15000);
    });

    // 第 0 秒常常是黑畫面或轉場，往後跳一點比較有東西看
    const target = Number.isFinite(video.duration) && video.duration > 2 ? 1 : 0;
    if (target > 0) {
      video.currentTime = target;
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
        window.setTimeout(resolve, 3000);
      });
    }

    if (!video.videoWidth || !video.videoHeight) return null;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
    video.removeAttribute("src");
    video.load();
  }
}

const inputStyle = {
  background: CIS.bg,
  borderColor: CIS.cardBorder,
  color: CIS.text,
};

export default function VideosManager({
  initial,
  viewStats,
}: {
  initial: VideoRecord[];
  /** 👁 每支影片的播放次數。讀不到時是空物件，每一列顯示 0，不是錯誤 */
  viewStats: VideoViewStats;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadNote, setUploadNote] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  /**
   * 選了檔案之後：先截封面圖 → 傳影片 → 傳封面圖 → 把兩個網址填回表單。
   *
   * ⚠️ 檔案是**從瀏覽器直接傳到 Vercel Blob**，不經過我們的 API ——
   * serverless function 的 request body 上限是 4.5MB，影片一定過不去。
   */
  async function onPickFile(file: File | undefined) {
    if (!file) return;
    setUploadNote(null);
    setMsg(null);

    if (file.size > MAX_VIDEO_UPLOAD_BYTES) {
      setUploadNote({
        ok: false,
        text: `這個檔 ${formatBytes(file.size)}，超過 ${MAX_MB}MB 上限。先用手機或剪輯軟體壓過再傳（1080p 就夠了，不用 4K）。`,
      });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    setUploading(true);
    setProgress(0);
    try {
      // 先截封面。截不出來代表瀏覽器解不了這個檔 —— 那客戶多半也播不了，
      // 這時候擋下來比傳上去之後才發現好。
      const poster = await capturePoster(file);
      if (!poster) {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = "";
        setUploadNote({
          ok: false,
          text: "瀏覽器讀不出這個影片檔的畫面（最常見是 iPhone 直出的 HEVC .mov）。客戶的瀏覽器多半也播不了，先轉成 MP4（H.264）再上傳。",
        });
        return;
      }

      const videoBlob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/admin/videos/upload",
        clientPayload: "video",
        onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
      });

      const posterBlob = await upload(`${file.name}.poster.jpg`, poster, {
        access: "public",
        handleUploadUrl: "/api/admin/videos/upload",
        clientPayload: "poster",
      });

      setForm((prev) => ({
        ...prev,
        source: "upload",
        url: videoBlob.url,
        posterUrl: posterBlob.url,
        bytes: file.size,
        // 標題還空著的話，拿檔名當預設 —— 他多半會再改，但總比空白好
        title: prev.title || file.name.replace(/\.[^.]+$/, ""),
      }));
      setUploadNote({ ok: true, text: `上傳完成（${formatBytes(file.size)}），封面圖也抓好了。下面填標題、選分類再按存檔。` });
    } catch (e) {
      setUploadNote({ ok: false, text: `上傳失敗：${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  function openNew() {
    setForm({ ...emptyForm, publishedAt: todayTaipei() });
    setEditing("new");
    setMsg(null);
    setUploadNote(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function openEdit(row: VideoRecord) {
    setForm({
      category: row.category,
      title: row.title,
      url: row.url,
      source: row.source,
      posterUrl: row.posterUrl ?? "",
      bytes: row.bytes,
      summary: row.summary,
      publishedAt: row.publishedAt,
      status: row.status,
    });
    setEditing(row.id);
    setMsg(null);
    setUploadNote(null);
    if (fileRef.current) fileRef.current.value = "";
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

  // 貼上網址當下就告訴你認不認得出來 —— 存完才發現嵌不進去太晚了。
  // 自己上傳的檔案不是 YouTube，不要拿去解析（解不出來，而且會誤報警告）。
  const previewId = form.source === "youtube" ? parseYoutubeId(form.url) : null;

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
                前台側欄的「影片類別」照這個分，選錯就會被歸到另一類。
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

            <div className={styles.field}>
              <label className={styles.label} style={{ color: CIS.textSub }} htmlFor="vid-date">
                影片日期
              </label>
              <input
                id="vid-date"
                type="date"
                className={styles.input}
                style={inputStyle}
                value={form.publishedAt}
                onChange={(e) => set("publishedAt", e.target.value)}
              />
              <div className={styles.hint} style={{ color: CIS.textMute }}>
                前台會顯示這個日期，側欄「最新影片」也照這個排。
                補上舊片時記得改成當初拍的日期，不然它會變成「最新」。
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
              <span className={styles.label} style={{ color: CIS.textSub }}>
                影片從哪裡來
              </span>
              <div className={styles.actions} style={{ marginTop: 4 }}>
                {(
                  [
                    ["youtube", "貼網址（YouTube／FB／IG）"],
                    ["upload", "從電腦上傳檔案"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={styles.btn}
                    style={
                      form.source === value
                        ? { borderColor: CIS.blueSoft, color: CIS.text, background: "rgba(238,130,138,.12)" }
                        : { borderColor: CIS.cardBorder, color: CIS.textMute }
                    }
                    disabled={uploading}
                    onClick={() => {
                      // 換來源就把上一個來源填的東西清掉 ——
                      // 留著的話會出現「選了上傳、但存進去的是 YouTube 網址」這種對不上的資料
                      setForm((prev) => ({ ...prev, source: value, url: "", posterUrl: "", bytes: null }));
                      setUploadNote(null);
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {form.source === "youtube" ? (
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
            ) : (
              <div className={`${styles.field} ${styles.fieldWide}`}>
                <label className={styles.label} style={{ color: CIS.textSub }} htmlFor="vid-file">
                  影片檔（最大 {MAX_MB}MB）
                </label>
                <input
                  id="vid-file"
                  ref={fileRef}
                  type="file"
                  className={styles.input}
                  style={inputStyle}
                  accept={ALLOWED_VIDEO_TYPES.join(",")}
                  disabled={uploading}
                  onChange={(e) => void onPickFile(e.target.files?.[0])}
                />
                {uploading ? (
                  <div className={styles.hint} style={{ color: CIS.textSub }}>
                    上傳中… {progress}%（檔案是直接傳到儲存空間的，這個分頁先別關）
                  </div>
                ) : null}
                {uploadNote ? (
                  <div className={styles.hint} style={{ color: uploadNote.ok ? "#4ade80" : "#fbbf24" }}>
                    {uploadNote.ok ? "✓ " : "⚠️ "}
                    {uploadNote.text}
                  </div>
                ) : null}
                {!uploading && !uploadNote && form.url ? (
                  <div className={styles.hint} style={{ color: "#4ade80" }}>
                    ✓ 已經有影片檔了{form.bytes ? `（${formatBytes(form.bytes)}）` : ""}。
                    要換一支就重新選檔案。
                  </div>
                ) : null}
                <div className={styles.hint} style={{ color: CIS.textMute }}>
                  <b>建議 MP4（H.264）、1080p 就夠。</b>
                  iPhone 直出的 .mov 常常是 HEVC，很多瀏覽器播不了 —— 傳之前先轉一下。
                  <br />
                  ⚠️ 自己上傳的影片會吃 Vercel 的儲存與流量額度。
                  <b>超過額度不會多收錢，但整個檔案儲存會停用 30 天，精選好案的照片會一起消失。</b>
                  影片多的話建議傳到 YouTube（可以設「不公開」，不會被搜尋到）再貼網址。
                </div>
              </div>
            )}

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

            {previewId || form.posterUrl ? (
              <div className={`${styles.field} ${styles.fieldWide}`}>
                <span className={styles.label} style={{ color: CIS.textSub }}>
                  {previewId ? "縮圖預覽" : "封面預覽（從影片第 1 秒截的）"}
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className={styles.previewThumb}
                  src={previewId ? youtubeThumbnail(previewId) : form.posterUrl}
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
              disabled={busy === "save" || uploading}
            >
              <Icon name="save" size={15} />
              {uploading ? "等上傳完成…" : busy === "save" ? "存檔中…" : "存檔"}
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

              {rows.map((row) => {
                const hidden = row.status === "hidden";
                return (
                  <div
                    key={row.id}
                    className={`${styles.row}${hidden ? ` ${styles.rowSold}` : ""}`}
                    style={{ background: CIS.card, borderColor: CIS.cardBorder }}
                  >
                    <div className={styles.thumbWrap}>
                      {row.videoId || row.posterUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          className={styles.thumb}
                          src={row.videoId ? youtubeThumbnail(row.videoId) : row.posterUrl!}
                          alt=""
                          width={160}
                          height={90}
                        />
                      ) : (
                        <div className={styles.thumbEmpty} style={{ color: CIS.textMute }}>
                          無縮圖
                        </div>
                      )}
                    </div>

                    <div className={styles.rowBody}>
                      <div className={styles.rowHead}>
                        <h2 className={styles.rowTitle}>{row.title}</h2>
                        {row.pinned ? (
                          <span
                            className={styles.chip}
                            style={{ background: "rgba(245,158,11,.15)", borderColor: "rgba(245,158,11,.4)", color: "#fbbf24" }}
                          >
                            📌 置頂
                          </span>
                        ) : null}
                        {hidden ? (
                          <span
                            className={styles.chip}
                            style={{ background: "rgba(255,255,255,.06)", borderColor: CIS.cardBorder, color: CIS.textMute }}
                          >
                            隱藏中
                          </span>
                        ) : null}
                        {row.source === "upload" ? (
                          <span
                            className={styles.chip}
                            style={{ background: "rgba(238,130,138,.16)", borderColor: "rgba(238,130,138,.4)", color: CIS.blueSoft }}
                          >
                            自行上傳{row.bytes ? ` ${formatBytes(row.bytes)}` : ""}
                          </span>
                        ) : !row.videoId ? (
                          <span
                            className={styles.chip}
                            style={{ background: "rgba(245,158,11,.15)", borderColor: "rgba(245,158,11,.35)", color: "#fbbf24" }}
                          >
                            只能連出去
                          </span>
                        ) : null}
                      </div>

                      <div className={styles.rowMeta} style={{ color: CIS.textMute }}>
                        {row.publishedAt}
                        {" ・ "}
                        <a href={row.url} target="_blank" rel="noopener noreferrer" style={{ color: CIS.blueSoft }}>
                          {row.url.length > 52 ? `${row.url.slice(0, 52)}…` : row.url} ↗
                        </a>
                      </div>

                      {/* 👁 播放次數。算的是「按下播放」不是「看到縮圖」——
                          捲過去看到十張縮圖的那個數字沒有意義（見 lib/video-views.ts）。
                          版型與數字的意思都跟精選好案的點擊統計一致（總數大字、近 7 天小字），
                          只是這裡只有一個指標，所以用單欄那個 class。 */}
                      <div
                        className={`${styles.clickStats} ${styles.clickStatsSingle}`}
                        style={{ borderColor: CIS.cardBorder }}
                      >
                        {(() => {
                          const stat = viewStats[row.id];
                          const total = stat?.total ?? 0;
                          const recent = stat?.recent ?? 0;
                          return (
                            <div className={styles.clickCell}>
                              <div className={styles.clickLabel} style={{ color: CIS.textMute }}>
                                播放次數
                              </div>
                              <div
                                className={styles.clickValue}
                                style={{ color: total > 0 ? "#60a5fa" : CIS.textMute }}
                              >
                                {total}
                                <span className={styles.clickUnit}>人次</span>
                              </div>
                              <div className={styles.clickRecent} style={{ color: CIS.textMute }}>
                                近 7 天 {recent}
                              </div>
                            </div>
                          );
                        })()}
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

                        {/* 置頂一鍵切換。刻意不放進編輯表單裡 ——
                            同一件事有兩個入口，改了一邊沒改另一邊就會對不上。 */}
                        <button
                          type="button"
                          className={styles.btn}
                          style={
                            row.pinned
                              ? { borderColor: "rgba(245,158,11,.4)", color: "#fbbf24" }
                              : { borderColor: CIS.cardBorder, color: CIS.textSub }
                          }
                          disabled={busy === `pin-${row.id}`}
                          onClick={() =>
                            run(
                              `pin-${row.id}`,
                              () => setVideoPinnedAction(row.id, !row.pinned),
                              row.pinned ? "已取消置頂" : "已置頂，這支會排在最前面",
                            )
                          }
                        >
                          <Icon name={row.pinned ? "star" : "bookmark"} size={15} />
                          {row.pinned ? "取消置頂" : "置頂"}
                        </button>

                        {/* ⚠️ 這裡本來有上移／下移兩顆箭頭，2026-08-26 拿掉了。
                            排序改成只看「影片日期」由新到舊之後，日期不同的兩支
                            交換 sort_order 根本不會改變順序 —— 按鈕按了畫面不動，
                            那比沒有按鈕更糟。要調順序就改那支影片的日期。 */}
                        <span className={styles.spacer} />

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

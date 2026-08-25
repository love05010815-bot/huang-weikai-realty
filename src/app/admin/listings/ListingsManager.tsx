"use client";
/**
 * 精選好案後台的操作介面。
 *
 * 一列一筆物件，展開就是編輯表單。所有動作走 server action，
 * 存完 router.refresh() 重讀 —— 不在前端自己拼湊結果假裝存好了，
 * 畫面上看到的一律是資料庫真的有的東西。
 *
 * ⚠️ 「成交／下架」用的是狀態切換不是刪除。刪除鈕留給建錯的資料，而且會再問一次。
 */
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { CIS, CHIP } from "@/app/admin/_components/cis";
import { Icon } from "@/app/admin/_ui/icons";
import { MAX_PHOTOS } from "@/config/listings";
import { findCopyRisks } from "@/lib/listing-copy-risk";
import { photoDisplayName, resolvePhotoSrc } from "@/lib/photo-src";
import type { ListingInput, ListingRecord, ListingStatus } from "@/lib/listings";
import type { ListingClickStats } from "@/lib/listing-clicks";
import styles from "./listings-admin.module.css";

type FormState = ListingInput & { pointsText: string };

/** 把第 from 張搬到第 to 張，回一份新陣列。越界就原封不動退回。 */
function movePhoto(photos: string[], from: number, to: number): string[] {
  if (to < 0 || to >= photos.length) return photos;
  const next = [...photos];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

const inputStyle: React.CSSProperties = {
  background: "#141414",
  borderColor: CIS.cardBorder,
  color: CIS.text,
};

function emptyForm(): FormState {
  // slug 只是內部識別字（對外網址不會用到），所以直接給一個能用的預設值，
  // 不要讓人卡在「這欄該填什麼」——想改再改。
  const suffix = Math.random().toString(36).slice(2, 8);
  return {
    slug: `listing-${suffix}`,
    title: "",
    points: [],
    pointsText: "",
    area: "",
    photos: [],
    linkLabel: "",
    linkHref: "",
    videoHref: "",
    status: "active",
  };
}

function toForm(row: ListingRecord): FormState {
  return {
    slug: row.slug,
    title: row.title,
    points: row.points,
    pointsText: row.points.join("\n"),
    area: row.area,
    photos: row.photos,
    linkLabel: "",
    linkHref: row.link?.href || "",
    videoHref: row.video?.href || "",
    status: row.status,
  };
}

export default function ListingsManager({
  initial,
  clickStats = {},
}: {
  initial: ListingRecord[];
  /** 每一筆物件被點過幾次。讀不到時是空物件，畫面顯示 0。 */
  clickStats?: ListingClickStats;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const openNew = () => {
    setForm(emptyForm());
    setEditing("new");
    setMsg(null);
  };

  const openEdit = (row: ListingRecord) => {
    setForm(toForm(row));
    setEditing(row.id);
    setMsg(null);
  };

  const run = async (key: string, fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) => {
    if (busy) return;
    setBusy(key);
    setMsg(null);
    const r = await fn();
    setBusy(null);
    if (r.ok) {
      setMsg({ ok: true, text: okText });
      router.refresh();
    } else {
      setMsg({ ok: false, text: r.error || "沒存成功，原因不明" });
    }
    return r;
  };

  const save = async () => {
    const { saveListingAction } = await import("@/lib/actions/listings");
    const payload: ListingInput = {
      slug: form.slug,
      title: form.title,
      area: form.area,
      // 一行一條賣點。空行自動丟掉，貼上來的時候常常多幾個換行。
      points: form.pointsText.split("\n").map((s) => s.trim()).filter(Boolean),
      photos: form.photos,
      linkLabel: form.linkLabel,
      linkHref: form.linkHref,
      videoHref: form.videoHref,
      status: form.status,
    };
    const r = await run(
      "save",
      () => saveListingAction(editing === "new" ? null : editing, payload),
      editing === "new" ? "已新增，網站上立刻看得到了" : "已儲存，網站上立刻就變了",
    );
    if (r?.ok) setEditing(null);
  };

  const toggleStatus = async (row: ListingRecord) => {
    const { setListingStatusAction } = await import("@/lib/actions/listings");
    const next: ListingStatus = row.status === "active" ? "sold" : "active";
    await run(
      `status-${row.id}`,
      () => setListingStatusAction(row.id, next),
      next === "sold" ? "已下架，網站上不再顯示" : "已重新上架",
    );
  };

  const move = async (row: ListingRecord, direction: "up" | "down") => {
    const { moveListingAction } = await import("@/lib/actions/listings");
    await run(`move-${row.id}`, () => moveListingAction(row.id, direction), "順序已更新");
  };

  const remove = async (row: ListingRecord) => {
    if (!window.confirm(`確定要「永久刪除」${row.title}？\n\n成交或下架請按「下架」就好，刪掉之後查不回來。`)) return;
    const { deleteListingAction } = await import("@/lib/actions/listings");
    await run(`del-${row.id}`, () => deleteListingAction(row.id), "已刪除");
  };

  const formRisks = findCopyRisks(form.title, form.pointsText);

  return (
    <>
      <div className={styles.actions} style={{ marginTop: 0, marginBottom: 16 }}>
        <button
          type="button"
          className={styles.btn}
          style={{ borderColor: CIS.blue, color: CIS.blue }}
          onClick={openNew}
          disabled={editing === "new"}
        >
          <Icon name="add" size={16} />
          新增物件
        </button>
        {msg ? (
          <span className={styles.msg} style={{ margin: 0, color: msg.ok ? "#4ade80" : "#fb7185" }}>
            {msg.text}
          </span>
        ) : null}
      </div>

      {editing === "new" ? (
        <div className={styles.form} style={{ background: CIS.card, borderColor: CIS.blue, marginBottom: 16 }}>
          <ListingForm
            form={form}
            setForm={setForm}

            risks={formRisks}
            busy={busy === "save"}
            onSave={save}
            onCancel={() => setEditing(null)}
            isNew
          />
        </div>
      ) : null}

      <div className={styles.list}>
        {initial.length === 0 ? (
          <div
            className={styles.notice}
            style={{ background: CIS.card, borderColor: CIS.cardBorder, color: CIS.textSub, margin: 0 }}
          >
            目前一筆物件都沒有。按上面的「新增物件」開始，或是把 <code>src/config/listings.ts</code>{" "}
            的種子重灌一次。
          </div>
        ) : null}

        {initial.map((row, index) => {
          const risks = findCopyRisks(row.title, ...row.points);
          const sold = row.status === "sold";
          const chip = sold ? CHIP.neutral : CHIP.success;

          if (editing === row.id) {
            return (
              <div key={row.id} className={styles.form} style={{ background: CIS.card, borderColor: CIS.blue }}>
                <ListingForm
                  form={form}
                  setForm={setForm}

                  risks={formRisks}
                  busy={busy === "save"}
                  onSave={save}
                  onCancel={() => setEditing(null)}
                />
              </div>
            );
          }

          return (
            <div
              key={row.id}
              className={`${styles.row}${sold ? ` ${styles.rowSold}` : ""}`}
              style={{ background: CIS.card, borderColor: CIS.cardBorder }}
            >
              {row.photos.length > 0 ? (
                <div className={styles.thumbWrap}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className={styles.thumb} src={resolvePhotoSrc(row.photos[0])} alt="" width={132} height={88} />
                  {/* 多張才標數量 —— 一張的時候標「1」是廢話 */}
                  {row.photos.length > 1 ? (
                    <span className={styles.thumbCount}>{row.photos.length} 張</span>
                  ) : null}
                </div>
              ) : (
                <div className={`${styles.thumb} ${styles.thumbEmpty}`} style={{ color: CIS.textMute }}>
                  照片
                  <br />
                  準備中
                </div>
              )}

              <div className={styles.rowBody}>
                <div className={styles.rowHead}>
                  <h2 className={styles.rowTitle}>{row.title}</h2>
                  <span
                    className={styles.chip}
                    style={{ background: chip.bg, borderColor: chip.border, color: chip.color }}
                  >
                    {sold ? "已下架" : "上架中"}
                  </span>
                  {risks.length > 0 ? (
                    <span
                      className={styles.chip}
                      style={{ background: CHIP.warn.bg, borderColor: CHIP.warn.border, color: CHIP.warn.color }}
                    >
                      <Icon name="warning" size={13} />
                      文案要注意
                    </span>
                  ) : null}
                </div>

                <div className={styles.rowMeta} style={{ color: CIS.textMute }}>
                  {row.area}
                  {row.link ? (
                    <>
                      {" ・ "}
                      <a href={row.link.href} target="_blank" rel="noopener noreferrer" style={{ color: CIS.blueSoft }}>
                        {row.link.label} ↗
                      </a>
                    </>
                  ) : null}
                </div>

                {/* 👆 點擊統計。四種動作分開看 ——「有人想看影片」跟「有人想約看」
                    是完全不同的情報，加總成一個數字就沒有用了。 */}
                <div className={styles.clickStats} style={{ borderColor: CIS.cardBorder }}>
                  {(() => {
                    const stat = clickStats[row.slug];
                    const cells: Array<[string, number, number, string]> = [
                      ["物件資訊", stat?.actions.link.total ?? 0, stat?.actions.link.recent ?? 0, CIS.textSub],
                      ["影片賞析", stat?.actions.video.total ?? 0, stat?.actions.video.recent ?? 0, CIS.textSub],
                      ["預約看屋", stat?.actions.booking.total ?? 0, stat?.actions.booking.recent ?? 0, "#4ade80"],
                    ];
                    return (
                      <>
                        {cells.map(([label, total, recent, color]) => (
                          <div key={label} className={styles.clickCell}>
                            <div className={styles.clickLabel} style={{ color: CIS.textMute }}>
                              {label}
                            </div>
                            <div className={styles.clickValue} style={{ color: total > 0 ? color : CIS.textMute }}>
                              {total}
                              <span className={styles.clickUnit}>人次</span>
                            </div>
                            <div className={styles.clickRecent} style={{ color: CIS.textMute }}>
                              近 7 天 {recent}
                            </div>
                          </div>
                        ))}
                      </>
                    );
                  })()}
                </div>

                {row.points.length > 0 ? (
                  <ul className={styles.points} style={{ color: CIS.textSub }}>
                    {row.points.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                ) : null}

                {risks.length > 0 ? (
                  <div
                    className={styles.riskBox}
                    style={{ background: CHIP.warn.bg, borderColor: CHIP.warn.border, color: "#fdba74" }}
                  >
                    {risks.map((risk) => (
                      <div key={risk.word}>
                        <b>{risk.word}</b>：{risk.why}
                      </div>
                    ))}
                  </div>
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
                    style={{ borderColor: CIS.cardBorder, color: sold ? "#4ade80" : "#fbbf24" }}
                    onClick={() => toggleStatus(row)}
                    disabled={busy === `status-${row.id}`}
                  >
                    <Icon name={sold ? "check" : "ban"} size={15} />
                    {sold ? "重新上架" : "成交／下架"}
                  </button>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnIcon}`}
                    style={{ borderColor: CIS.cardBorder, color: CIS.textSub }}
                    onClick={() => move(row, "up")}
                    disabled={index === 0 || busy === `move-${row.id}`}
                    aria-label="上移一位"
                  >
                    <Icon name="chevronUp" size={16} />
                  </button>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnIcon}`}
                    style={{ borderColor: CIS.cardBorder, color: CIS.textSub }}
                    onClick={() => move(row, "down")}
                    disabled={index === initial.length - 1 || busy === `move-${row.id}`}
                    aria-label="下移一位"
                  >
                    <Icon name="chevronDown" size={16} />
                  </button>
                  <span className={styles.spacer} />
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnIcon}`}
                    style={{ borderColor: "rgba(244,63,94,0.35)", color: "#fb7185" }}
                    onClick={() => remove(row)}
                    disabled={busy === `del-${row.id}`}
                    aria-label="永久刪除"
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

function ListingForm({
  form,
  setForm,
  risks,
  busy,
  onSave,
  onCancel,
  isNew,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  risks: ReturnType<typeof findCopyRisks>;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
  isNew?: boolean;
}) {
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const fileInputRef = useRef<HTMLInputElement>(null);
  // null = 這次是「加在後面」；數字 = 這次是「換掉第幾張」
  const replaceAtRef = useRef<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [brokenPhotos, setBrokenPhotos] = useState<Set<string>>(new Set());

  const markBroken = (file: string) =>
    setBrokenPhotos((prev) => (prev.has(file) ? prev : new Set(prev).add(file)));

  const pickFiles = ({ replaceAt }: { replaceAt: number | null }) => {
    replaceAtRef.current = replaceAt;
    const el = fileInputRef.current;
    if (!el) return;
    // 「換掉」一次只換一張，「加入」可以複選
    el.multiple = replaceAt === null;
    // 清掉上次的值，不然連續選同一個檔案不會觸發 change
    el.value = "";
    el.click();
  };

  const onFilesChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const replaceAt = replaceAtRef.current;
    const room = MAX_PHOTOS - (replaceAt === null ? form.photos.length : form.photos.length - 1);
    const take = files.slice(0, Math.max(0, room));
    if (take.length === 0) {
      setUploadMsg({ ok: false, text: `已經有 ${MAX_PHOTOS} 張了，要先移除幾張才能再加` });
      return;
    }

    setUploading(true);
    setUploadMsg(null);
    try {
      const body = new FormData();
      for (const f of take) body.append("file", f);

      const res = await fetch("/api/admin/listings/photo", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `上傳失敗（${res.status}）`);

      const urls: string[] = (data.uploaded || []).map((u: { url: string }) => u.url);
      const failed: Array<{ name: string; error: string }> = data.failed || [];

      if (urls.length > 0) {
        setForm((prev) => {
          const next = [...prev.photos];
          if (replaceAt === null) next.push(...urls);
          else next.splice(replaceAt, 1, urls[0]);
          return { ...prev, photos: next.slice(0, MAX_PHOTOS) };
        });
      }

      const skipped = files.length - take.length;
      const parts: string[] = [];
      if (urls.length > 0) {
        parts.push(replaceAt === null ? `已上傳 ${urls.length} 張` : "已換掉這張");
      }
      if (failed.length > 0) parts.push(`${failed.length} 張失敗：${failed.map((f) => `${f.name}（${f.error}）`).join("、")}`);
      if (skipped > 0) parts.push(`${skipped} 張超過上限沒收`);
      parts.push("記得按「儲存」才會真的寫進網站");

      setUploadMsg({ ok: failed.length === 0 && urls.length > 0, text: parts.join("；") });
    } catch (err) {
      setUploadMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setUploading(false);
      replaceAtRef.current = null;
    }
  };

  return (
    <>
      <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 14 }}>
        {isNew ? "新增物件" : "編輯物件"}
      </div>

      <div className={styles.formGrid}>
        <div className={styles.field}>
          <label className={styles.label} style={{ color: CIS.textSub }} htmlFor="lst-title">
            標題
          </label>
          <input
            id="lst-title"
            className={styles.input}
            style={inputStyle}
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="中高樓無限視野兩房平車"
          />
          <div className={styles.hint} style={{ color: CIS.textMute }}>
            一句話講完最大賣點，照你在 LINE 好案的寫法。
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} style={{ color: CIS.textSub }} htmlFor="lst-area">
            行政區＋社區名
          </label>
          <input
            id="lst-area"
            className={styles.input}
            style={inputStyle}
            value={form.area}
            onChange={(e) => set("area", e.target.value)}
            placeholder="清水區・聯悦聚"
          />
          <div className={styles.hint} style={{ color: CIS.textMute }}>
            會顯示在卡片上，也是在地搜尋的關鍵字。
          </div>
        </div>

        <div className={`${styles.field} ${styles.fieldWide}`}>
          <label className={styles.label} style={{ color: CIS.textSub }} htmlFor="lst-points">
            賣點（一行一條）
          </label>
          <textarea
            id="lst-points"
            className={styles.textarea}
            style={inputStyle}
            value={form.pointsText}
            onChange={(e) => set("pointsText", e.target.value)}
            placeholder={"無限棟距｜視野開闊\n主＋附 20 坪大兩房，配 B2 柱邊平車位"}
          />
          <div className={styles.hint} style={{ color: CIS.textMute }}>
            畫面上每一條前面會自動加符號，這裡不用自己打。最多 8 條。
            坪數、格局、屋況寫上去就要真實可查。
          </div>
        </div>

        <div className={`${styles.field} ${styles.fieldWide}`}>
          <label className={styles.label} style={{ color: CIS.textSub }}>
            照片
          </label>

          {form.photos.length > 0 ? (
            <ul className={styles.photoList}>
              {form.photos.map((file, i) => {
                // 圖載不出來（Blob 被刪掉、repo 舊檔被移走）就標紅留著，
                // 不自動清掉 —— 悄悄消失比留著一個看得見的警告更難查。
                const broken = brokenPhotos.has(file);
                return (
                  <li key={file} className={styles.photoItem} style={{ borderColor: CIS.cardBorder }}>
                    {broken ? (
                      <div
                        className={`${styles.photoItemThumb} ${styles.photoItemMissing}`}
                        style={{ color: CIS.textMute }}
                      >
                        載不到
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        className={styles.photoItemThumb}
                        src={resolvePhotoSrc(file)}
                        alt=""
                        width={72}
                        height={48}
                        onError={() => markBroken(file)}
                      />
                    )}
                    <span
                      className={styles.photoItemName}
                      style={{ color: broken ? "#fdba74" : CIS.text }}
                      title={file}
                    >
                      {photoDisplayName(file)}
                      {broken ? "（載不到）" : ""}
                    </span>
                    {i === 0 ? <span className={styles.photoCover}>封面</span> : null}
                    <div className={styles.photoItemBtns}>
                      <button
                        type="button"
                        className={styles.photoBtn}
                        style={{ borderColor: CIS.cardBorder, color: CIS.textSub }}
                        onClick={() => set("photos", movePhoto(form.photos, i, i - 1))}
                        disabled={i === 0 || uploading}
                        aria-label={`${photoDisplayName(file)} 往前一張`}
                        title="往前"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className={styles.photoBtn}
                        style={{ borderColor: CIS.cardBorder, color: CIS.textSub }}
                        onClick={() => set("photos", movePhoto(form.photos, i, i + 1))}
                        disabled={i === form.photos.length - 1 || uploading}
                        aria-label={`${photoDisplayName(file)} 往後一張`}
                        title="往後"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className={`${styles.photoBtn} ${styles.photoBtnWide}`}
                        style={{ borderColor: CIS.cardBorder, color: CIS.textSub }}
                        onClick={() => pickFiles({ replaceAt: i })}
                        disabled={uploading}
                        aria-label={`換掉 ${photoDisplayName(file)}`}
                        title="從電腦選一張換掉這張"
                      >
                        換掉
                      </button>
                      <button
                        type="button"
                        className={styles.photoBtn}
                        style={{ borderColor: CIS.cardBorder, color: "#f87171" }}
                        onClick={() => set("photos", form.photos.filter((_, n) => n !== i))}
                        disabled={uploading}
                        aria-label={`移除 ${photoDisplayName(file)}`}
                        title="從這筆物件移除"
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div
              className={styles.photoEmpty}
              style={{ color: CIS.textMute, borderColor: CIS.cardBorder }}
            >
              還沒有照片，前台會顯示「照片準備中」佔位塊（版面不會歪）。
            </div>
          )}

          {/* 真正的 file input 藏起來，用按鈕去戳它 —— 原生的樣子在後台很突兀，
              而且它的文字沒辦法改成中文 */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={onFilesChosen}
          />

          <div className={styles.photoAddRow}>
            <button
              type="button"
              className={`${styles.btn} ${styles.photoAddBtn}`}
              style={{ borderColor: CIS.cardBorder, color: CIS.text }}
              onClick={() => pickFiles({ replaceAt: null })}
              disabled={uploading || form.photos.length >= MAX_PHOTOS}
            >
              {uploading
                ? "上傳中…"
                : form.photos.length >= MAX_PHOTOS
                  ? `已達上限 ${MAX_PHOTOS} 張`
                  : "＋ 從電腦選照片"}
            </button>
            {uploading ? (
              <span style={{ color: CIS.textMute, fontSize: 13 }}>
                正在壓縮並上傳，大張的照片可能要幾秒鐘，先別關掉這頁
              </span>
            ) : null}
          </div>

          {uploadMsg ? (
            <div
              className={styles.msg}
              style={{
                marginTop: 10,
                background: uploadMsg.ok ? CHIP.success.bg : CHIP.warn.bg,
                borderColor: uploadMsg.ok ? CHIP.success.border : CHIP.warn.border,
                color: uploadMsg.ok ? CHIP.success.color : CHIP.warn.color,
              }}
            >
              {uploadMsg.text}
            </div>
          ) : null}

          <div className={styles.hint} style={{ color: CIS.textMute }}>
            <b>第一張是封面</b>，兩張以上前台卡片會自動變成可左右滑的相簿。用 ↑↓ 調順序，
            建議客廳 → 主臥 → 視野或外觀，最多 {MAX_PHOTOS} 張。
            上傳時會自動轉正、縮到 1600px、壓成 WebP，所以直接丟手機拍的原圖就好。
            <b>照片是存檔的時候才寫進資料庫的</b> —— 傳完記得按下面的「儲存」。
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} style={{ color: CIS.textSub }} htmlFor="lst-status">
            狀態
          </label>
          <select
            id="lst-status"
            className={styles.select}
            style={inputStyle}
            value={form.status}
            onChange={(e) => set("status", e.target.value === "sold" ? "sold" : "active")}
          >
            <option value="active">上架中（顯示在網站上）</option>
            <option value="sold">已成交／下架（不顯示）</option>
          </select>
          <div className={styles.hint} style={{ color: CIS.textMute }}>
            賣掉的物件還掛在網站上就是廣告不實，成交當下就改這裡。
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} style={{ color: CIS.textSub }} htmlFor="lst-link-href">
            「物件資訊」網址
          </label>
          <input
            id="lst-link-href"
            className={styles.input}
            style={inputStyle}
            value={form.linkHref}
            onChange={(e) => set("linkHref", e.target.value)}
            placeholder="https://www.591.com.tw/..."
          />
          <div className={styles.hint} style={{ color: CIS.textMute }}>
            物件詳情頁，例如 591。**留空這顆按鈕就不會出現**，不會在卡片上留空位。
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} style={{ color: CIS.textSub }} htmlFor="lst-video-href">
            「影片賞析」網址
          </label>
          <input
            id="lst-video-href"
            className={styles.input}
            style={inputStyle}
            value={form.videoHref}
            onChange={(e) => set("videoHref", e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
          />
          <div className={styles.hint} style={{ color: CIS.textMute }}>
            影片連結，例如 YouTube 或 FB 影片。**留空這顆按鈕就不會出現**。
            兩欄都留空，卡片上就只有「預約看屋」一顆。
            外部頁面下架之後連結會變死的，改物件時順手點一遍。
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} style={{ color: CIS.textSub }} htmlFor="lst-slug">
            識別字（slug）
          </label>
          <input
            id="lst-slug"
            className={styles.input}
            style={inputStyle}
            value={form.slug}
            onChange={(e) => set("slug", e.target.value)}
            placeholder="qingshui-lianyueju"
          />
          <div className={styles.hint} style={{ color: CIS.textMute }}>
            內部識別用，不會出現在對外網址。只能小寫英數與連字號，不能跟別筆重複。
          </div>
        </div>
      </div>

      {/* 上面的清單縮圖太小看不出裁切，這裡用卡片實際的 3:2 尺寸再放一次封面 */}
      {form.photos.length > 0 && !brokenPhotos.has(form.photos[0]) ? (
        <div className={styles.formPreview}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.previewThumb}
            src={resolvePhotoSrc(form.photos[0])}
            alt=""
            width={132}
            height={88}
            onError={() => markBroken(form.photos[0])}
          />
          <span style={{ color: CIS.textMute, fontSize: 13.5 }}>
            封面在卡片上是 3:2 裁切，比例不合會被切掉上下或左右。
            {form.photos.length > 1 ? `後面還有 ${form.photos.length - 1} 張，客戶可以左右滑。` : ""}
          </span>
        </div>
      ) : null}

      {risks.length > 0 ? (
        <div
          className={styles.riskBox}
          style={{ background: CHIP.warn.bg, borderColor: CHIP.warn.border, color: "#fdba74" }}
        >
          <b>這段文案有需要留意的字：</b>
          {risks.map((risk) => (
            <div key={risk.word}>
              <b>{risk.word}</b>：{risk.why}
            </div>
          ))}
          <div style={{ marginTop: 4 }}>
            說得出根據就可以照用 —— 這裡只是提醒你將來可能要拿得出證據，不會擋你儲存。
          </div>
        </div>
      ) : null}

      <div className={styles.formActions}>
        <button
          type="button"
          className={styles.btn}
          style={{ background: CIS.blueDeep, borderColor: CIS.blueDeep, color: "#fff" }}
          onClick={onSave}
          disabled={busy}
        >
          {busy ? "儲存中…" : "儲存"}
        </button>
        <button
          type="button"
          className={styles.btn}
          style={{ borderColor: CIS.cardBorder, color: CIS.textSub }}
          onClick={onCancel}
          disabled={busy}
        >
          取消
        </button>
      </div>
    </>
  );
}

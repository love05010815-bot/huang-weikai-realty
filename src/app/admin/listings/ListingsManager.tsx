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
import { useState } from "react";
import { CIS, CHIP } from "@/app/admin/_components/cis";
import { Icon } from "@/app/admin/_ui/icons";
import { findCopyRisks } from "@/lib/listing-copy-risk";
import type { ListingInput, ListingRecord, ListingStatus } from "@/lib/listings";
import styles from "./listings-admin.module.css";

type FormState = ListingInput & { pointsText: string };

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
    photo: null,
    linkLabel: "",
    linkHref: "",
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
    photo: row.photo,
    linkLabel: row.link?.label || "",
    linkHref: row.link?.href || "",
    status: row.status,
  };
}

export default function ListingsManager({
  initial,
  photoFiles,
}: {
  initial: ListingRecord[];
  photoFiles: string[];
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
      photo: form.photo,
      linkLabel: form.linkLabel,
      linkHref: form.linkHref,
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
            photoFiles={photoFiles}
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
                  photoFiles={photoFiles}
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
              {row.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className={styles.thumb} src={`/listings/${row.photo}`} alt="" width={132} height={88} />
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
  photoFiles,
  risks,
  busy,
  onSave,
  onCancel,
  isNew,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  photoFiles: string[];
  risks: ReturnType<typeof findCopyRisks>;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
  isNew?: boolean;
}) {
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

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

        <div className={styles.field}>
          <label className={styles.label} style={{ color: CIS.textSub }} htmlFor="lst-photo">
            照片
          </label>
          <select
            id="lst-photo"
            className={styles.select}
            style={inputStyle}
            value={form.photo || ""}
            onChange={(e) => set("photo", e.target.value || null)}
          >
            <option value="">（沒有照片，顯示佔位塊）</option>
            {photoFiles.map((file) => (
              <option key={file} value={file}>
                {file}
              </option>
            ))}
            {form.photo && !photoFiles.includes(form.photo) ? (
              <option value={form.photo}>{form.photo}（檔案找不到）</option>
            ) : null}
          </select>
          <div className={styles.hint} style={{ color: CIS.textMute }}>
            只能從 <code>public/listings/</code> 現有的圖檔挑。要放全新照片，把圖檔給我、部署一次才會出現在這個清單裡。
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
          <label className={styles.label} style={{ color: CIS.textSub }} htmlFor="lst-link-label">
            外部連結文字
          </label>
          <input
            id="lst-link-label"
            className={styles.input}
            style={inputStyle}
            value={form.linkLabel}
            onChange={(e) => set("linkLabel", e.target.value)}
            placeholder="影片賞析"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} style={{ color: CIS.textSub }} htmlFor="lst-link-href">
            外部連結網址
          </label>
          <input
            id="lst-link-href"
            className={styles.input}
            style={inputStyle}
            value={form.linkHref}
            onChange={(e) => set("linkHref", e.target.value)}
            placeholder="https://www.facebook.com/reel/..."
          />
          <div className={styles.hint} style={{ color: CIS.textMute }}>
            外部頁面下架之後連結就變死的，改物件時順手點一遍。留空就不顯示按鈕。
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

      {form.photo ? (
        <div className={styles.formPreview}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.previewThumb} src={`/listings/${form.photo}`} alt="" width={132} height={88} />
          <span style={{ color: CIS.textMute, fontSize: 13.5 }}>
            卡片是 3:2 裁切，比例不合會被切掉上下或左右。
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

"use client";

/**
 * 租件圖片排版 —— 左邊是操作區（版面／照片／傢俱勾選），右邊是照 Excel 範本畫的紙本預覽。
 *
 * ⚠️ 全部在瀏覽器裡做：照片不上傳、不進資料庫，關掉或重新整理分頁照片就沒了；
 *    文字（案名／照片說明／傢俱勾選／備註）存在這台瀏覽器的 localStorage，下次打開還在。
 * ⚠️ 照片進來先縮到長邊 1800px 再放（手機原圖一張 5～6MB，八張直接塞會讓列印預覽卡住）。
 * ⚠️ 照片說明與備註是「直接在右邊那張紙上打字」，不是另外的表單 —— 看到什麼印出來就是什麼。
 */
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { flushSync } from "react-dom";
import { Icon } from "@/app/admin/_ui/icons";
import {
  MAX_PHOTOS,
  defaultCats,
  emptyDraft,
  layoutTable,
  newId,
  reviveDraft,
  type RentalCat,
  type RentalDraft,
  type RentalItem,
  type RentalLayout,
} from "@/lib/rental-sheet";
import styles from "./rentalSheet.module.css";

const STORE_KEY = "rental-sheet-draft-v1";
const MAX_SIDE = 1800;

/** 把使用者選的檔案縮成 JPEG blob URL。讀不了（例如 iPhone 的 HEIC）就丟錯，由呼叫端講清楚。 */
async function fileToUrl(file: File): Promise<string> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.88));
  if (!blob) throw new Error("no blob");
  return URL.createObjectURL(blob);
}

export default function RentalSheetManager() {
  const [draft, setDraft] = useState<RentalDraft>(emptyDraft);
  const [photos, setPhotos] = useState<(string | null)[]>(() => Array(MAX_PHOTOS).fill(null));
  const [photoMsg, setPhotoMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [printing, setPrinting] = useState(false);
  const multiRef = useRef<HTMLInputElement>(null);
  const slotRef = useRef<HTMLInputElement>(null);
  const slotTarget = useRef(0);

  // 讀回上次的文字草稿（照片不存）
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) setDraft(reviveDraft(JSON.parse(raw)));
    } catch {
      /* 讀不到就用空白的 */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(draft));
    } catch {
      /* 存不進去不影響這次使用 */
    }
  }, [draft, loaded]);

  // 列印那一下把灰色提示字整個拿掉（不是變透明）：透明字還是會寫進 PDF，有些 PDF 閱讀器會把它顯示出來。
  // 用 flushSync：beforeprint 回來瀏覽器就照相了，等 React 排程會來不及。Ctrl+P 也走這裡。
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  const patch = (p: Partial<RentalDraft>) => setDraft((d) => ({ ...d, ...p }));
  const shown = draft.layout;
  const hiddenCount = photos.slice(shown).filter(Boolean).length;
  const filled = photos.slice(0, shown).filter(Boolean).length;

  /** 把一批檔案依序放進空格；`startAt` 有給就從那一格開始（那一格有照片也會被換掉）。 */
  async function addFiles(files: File[], startAt?: number) {
    const imgs = files.filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name));
    if (imgs.length === 0) return;
    setBusy(true);
    setPhotoMsg("");
    const next = [...photos];
    const slots: number[] = [];
    if (startAt != null) slots.push(startAt);
    for (let i = 0; i < shown; i++) if (!next[i] && i !== startAt) slots.push(i);
    let failed = 0;
    let placed = 0;
    let skipped = 0;
    for (const file of imgs) {
      const slot = slots[placed];
      if (slot == null) {
        skipped += 1;
        continue;
      }
      try {
        const url = await fileToUrl(file);
        if (next[slot]) URL.revokeObjectURL(next[slot] as string);
        next[slot] = url;
        placed += 1;
      } catch {
        failed += 1;
      }
    }
    setPhotos(next);
    setBusy(false);
    const parts: string[] = [];
    if (placed > 0) parts.push(`放進 ${placed} 張`);
    if (skipped > 0) parts.push(`${skipped} 張沒放（${shown} 格都滿了）`);
    if (failed > 0) parts.push(`${failed} 張讀不了（iPhone 的 HEIC 檔請先轉成 JPG）`);
    setPhotoMsg(parts.join("；"));
  }

  function onMulti(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    void addFiles(files);
  }
  function onSlotPick(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    void addFiles(files, slotTarget.current);
  }
  function pickSlot(i: number) {
    slotTarget.current = i;
    slotRef.current?.click();
  }
  function removePhoto(i: number) {
    setPhotos((ps) => {
      const next = [...ps];
      if (next[i]) URL.revokeObjectURL(next[i] as string);
      next[i] = null;
      return next;
    });
  }
  /** 照片與它的說明一起搬（說明是跟著照片走的） */
  function swap(a: number, b: number) {
    if (a === b) return;
    setPhotos((ps) => {
      const next = [...ps];
      [next[a], next[b]] = [next[b], next[a]];
      return next;
    });
    setDraft((d) => {
      const captions = [...d.captions];
      [captions[a], captions[b]] = [captions[b], captions[a]];
      return { ...d, captions };
    });
  }
  function onDrop(e: DragEvent, i: number) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length > 0) void addFiles(files, i);
    else if (dragFrom != null) swap(dragFrom, i);
    setDragFrom(null);
  }

  // ---- 傢俱表 ----
  const setCats = (fn: (cats: RentalCat[]) => RentalCat[]) => setDraft((d) => ({ ...d, cats: fn(d.cats) }));
  const patchCat = (cid: string, p: Partial<RentalCat>) => setCats((cs) => cs.map((c) => (c.id === cid ? { ...c, ...p } : c)));
  const patchItem = (cid: string, iid: string, p: Partial<RentalItem>) =>
    setCats((cs) => cs.map((c) => (c.id === cid ? { ...c, items: c.items.map((i) => (i.id === iid ? { ...i, ...p } : i)) } : c)));
  const addItem = (cid: string) =>
    setCats((cs) => cs.map((c) => (c.id === cid ? { ...c, items: [...c.items, { id: newId("i"), name: "", qty: "", on: true }] } : c)));
  const delItem = (cid: string, iid: string) =>
    setCats((cs) => cs.map((c) => (c.id === cid ? { ...c, items: c.items.filter((i) => i.id !== iid) } : c)));
  const addCat = () => setCats((cs) => [...cs, { id: newId("c"), name: "", items: [{ id: newId("i"), name: "", qty: "", on: true }] }]);
  const delCat = (cid: string) => setCats((cs) => cs.filter((c) => c.id !== cid));
  const moveCat = (idx: number, dir: -1 | 1) =>
    setCats((cs) => {
      const to = idx + dir;
      if (to < 0 || to >= cs.length) return cs;
      const next = [...cs];
      [next[idx], next[to]] = [next[to], next[idx]];
      return next;
    });

  function resetAll() {
    if (!window.confirm("照片、說明、勾選的傢俱、備註全部清掉，換下一間？")) return;
    photos.forEach((p) => p && URL.revokeObjectURL(p));
    setPhotos(Array(MAX_PHOTOS).fill(null));
    setDraft((d) => ({ ...emptyDraft(), layout: d.layout, fit: d.fit }));
    setPhotoMsg("");
  }
  function resetCats() {
    if (!window.confirm("傢俱表恢復成預設品項（你自己加的、改過的會不見）？")) return;
    patch({ cats: defaultCats() });
  }
  function doPrint() {
    // 另存 PDF 時瀏覽器拿分頁標題當檔名 —— 印的那一下換成案名，印完換回來
    const old = document.title;
    const name = draft.name.trim();
    document.title = name ? `${name}_房屋內部傢俱項目` : "房屋內部傢俱項目";
    const back = () => {
      document.title = old;
      window.removeEventListener("afterprint", back);
    };
    window.addEventListener("afterprint", back);
    window.print();
  }

  const table = layoutTable(draft.cats);
  const checkedCount = draft.cats.reduce((n, c) => n + c.items.filter((i) => i.on).length, 0);
  const fitClass = draft.fit === "contain" ? styles.imgContain : styles.imgCover;

  return (
    <div className={styles.wrap}>
      {/* ================= 操作區 ================= */}
      <div className={styles.panel}>
        <section className={styles.card}>
          <h2 className={styles.h2}>① 版面</h2>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>案名（不會印在紙上，只當存 PDF 的檔名）</span>
            <input
              className={styles.input}
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="例：市鎮之櫻 C1-3"
            />
          </label>
          <div className={styles.segRow}>
            {([6, 8] as RentalLayout[]).map((n) => (
              <button
                key={n}
                type="button"
                className={`${styles.seg} ${draft.layout === n ? styles.segOn : ""}`}
                aria-pressed={draft.layout === n}
                onClick={() => patch({ layout: n })}
              >
                {n} 張照片
              </button>
            ))}
          </div>
          {hiddenCount > 0 && (
            <p className={styles.note}>第 7、8 格還有 {hiddenCount} 張照片沒顯示，切回「8 張照片」就會出現。</p>
          )}
          <div className={styles.segRow}>
            <button
              type="button"
              className={`${styles.seg} ${draft.fit === "cover" ? styles.segOn : ""}`}
              aria-pressed={draft.fit === "cover"}
              onClick={() => patch({ fit: "cover" })}
            >
              照片填滿格子
            </button>
            <button
              type="button"
              className={`${styles.seg} ${draft.fit === "contain" ? styles.segOn : ""}`}
              aria-pressed={draft.fit === "contain"}
              onClick={() => patch({ fit: "contain" })}
            >
              照片完整不裁切
            </button>
          </div>
        </section>

        <section className={styles.card}>
          <h2 className={styles.h2}>
            ② 照片 <span className={styles.count}>{filled}／{shown}</span>
          </h2>
          <button type="button" className={styles.primary} disabled={busy} onClick={() => multiRef.current?.click()}>
            <Icon name="upload" size={16} /> {busy ? "處理中…" : "一次選多張照片"}
          </button>
          <input ref={multiRef} type="file" accept="image/*" multiple hidden onChange={onMulti} />
          <input ref={slotRef} type="file" accept="image/*" hidden onChange={onSlotPick} />
          {photoMsg && <p className={styles.note} role="status">{photoMsg}</p>}
          <p className={styles.hint}>
            也可以直接點右邊紙上的格子放單張。拖著照片到另一格＝兩張對調（說明跟著走）。
            照片只在這個分頁裡，<b>重新整理就沒了</b>；文字會記得。
          </p>
        </section>

        <section className={styles.card}>
          <h2 className={styles.h2}>
            ③ 傢俱表 <span className={styles.count}>已勾 {checkedCount} 項</span>
          </h2>
          <p className={styles.hint}>打勾的才會印出來；整組都沒勾，那一組就不印。名稱、數量都可以直接改。</p>
          {draft.cats.map((cat, ci) => {
            const on = cat.items.filter((i) => i.on).length;
            return (
              <div key={cat.id} className={`${styles.cat} ${on > 0 ? styles.catOn : ""}`}>
                <div className={styles.catHead}>
                  <input
                    className={`${styles.input} ${styles.catName}`}
                    value={cat.name}
                    onChange={(e) => patchCat(cat.id, { name: e.target.value })}
                    placeholder="分類名稱"
                    aria-label="分類名稱"
                  />
                  <span className={styles.count}>{on > 0 ? `${on} 項` : "不印"}</span>
                  <button type="button" className={styles.iconBtn} onClick={() => moveCat(ci, -1)} disabled={ci === 0} aria-label={`${cat.name} 往前移`} title="往前移">
                    <Icon name="chevronUp" size={15} />
                  </button>
                  <button type="button" className={styles.iconBtn} onClick={() => moveCat(ci, 1)} disabled={ci === draft.cats.length - 1} aria-label={`${cat.name} 往後移`} title="往後移">
                    <Icon name="chevronDown" size={15} />
                  </button>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => (cat.items.length === 0 || window.confirm(`刪掉「${cat.name || "這個分類"}」整組？`)) && delCat(cat.id)}
                    aria-label={`刪除分類 ${cat.name}`}
                    title="刪除這個分類"
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
                {cat.items.map((it) => (
                  <div key={it.id} className={styles.itemRow}>
                    <input
                      type="checkbox"
                      className={styles.check}
                      checked={it.on}
                      onChange={(e) => patchItem(cat.id, it.id, { on: e.target.checked })}
                      aria-label={`${cat.name} ${it.name || "新品項"}`}
                    />
                    <input
                      className={`${styles.input} ${styles.itemName}`}
                      value={it.name}
                      onChange={(e) => patchItem(cat.id, it.id, { name: e.target.value })}
                      placeholder="品項"
                      aria-label="品項名稱"
                    />
                    <input
                      className={`${styles.input} ${styles.itemQty}`}
                      value={it.qty}
                      onChange={(e) => patchItem(cat.id, it.id, { qty: e.target.value })}
                      placeholder="數量"
                      aria-label={`${it.name} 數量`}
                    />
                    <button type="button" className={styles.iconBtn} onClick={() => delItem(cat.id, it.id)} aria-label={`刪除 ${it.name}`} title="刪除這個品項">
                      <Icon name="close" size={15} />
                    </button>
                  </div>
                ))}
                <button type="button" className={styles.linkBtn} onClick={() => addItem(cat.id)}>
                  ＋ 加品項
                </button>
              </div>
            );
          })}
          <div className={styles.btnRow}>
            <button type="button" className={styles.ghost} onClick={addCat}>＋ 加分類</button>
            <button type="button" className={styles.ghost} onClick={resetCats}>恢復預設品項</button>
          </div>
        </section>

        <section className={`${styles.card} ${styles.actions}`}>
          <button type="button" className={styles.primary} onClick={doPrint}>
            <Icon name="print" size={16} /> 列印／存成 PDF
          </button>
          <button type="button" className={styles.ghost} onClick={resetAll}>清空，換下一間</button>
          <p className={styles.hint}>
            A4 直式兩頁：第 1 頁照片、第 2 頁項目列表與簽名欄。列印視窗裡「頁首及頁尾」請取消勾選。
          </p>
        </section>
      </div>

      {/* ================= 紙本預覽（印出來的就是這一塊） ================= */}
      <div className={styles.stage}>
        <div className={styles.sheet} id="rental-sheet">
          <div className={styles.paper}>
            <div className={styles.title}>房屋內部傢俱項目</div>
            <div className={`${styles.photos} ${shown === 8 ? styles.photos8 : styles.photos6}`}>
              {Array.from({ length: shown }, (_, i) => (
                <div key={i} className={styles.cell}>
                  <input
                    className={styles.cap}
                    value={draft.captions[i] ?? ""}
                    onChange={(e) => {
                      const captions = [...draft.captions];
                      captions[i] = e.target.value;
                      patch({ captions });
                    }}
                    placeholder={printing ? undefined : `第 ${i + 1} 張的說明（例：沙發、茶几、電視）`}
                    aria-label={`第 ${i + 1} 張照片的說明`}
                  />
                  <div
                    className={`${styles.ph} ${dragFrom != null && dragFrom !== i ? styles.phDrop : ""}`}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => onDrop(e, i)}
                  >
                    {photos[i] ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element -- 本機 blob URL，next/image 幫不上忙 */}
                        <img
                          src={photos[i] as string}
                          alt={draft.captions[i] || `第 ${i + 1} 張照片`}
                          className={fitClass}
                          draggable
                          onDragStart={() => setDragFrom(i)}
                          onDragEnd={() => setDragFrom(null)}
                        />
                        <div className={styles.phTools}>
                          <button type="button" className={styles.phBtn} onClick={() => pickSlot(i)}>換一張</button>
                          <button type="button" className={styles.phBtn} onClick={() => removePhoto(i)}>移除</button>
                        </div>
                      </>
                    ) : (
                      <button type="button" className={styles.phEmpty} onClick={() => pickSlot(i)}>
                        <Icon name="image" size={22} />
                        <span>點這裡放第 {i + 1} 張</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={`${styles.paper} ${styles.paper2}`}>
            <div className={styles.title}>項目列表</div>
            {table.cols === 0 ? (
              <div className={styles.tableEmpty}>在「③ 傢俱表」打勾，品項就會出現在這裡。</div>
            ) : (
              <table className={styles.items}>
                <tbody>
                  {table.rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, c) =>
                        cell.kind === "head" ? (
                          <td key={c} colSpan={2} className={styles.tdHead}>{cell.name}</td>
                        ) : cell.kind === "item" ? (
                          [
                            <td key={`${c}n`} className={styles.tdName}>{cell.name}</td>,
                            <td key={`${c}q`} className={styles.tdQty}>{cell.qty}</td>,
                          ]
                        ) : (
                          <td key={c} colSpan={2} className={styles.tdBlank} />
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className={styles.noteBox}>
              <span className={styles.boxLabel}>備　　註：</span>
              <textarea
                className={styles.noteInput}
                value={draft.note}
                onChange={(e) => patch({ note: e.target.value })}
                placeholder={printing ? undefined : "要先打好的備註寫在這裡；留空就是給現場手寫"}
                aria-label="備註"
                rows={3}
              />
            </div>
            <div className={styles.signRow}>
              <div className={styles.signBox}><span className={styles.boxLabel}>甲　　方：</span></div>
              <div className={styles.signBox}><span className={styles.boxLabel}>乙　　方：</span></div>
            </div>
            <div className={styles.dateRow}>
              <div className={styles.dateLabel}>簽約日期：</div>
              <div className={styles.dateBlank} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

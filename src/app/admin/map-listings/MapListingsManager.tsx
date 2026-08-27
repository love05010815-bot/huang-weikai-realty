"use client";

/**
 * 建案地圖物件後台的操作介面。
 *
 * 一筆物件＝一個建案底下的一間房。左邊是依建案分組的清單，
 * 點「編輯」在右邊改，存檔立刻反映到 `/map`。
 *
 * ## 幾個刻意的設計
 *
 * 1. **一定要先選建案**才存得起來。沒有建案的物件不知道要掛在地圖哪裡，
 *    存了也不會出現在任何地方，那比報錯更糟（你會以為存好了）。
 *
 * 2. **照片傳完要按「儲存」才會寫進資料庫**。上傳只是把圖丟到 Blob 拿網址，
 *    畫面上會一直提醒還沒存，免得傳完就關掉視窗。
 *
 * 3. **刪除要按兩次**。這裡沒有垃圾桶，刪了就是刪了。
 */

import { useMemo, useRef, useState, useTransition } from "react";
import { resolvePhotoSrc } from "@/lib/photo-src";
import { MAX_PHOTOS, type MapListingRecord, type MapListingStatus } from "@/lib/map-listings";
import { houseolItemSummary, type HouseolItem } from "@/lib/houseol-item";
import type { ListingClickStats } from "@/lib/listing-clicks";
import {
  deleteMapListingAction,
  moveMapListingAction,
  saveMapListingAction,
  setMapListingStatusAction,
} from "@/lib/actions/map-listings";
import styles from "./map-listings-admin.module.css";

type ProjectOption = { id: string; name: string; builder: string; count: number };

type Draft = {
  id: string | null;
  projectId: string;
  title: string;
  address: string;
  pointsText: string;
  photos: string[];
  linkHref: string;
  status: MapListingStatus;
};

const EMPTY: Draft = {
  id: null,
  projectId: "",
  title: "",
  address: "",
  pointsText: "",
  photos: [],
  linkHref: "",
  status: "active",
};

function toDraft(r: MapListingRecord): Draft {
  return {
    id: r.id,
    projectId: r.projectId,
    title: r.title,
    address: r.address ?? "",
    pointsText: r.points.join("\n"),
    photos: [...r.photos],
    linkHref: r.linkHref ?? "",
    status: r.status,
  };
}

export default function MapListingsManager({
  initial,
  projects,
  inventory,
  clickStats = {},
}: {
  initial: MapListingRecord[];
  projects: ProjectOption[];
  inventory: HouseolItem[];
  /** 每一筆物件的兩顆按鈕各被點過幾次。讀不到時是空物件，畫面顯示 0。 */
  clickStats?: ListingClickStats;
}) {
  const [rows, setRows] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [invQuery, setInvQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  /** 打字才篩，一開始最多先列 20 筆，不要一次把上百筆都塞進畫面 */
  const invPool = useMemo(() => {
    const q = invQuery.trim();
    // 地址也能搜 —— 「這間我上架過了嗎」用門牌找比用案名快
    return q
      ? inventory.filter((it) => `${it.title}${it.community}${it.district}${it.address ?? ""}`.includes(q))
      : inventory;
  }, [inventory, invQuery]);
  const invMatches = useMemo(() => invPool.slice(0, 20), [invPool]);

  const projectName = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projects) m.set(p.id, p.name);
    return m;
  }, [projects]);

  /** 依建案分組，方便一眼看出哪棟樓有幾間 */
  const grouped = useMemo(() => {
    const map = new Map<string, MapListingRecord[]>();
    for (const r of rows) {
      const list = map.get(r.projectId);
      if (list) list.push(r);
      else map.set(r.projectId, [r]);
    }
    return [...map.entries()].sort((a, b) =>
      (projectName.get(a[0]) ?? a[0]).localeCompare(projectName.get(b[0]) ?? b[0], "zh-Hant")
    );
  }, [rows, projectName]);

  const patch = (p: Partial<Draft>) => {
    setDraft((d) => (d ? { ...d, ...p } : d));
    setDirty(true);
  };

  /** 帶入標題與坪數價格摘要；屬於哪個建案不動，要自己選 —— 愛屋資料沒有建案欄位，猜錯比留白更糟 */
  const applyInventoryItem = (item: HouseolItem) => {
    const summaryLine = houseolItemSummary(item);
    patch({
      title: item.title,
      // 地址有才帶入。沒有的話**不要碰** —— 覆寫成空字串會把你手打的洗掉
      ...(item.address ? { address: item.address } : {}),
      pointsText: summaryLine ? `${summaryLine}\n` : "",
    });
    setMsg({
      kind: "ok",
      text: item.address
        ? `已帶入「${item.title}」與地址，記得選建案、補賣點。`
        : `已帶入「${item.title}」，記得選建案、補賣點。這筆愛屋沒有地址（還沒跑 push-addresses.js？）。`,
    });
  };

  /** 存完重新抓一次，不要自己在前端拼資料 —— 拼錯了畫面跟資料庫就對不起來 */
  const reload = () => {
    startTransition(() => {
      window.location.reload();
    });
  };

  async function onUpload(files: FileList | null) {
    if (!files || files.length === 0 || !draft) return;
    const room = MAX_PHOTOS - draft.photos.length;
    if (room <= 0) {
      setMsg({ kind: "err", text: `已經有 ${MAX_PHOTOS} 張了，先移除幾張再傳` });
      return;
    }
    const form = new FormData();
    for (const f of Array.from(files).slice(0, room)) form.append("file", f);

    setUploading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/listings/photo", { method: "POST", body: form });
      const data = (await res.json()) as {
        uploaded?: { name: string; url: string }[];
        failed?: { name: string; error: string }[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `上傳失敗（${res.status}）`);

      const urls = (data.uploaded ?? []).map((u) => u.url);
      if (urls.length) patch({ photos: [...draft.photos, ...urls] });

      const failed = data.failed ?? [];
      setMsg(
        failed.length
          ? { kind: "err", text: `${urls.length} 張成功、${failed.length} 張失敗：${failed[0].error}` }
          : { kind: "ok", text: `已上傳 ${urls.length} 張。⚠️ 記得按「儲存」才會寫進資料庫` }
      );
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onSave() {
    if (!draft) return;
    setMsg(null);
    const res = await saveMapListingAction(draft.id, {
      projectId: draft.projectId,
      title: draft.title,
      address: draft.address,
      points: draft.pointsText.split("\n").map((s) => s.trim()).filter(Boolean),
      photos: draft.photos,
      linkHref: draft.linkHref,
      status: draft.status,
    });
    if (!res.ok) {
      setMsg({ kind: "err", text: res.error ?? "存檔失敗" });
      return;
    }
    setDirty(false);
    setMsg({ kind: "ok", text: "已存檔，/map 上立刻就變" });
    reload();
  }

  async function onToggleStatus(r: MapListingRecord) {
    const next: MapListingStatus = r.status === "active" ? "sold" : "active";
    const res = await setMapListingStatusAction(r.id, next);
    if (!res.ok) return setMsg({ kind: "err", text: res.error ?? "改狀態失敗" });
    setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, status: next } : x)));
  }

  async function onMove(id: string, dir: "up" | "down") {
    const res = await moveMapListingAction(id, dir);
    if (!res.ok) return setMsg({ kind: "err", text: res.error ?? "換順序失敗" });
    reload();
  }

  async function onDelete(id: string) {
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      return;
    }
    const res = await deleteMapListingAction(id);
    if (!res.ok) return setMsg({ kind: "err", text: res.error ?? "刪除失敗" });
    setConfirmDelete(null);
    if (draft?.id === id) setDraft(null);
    setRows((rs) => rs.filter((x) => x.id !== id));
  }

  return (
    <div className={styles.wrap}>
      {msg && <p className={msg.kind === "ok" ? styles.ok : styles.error}>{msg.text}</p>}

      <div className={styles.cols}>
        {/* ── 左：清單 ── */}
        <div className={styles.listCol}>
          <div className={styles.listHead}>
            <h2>物件清單</h2>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => {
                setDraft({ ...EMPTY });
                setDirty(false);
                setMsg(null);
              }}
            >
              ＋ 新增物件
            </button>
          </div>

          {rows.length === 0 ? (
            <p className={styles.empty}>
              還沒有任何地圖物件。按「＋ 新增物件」開始 —— 選一個建案、填標題與賣點、傳照片就完成了。
            </p>
          ) : (
            grouped.map(([pid, list]) => (
              <section key={pid} className={styles.group}>
                <h3 className={styles.groupTitle}>
                  {projectName.get(pid) ?? `（找不到建案：${pid}）`}
                  <span>{`${list.length} 間`}</span>
                </h3>
                <ul className={styles.items}>
                  {list.map((r, i) => (
                    <li key={r.id} className={r.status === "sold" ? styles.itemSold : styles.item}>
                      <div className={styles.itemMain}>
                        {r.photos[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={resolvePhotoSrc(r.photos[0])} alt="" width={56} height={42} />
                        ) : (
                          <span className={styles.noPhoto}>無照片</span>
                        )}
                        <div>
                          <b>{r.title}</b>
                          {/* 地址擺標題正下方：同一棟樓好幾間的標題常常一模一樣，
                              沒有地址根本認不出「這筆是哪一間」。沒填也要顯示，
                              留白的話你不會發現自己漏填。 */}
                          <span className={r.address ? styles.addrLine : styles.addrEmpty}>
                            {r.address ? `📍 ${r.address}` : "📍 未填地址"}
                          </span>
                          <small>
                            {r.status === "active" ? "上架中" : "已下架"}
                            {r.photos.length > 0 && ` ・ ${r.photos.length} 張照片`}
                            {r.linkHref && " ・ 有物件資訊連結"}
                          </small>
                          {/* 👆 兩顆按鈕分開看 ——「想看物件詳情」跟「想直接約」
                              是不同的訊號，加總成一個數字就看不出來了。
                              統計的 key 是這筆物件的 id，前台按鈕上掛的也是它。 */}
                          {(() => {
                            const stat = clickStats[r.id];
                            const cells: Array<[string, number, number]> = [
                              ["物件介紹", stat?.actions.link.total ?? 0, stat?.actions.link.recent ?? 0],
                              ["預約諮詢", stat?.actions.booking.total ?? 0, stat?.actions.booking.recent ?? 0],
                            ];
                            return (
                              <span className={styles.clickRow}>
                                {cells.map(([label, total, recent]) => (
                                  <span key={label} className={styles.clickCell}>
                                    {label}
                                    <b className={total > 0 ? styles.clickHot : undefined}>{total}</b>
                                    人次
                                    {recent > 0 && <em>{`近7天 ${recent}`}</em>}
                                  </span>
                                ))}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                      <div className={styles.itemBtns}>
                        <button type="button" onClick={() => onMove(r.id, "up")} disabled={i === 0} title="上移">
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => onMove(r.id, "down")}
                          disabled={i === list.length - 1}
                          title="下移"
                        >
                          ↓
                        </button>
                        <button type="button" onClick={() => onToggleStatus(r)}>
                          {r.status === "active" ? "下架" : "上架"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDraft(toDraft(r));
                            setDirty(false);
                            setMsg(null);
                          }}
                        >
                          編輯
                        </button>
                        <button
                          type="button"
                          className={confirmDelete === r.id ? styles.dangerOn : styles.danger}
                          onClick={() => onDelete(r.id)}
                        >
                          {confirmDelete === r.id ? "再按一次刪除" : "刪除"}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>

        {/* ── 右：編輯 ── */}
        <div className={styles.formCol}>
          {!draft ? (
            <p className={styles.empty}>左邊按「＋ 新增物件」或任一筆的「編輯」，表單會出現在這裡。</p>
          ) : (
            <div className={styles.form}>
              <h2>{draft.id ? "編輯物件" : "新增物件"}</h2>

              <div className={styles.invBlock}>
                <span className={styles.fieldLabel}>🏠 從愛屋庫存帶入標題與坪數價格（可選）</span>
                {inventory.length === 0 ? (
                  <small>
                    還沒有庫存資料。打開 <code>tools/houseol/install.html</code> 抓一次愛屋，
                    或跳過這段直接手動填。
                  </small>
                ) : (
                  <>
                    <input
                      type="text"
                      placeholder={`搜尋案名／社區／行政區（共 ${inventory.length} 筆）`}
                      value={invQuery}
                      onChange={(e) => setInvQuery(e.target.value)}
                    />
                    {invMatches.length === 0 ? (
                      <small>沒有符合的物件。</small>
                    ) : (
                      <ul className={styles.invList}>
                        {invMatches.map((item) => (
                          <li key={item.caseId || item.title}>
                            <div>
                              <b>{item.title}</b>
                              <small>
                                {[item.community, item.district, houseolItemSummary(item)].filter(Boolean).join(" ・ ")}
                              </small>
                              {/* 地址直接列在挑案清單上，不用點進去就認得出是哪一間。
                                  用 span 不用 small，避開上面 `.invList small` 那條規則。 */}
                              {item.address && (
                                <span className={styles.invAddr}>{`📍 ${item.address}`}</span>
                              )}
                            </div>
                            <button type="button" onClick={() => applyInventoryItem(item)}>
                              帶入
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {invPool.length > invMatches.length && (
                      <small>
                        符合的有 {invPool.length} 筆，只列前 {invMatches.length} 筆，打字縮小範圍找剩下的。
                      </small>
                    )}
                    <small>屬於哪個建案不會自動選，帶入之後記得手動選建案。</small>
                  </>
                )}
              </div>

              <label>
                <span>
                  屬於哪個建案 <em>必填</em>
                </span>
                <select value={draft.projectId} onChange={(e) => patch({ projectId: e.target.value })}>
                  <option value="">— 請選擇 —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {`${p.name}（${p.builder}）${p.count > 0 ? ` ・已有 ${p.count} 間` : ""}`}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>
                  標題 <em>必填</em>
                </span>
                <input
                  type="text"
                  value={draft.title}
                  onChange={(e) => patch({ title: e.target.value })}
                  placeholder="例：中高樓無限視野兩房平車"
                  maxLength={255}
                />
              </label>

              <label>
                <span>物件地址（可留空）</span>
                <input
                  type="text"
                  value={draft.address}
                  onChange={(e) => patch({ address: e.target.value })}
                  placeholder="例：梧棲區文化路二段 123 號 12 樓之 3"
                  maxLength={255}
                />
                <small>
                  <b>不會出現在 /map 上</b>，只有這個後台看得到。用途是讓你認出這筆是哪一間
                  —— 同一棟樓好幾間的標題常常長得一樣。
                </small>
              </label>

              <label>
                <span>賣點（一行一條）</span>
                <textarea
                  rows={4}
                  value={draft.pointsText}
                  onChange={(e) => patch({ pointsText: e.target.value })}
                  placeholder={"無限棟距｜視野開闊\n主＋附 20 坪大兩房，配 B2 柱邊平車位"}
                />
              </label>

              <label>
                <span>「物件資訊」按鈕網址（可留空）</span>
                <input
                  type="url"
                  value={draft.linkHref}
                  onChange={(e) => patch({ linkHref: e.target.value })}
                  placeholder="https://…（591、FB 貼文等）"
                />
                <small>留空的話卡片上就只有「預約諮詢」一顆按鈕，不會留白。</small>
              </label>

              <div className={styles.photoBlock}>
                <span className={styles.fieldLabel}>{`照片（第一張是封面，最多 ${MAX_PHOTOS} 張）`}</span>
                {draft.photos.length > 0 && (
                  <ul className={styles.photoList}>
                    {draft.photos.map((p, i) => (
                      <li key={p}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={resolvePhotoSrc(p)} alt="" width={64} height={48} />
                        <span>{i === 0 ? "封面" : `第 ${i + 1} 張`}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const next = [...draft.photos];
                            [next[i - 1], next[i]] = [next[i], next[i - 1]];
                            patch({ photos: next });
                          }}
                          disabled={i === 0}
                          title="上移"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const next = [...draft.photos];
                            [next[i], next[i + 1]] = [next[i + 1], next[i]];
                            patch({ photos: next });
                          }}
                          disabled={i === draft.photos.length - 1}
                          title="下移"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className={styles.danger}
                          onClick={() => patch({ photos: draft.photos.filter((_, j) => j !== i) })}
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={uploading || draft.photos.length >= MAX_PHOTOS}
                  onChange={(e) => onUpload(e.target.files)}
                />
                {uploading && <small>上傳中…（會自動轉正、縮圖、壓成 WebP）</small>}
              </div>

              <label className={styles.inline}>
                <input
                  type="checkbox"
                  checked={draft.status === "active"}
                  onChange={(e) => patch({ status: e.target.checked ? "active" : "sold" })}
                />
                <span>上架中（取消勾選＝從地圖上隱藏，但資料留著）</span>
              </label>

              <div className={styles.formBtns}>
                <button type="button" className={styles.primaryBtn} onClick={onSave} disabled={pending || uploading}>
                  {pending ? "儲存中…" : "儲存"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(null);
                    setDirty(false);
                  }}
                >
                  取消
                </button>
                {dirty && <span className={styles.dirty}>有未儲存的變更</span>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

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
import { uploadPhotos } from "@/lib/photo-upload-client";
import type { ProjectSuggestion } from "@/lib/project-match";
import type { ListingClickStats } from "@/lib/listing-clicks";
import {
  deleteMapListingAction,
  moveMapListingAction,
  readHouseolAction,
  saveMapListingAction,
  setMapListingStatusAction,
} from "@/lib/actions/map-listings";
import styles from "./map-listings-admin.module.css";

type ProjectOption = { id: string; name: string; builder: string; count: number };

/** 讀完愛屋型錄之後，畫面上要顯示的東西 */
type ReadInfo = {
  caseId: string;
  community: string;
  addressSource: "門牌" | "型錄";
  photos: string[];
  suggestions: ProjectSuggestion[];
  /** 自動選好的建案名，空字串＝沒自動選 */
  autoPicked: string;
  missing: string[];
};

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
  clickStats = {},
}: {
  initial: MapListingRecord[];
  projects: ProjectOption[];
  /** 每一筆物件的兩顆按鈕各被點過幾次。讀不到時是空物件，畫面顯示 0。 */
  clickStats?: ListingClickStats;
}) {
  const [rows, setRows] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [listQuery, setListQuery] = useState("");
  const [projQuery, setProjQuery] = useState("");
  const [houseolInput, setHouseolInput] = useState("");
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [readInfo, setReadInfo] = useState<ReadInfo | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const formColRef = useRef<HTMLDivElement>(null);

  /**
   * 建案挑選（2026-09-07 改）。原本是一顆 `<select>`，但建案有 500 多個，
   * 下拉找到天荒地老 —— 改成跟上面愛屋挑案同一套：打關鍵字、按一下選。
   * 建商名也能搜（打「遠雄」列出所有遠雄的案子）。
   */
  const selectedProject = useMemo(() => {
    const id = draft?.projectId ?? "";
    return id ? projects.find((p) => p.id === id) ?? null : null;
  }, [projects, draft]);
  const projPool = useMemo(() => {
    const q = projQuery.trim();
    return q ? projects.filter((p) => `${p.name}${p.builder}`.includes(q)) : projects;
  }, [projects, projQuery]);
  const projMatches = useMemo(() => projPool.slice(0, 20), [projPool]);

  /** 選定一個建案。選完把關鍵字清掉，下次要換時是乾淨的清單 */
  const pickProject = (id: string) => {
    patch({ projectId: id });
    setProjQuery("");
  };

  const projectName = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projects) m.set(p.id, p.name);
    return m;
  }, [projects]);

  /**
   * 清單搜尋。建案名、標題、地址都比對 —— 同一棟樓好幾間時標題常常長得一樣，
   * 用地址找比用標題快；打建案名則是一次看完那棟的全部。
   */
  const visibleRows = useMemo(() => {
    const q = listQuery.trim();
    if (!q) return rows;
    return rows.filter((r) =>
      `${projectName.get(r.projectId) ?? ""}${r.title}${r.address ?? ""}`.includes(q),
    );
  }, [rows, listQuery, projectName]);

  /** 依建案分組，方便一眼看出哪棟樓有幾間 */
  const grouped = useMemo(() => {
    const map = new Map<string, MapListingRecord[]>();
    for (const r of visibleRows) {
      const list = map.get(r.projectId);
      if (list) list.push(r);
      else map.set(r.projectId, [r]);
    }
    return [...map.entries()].sort((a, b) =>
      (projectName.get(a[0]) ?? a[0]).localeCompare(projectName.get(b[0]) ?? b[0], "zh-Hant")
    );
  }, [visibleRows, projectName]);

  const patch = (p: Partial<Draft>) => {
    setDraft((d) => (d ? { ...d, ...p } : d));
    setDirty(true);
  };

  /**
   * 打開表單（新增或編輯）。
   *
   * 🔴 **一定要捲過去**：表單在右欄，但視窗寬度 ≤960px 版面就變單欄，
   *    表單會排到整份物件清單的**下面** —— 不捲過去，按了「編輯」畫面完全沒動靜，
   *    使用者只會說「按了沒反應」（2026-09-17 他又回報一次，這是第四次踩到同一個坑，
   *    見記憶 learning_silent_failure_pattern）。
   */
  const openForm = (next: Draft) => {
    setDraft(next);
    setDirty(false);
    setMsg(null);
    setProjQuery("");
    setHouseolInput("");
    setReadInfo(null);
    // ⚠️ 兩個都是實測踩出來的，不要「順手改漂亮一點」：
    //    ① 用 setTimeout 不用 requestAnimationFrame —— 分頁在背景時 RAF 根本不會執行，
    //       畫面就完全沒動靜（等於沒修）。setTimeout 不挑可見性。
    //    ② 不要加 `behavior: "smooth"`，實測捲不動而且不報錯。
    //    `block: "nearest"` 是為了寬螢幕兩欄時表單本來就看得到、不要平白跳動。
    setTimeout(() => {
      formColRef.current?.scrollIntoView({ block: "nearest" });
    }, 0);
  };

  /**
   * 貼愛屋連結 → 讀型錄 → 標題／地址／賣點一次帶進來，建案夠確定就順手選好。
   *
   * ⚠️ 只覆蓋讀得到的欄位。型錄沒有的東西**不要寫空字串進去** ——
   *    那會把他已經手打的內容洗掉，而且不會有任何提示。
   */
  const readHouseol = async () => {
    const input = houseolInput.trim();
    if (!input || reading) return;
    setReading(true);
    setMsg(null);
    try {
      const res = await readHouseolAction(input);
      if (!res.ok) {
        setReadInfo(null);
        setMsg({ kind: "err", text: res.error });
        return;
      }
      const autoName = res.autoProjectId ? (projects.find((p) => p.id === res.autoProjectId)?.name ?? "") : "";
      patch({
        ...(res.title ? { title: res.title } : {}),
        ...(res.address ? { address: res.address } : {}),
        ...(res.pointsText ? { pointsText: res.pointsText } : {}),
        linkHref: res.linkHref,
        ...(res.autoProjectId ? { projectId: res.autoProjectId } : {}),
      });
      setReadInfo({
        caseId: res.caseId,
        community: res.community,
        addressSource: res.addressSource,
        photos: res.photos,
        suggestions: res.suggestions,
        autoPicked: autoName,
        missing: res.missing,
      });
      setMsg({
        kind: "ok",
        text: `已帶入「${res.title}」${autoName ? `，建案自動選了「${autoName}」` : "，建案要自己挑一個"}。存檔前看一眼賣點。`,
      });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setReading(false);
    }
  };

  /**
   * 加一張照片進草稿。
   * ⚠️ 一定要用 setDraft 的函式版讀「當下的 draft」—— 迴圈裡連續加好幾張時，
   *    閉包裡的 draft 是第一圈那份舊的，用它會讓後面幾張把前面幾張蓋掉。
   */
  const addPhoto = (url: string) => {
    setDraft((d) => (d ? { ...d, photos: [...d.photos, url].slice(0, MAX_PHOTOS) } : d));
    setDirty(true);
  };

  /**
   * 把型錄上的照片抓進來（走跟手動上傳同一支壓縮＋Blob，不是外連愛屋的圖）。
   *
   * 🔴 **一張一張送，迴圈在這裡**（2026-09-17 改）：本來是叫伺服器一次做完 8 張，
   *    他按了回報「沒反應」—— 實測光 Blob 上傳一張就 3 秒，8 張會撞到函式時間上限被砍，
   *    而且整段沒有任何進度。現在每完成一張就馬上多一張縮圖，看得到它在動。
   */
  const importPhotos = async () => {
    if (!draft || !readInfo || importing) return;
    const room = MAX_PHOTOS - draft.photos.length;
    if (room <= 0) {
      setMsg({ kind: "err", text: `已經有 ${MAX_PHOTOS} 張了，先移除幾張再帶` });
      return;
    }
    const targets = readInfo.photos.slice(0, room);
    if (targets.length === 0) {
      setMsg({ kind: "err", text: "這一頁型錄沒有照片" });
      return;
    }

    setImporting(true);
    let added = 0;
    let degraded = "";
    const failures: string[] = [];
    try {
      for (const [i, src] of targets.entries()) {
        setMsg({ kind: "ok", text: `抓照片中… 第 ${i + 1} 張／共 ${targets.length} 張` });
        // ⚠️ 走 API 路由不走 server action —— sharp 的原生檔只帶得進 API 路由那支函式，
        //    寫成 server action 線上會噴「libvips-cpp.so cannot open shared object file」
        //    （2026-09-17 踩過，詳見那支 route 的檔頭）
        const res = await fetch("/api/admin/map-listings/houseol-photo", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: src }),
        });
        let data: { ok?: boolean; url?: string; error?: string; degraded?: string } | null = null;
        try {
          data = await res.json();
        } catch {
          data = null;
        }
        if (res.ok && data?.ok && data.url) {
          addPhoto(data.url);
          added++;
          // 降級（沒壓縮）要講出來，不要默默吞掉 —— 那代表 sharp 壞了，是要修的事
          if (data.degraded) degraded = data.degraded;
        } else {
          failures.push(data?.error ?? `上傳失敗（${res.status}）`);
        }
      }
      setMsg({
        kind: added > 0 ? "ok" : "err",
        text:
          added > 0
            ? `已帶入 ${added} 張照片${failures.length ? `（${failures.length} 張失敗：${failures[0]}）` : ""}${degraded ? `⚠️ ${degraded}` : ""}。⚠️ 記得按「儲存」才會寫進資料庫`
            : `照片都沒帶成功：${failures[0] ?? "不明原因"}`,
      });
    } catch (e) {
      setMsg({
        kind: "err",
        text: `${added > 0 ? `帶了 ${added} 張之後中斷：` : "照片帶入失敗："}${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setImporting(false);
    }
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
    const picked = Array.from(files).slice(0, room);

    setUploading(true);
    setMsg(null);
    try {
      // 一張一張送、送之前先在瀏覽器縮小 —— 平台對整個請求有 4.5MB 上限，
      // 手機直出的照片一次送兩張就爆（見 lib/photo-upload-client.ts 檔頭）
      const { urls, failed } = await uploadPhotos(picked, (done, total) => {
        if (done < total) setMsg({ kind: "ok", text: `處理中… 第 ${done + 1} 張／共 ${total} 張` });
      });
      if (urls.length) patch({ photos: [...draft.photos, ...urls] });

      setMsg(
        failed.length
          ? {
              kind: "err",
              text: `${urls.length} 張成功、${failed.length} 張失敗：${failed
                .map((f) => `${f.name}（${f.error}）`)
                .join("、")}`,
            }
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
      {msg && !draft && <p className={msg.kind === "ok" ? styles.ok : styles.error}>{msg.text}</p>}

      <div className={styles.cols}>
        {/* ── 左：清單 ── */}
        <div className={styles.listCol}>
          <div className={styles.listHead}>
            <h2>{`物件清單（${rows.length}）`}</h2>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => openForm({ ...EMPTY })}
            >
              ＋ 新增物件
            </button>
          </div>

          {/* 物件變多之後翻不完，打字縮小範圍（2026-09-17 他提的）。
              建案名、標題、地址都能搜 —— 同一棟樓好幾間時標題常常長得一樣，用地址找比較快。 */}
          {rows.length > 0 && (
            <div className={styles.listSearch}>
              <input
                type="text"
                placeholder="搜尋建案、標題或地址"
                value={listQuery}
                onChange={(e) => setListQuery(e.target.value)}
              />
              {listQuery.trim() && (
                <button type="button" onClick={() => setListQuery("")}>
                  清除
                </button>
              )}
            </div>
          )}

          {rows.length === 0 ? (
            <p className={styles.empty}>
              還沒有任何地圖物件。按「＋ 新增物件」開始 —— 選一個建案、填標題與賣點、傳照片就完成了。
            </p>
          ) : visibleRows.length === 0 ? (
            <p className={styles.empty}>{`沒有符合「${listQuery.trim()}」的物件。換個關鍵字，或按「清除」看全部。`}</p>
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
                          onClick={() => openForm(toDraft(r))}
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
        <div className={styles.formCol} ref={formColRef}>
          {!draft ? (
            <p className={styles.empty}>左邊按「＋ 新增物件」或任一筆的「編輯」，表單會出現在這裡。</p>
          ) : (
            <div className={styles.form}>
              <h2>{draft.id ? "編輯物件" : "新增物件"}</h2>

              {/* 🔴 訊息一定要放在表單裡、而且黏住 —— 放在整頁最上面的話，
                  他人在下面操作根本看不到「抓照片中…」或錯誤，回報就是「按了沒反應」 */}
              {msg && (
                <p className={`${msg.kind === "ok" ? styles.ok : styles.error} ${styles.formMsg}`}>{msg.text}</p>
              )}

              {/* 貼一條愛屋連結，標題／地址／格局／特色一次帶進來，順便猜建案。
                  2026-09-16 取代原本「搜尋愛屋庫存快照」那塊 —— 快照要自己跑書籤更新，
                  而且沒有特色也不會挑建案。 */}
              <div className={styles.invBlock}>
                <span className={styles.fieldLabel}>🏠 貼愛屋連結，自動帶入</span>
                <div className={styles.pasteRow}>
                  <input
                    type="text"
                    placeholder="貼愛屋物件連結，或直接打案號（例：AA6362139）"
                    value={houseolInput}
                    onChange={(e) => setHouseolInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      void readHouseol();
                    }}
                    disabled={reading}
                  />
                  <button type="button" onClick={() => void readHouseol()} disabled={reading || !houseolInput.trim()}>
                    {reading ? "讀取中…" : "讀取"}
                  </button>
                </div>

                {readInfo && (
                  <div className={styles.readBox}>
                    <span className={styles.readLine}>
                      {`✅ ${readInfo.caseId}`}
                      {readInfo.community ? `｜社區「${readInfo.community}」` : "｜型錄上沒有社區名"}
                      {`｜地址用${readInfo.addressSource === "門牌" ? "資料庫的完整門牌" : "型錄上的路名（沒有門牌）"}`}
                    </span>
                    {readInfo.missing.length > 0 && (
                      <span className={styles.readWarn}>{`⚠️ 型錄上沒讀到：${readInfo.missing.join("、")} —— 自己補一下`}</span>
                    )}
                    {readInfo.autoPicked ? (
                      <span className={styles.readLine}>{`🏢 建案已自動選好：${readInfo.autoPicked}`}</span>
                    ) : readInfo.suggestions.length > 0 ? (
                      <>
                        <span className={styles.readLine}>🏢 建案不夠確定，挑一個（或到下面自己搜）：</span>
                        <ul className={styles.invList}>
                          {readInfo.suggestions.map((s) => (
                            <li key={s.id}>
                              <div>
                                <b>{`${s.name}（${s.builder}）`}</b>
                                <small>{`${s.reason}　・把握度 ${s.score}`}</small>
                              </div>
                              <button type="button" onClick={() => pickProject(s.id)}>
                                選這個
                              </button>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <span className={styles.readWarn}>🏢 猜不出是哪個建案，請到下面自己搜一個</span>
                    )}
                    {readInfo.photos.length > 0 && (
                      <div className={styles.pasteRow}>
                        <span className={styles.readLine}>
                          {`📷 型錄上有 ${readInfo.photos.length} 張｜表單目前 ${draft.photos.length} 張`}
                        </span>
                        <button
                          type="button"
                          onClick={() => void importPhotos()}
                          disabled={importing || draft.photos.length >= MAX_PHOTOS}
                        >
                          {importing
                            ? "抓照片中…"
                            : draft.photos.length >= MAX_PHOTOS
                              ? `已滿 ${MAX_PHOTOS} 張`
                              : `帶入 ${Math.min(readInfo.photos.length, MAX_PHOTOS - draft.photos.length)} 張`}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <small>
                  電子型錄連結、店網物件頁、或只打案號都可以。<b>帶入之後全部都能改</b> ——
                  存檔前看一眼標題與賣點是不是你要的說法。
                </small>
              </div>

              {/* 選好之後只留一行，候選清單收起來 —— 不然表單會被清單撐得很長，
                  下面的欄位跑到畫面外，你會以為表單只有這幾格。 */}
              <div className={styles.projBlock}>
                <span className={styles.fieldLabel}>
                  屬於哪個建案 <em>必填</em>
                </span>
                {selectedProject ? (
                  <div className={styles.projPicked}>
                    <span>
                      <b>{selectedProject.name}</b>
                      {`（${selectedProject.builder}）`}
                    </span>
                    <button type="button" onClick={() => pickProject("")}>
                      換一個
                    </button>
                  </div>
                ) : (
                  <>
                    {draft.projectId && (
                      <small className={styles.projWarn}>
                        ⚠️ 這筆存的建案代號 <code>{draft.projectId}</code> 不在建案清單裡（改過名字或刪掉了？），
                        重新挑一個再存。
                      </small>
                    )}
                    <input
                      type="text"
                      placeholder={`打關鍵字找建案（共 ${projects.length} 個。案名、建商都能搜）`}
                      value={projQuery}
                      onChange={(e) => setProjQuery(e.target.value)}
                      onKeyDown={(e) => {
                        // 打完字直接按 Enter 選第一筆，手不用離開鍵盤
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        if (projMatches.length > 0) pickProject(projMatches[0].id);
                      }}
                    />
                    {projMatches.length === 0 ? (
                      <small>沒有符合的建案。少打幾個字試試（例如只打「遠雄」）。</small>
                    ) : (
                      <ul className={styles.invList}>
                        {projMatches.map((p) => (
                          <li key={p.id}>
                            <div>
                              <b>{p.name}</b>
                              <small>{`${p.builder}${p.count > 0 ? ` ・已有 ${p.count} 間` : ""}`}</small>
                            </div>
                            <button type="button" onClick={() => pickProject(p.id)}>
                              選這個
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {projPool.length > projMatches.length && (
                      <small>
                        符合的有 {projPool.length} 個，只列前 {projMatches.length} 個，多打幾個字縮小範圍。
                      </small>
                    )}
                  </>
                )}
              </div>

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

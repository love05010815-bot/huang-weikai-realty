"use client";

/**
 * /admin/fb —— 社團廣告發佈的操作介面。
 *
 * 流程：寫廣告（文案＋圖片）→ 加社團、勾社團 → 「開始發佈」把整批資料交給 Chrome 外掛
 *       （tools/fb-group-poster 的 bridge.js 在這頁監聽 postMessage）→ 外掛在 FB 逐一填好，你自己按發佈。
 *       外掛把進度寫回來，這頁即時顯示；整批結束寫進發佈紀錄。
 *
 * 🔴 資料（含廣告圖片）只存在瀏覽器 IndexedDB（idb.ts），不進資料庫、不上雲。
 * 🔴 圖片交給外掛時轉成 dataURL 放進 payload；存進 IndexedDB 前先縮到長邊 1600px，控制大小。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { idbGet, idbSet } from "./idb";
import styles from "./fb.module.css";

type AdImage = { name: string; dataUrl: string };
type Ad = { id: string; title: string; text: string; images: AdImage[]; updatedAt: number };
type GroupResult = { status: string; message: string; at: string };
type Group = { id: string; name: string; url: string; note: string; enabled: boolean; lastResult: GroupResult | null };
type Settings = { pageName: string; locale: "zh-TW" | "en"; dailyLimit: number };
type ResultRow = { groupId: string; groupName: string; status: string; message: string; at: string };
type HistoryJob = { id: string; at: number; adTitle: string; total: number; results: ResultRow[]; status: string };
type Progress = {
  status: "running" | "done" | "stopped";
  total: number;
  index: number;
  results: ResultRow[];
  today: number;
  dailyLimit: number;
  groupIds: string[];
  groupNames: Record<string, string>;
  finishedAt?: number;
};

const DEFAULT_SETTINGS: Settings = { pageName: "", locale: "zh-TW", dailyLimit: 10 };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const STATUS_LABEL: Record<string, [string, string]> = {
  posted: ["已發佈", "ok"],
  pending: ["待審核", "warn"],
  ready: ["已填好", "info"],
  filling: ["填寫中", "info"],
  failed: ["失敗", "bad"],
  skipped: ["跳過", "muted"],
  stopped: ["已停止", "muted"],
  waiting: ["等待中", "muted"],
};
const fmt = (ms: number | string) => (ms ? new Date(ms).toLocaleString("zh-TW", { hour12: false }) : "");

function normalizeGroupUrl(raw: string): string {
  let url = String(raw || "").trim();
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  try {
    const u = new URL(url);
    if (!/(^|\.)(facebook|fb)\.com$/i.test(u.hostname)) return "";
    const m = u.pathname.match(/\/groups\/([^/?#]+)/i);
    if (!m) return "";
    return `https://www.facebook.com/groups/${m[1]}/`;
  } catch {
    return "";
  }
}

async function fileToResizedDataUrl(file: File, max = 1600, quality = 0.85): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("圖片讀取失敗"));
      i.src = dataUrl;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    if (scale >= 1 && dataUrl.length < 900_000) return dataUrl; // 已經夠小
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return dataUrl;
  }
}

export default function FbGroupManager() {
  const [tab, setTab] = useState<"publish" | "posts" | "groups" | "history" | "settings">("publish");
  const [ads, setAds] = useState<Ad[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [history, setHistory] = useState<HistoryJob[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [extVersion, setExtVersion] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wroteHistoryFor = useRef<number | null>(null);
  const currentAdTitle = useRef("");

  const showToast = useCallback((msg: string, type = "info") => {
    setToast({ msg, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  // ── 載入 ──
  useEffect(() => {
    (async () => {
      setAds(await idbGet<Ad[]>("ads", []));
      setGroups(await idbGet<Group[]>("groups", []));
      setSettings({ ...DEFAULT_SETTINGS, ...(await idbGet<Partial<Settings>>("settings", {})) });
      setHistory(await idbGet<HistoryJob[]>("history", []));
      setLoaded(true);
    })();
  }, []);
  useEffect(() => {
    if (loaded) idbSet("ads", ads);
  }, [ads, loaded]);
  useEffect(() => {
    if (loaded) idbSet("groups", groups);
  }, [groups, loaded]);
  useEffect(() => {
    if (loaded) idbSet("settings", settings);
  }, [settings, loaded]);
  useEffect(() => {
    if (loaded) idbSet("history", history);
  }, [history, loaded]);

  // ── 外掛偵測 ──
  useEffect(() => {
    const read = () => setExtVersion(document.documentElement.getAttribute("data-fbq-ext") || "");
    read();
    const t = setTimeout(read, 1200);
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-fbq-ext"] });
    return () => {
      clearTimeout(t);
      obs.disconnect();
    };
  }, []);

  // ── 進度：外掛透過 bridge → postMessage 傳回來 ──
  useEffect(() => {
    function onMsg(ev: MessageEvent) {
      if (ev.source !== window || !ev.data || ev.data.type !== "fbq:progress") return;
      const p: Progress | null = ev.data.progress;
      setProgress(p);
      setRunning(!!p && p.status === "running");
    }
    window.addEventListener("message", onMsg);
    // 重新整理後跟外掛要目前進度
    window.postMessage({ type: "fbq:progress-get" }, window.location.origin);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // 整批結束 → 寫紀錄、更新社團「上次結果」（每個 finishedAt 只寫一次）
  useEffect(() => {
    if (!progress || progress.status === "running" || !progress.finishedAt) return;
    if (wroteHistoryFor.current === progress.finishedAt) return;
    wroteHistoryFor.current = progress.finishedAt;
    const results = progress.results || [];
    setHistory((h) => [{ id: uid(), at: progress.finishedAt || Date.now(), adTitle: currentAdTitle.current, total: progress.total, results, status: progress.status }, ...h].slice(0, 100));
    setGroups((gs) => gs.map((g) => {
      const r = results.find((x) => x.groupId === g.id);
      return r ? { ...g, lastResult: { status: r.status, message: r.message, at: r.at } } : g;
    }));
    showToast(progress.status === "stopped" ? "已停止" : "整批完成", progress.status === "stopped" ? "warn" : "ok");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  // ── 廣告文案 ──
  const [editingAdId, setEditingAdId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftText, setDraftText] = useState("");
  const [draftImages, setDraftImages] = useState<AdImage[]>([]);
  const editingAd = ads.find((a) => a.id === editingAdId) || null;

  function newAd() {
    setEditingAdId(null);
    setDraftTitle("");
    setDraftText("");
    setDraftImages([]);
  }
  function editAd(a: Ad) {
    setEditingAdId(a.id);
    setDraftTitle(a.title);
    setDraftText(a.text);
    setDraftImages(a.images);
  }
  async function onPickImages(files: FileList | null) {
    if (!files) return;
    const room = 10 - draftImages.length;
    const picked = [...files].slice(0, Math.max(0, room));
    if (picked.length < files.length) showToast("最多 10 張圖片", "warn");
    const next: AdImage[] = [];
    for (const f of picked) {
      if (!/^image\//.test(f.type)) continue;
      next.push({ name: f.name, dataUrl: await fileToResizedDataUrl(f) });
    }
    setDraftImages((prev) => [...prev, ...next]);
  }
  function saveAd() {
    if (!draftText.trim() && !draftImages.length) return showToast("請先輸入內容或加圖片", "warn");
    const now = Date.now();
    if (editingAd) {
      setAds((prev) => prev.map((a) => (a.id === editingAd.id ? { ...a, title: draftTitle.trim() || "未命名文案", text: draftText, images: draftImages, updatedAt: now } : a)));
    } else {
      const a: Ad = { id: uid(), title: draftTitle.trim() || "未命名文案", text: draftText, images: draftImages, updatedAt: now };
      setAds((prev) => [a, ...prev]);
      setEditingAdId(a.id);
      setPubAdId(a.id);
    }
    showToast("文案已儲存", "ok");
  }
  function deleteAd(a: Ad) {
    if (!confirm(`刪除「${a.title}」？`)) return;
    setAds((prev) => prev.filter((x) => x.id !== a.id));
    if (editingAdId === a.id) newAd();
    showToast("已刪除", "ok");
  }

  // ── 社團 ──
  const [gName, setGName] = useState("");
  const [gUrl, setGUrl] = useState("");
  const [gNote, setGNote] = useState("");
  const [gBulk, setGBulk] = useState("");
  function addGroup() {
    const url = normalizeGroupUrl(gUrl);
    if (!url) return showToast("社團網址格式不正確，需要像 facebook.com/groups/xxxx", "bad");
    if (groups.some((g) => g.url === url)) return showToast("這個社團已經在清單裡", "warn");
    const g: Group = { id: uid(), name: gName.trim() || url.replace("https://www.facebook.com/groups/", "").replace(/\/$/, ""), url, note: gNote.trim(), enabled: true, lastResult: null };
    setGroups((prev) => [...prev, g]);
    setChecked((c) => new Set(c).add(g.id));
    setGName("");
    setGUrl("");
    setGNote("");
    showToast(`已新增：${g.name}`, "ok");
  }
  function bulkAddGroups() {
    let added = 0;
    const errors: string[] = [];
    const next = [...groups];
    const newChecked = new Set(checked);
    for (const line of gBulk.split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      let name = "";
      let u = t;
      const m = t.match(/^(.*?)\s*[|,\t]\s*(\S*(?:facebook|fb)\.com\S*)$/i);
      if (m) {
        name = m[1];
        u = m[2];
      }
      const url = normalizeGroupUrl(u);
      if (!url) {
        errors.push(t);
        continue;
      }
      if (next.some((g) => g.url === url)) continue;
      const g: Group = { id: uid(), name: name.trim() || url.replace("https://www.facebook.com/groups/", "").replace(/\/$/, ""), url, note: "", enabled: true, lastResult: null };
      next.push(g);
      newChecked.add(g.id);
      added++;
    }
    setGroups(next);
    setChecked(newChecked);
    setGBulk(errors.join("\n"));
    showToast(`新增 ${added} 個${errors.length ? `，${errors.length} 行格式不對` : ""}`, errors.length ? "warn" : "ok");
  }
  function updateGroup(id: string, patch: Partial<Group>) {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }
  function removeGroup(id: string) {
    const g = groups.find((x) => x.id === id);
    if (g && !confirm(`刪除「${g.name}」？`)) return;
    setGroups((prev) => prev.filter((x) => x.id !== id));
    setChecked((c) => {
      const n = new Set(c);
      n.delete(id);
      return n;
    });
  }

  // ── 發佈 ──
  const [pubAdId, setPubAdId] = useState<string>("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const checkedInit = useRef(false);
  useEffect(() => {
    if (!loaded || checkedInit.current) return;
    checkedInit.current = true;
    setChecked(new Set(groups.filter((g) => g.enabled).map((g) => g.id)));
    if (!pubAdId && ads[0]) setPubAdId(ads[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);
  const pubAd = ads.find((a) => a.id === pubAdId) || null;
  const checkedCount = groups.filter((g) => checked.has(g.id)).length;

  async function launch() {
    if (!extVersion) return showToast("沒偵測到外掛：請先安裝「FB 社團廣告助手」，裝好後按 F5 重新整理這頁", "bad");
    if (!pubAd) return showToast("請先選一版廣告文案", "warn");
    if (!pubAd.text.trim() && !pubAd.images.length) return showToast("這版文案沒有內容", "warn");
    const picked = groups.filter((g) => checked.has(g.id));
    if (!picked.length) return showToast("請至少勾選一個社團", "warn");
    if (!settings.pageName && !confirm("你還沒在設定裡填粉專名稱，系統就無法自動確認發文身分（可能用個人帳號發）。仍要繼續嗎？")) return;

    currentAdTitle.current = pubAd.title;
    const payload = {
      v: 1,
      pageName: settings.pageName,
      locale: settings.locale,
      dailyLimit: settings.dailyLimit,
      requirePageIdentity: true,
      ad: { text: pubAd.text, images: pubAd.images.map((im) => im.dataUrl) },
      groups: picked.map((g) => ({ id: g.id, name: g.name, url: g.url })),
    };
    const ok = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        window.removeEventListener("message", onAck);
        resolve(false);
      }, 5000);
      function onAck(ev: MessageEvent) {
        if (ev.source !== window || !ev.data || ev.data.type !== "fbq:ack" || ev.data.action !== "launch") return;
        clearTimeout(timer);
        window.removeEventListener("message", onAck);
        resolve(!!ev.data.ok);
      }
      window.addEventListener("message", onAck);
      window.postMessage({ type: "fbq:launch", payload }, window.location.origin);
    });
    if (ok) {
      setRunning(true);
      showToast("已交給外掛，正在開第一個社團…到那個分頁操作", "ok");
    } else {
      showToast("外掛沒回應。到 chrome://extensions 按那張卡片的 ↻，回來重新整理這頁再試", "bad");
    }
  }
  async function stop() {
    window.postMessage({ type: "fbq:stop" }, window.location.origin);
    showToast("已送出停止", "warn");
  }

  const badge = (status: string) => {
    const [label, cls] = STATUS_LABEL[status] || [status, "muted"];
    return <span className={`${styles.badge} ${styles["b_" + cls] || ""}`}>{label}</span>;
  };

  if (!loaded) return <p className={styles.hint}>載入中…</p>;

  const tabs: [typeof tab, string][] = [
    ["publish", "🚀 發佈"],
    ["posts", "📝 廣告文案"],
    ["groups", "👥 社團清單"],
    ["history", "📜 發佈紀錄"],
    ["settings", "⚙️ 設定"],
  ];
  const missing: string[] = [];
  if (!ads.length) missing.push("到「廣告文案」寫一版廣告");
  if (!groups.length) missing.push("到「社團清單」加入社團");
  if (!settings.pageName) missing.push("到「設定」填粉專名稱");
  if (!extVersion) missing.push("安裝「FB 社團廣告助手」外掛（裝法在設定頁）");

  return (
    <div className={styles.wrap}>
      <div className={styles.statusbar}>
        <span>
          <span className={`${styles.dot} ${extVersion ? styles.dotOn : ""}`} />
          {extVersion ? `外掛已安裝 v${extVersion}` : "未偵測到外掛"}
        </span>
        <span>今日已發：<b>{progress?.today ?? 0}</b> / {settings.dailyLimit > 0 ? settings.dailyLimit : "不限"}</span>
      </div>

      <div className={styles.tabs}>
        {tabs.map(([k, label]) => (
          <button key={k} type="button" className={`${styles.chip} ${tab === k ? styles.chipOn : ""}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {/* ── 發佈 ── */}
      {tab === "publish" && (
        <>
          {missing.length > 0 && (
            <section className={`${styles.card} ${styles.warnCard}`}>
              <b>開始之前：</b>
              <ol className={styles.ol}>
                {missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ol>
            </section>
          )}
          <div className={styles.grid2}>
            <section className={styles.card}>
              <h2 className={styles.h2}>1. 選一版廣告</h2>
              <select className={styles.input} value={pubAdId} onChange={(e) => setPubAdId(e.target.value)}>
                {ads.length ? (
                  ads.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title}
                      {a.images.length ? `（${a.images.length} 張圖）` : ""}
                    </option>
                  ))
                ) : (
                  <option value="">（請先建立文案）</option>
                )}
              </select>
              {pubAd ? (
                <div className={styles.preview}>
                  <div className={styles.pre}>{pubAd.text}</div>
                  {pubAd.images.length > 0 && (
                    <div className={styles.thumbsSm}>
                      {pubAd.images.map((im, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={i} src={im.dataUrl} alt="" />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className={styles.hint}>尚未選擇文案</p>
              )}
            </section>
            <section className={styles.card}>
              <h2 className={styles.h2}>2. 方式</h2>
              <p className={styles.hint}>
                外掛會自動打開社團、切成粉專身分、填好文案和圖片，然後停下來。<b>你自己核對後按 Facebook 的「發佈」</b>，
                再點面板上的「下一個社團」，就換下一個。這是最安全的做法。
              </p>
              <p className={styles.hint}>
                每天最多發 <b>{settings.dailyLimit > 0 ? `${settings.dailyLimit} 個社團` : "不限"}</b>（可到設定改）。
                同一篇短時間發太多社團容易被 Facebook 判定垃圾訊息。
              </p>
            </section>
          </div>

          <section className={styles.card}>
            <div className={styles.between}>
              <h2 className={styles.h2}>
                3. 勾選社團 <span className={styles.hintInline}>（已勾 {checkedCount} / {groups.length}）</span>
              </h2>
              <div>
                <button type="button" className={styles.btnSm} onClick={() => setChecked(new Set(groups.filter((g) => g.enabled).map((g) => g.id)))}>
                  全選啟用中
                </button>
                <button type="button" className={styles.btnSm} onClick={() => setChecked(new Set())}>
                  全部取消
                </button>
              </div>
            </div>
            {groups.length ? (
              <div className={styles.checklist}>
                {groups.map((g) => (
                  <label key={g.id} className={`${styles.checkItem} ${g.enabled ? "" : styles.disabled}`}>
                    <input
                      type="checkbox"
                      checked={checked.has(g.id)}
                      onChange={(e) =>
                        setChecked((c) => {
                          const n = new Set(c);
                          if (e.target.checked) n.add(g.id);
                          else n.delete(g.id);
                          return n;
                        })
                      }
                    />
                    <span className={styles.ciName}>{g.name}</span>
                    {g.lastResult && badge(g.lastResult.status)}
                  </label>
                ))}
              </div>
            ) : (
              <p className={styles.hint}>還沒有社團，請到「社團清單」新增。</p>
            )}
          </section>

          <div className={styles.actions}>
            <button type="button" className={styles.runBig} onClick={launch} disabled={running}>
              ▶ 開始發佈
            </button>
            {running && (
              <button type="button" className={styles.btnDanger} onClick={stop}>
                ■ 停止
              </button>
            )}
          </div>

          {progress && (progress.results.length > 0 || progress.status === "running") && (
            <section className={styles.card}>
              <div className={styles.between}>
                <h2 className={styles.h2}>
                  進度 {badge(progress.status === "running" ? "filling" : progress.status)}
                </h2>
                <span className={styles.hintInline}>
                  {progress.results.filter((r) => r.status === "posted").length} 已發 ·{" "}
                  {progress.results.filter((r) => r.status === "skipped").length} 跳過 ·{" "}
                  {progress.results.filter((r) => r.status === "failed").length} 失敗
                </span>
              </div>
              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: `${progress.total ? Math.round((progress.results.filter((r) => r).length / progress.total) * 100) : 0}%` }} />
              </div>
              <ul className={styles.results}>
                {progress.groupIds.map((id, i) => {
                  const r = progress.results[i];
                  const name = progress.groupNames[id] || id;
                  if (r) {
                    return (
                      <li key={id}>
                        {badge(r.status)}
                        <b>{name}</b>
                        <span className={styles.msg}>{r.message}</span>
                      </li>
                    );
                  }
                  const st = progress.status === "running" && progress.index === i ? "filling" : progress.status === "running" ? "waiting" : "skipped";
                  return (
                    <li key={id} className={st === "filling" ? styles.rowActive : ""}>
                      {badge(st)}
                      <b>{name}</b>
                    </li>
                  );
                })}
              </ul>
              {progress.status === "running" && <p className={styles.hint}>到 Facebook 分頁操作：核對內容 → 按「發佈」→ 按面板的「下一個社團」。</p>}
            </section>
          )}
        </>
      )}

      {/* ── 廣告文案 ── */}
      {tab === "posts" && (
        <div className={styles.gridSide}>
          <section className={styles.card}>
            <div className={styles.between}>
              <h2 className={styles.h2}>已儲存</h2>
              <button type="button" className={styles.btnSm} onClick={newAd}>
                ＋ 新文案
              </button>
            </div>
            <ul className={styles.items}>
              {ads.length ? (
                ads.map((a) => (
                  <li key={a.id} className={editingAdId === a.id ? styles.itemActive : ""} onClick={() => editAd(a)}>
                    <b>{a.title}</b>
                    <div className={styles.tiny}>
                      {fmt(a.updatedAt)}
                      {a.images.length ? ` · ${a.images.length} 張圖` : ""}
                    </div>
                    <div className={`${styles.tiny} ${styles.clamp}`}>{a.text.slice(0, 50)}</div>
                  </li>
                ))
              ) : (
                <li className={styles.hint}>還沒有文案</li>
              )}
            </ul>
          </section>
          <section className={styles.card}>
            <h2 className={styles.h2}>{editingAd ? "編輯文案" : "新文案"}</h2>
            <label className={styles.lbl}>標題（只給自己看，方便辨認）</label>
            <input className={styles.input} value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} placeholder="例：9月 梧棲藍線捷運宅" />
            <label className={styles.lbl}>貼文內容（會原封不動發到每個社團）</label>
            <textarea className={styles.ta} rows={12} value={draftText} onChange={(e) => setDraftText(e.target.value)} placeholder="貼文文字，可換行、可用 emoji 與 #標籤" spellCheck={false} />
            <div className={styles.hintInline}>{[...draftText].length} 字</div>
            <label className={styles.lbl}>圖片（最多 10 張，依順序上傳）</label>
            <input type="file" accept="image/*" multiple onChange={(e) => { onPickImages(e.target.files); e.currentTarget.value = ""; }} />
            {draftImages.length > 0 && (
              <div className={styles.thumbs}>
                {draftImages.map((im, i) => (
                  <div key={i} className={styles.thumb}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={im.dataUrl} alt="" />
                    <button type="button" onClick={() => setDraftImages((prev) => prev.filter((_, j) => j !== i))} title="移除">
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className={styles.actions}>
              <button type="button" className={styles.run} onClick={saveAd}>
                💾 儲存文案
              </button>
              {editingAd && (
                <button type="button" className={styles.btnDanger} onClick={() => deleteAd(editingAd)}>
                  刪除這篇
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      {/* ── 社團清單 ── */}
      {tab === "groups" && (
        <>
          <div className={styles.grid2}>
            <section className={styles.card}>
              <h2 className={styles.h2}>新增社團</h2>
              <label className={styles.lbl}>社團名稱</label>
              <input className={styles.input} value={gName} onChange={(e) => setGName(e.target.value)} placeholder="例：台中海線房屋交流" />
              <label className={styles.lbl}>社團網址</label>
              <input className={styles.input} value={gUrl} onChange={(e) => setGUrl(e.target.value)} placeholder="https://www.facebook.com/groups/xxxx" />
              <label className={styles.lbl}>備註</label>
              <input className={styles.input} value={gNote} onChange={(e) => setGNote(e.target.value)} placeholder="例：需管理員審核" />
              <div className={styles.actions}>
                <button type="button" className={styles.run} onClick={addGroup}>
                  ＋ 新增
                </button>
              </div>
            </section>
            <section className={styles.card}>
              <h2 className={styles.h2}>批次貼上</h2>
              <p className={styles.hint}>一行一個。可以只貼網址，或「名稱 | 網址」。</p>
              <textarea className={styles.ta} rows={7} value={gBulk} onChange={(e) => setGBulk(e.target.value)} placeholder={"台中房屋買賣 | https://www.facebook.com/groups/123456\nhttps://www.facebook.com/groups/haixian.house"} spellCheck={false} />
              <div className={styles.actions}>
                <button type="button" className={styles.run} onClick={bulkAddGroups}>
                  批次新增
                </button>
              </div>
            </section>
          </div>
          <section className={styles.card}>
            <h2 className={styles.h2}>
              所有社團 <span className={styles.hintInline}>{groups.length ? `（${groups.length} 個）` : ""}</span>
            </h2>
            <p className={styles.hint}>「啟用」關掉的社團不會出現在發佈頁的預設勾選。名稱與備註可直接改。</p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>啟用</th>
                    <th>名稱</th>
                    <th>網址</th>
                    <th>備註</th>
                    <th>上次結果</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {groups.length ? (
                    groups.map((g) => (
                      <tr key={g.id} className={g.enabled ? "" : styles.disabled}>
                        <td>
                          <input type="checkbox" checked={g.enabled} onChange={(e) => updateGroup(g.id, { enabled: e.target.checked })} />
                        </td>
                        <td>
                          <input className={styles.cell} value={g.name} onChange={(e) => updateGroup(g.id, { name: e.target.value })} />
                        </td>
                        <td>
                          <a className={styles.url} href={g.url} target="_blank" rel="noopener noreferrer">
                            {g.url.replace("https://www.facebook.com/groups/", "").replace(/\/$/, "")}
                          </a>
                        </td>
                        <td>
                          <input className={styles.cell} value={g.note} onChange={(e) => updateGroup(g.id, { note: e.target.value })} placeholder="備註" />
                        </td>
                        <td>{g.lastResult ? <span title={g.lastResult.message}>{badge(g.lastResult.status)}</span> : <span className={styles.hint}>–</span>}</td>
                        <td>
                          <button type="button" className={styles.btnSmDanger} onClick={() => removeGroup(g.id)}>
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className={styles.empty}>
                        還沒有社團。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* ── 發佈紀錄 ── */}
      {tab === "history" && (
        <>
          {history.length ? (
            history.map((j) => {
              const c = (s: string) => j.results.filter((r) => r.status === s).length;
              return (
                <details key={j.id} className={`${styles.card} ${styles.job}`}>
                  <summary>
                    {badge(j.status === "done" ? "posted" : j.status)}
                    <b>{j.adTitle}</b>
                    <span className={styles.hintInline}>
                      {fmt(j.at)} · {j.total} 個社團
                    </span>
                    <span className={styles.counts}>
                      已發 {c("posted")} · 待審核 {c("pending")} · 失敗 {c("failed")} · 跳過 {c("skipped")}
                    </span>
                  </summary>
                  <ul className={styles.results}>
                    {j.results.map((r, i) => (
                      <li key={i}>
                        {badge(r.status)}
                        <b>{r.groupName}</b>
                        <span className={styles.msg}>{r.message}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })
          ) : (
            <section className={styles.card}>
              <p className={styles.hint}>還沒有發佈紀錄。</p>
            </section>
          )}
        </>
      )}

      {/* ── 設定 ── */}
      {tab === "settings" && (
        <>
          <section className={styles.card}>
            <h2 className={styles.h2}>發文設定</h2>
            <label className={styles.lbl}>粉專名稱（用來確認發文身分；要和 Facebook 上顯示的一樣）</label>
            <input className={styles.input} value={settings.pageName} onChange={(e) => setSettings((s) => ({ ...s, pageName: e.target.value }))} placeholder="例：房產找瑋凱" />
            <div className={styles.grid2}>
              <div>
                <label className={styles.lbl}>Facebook 介面語言</label>
                <select className={styles.input} value={settings.locale} onChange={(e) => setSettings((s) => ({ ...s, locale: e.target.value as "zh-TW" | "en" }))}>
                  <option value="zh-TW">繁體中文</option>
                  <option value="en">English</option>
                </select>
              </div>
              <div>
                <label className={styles.lbl}>每日最多發幾個社團（0 = 不限）</label>
                <input className={styles.input} type="number" min={0} value={settings.dailyLimit} onChange={(e) => setSettings((s) => ({ ...s, dailyLimit: Math.max(0, Number(e.target.value) || 0) }))} />
              </div>
            </div>
            <p className={styles.okText}>設定會自動儲存。</p>
          </section>

          <section className={styles.card}>
            <h2 className={styles.h2}>安裝外掛（第一次）</h2>
            <ol className={styles.steps}>
              <li>Chrome 打開 <code>chrome://extensions</code>，右上角開「開發人員模式」。</li>
              <li>按「載入未封裝項目」，選資料夾 <code>booking-system\tools\fb-group-poster</code>。</li>
              <li>回到這頁按 F5 重新整理，上面會顯示「外掛已安裝」。</li>
              <li>先到 Facebook 登入，並切換成你的粉專身分（右上角頭像 → 查看所有個人檔案 → 選粉專）。</li>
            </ol>
            <p className={styles.hint}>{extVersion ? `目前偵測到外掛 v${extVersion}。` : "目前還沒偵測到外掛。"}</p>
          </section>

          <section className={`${styles.card} ${styles.warnCard}`}>
            <h2 className={styles.h2}>⚠ 使用前請了解</h2>
            <ul className={styles.ul}>
              <li>Facebook 在 2024 年停用了社團發文 API，這是用「模擬你操作瀏覽器」的方式運作，<b>不符合 Meta 服務條款</b>，帳號或粉專有被限制的可能，請自行評估。</li>
              <li>同一篇短時間發到很多社團是被判垃圾訊息的主因。建議每天 10 個社團以內、只發允許廣告的社團、遵守各社團版規。</li>
              <li>Facebook 常改版，若外掛面板說「找不到發文框」，多半是介面變了，要更新外掛的 <code>fb-selectors.js</code>。</li>
            </ul>
          </section>
        </>
      )}

      {toast && <div className={`${styles.toast} ${styles["t_" + toast.type] || ""}`}>{toast.msg}</div>}
    </div>
  );
}

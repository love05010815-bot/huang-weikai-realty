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
// 🔴 只 import 純邏輯，不要 import `@/config/fb-tail`：這支會被同事版外掛整包編進去（tools/fb-group-poster/app），
//    那裡面是黃瑋凱本人的尾段（電話、證號）。他的尾段由 FbAdminManager 用 props 傳進來。
import { truncatedLinks, withTail } from "@/lib/fb-tail-core";
import { idbGet, idbSet } from "./idb";
import styles from "./fb.module.css";

type AdImage = { name: string; dataUrl: string };
type Ad = { id: string; title: string; text: string; images: AdImage[]; updatedAt: number };
type GroupResult = { status: string; message: string; at: string };
type Group = { id: string; name: string; url: string; note: string; enabled: boolean; lastResult: GroupResult | null; identityIds?: string[] };
/**
 * 外掛從 Facebook「你的社團」抓回來的一筆（還沒進清單，等他勾）。
 * ⚠️ 這裡的 id 是 **FB 的社團代號**，跟 Group.id（本機亂數）不是同一件事，不要混用。
 */
type ScanGroup = { id: string; name: string; url: string };
type ScanState = { status: "scanning" | "done"; found?: number; groups?: ScanGroup[]; error?: string; stopped?: boolean; at?: number };
/**
 * 發文身分：貼文最後會掛在誰名下。
 * kind="page" 粉專（同一個 FB 帳號底下切換，外掛可以自己切）
 * kind="account" 另一個 FB 帳號（要你自己換 Chrome 使用者／登入，工具只負責認人、不碰密碼）
 */
type Identity = { id: string; name: string; kind: "page" | "account"; note: string };
/** tailText＝固定尾段，每則廣告自動接在文案後面（預設值在 config/fb-tail.ts） */
type Settings = { pageName: string; locale: "zh-TW" | "en"; dailyLimit: number; tailText: string };
type ResultRow = { groupId: string; groupName: string; status: string; message: string; at: string };
type HistoryJob = { id: string; at: number; adTitle: string; identityName?: string; total: number; results: ResultRow[]; status: string };
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

/** 預設設定；固定尾段的預設值由外面給（後台＝黃瑋凱的那段、同事版＝空白讓同事自己填） */
const defaultSettings = (tail: string): Settings => ({ pageName: "", locale: "zh-TW", dailyLimit: 10, tailText: tail });

export type ImportDraft = { title: string; text: string; missing: string[] };
/** 「從愛屋帶入」打哪裡：後台走 /api/admin/fb/*（Google 登入）、同事版走 weikaihouse.com/api/fb-ext/*（授權碼） */
export type FbImportApi = {
  houseol(input: string): Promise<{ ok: boolean; error?: string; caseId?: string; photos?: string[]; draft?: ImportDraft }>;
  photo(url: string): Promise<{ ok: boolean; error?: string; dataUrl?: string }>;
};
const postJson = async (url: string, body: unknown) =>
  (await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json();
const ADMIN_IMPORT_API: FbImportApi = {
  houseol: (input) => postJson("/api/admin/fb/houseol", { input }),
  photo: (url) => postJson("/api/admin/fb/houseol-photo", { url }),
};

export type FbGroupManagerProps = {
  /** admin＝weikaihouse.com 的後台頁；extension＝同事版外掛自己的 app.html */
  mode?: "admin" | "extension";
  /** 固定尾段第一次的預設值 */
  defaultTail?: string;
  /** 載入舊設定時的補丁（後台用來把截斷的網址換掉）；同事版不用 */
  migrateTail?: (tail: string) => string;
  /** 同事版：授權碼有效才給發佈／抓社團／帶入；後台永遠 true */
  licensed?: boolean;
  /** 沒授權時按按鈕要講的話 */
  licenseHint?: string;
  importApi?: FbImportApi;
};
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

/**
 * 縮圖：長邊超過 max 就用 canvas 縮，回新的 dataURL。
 * 自己選的檔案與從愛屋型錄抓回來的照片共用這一支 —— 兩邊都要存進 IndexedDB，大小規矩要一樣。
 * ⚠️ 只吃 dataURL（同源），不要餵它 http 的圖：跨網域的圖畫進 canvas 會污染，toDataURL 直接丟例外。
 */
async function resizeDataUrl(dataUrl: string, max = 1600, quality = 0.85): Promise<string> {
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

async function fileToResizedDataUrl(file: File, max = 1600, quality = 0.85): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  return resizeDataUrl(dataUrl, max, quality);
}

export default function FbGroupManager({
  mode = "admin",
  defaultTail = "",
  migrateTail,
  licensed = true,
  licenseHint = "先在最上面貼授權碼、按「儲存並驗證」",
  importApi = ADMIN_IMPORT_API,
}: FbGroupManagerProps) {
  const [tab, setTab] = useState<"publish" | "posts" | "groups" | "history" | "settings">("publish");
  const [ads, setAds] = useState<Ad[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [settings, setSettings] = useState<Settings>(() => defaultSettings(defaultTail));
  const [history, setHistory] = useState<HistoryJob[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [extVersion, setExtVersion] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wroteHistoryFor = useRef<number | null>(null);
  const currentAdTitle = useRef("");
  const currentIdentityName = useRef("");

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
      const s = { ...defaultSettings(defaultTail), ...(await idbGet<Partial<Settings>>("settings", {})) };
      // 後台：他 9/18 之前存的尾段裡有三條被截斷的死連結（樂屋／FB粉專／YouTube）→ 開頁時換成完整網址
      if (migrateTail) s.tailText = migrateTail(s.tailText);
      setSettings(s);
      // 舊資料只有單一「粉專名稱」→ 自動升級成第一個發文身分，不用他重打
      let ids = await idbGet<Identity[]>("identities", []);
      if (!ids.length && s.pageName.trim()) {
        ids = [{ id: uid(), name: s.pageName.trim(), kind: "page", note: "從舊設定的粉專名稱自動帶入" }];
        await idbSet("identities", ids);
      }
      setIdentities(ids);
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
    if (loaded) idbSet("identities", identities);
  }, [identities, loaded]);
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

  // ── 進度／抓回來的社團：外掛透過 bridge → postMessage 傳回來 ──
  useEffect(() => {
    function onMsg(ev: MessageEvent) {
      if (ev.source !== window || !ev.data) return;
      if (ev.data.type === "fbq:progress") {
        const p: Progress | null = ev.data.progress;
        setProgress(p);
        setRunning(!!p && p.status === "running");
      } else if (ev.data.type === "fbq:scan-state") {
        setScan((ev.data.scan as ScanState | null) || null);
      }
    }
    window.addEventListener("message", onMsg);
    // 重新整理後跟外掛要目前進度與上次抓到的社團
    window.postMessage({ type: "fbq:progress-get" }, window.location.origin);
    window.postMessage({ type: "fbq:scan-get" }, window.location.origin);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // 整批結束 → 寫紀錄、更新社團「上次結果」（每個 finishedAt 只寫一次）
  useEffect(() => {
    if (!progress || progress.status === "running" || !progress.finishedAt) return;
    if (wroteHistoryFor.current === progress.finishedAt) return;
    wroteHistoryFor.current = progress.finishedAt;
    const results = progress.results || [];
    setHistory((h) =>
      [
        {
          id: uid(),
          at: progress.finishedAt || Date.now(),
          adTitle: currentAdTitle.current,
          identityName: currentIdentityName.current,
          total: progress.total,
          results,
          status: progress.status,
        },
        ...h,
      ].slice(0, 100),
    );
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

  /* 從愛屋連結帶入這一戶的資料（案名／開價／路名／格局／坪數／樓別／屋齡／車位／環境特色）。
   * 真正去抓型錄的是 `/api/admin/fb/houseol`（伺服器端，網域擋在 lib 裡）。 */
  const [impInput, setImpInput] = useState("");
  const [impBusy, setImpBusy] = useState(false);
  const [impMissing, setImpMissing] = useState<string[]>([]);
  /** 上次帶入那一戶的型錄照片網址（還沒抓圖，等他按「帶入型錄照片」） */
  const [impPhotos, setImpPhotos] = useState<string[]>([]);
  const [picBusy, setPicBusy] = useState(false);
  const [picDone, setPicDone] = useState(0);
  const [picTotal, setPicTotal] = useState(0);

  function newAd() {
    setEditingAdId(null);
    setDraftTitle("");
    setDraftText("");
    setDraftImages([]);
    setImpMissing([]);
  }
  function editAd(a: Ad) {
    setEditingAdId(a.id);
    setDraftTitle(a.title);
    setDraftText(a.text);
    setDraftImages(a.images);
    setImpMissing([]);
  }
  async function importFromHouseol() {
    const input = impInput.trim();
    if (!input) return showToast("先貼愛屋的物件連結，或直接打案號（例：AA6352434）", "warn");
    if (!licensed) return showToast(`🔒 ${licenseHint}`, "bad");
    // 打字打到一半被蓋掉最嘔，先問過
    if ((draftText.trim() || draftTitle.trim()) && !confirm("帶入會蓋掉現在這篇的標題與內容，確定嗎？")) return;
    setImpBusy(true);
    setImpMissing([]);
    try {
      const j = await importApi.houseol(input);
      if (!j.ok || !j.draft) return showToast(j.error || "帶入失敗", "bad");
      setDraftTitle(j.draft.title);
      setDraftText(j.draft.text);
      setImpMissing(j.draft.missing || []);
      setImpPhotos(Array.isArray(j.photos) ? j.photos : []);
      setPicDone(0);
      showToast(`已帶入 ${j.caseId || ""}，記得看一下再存`, "ok");
    } catch (e) {
      showToast(`連不上伺服器：${e instanceof Error ? e.message : String(e)}`, "bad");
    } finally {
      setImpBusy(false);
    }
  }
  /**
   * 把型錄照片一張一張抓回來放進這篇文案。
   * 🔴 一次叫伺服器抓完 12 張會超時（2026-09-17 在 map-listings 踩過）—— 迴圈放這裡，一張一個請求，
   *    每抓好一張畫面就多一張縮圖，看得到進度。
   * 🔴 `setDraftImages` 一定要用函式版：迴圈裡連續改同一個 state，用閉包裡那份會讓後面幾張蓋掉前面的。
   * 圖片只存在他自己的瀏覽器（IndexedDB），跟他自己選的檔案走同一條路。
   */
  async function importPhotos() {
    const room = 10 - draftImages.length;
    if (room <= 0) return showToast("已經有 10 張了，先移掉幾張再帶", "warn");
    const list = impPhotos.slice(0, room);
    if (!list.length) return showToast("這一戶的型錄上沒有照片", "warn");
    if (!licensed) return showToast(`🔒 ${licenseHint}`, "bad");
    setPicBusy(true);
    setPicDone(0);
    setPicTotal(list.length);
    let failed = 0;
    for (let i = 0; i < list.length; i++) {
      try {
        const j = await importApi.photo(list[i]);
        if (!j.ok || !j.dataUrl) {
          failed++;
          continue;
        }
        const small = await resizeDataUrl(j.dataUrl);
        setDraftImages((prev) => (prev.length >= 10 ? prev : [...prev, { name: `型錄-${i + 1}`, dataUrl: small }]));
        setPicDone(i + 1);
      } catch {
        failed++;
      }
    }
    setPicBusy(false);
    const got = list.length - failed;
    showToast(failed ? `帶入 ${got} 張，${failed} 張失敗` : `已帶入 ${got} 張照片`, failed ? "warn" : "ok");
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
  /* ── 從 FB 抓我加入的社團 ──
   * 外掛在他自己的 Chrome 裡開「你的社團」分頁、往下捲、收集社團名稱與網址回傳，
   * 這裡只負責讓他逐一勾選再加進清單。🔴 抓到的東西只留在瀏覽器，不進資料庫。 */
  const [scan, setScan] = useState<ScanState | null>(null);
  const [scanPick, setScanPick] = useState<Set<string>>(new Set());
  const [scanFilter, setScanFilter] = useState("");
  const scanning = scan?.status === "scanning";
  const haveUrls = new Set(groups.map((g) => g.url));
  const scanGroups = scan?.groups || [];
  const scanNew = scanGroups.filter((s) => !haveUrls.has(normalizeGroupUrl(s.url)));
  const scanShown = scanFilter.trim() ? scanGroups.filter((s) => s.name.toLowerCase().includes(scanFilter.trim().toLowerCase())) : scanGroups;

  // 抓回新的一批 → 預設幫他勾「還沒在清單裡」的，已經有的不重複勾
  const scanSeenAt = useRef<number>(0);
  useEffect(() => {
    if (!scan || scan.status !== "done" || !scan.groups || !scan.at || scanSeenAt.current === scan.at) return;
    scanSeenAt.current = scan.at;
    const have = new Set(groups.map((g) => g.url));
    setScanPick(new Set(scan.groups.filter((s) => !have.has(normalizeGroupUrl(s.url))).map((s) => s.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan]);

  async function startScan() {
    if (!extVersion) return showToast("沒偵測到外掛：請先安裝／更新「FB 社團廣告助手」，裝好後按 F5 重新整理這頁", "bad");
    if (!licensed) return showToast(`🔒 ${licenseHint}`, "bad");
    setScanPick(new Set());
    // 等外掛回話再說「已開分頁」：同事版沒授權時背景程式會拒絕，不能假裝開了
    const ack = await askExt("scan-start", { type: "fbq:scan-start", locale: settings.locale });
    if (!ack.ok) return showToast(ack.error || "外掛沒回應。到 chrome://extensions 按那張卡片的 ↻，回來重新整理這頁再試", "bad");
    setScan({ status: "scanning", found: 0 });
    showToast("已開一個 Facebook 分頁去抓，讓它留在前景跑完", "ok");
  }
  function clearScan() {
    window.postMessage({ type: "fbq:scan-clear" }, window.location.origin);
    setScan(null);
    setScanPick(new Set());
    setScanFilter("");
  }
  function importScanned() {
    const picked = scanGroups.filter((s) => scanPick.has(s.id));
    if (!picked.length) return showToast("沒有勾選任何社團", "warn");
    const next = [...groups];
    const newChecked = new Set(checked);
    let added = 0;
    let dup = 0;
    for (const s of picked) {
      const url = normalizeGroupUrl(s.url);
      if (!url) continue;
      if (next.some((g) => g.url === url)) {
        dup++;
        continue;
      }
      const g: Group = {
        id: uid(),
        name: s.name.trim() || url.replace("https://www.facebook.com/groups/", "").replace(/\/$/, ""),
        url,
        note: "從 FB 抓回來的",
        enabled: true,
        lastResult: null,
      };
      next.push(g);
      newChecked.add(g.id);
      added++;
    }
    setGroups(next);
    setChecked(newChecked);
    setScanPick(new Set());
    showToast(`已加入 ${added} 個${dup ? `，${dup} 個本來就在清單裡` : ""}`, added ? "ok" : "warn");
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
  const [pubIdentityId, setPubIdentityId] = useState<string>("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const checkedInit = useRef(false);
  const pubIdentity = identities.find((i) => i.id === pubIdentityId) || null;
  /** 沒標身分的社團＝每個身分都能發（相容舊資料）；標了就只在那些身分底下出現 */
  const groupsForIdentity = (idId: string) =>
    groups.filter((g) => !g.identityIds || g.identityIds.length === 0 || (!!idId && g.identityIds.includes(idId)));
  const visibleGroups = groupsForIdentity(pubIdentityId);
  useEffect(() => {
    if (!loaded || checkedInit.current) return;
    checkedInit.current = true;
    if (!pubAdId && ads[0]) setPubAdId(ads[0].id);
    if (!pubIdentityId && identities[0]) setPubIdentityId(identities[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);
  // 換身分 → 重新預選那個身分底下、啟用中的社團（不同帳號加入的社團不一樣）
  useEffect(() => {
    if (!loaded) return;
    setChecked(new Set(groupsForIdentity(pubIdentityId).filter((g) => g.enabled).map((g) => g.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubIdentityId, loaded]);
  const pubAd = ads.find((a) => a.id === pubAdId) || null;
  /** 真正會貼到 FB 的內容＝這一戶的文案 ＋ 固定尾段。預覽跟發佈用同一個值，看到什麼就發什麼。 */
  const finalText = pubAd ? withTail(pubAd.text, settings.tailText) : "";
  const checkedCount = visibleGroups.filter((g) => checked.has(g.id)).length;

  async function launch() {
    if (!extVersion) return showToast("沒偵測到外掛：請先安裝「FB 社團廣告助手」，裝好後按 F5 重新整理這頁", "bad");
    if (!pubAd) return showToast("請先選一版廣告文案", "warn");
    if (!pubAd.text.trim() && !pubAd.images.length) return showToast("這版文案沒有內容", "warn");
    if (!pubIdentity) return showToast("請先選發文身分（沒有的話到「設定」新增）", "warn");
    const picked = visibleGroups.filter((g) => checked.has(g.id));
    if (!picked.length) return showToast("請至少勾選一個社團", "warn");
    if (
      pubIdentity.kind === "account" &&
      !confirm(`這批要用「${pubIdentity.name}」這個帳號發。請先確認 Chrome 目前登入的就是它（工具不會、也不能替你切換帳號）。現在就是這個帳號嗎？`)
    )
      return;
    // 固定尾段裡有被截斷的連結就先問一次 —— 發出去是死連結，客戶點不到
    const bad = truncatedLinks(finalText);
    if (bad.length && !confirm(`固定尾段裡有 ${bad.length} 條連結是截斷的（… 結尾），發出去客戶點不開：\n\n${bad.join("\n")}\n\n到「設定 → 固定尾段」貼完整網址比較好。仍要照發嗎？`))
      return;

    currentAdTitle.current = pubAd.title;
    currentIdentityName.current = pubIdentity.name;
    const payload = {
      v: 1,
      pageName: pubIdentity.name, // 舊版外掛只認 pageName，留著相容
      identity: { name: pubIdentity.name, kind: pubIdentity.kind },
      locale: settings.locale,
      dailyLimit: settings.dailyLimit,
      requirePageIdentity: true,
      ad: { text: finalText, images: pubAd.images.map((im) => im.dataUrl) },
      groups: picked.map((g) => ({ id: g.id, name: g.name, url: g.url })),
    };
    const ack = await askExt("launch", { type: "fbq:launch", payload });
    if (ack.ok) {
      setRunning(true);
      showToast("已交給外掛，正在開第一個社團…到那個分頁操作", "ok");
    } else {
      // 同事版沒授權、後台資料格式不對…外掛會講原因；完全沒回話才是外掛沒載好
      showToast(ack.error || "外掛沒回應。到 chrome://extensions 按那張卡片的 ↻，回來重新整理這頁再試", "bad");
    }
  }
  /** 丟訊息給外掛（bridge.js 轉給背景程式）並等它回 fbq:ack；5 秒沒回就當沒裝好 */
  function askExt(action: string, msg: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        window.removeEventListener("message", onAck);
        resolve({ ok: false });
      }, 5000);
      function onAck(ev: MessageEvent) {
        if (ev.source !== window || !ev.data || ev.data.type !== "fbq:ack" || ev.data.action !== action) return;
        clearTimeout(timer);
        window.removeEventListener("message", onAck);
        resolve({ ok: !!ev.data.ok, error: typeof ev.data.error === "string" ? ev.data.error : undefined });
      }
      window.addEventListener("message", onAck);
      window.postMessage(msg, window.location.origin);
    });
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
  if (!identities.length) missing.push("到「設定」新增發文身分（粉專或帳號，可以多個）");
  if (!extVersion && mode === "admin") missing.push("安裝「FB 社團廣告助手」外掛（裝法在設定頁）");
  if (!licensed) missing.push("在最上面貼授權碼、按「儲存並驗證」");

  return (
    <div className={styles.wrap}>
      <div className={styles.statusbar}>
        <span>
          <span className={`${styles.dot} ${extVersion ? styles.dotOn : ""}`} />
          {extVersion ? `外掛已安裝 v${extVersion}` : "未偵測到外掛"}
        </span>
        {mode === "extension" && !licensed && <span className={styles.warnText}>🔒 {licenseHint}</span>}
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
                  {/* 預覽＝真正會貼出去的全文（含固定尾段），所見即所發 */}
                  <div className={styles.pre}>{finalText}</div>
                  {settings.tailText.trim() && <p className={styles.hintInline}>↑ 尾段是「設定」裡的固定尾段，每則自動接上。</p>}
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
              <h2 className={styles.h2}>2. 用哪個身分發</h2>
              {identities.length ? (
                <>
                  <select className={styles.input} value={pubIdentityId} onChange={(e) => setPubIdentityId(e.target.value)}>
                    {identities.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}（{i.kind === "page" ? "粉專" : "帳號"}）
                      </option>
                    ))}
                  </select>
                  {pubIdentity?.kind === "account" ? (
                    <p className={styles.warnText}>
                      ⚠ 這是<b>另一個 FB 帳號</b>。發之前請先自己把 Chrome 切到登入「{pubIdentity.name}」的那個視窗
                      （工具不會也不能替你登入或切帳號）。外掛會在每個社團先認人，對不上就停下來問你，不會用錯帳號發出去。
                    </p>
                  ) : (
                    <p className={styles.hint}>粉專身分外掛會自己在發文視窗切好；切不過去會停下來問你，不會硬發。</p>
                  )}
                  {pubIdentity?.note && <p className={styles.hint}>備註：{pubIdentity.note}</p>}
                  <p className={styles.hint}>
                    每天最多發 <b>{settings.dailyLimit > 0 ? `${settings.dailyLimit} 個社團` : "不限"}</b>
                    （<b>每個身分分開算</b>，可到設定改）。同一篇短時間發太多社團容易被判定垃圾訊息。
                  </p>
                </>
              ) : (
                <p className={styles.hint}>還沒有發文身分，請到「設定」新增（可以放 2～3 個粉專或帳號）。</p>
              )}
            </section>
          </div>

          <section className={styles.card}>
            <div className={styles.between}>
              <h2 className={styles.h2}>
                3. 勾選社團{" "}
                <span className={styles.hintInline}>
                  （已勾 {checkedCount} / {visibleGroups.length}
                  {pubIdentity ? `，${pubIdentity.name} 的社團` : ""}）
                </span>
              </h2>
              <div>
                <button type="button" className={styles.btnSm} onClick={() => setChecked(new Set(visibleGroups.filter((g) => g.enabled).map((g) => g.id)))}>
                  全選啟用中
                </button>
                <button type="button" className={styles.btnSm} onClick={() => setChecked(new Set())}>
                  全部取消
                </button>
              </div>
            </div>
            {visibleGroups.length ? (
              <div className={styles.checklist}>
                {visibleGroups.map((g) => (
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
              <p className={styles.hint}>
                {groups.length
                  ? `「${pubIdentity?.name ?? ""}」底下還沒有社團。到「社團清單」把社團標給這個身分（沒標身分的社團每個身分都會出現）。`
                  : "還沒有社團，請到「社團清單」新增。"}
              </p>
            )}
          </section>

          <div className={styles.actions}>
            <button type="button" className={styles.runBig} onClick={launch} disabled={running || !licensed}>
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
            <label className={styles.lbl}>從愛屋帶入（貼物件連結或案號）</label>
            <div className={styles.impRow}>
              <input
                className={styles.input}
                value={impInput}
                onChange={(e) => setImpInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    importFromHouseol();
                  }
                }}
                placeholder="https://www.houseol.com.tw/sell_item/… 或 AA6352434"
                spellCheck={false}
              />
              <button type="button" className={styles.btnSm} onClick={importFromHouseol} disabled={impBusy || !licensed}>
                {impBusy ? "讀取中…" : "帶入"}
              </button>
            </div>
            <p className={styles.hint}>
              會帶入<b>案名、開價、路名、格局、登記坪數、主＋附屬、樓別/樓高、屋齡、車位與車位型式、環境特色</b>，帶進來就是可以改的草稿。
              地址只到路名（型錄本來就沒有門牌號）。
            </p>
            {impMissing.length > 0 && <p className={styles.warnText}>型錄上沒讀到：{impMissing.join("、")} —— 這幾項要自己補或刪掉那一行。</p>}
            {impPhotos.length > 0 && (
              <div className={styles.actions}>
                <button type="button" className={styles.btnSm} onClick={importPhotos} disabled={picBusy || draftImages.length >= 10 || !licensed}>
                  {picBusy ? `抓照片中… ${picDone}/${picTotal}` : `📷 帶入型錄照片（${impPhotos.length} 張）`}
                </button>
                <span className={styles.hintInline}>
                  {draftImages.length >= 10 ? "已經 10 張了" : `最多再帶 ${10 - draftImages.length} 張，會接在現有圖片後面`}
                </span>
              </div>
            )}
            <label className={styles.lbl}>標題（只給自己看，方便辨認）</label>
            <input className={styles.input} value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} placeholder="例：9月 梧棲藍線捷運宅" />
            <label className={styles.lbl}>貼文內容（只寫這一戶的部分）</label>
            <textarea className={styles.ta} rows={12} value={draftText} onChange={(e) => setDraftText(e.target.value)} placeholder="貼文文字，可換行、可用 emoji 與 #標籤" spellCheck={false} />
            <div className={styles.hintInline}>
              {[...draftText].length} 字
              {settings.tailText.trim() && <>　·　發佈時會自動接上<b>固定尾段</b>（電話／LINE／個人店鋪那一段），這裡不用再貼一次。</>}
            </div>
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
          <section className={styles.card}>
            <h2 className={styles.h2}>從 FB 抓我加入的社團</h2>
            <p className={styles.hint}>
              按下去會開一個分頁到 Facebook 的「你的社團」，外掛自動往下捲，把你<b>已經加入</b>的社團名稱與網址收集回來，你在這裡逐一勾選要用哪些。
              只讀名稱與網址，<b>不會發文、不會加入或退出任何社團</b>；抓回來的清單只留在你自己的瀏覽器。
            </p>
            {!extVersion && <p className={styles.warnText}>沒偵測到外掛。先到 chrome://extensions 安裝／更新「FB 社團廣告助手」，回來按 F5 再試。</p>}
            <div className={styles.actions}>
              <button type="button" className={styles.run} onClick={startScan} disabled={scanning || !extVersion || !licensed}>
                {scanning ? "抓取中…" : "從 FB 抓我加入的社團"}
              </button>
              {scan && !scanning && (
                <button type="button" className={styles.btnSm} onClick={clearScan}>
                  清掉這次結果
                </button>
              )}
            </div>
            {scanning && (
              <p className={styles.hint}>
                抓取中…已找到 <b>{scan?.found ?? 0}</b> 個。請讓那個 Facebook 分頁留在前景，捲完會自己停。
              </p>
            )}
            {scan?.status === "done" && scan.error && <p className={styles.warnText}>抓不到：{scan.error}</p>}
            {scan?.status === "done" && !scan.error && !scanGroups.length && (
              <p className={styles.warnText}>一個社團都沒抓到。到那個分頁確認開的是「你的社團」清單，自己往下捲一點，再按面板的「再抓一次」。</p>
            )}
            {scan?.status === "done" && !!scanGroups.length && (
              <>
                <p className={styles.hint}>
                  抓到 <b>{scanGroups.length}</b> 個，其中 <b>{scanNew.length}</b> 個還沒在你的清單裡{scan.stopped ? "（你按了停止，可能還沒捲完）" : ""}。
                  勾好按下面加入；已經在清單裡的會標「已有」，不會重複加。
                </p>
                <input className={styles.input} value={scanFilter} onChange={(e) => setScanFilter(e.target.value)} placeholder="篩選名稱…（例如：房屋）" />
                <div className={styles.actions}>
                  <button type="button" className={styles.btnSm} onClick={() => setScanPick(new Set(scanShown.filter((s) => !haveUrls.has(normalizeGroupUrl(s.url))).map((s) => s.id)))}>
                    勾選畫面上還沒加入的
                  </button>
                  <button type="button" className={styles.btnSm} onClick={() => setScanPick(new Set())}>
                    全部不勾
                  </button>
                </div>
                <div className={`${styles.checklist} ${styles.scanList}`}>
                  {scanShown.map((s) => {
                    const have = haveUrls.has(normalizeGroupUrl(s.url));
                    return (
                      <label key={s.id} className={`${styles.checkItem} ${have ? styles.scanHave : ""}`} title={s.url}>
                        <input
                          type="checkbox"
                          disabled={have}
                          checked={!have && scanPick.has(s.id)}
                          onChange={(e) =>
                            setScanPick((p) => {
                              const n = new Set(p);
                              if (e.target.checked) n.add(s.id);
                              else n.delete(s.id);
                              return n;
                            })
                          }
                        />
                        <span className={styles.ciName}>{s.name}</span>
                        {have && <span className={styles.scanTag}>已有</span>}
                      </label>
                    );
                  })}
                </div>
                {!scanShown.length && <p className={styles.hint}>沒有符合「{scanFilter}」的社團。</p>}
                <div className={styles.actions}>
                  <button type="button" className={styles.run} onClick={importScanned} disabled={!scanPick.size}>
                    加入勾選的 {scanPick.size} 個社團
                  </button>
                </div>
              </>
            )}
          </section>
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
            <p className={styles.hint}>
              「啟用」關掉的社團不會出現在發佈頁的預設勾選。名稱與備註可直接改。
              {identities.length > 1 && <> 「哪個身分」勾起來，這個社團就只在那些身分底下出現；<b>都不勾＝每個身分都會出現</b>。</>}
            </p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>啟用</th>
                    <th>名稱</th>
                    <th>網址</th>
                    {identities.length > 1 && <th>哪個身分</th>}
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
                        {identities.length > 1 && (
                          <td>
                            <div className={styles.idTags}>
                              {identities.map((it) => {
                                const on = (g.identityIds || []).includes(it.id);
                                return (
                                  <label key={it.id} className={`${styles.idTag} ${on ? styles.idTagOn : ""}`} title={it.kind === "page" ? "粉專" : "帳號"}>
                                    <input
                                      type="checkbox"
                                      checked={on}
                                      onChange={(e) => {
                                        const cur = g.identityIds || [];
                                        updateGroup(g.id, { identityIds: e.target.checked ? [...cur, it.id] : cur.filter((x) => x !== it.id) });
                                      }}
                                    />
                                    {it.name || "(未命名)"}
                                  </label>
                                );
                              })}
                            </div>
                          </td>
                        )}
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
                      <td colSpan={identities.length > 1 ? 7 : 6} className={styles.empty}>
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
                      {fmt(j.at)} · {j.total} 個社團{j.identityName ? ` · 以 ${j.identityName} 發` : ""}
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
            <h2 className={styles.h2}>發文身分（可以放好幾個粉專／帳號）</h2>
            <p className={styles.hint}>
              名稱要和 <b>Facebook 上顯示的一模一樣</b>，外掛靠它認人。發佈前在「發佈」頁選要用哪一個，每個身分的每日上限分開算。
            </p>
            <p className={styles.warnText}>
              ⚠ 兩三個<b>不同帳號</b>的用法：工具<b>不會也不能</b>替你登入或切換帳號（那要碰密碼）。請幫每個帳號開一個
              Chrome 使用者（右上角頭像 →「新增」），各自登入好；要用哪個帳號發，就先切到那個 Chrome 視窗再按開始。
              外掛會在每個社團先確認發文者是不是你選的那個，對不上就停下來問你，<b>不會用錯帳號發出去</b>。
            </p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>名稱（FB 上顯示的）</th>
                    <th>類型</th>
                    <th>備註</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {identities.length ? (
                    identities.map((it) => (
                      <tr key={it.id}>
                        <td>
                          <input
                            className={styles.cell}
                            value={it.name}
                            onChange={(e) => setIdentities((prev) => prev.map((x) => (x.id === it.id ? { ...x, name: e.target.value } : x)))}
                          />
                        </td>
                        <td>
                          <select
                            className={styles.cell}
                            value={it.kind}
                            onChange={(e) => setIdentities((prev) => prev.map((x) => (x.id === it.id ? { ...x, kind: e.target.value as "page" | "account" } : x)))}
                          >
                            <option value="page">粉專</option>
                            <option value="account">帳號</option>
                          </select>
                        </td>
                        <td>
                          <input
                            className={styles.cell}
                            value={it.note}
                            placeholder="例：主帳號、公司粉專"
                            onChange={(e) => setIdentities((prev) => prev.map((x) => (x.id === it.id ? { ...x, note: e.target.value } : x)))}
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className={styles.btnSmDanger}
                            onClick={() => {
                              if (!confirm(`刪除身分「${it.name}」？（社團上標的這個身分也會一起清掉）`)) return;
                              setIdentities((prev) => prev.filter((x) => x.id !== it.id));
                              setGroups((prev) => prev.map((g) => ({ ...g, identityIds: (g.identityIds || []).filter((x) => x !== it.id) })));
                              if (pubIdentityId === it.id) setPubIdentityId("");
                            }}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className={styles.empty}>
                        還沒有身分。按下面新增，至少要有一個。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.run}
                onClick={() => {
                  const it: Identity = { id: uid(), name: "", kind: "page", note: "" };
                  setIdentities((prev) => [...prev, it]);
                  if (!pubIdentityId) setPubIdentityId(it.id);
                }}
              >
                ＋ 新增身分
              </button>
            </div>
          </section>

          <section className={styles.card}>
            <h2 className={styles.h2}>固定尾段（每則廣告自動接在文案後面）</h2>
            <p className={styles.hint}>
              電話、LINE、個人店鋪那一整段放這裡，<b>不用每次重打</b>。寫文案時只寫那一戶的內容，發佈時自動接上（中間空一行）。
              改這裡，之後每一則都跟著變。排版原封不動照貼，空行也會保留。
            </p>
            {(() => {
              const bad = truncatedLinks(settings.tailText);
              return bad.length ? (
                <p className={styles.warnText}>
                  ⚠ 有 {bad.length} 條連結是<b>截斷的</b>（… 結尾），發出去客戶點不開，請貼完整網址：
                  {bad.map((l) => (
                    <span key={l} style={{ display: "block", wordBreak: "break-all" }}>
                      · {l}
                    </span>
                  ))}
                </p>
              ) : null;
            })()}
            <textarea
              className={styles.ta}
              rows={16}
              value={settings.tailText}
              onChange={(e) => setSettings((s) => ({ ...s, tailText: e.target.value }))}
              placeholder="留空就不接任何東西"
              spellCheck={false}
            />
            <div className={styles.actions}>
              <span className={styles.hintInline}>{[...settings.tailText].length} 字</span>
              <button
                type="button"
                className={styles.btnSm}
                onClick={() => {
                  if (confirm("把固定尾段還原成一開始的版本？你現在改過的內容會被蓋掉。")) setSettings((s) => ({ ...s, tailText: defaultTail }));
                }}
              >
                還原成預設
              </button>
            </div>
          </section>

          <section className={styles.card}>
            <h2 className={styles.h2}>發文設定</h2>
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

          {mode === "admin" && (
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
          )}

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

/**
 * 後台 /admin/fb ↔ 外掛 的橋。
 *
 * 後台按「開始發佈」→ window.postMessage({ type: "fbq:launch", payload }) → 這裡轉給背景程式
 *   → 回 { type: "fbq:ack", ok }。停止／要進度／抓社團清單同理。
 * 背景程式更新進度（chrome.storage.local 的 fbq:progress）→ 這裡監聽變化 → 轉成
 *   window.postMessage({ type: "fbq:progress", progress }) 給後台畫面即時更新。
 *   抓社團清單（fbq:scan）走同一條路，轉成 { type: "fbq:scan-state", scan }。
 *
 * 為什麼用 storage 轉：後台分頁和 FB 分頁是兩個分頁，背景程式沒辦法直接 postMessage 到後台；
 * 但這支 content script 跟後台在同一頁，能監聽 storage 變化再轉給它。
 */
(() => {
  const VERSION = chrome.runtime.getManifest().version;
  document.documentElement.setAttribute("data-fbq-ext", VERSION); // 讓後台知道外掛在、版本多少

  const send = (type, extra) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type, ...(extra || {}) }, (r) => {
          const err = chrome.runtime.lastError;
          resolve(err ? { ok: false, error: err.message } : r || { ok: false, error: "no response" });
        });
      } catch (e) {
        resolve({ ok: false, error: String(e && e.message ? e.message : e) });
      }
    });

  const toPage = (data) => window.postMessage(data, window.location.origin);

  window.addEventListener("message", async (ev) => {
    if (ev.source !== window || !ev.data || typeof ev.data !== "object") return;
    const { type } = ev.data;
    if (type === "fbq:launch") {
      const r = await send("fbq:launch", { payload: ev.data.payload });
      toPage({ type: "fbq:ack", action: "launch", ok: !!r.ok, error: r.error });
    } else if (type === "fbq:stop") {
      const r = await send("fbq:stop");
      toPage({ type: "fbq:ack", action: "stop", ok: !!r.ok, error: r.error });
    } else if (type === "fbq:progress-get") {
      const r = await send("fbq:progress-get");
      toPage({ type: "fbq:progress", progress: r.progress || null, running: !!r.running });
    } else if (type === "fbq:scan-start") {
      const r = await send("fbq:scan-start", { locale: ev.data.locale });
      toPage({ type: "fbq:ack", action: "scan-start", ok: !!r.ok, error: r.error });
    } else if (type === "fbq:scan-get") {
      const r = await send("fbq:scan-get");
      toPage({ type: "fbq:scan-state", scan: r.scan || null });
    } else if (type === "fbq:scan-clear") {
      await send("fbq:scan-clear");
      toPage({ type: "fbq:scan-state", scan: null });
    }
  });

  // 背景程式更新進度／抓到的社團 → 轉給後台畫面
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes["fbq:progress"]) toPage({ type: "fbq:progress", progress: changes["fbq:progress"].newValue || null });
    if (changes["fbq:scan"]) toPage({ type: "fbq:scan-state", scan: changes["fbq:scan"].newValue || null });
  });
})();

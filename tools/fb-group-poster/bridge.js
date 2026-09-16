/**
 * 後台 /admin/fb ↔ 外掛 的橋。
 *
 * 後台按「開始發佈」→ window.postMessage({ type: "fbq:launch", payload }) → 這裡轉給背景程式
 *   → 回 { type: "fbq:ack", ok }。停止／要進度同理。
 * 背景程式更新進度（chrome.storage.local 的 fbq:progress）→ 這裡監聽變化 → 轉成
 *   window.postMessage({ type: "fbq:progress", progress }) 給後台畫面即時更新。
 *
 * 為什麼用 storage 轉進度：後台分頁和社團分頁是兩個分頁，背景程式沒辦法直接 postMessage 到後台；
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

  window.addEventListener("message", async (ev) => {
    if (ev.source !== window || !ev.data || typeof ev.data !== "object") return;
    const { type } = ev.data;
    if (type === "fbq:launch") {
      const r = await send("fbq:launch", { payload: ev.data.payload });
      window.postMessage({ type: "fbq:ack", action: "launch", ok: !!r.ok, error: r.error }, window.location.origin);
    } else if (type === "fbq:stop") {
      const r = await send("fbq:stop");
      window.postMessage({ type: "fbq:ack", action: "stop", ok: !!r.ok, error: r.error }, window.location.origin);
    } else if (type === "fbq:progress-get") {
      const r = await send("fbq:progress-get");
      window.postMessage({ type: "fbq:progress", progress: r.progress || null, running: !!r.running }, window.location.origin);
    }
  });

  // 背景程式更新進度 → 轉給後台畫面
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes["fbq:progress"]) return;
    window.postMessage({ type: "fbq:progress", progress: changes["fbq:progress"].newValue || null }, window.location.origin);
  });
})();

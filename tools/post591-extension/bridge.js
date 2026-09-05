/**
 * 後台 /admin/post591 ↔ 外掛 的橋。
 *
 * 後台按「🚀 上架到 591」→ window.postMessage({ type: "p591:launch", payload })
 * → 這裡轉給背景程式（存起來、開 591 分頁）→ 回 { type: "p591:ack", ok } 讓後台知道有沒有成功。
 *
 * 為什麼不把資料放在 591 的網址後面：2026-09-05 實測，4KB 的 #片段 會讓 591 第①頁的點擊卡死。
 */
(() => {
  document.documentElement.setAttribute("data-p591-ext", chrome.runtime.getManifest().version); // 讓後台知道外掛在
  window.addEventListener("message", (ev) => {
    if (ev.source !== window || !ev.data || ev.data.type !== "p591:launch") return;
    chrome.runtime.sendMessage({ type: "p591:launch", payload: ev.data.payload }, (r) => {
      const err = chrome.runtime.lastError;
      window.postMessage({ type: "p591:ack", ok: !!(r && r.ok), error: err ? err.message : r && r.error }, window.location.origin);
    });
  });
})();

/**
 * 後台 /admin/post591 ↔ 外掛 的橋。
 *
 * 後台按「🚀 上架到 591」→ window.postMessage({ type: "p591:launch", payload })
 * → 這裡轉給背景程式（存起來、開 591 分頁）→ 回 { type: "p591:ack", ok } 讓後台知道有沒有成功。
 * 後台 ⑤ 貼了型錄頁連結 → postMessage({ type: "p591:scan", id, url }) → 背景程式把那一頁抓回來
 * → 回 { type: "p591:scan-result", id, ok, html }，照片由後台自己從 HTML 裡撈（規則在 post591-parser.ts）。
 *
 * 為什麼不把資料放在 591 的網址後面：2026-09-05 實測，4KB 的 #片段 會讓 591 第①頁的點擊卡死。
 */
(() => {
  document.documentElement.setAttribute("data-p591-ext", chrome.runtime.getManifest().version); // 讓後台知道外掛在
  window.addEventListener("message", (ev) => {
    if (ev.source !== window || !ev.data) return;
    if (ev.data.type === "p591:launch") {
      chrome.runtime.sendMessage({ type: "p591:launch", payload: ev.data.payload }, (r) => {
        const err = chrome.runtime.lastError;
        window.postMessage({ type: "p591:ack", ok: !!(r && r.ok), error: err ? err.message : r && r.error }, window.location.origin);
      });
    } else if (ev.data.type === "p591:scan") {
      const id = ev.data.id;
      chrome.runtime.sendMessage({ type: "p591:scan", url: ev.data.url }, (r) => {
        const err = chrome.runtime.lastError;
        window.postMessage({ type: "p591:scan-result", id, ok: !!(r && r.ok), html: r && r.html ? r.html : "", error: err ? err.message : r && r.error }, window.location.origin);
      });
    }
  });
})();

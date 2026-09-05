/**
 * 背景程式：只做一件事 —— 幫網頁端把照片抓回來。
 *
 * 照片放在愛屋的圖檔主機（hq.houseol.com.tw），591 的頁面不能直接跨網域抓；
 * 擴充功能的背景程式有 host_permissions，可以。抓回來轉成 base64 丟回給 content.js，
 * 由它塞進 591 的照片 <input type="file">。
 *
 * ⚠️ 這裡不會、也不准去 591 或愛屋抓「資料」—— 只抓使用者自己那一戶的照片檔。
 */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "p591:fetch") return false;
  (async () => {
    try {
      const res = await fetch(msg.url, { credentials: "omit" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      sendResponse({ ok: true, b64: btoa(bin), type: res.headers.get("content-type") || "image/jpeg" });
    } catch (e) {
      sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
    }
  })();
  return true; // 非同步回覆
});

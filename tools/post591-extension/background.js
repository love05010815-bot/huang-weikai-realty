/**
 * 背景程式做四件事：
 *   ① 點工具列圖示 → 開外掛自己的頁面 app.html（同事版入口：貼資料 → 解析 → 上架，不需要任何後台）
 *   ② 保管資料包（chrome.storage.session，關瀏覽器就沒了）並開 591 刊登分頁
 *      —— 資料包來源有兩個：app.html（同事版）或 weikaihouse.com 後台的 bridge.js（後台版）
 *   ③ 591 頁面的 content.js 來要資料就給它、填完就清掉
 *   ④ 幫 content.js 把愛屋圖檔主機（hq.houseol.com.tw）的照片抓回來 —— 591 頁面本身不能跨網域抓
 *   ⑤ 使用者貼了型錄頁連結時，把那一頁抓回來給頁面端撈嵌在頁面上的照片（型錄頁的網址本身沒有照片清單）
 *
 * ⚠️ 這裡不會、也不准去 591 或愛屋抓「資料」—— 只抓使用者自己那一戶的照片檔。
 *
 * 591 第①頁四連點對應的網址參數（2026-09-05 實測）：
 *   /post/two/sale?is_use_first=1&kind=<現況>&shape=<型態>&purpose=<法定用途>&purpose_custom=
 *   認得的組合直接開第②頁、跳過第①頁；不認得的才開第①頁用點的。
 */
const KEY = "p591:payload";
const KIND = { 住宅: 9 };
const SHAPE = { 電梯大樓: 2, 透天厝: 3, 華廈: 5 }; // 2026-09-05 從他真實上架的網址學到華廈=5
const PURPOSE = { 住家用: 3, 住商用: 4 };

function launchUrl(p) {
  const f = (p && p.first) || {};
  const k = KIND[f.status], s = SHAPE[f.type], u = PURPOSE[f.legal];
  if (k && s && u) return "https://user.591.com.tw/post/two/sale?is_use_first=1&kind=" + k + "&shape=" + s + "&purpose=" + u + "&purpose_custom=";
  return "https://user.591.com.tw/post/first";
}

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("app.html") });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return false;
  const reply = (fn) => {
    fn().then((r) => sendResponse(r)).catch((e) => sendResponse({ ok: false, error: String(e && e.message ? e.message : e) }));
    return true; // 非同步回覆
  };
  if (msg.type === "p591:launch") {
    return reply(async () => {
      if (!msg.payload || msg.payload.v !== 1) throw new Error("資料格式不對");
      await chrome.storage.session.set({ [KEY]: msg.payload });
      await chrome.tabs.create({ url: launchUrl(msg.payload) });
      return { ok: true };
    });
  }
  if (msg.type === "p591:get") {
    return reply(async () => {
      const o = await chrome.storage.session.get(KEY);
      return { ok: true, payload: o[KEY] || null };
    });
  }
  if (msg.type === "p591:clear") {
    return reply(async () => {
      await chrome.storage.session.remove(KEY);
      return { ok: true };
    });
  }
  if (msg.type === "p591:scan") {
    // 只抓使用者自己貼進來的那一頁愛屋型錄（es.houseol.com.tw/*.aspx），回傳 HTML 讓頁面端撈這一戶的照片網址
    return reply(async () => {
      const u = new URL(String(msg.url || ""));
      if (!(u.hostname === "houseol.com.tw" || u.hostname.endsWith(".houseol.com.tw"))) throw new Error("只掃愛屋型錄頁");
      const res = await fetch(u.href, { credentials: "omit" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const html = await res.text();
      return { ok: true, html: html.slice(0, 2000000) };
    });
  }
  if (msg.type === "p591:fetch") {
    return reply(async () => {
      const res = await fetch(msg.url, { credentials: "omit" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const bytes = new Uint8Array(await res.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return { ok: true, b64: btoa(bin), type: res.headers.get("content-type") || "image/jpeg" };
    });
  }
  return false;
});

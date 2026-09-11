/**
 * 背景程式做四件事：
 *   ① 點工具列圖示 → 開外掛自己的頁面 app.html（同事版入口：貼資料 → 解析 → 上架，不需要任何後台）
 *   ② 保管資料包（chrome.storage.session，關瀏覽器就沒了）並開 591 刊登分頁
 *      —— 資料包來源有兩個：app.html（同事版）或 weikaihouse.com 後台的 bridge.js（後台版）
 *   ③ 591 頁面的 content.js 來要資料就給它、填完就清掉
 *   ④ 幫 content.js 把愛屋圖檔主機（hq.houseol.com.tw）的照片抓回來 —— 591 頁面本身不能跨網域抓
 *   ⑤ 使用者貼了型錄頁連結時，把那一頁抓回來給頁面端撈嵌在頁面上的照片（型錄頁的網址本身沒有照片清單）
 *   ⑥ 同事版的授權碼（2026-09-11 起）：app.html 來的上架要先過 license.js 的檢查（向 weikaihouse.com 驗、綁這台 Chrome）；
 *      後台 bridge.js 來的不用 —— 那是他自己，後台已經有 Google 登入白名單。
 *
 * ⚠️ 這裡不會、也不准去 591 或愛屋抓「資料」—— 只抓使用者自己那一戶的照片檔。
 *
 * 591 第①頁四連點對應的網址參數（2026-09-05 實測）：
 *   /post/two/sale?is_use_first=1&kind=<現況>&shape=<型態>&purpose=<法定用途>&purpose_custom=
 *   認得的組合直接開第②頁、跳過第①頁；不認得的才開第①頁用點的。
 */
const KEY = "p591:payload";

importScripts("license.js"); // 同事版授權：規則、快取、離線處理都在那支
const license = self.P591License.create({
  storage: { get: (k) => chrome.storage.local.get(k), set: (o) => chrome.storage.local.set(o) },
  fetch: (u, o) => fetch(u, o),
  version: chrome.runtime.getManifest().version,
});
/** 訊息是不是從外掛自己的頁面（app.html，同事版）來的；後台 bridge.js 來的 sender.url 是 weikaihouse.com */
const fromAppPage = (sender) => !!(sender && sender.url && sender.url.startsWith(chrome.runtime.getURL("")));

const KIND = { 住宅: 9 };
const SHAPE = { 電梯大樓: 2, 透天厝: 3, 華廈: 5 }; // 2026-09-05 從他真實上架的網址學到華廈=5
const PURPOSE = { 住家用: 3, 住商用: 4 };

const KIND_RENT = { 整層住家: 1 }; // 2026-09-09 從第①頁點出來的網址學到：出租 kind=1 整層住家、shape 同出售

function launchUrl(p) {
  const f = (p && p.first) || {};
  if (p && p.target === "rakuya") return p.deal === "rent" ? "https://member.rakuya.com.tw/rent/post/add" : "https://member.rakuya.com.tw/sell/post/add"; // 樂屋一頁式，沒有第①頁
  if (p && p.deal === "rent") {
    const rk = KIND_RENT[f.status], rs = SHAPE[f.type];
    if (rk && rs) return "https://user.591.com.tw/post/two/rent?is_use_first=1&kind=" + rk + "&shape=" + rs + "&purpose=&purpose_custom=";
    return "https://user.591.com.tw/post/first";
  }
  const k = KIND[f.status], s = SHAPE[f.type], u = PURPOSE[f.legal];
  if (k && s && u) return "https://user.591.com.tw/post/two/sale?is_use_first=1&kind=" + k + "&shape=" + s + "&purpose=" + u + "&purpose_custom=";
  return "https://user.591.com.tw/post/first";
}

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("app.html") });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return false;
  const reply = (fn) => {
    fn().then((r) => sendResponse(r)).catch((e) => sendResponse({ ok: false, error: String(e && e.message ? e.message : e) }));
    return true; // 非同步回覆
  };
  if (msg.type === "p591:launch") {
    return reply(async () => {
      if (!msg.payload || msg.payload.v !== 1) throw new Error("資料格式不對");
      const viaApp = fromAppPage(sender);
      if (viaApp) {
        // 同事版：沒有有效授權碼就不開分頁；把 license 一起回去，外掛頁才能顯示原因。
        // event=launch → 這一次一定問伺服器並記一次上架（後台的使用人次）
        const lic = await license.check({ event: "launch" });
        if (!lic.ok) return { ok: false, error: self.P591License.message(lic), license: lic };
      }
      msg.payload.via = viaApp ? "app" : "bridge"; // content.js／rakuya.js 據此決定填表前要不要再驗一次
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
  if (msg.type === "p591:license-check") {
    return reply(async () => {
      const lic = await license.check({ force: !!msg.force });
      return { ok: true, license: lic, message: self.P591License.message(lic) };
    });
  }
  if (msg.type === "p591:license-set") {
    // 只有外掛自己的頁面能改授權碼（591／樂屋頁面上的 content script 沒理由改它）
    return reply(async () => {
      if (!fromAppPage(sender)) throw new Error("只有外掛頁面能改授權碼");
      const lic = await license.setKey(msg.key);
      return { ok: true, license: lic, message: self.P591License.message(lic) };
    });
  }
  return false;
});

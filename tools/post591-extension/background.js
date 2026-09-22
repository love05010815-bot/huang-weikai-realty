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
/**
 * 資料包一個平台一格（2026-09-14 起，為了「591＋樂屋一起上架」）：
 *   p591:payload:591／p591:payload:rakuya。content.js 在 591 頁、rakuya.js 在樂屋頁，各拿各的格，
 *   兩個分頁同時開也不會搶到對方的資料包。
 * 「一起上架」＝ 591 的資料包裡帶 chain（樂屋的資料包）：先存進樂屋那格並標 queued、只開 591 分頁；
 *   591 填完 content.js 來 p591:clear 時，看到樂屋那格還在排隊就順手開樂屋分頁 —— 兩個分頁輪流在前景填，
 *   不會有一個一直在背景被 Chrome 放慢。
 */
const LEGACY_KEY = "p591:payload";
const slotOf = (target) => "p591:payload:" + (target === "rakuya" ? "rakuya" : "591");
/** content script 在哪個平台：看 sender 的網址 */
const targetOfSender = (sender) => (sender && sender.url && /rakuya\.com\.tw/.test(sender.url) ? "rakuya" : "591");

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
      const via = viaApp ? "app" : "bridge"; // content.js／rakuya.js 據此決定填表前要不要再驗一次
      const chain = msg.payload.chain && typeof msg.payload.chain === "object" ? msg.payload.chain : null;
      delete msg.payload.chain;
      msg.payload.via = via;
      const store = { [slotOf(msg.payload.target)]: msg.payload };
      if (chain) {
        // 一起上架：樂屋的資料包先排隊，等 591 那邊填完（p591:clear）再開分頁
        chain.via = via;
        chain.target = "rakuya";
        chain.queued = true;
        store[slotOf("rakuya")] = chain;
      }
      await chrome.storage.session.set(store);
      await chrome.storage.session.remove(LEGACY_KEY);
      await chrome.tabs.create({ url: launchUrl(msg.payload) });
      return { ok: true, chained: !!chain };
    });
  }
  if (msg.type === "p591:get") {
    return reply(async () => {
      const key = slotOf(targetOfSender(sender));
      const o = await chrome.storage.session.get(key);
      const p = o[key] || null;
      return { ok: true, payload: p && !p.queued ? p : null }; // 還在排隊的樂屋資料包不給（分頁還沒輪到它）
    });
  }
  if (msg.type === "p591:clear") {
    return reply(async () => {
      const target = targetOfSender(sender);
      await chrome.storage.session.remove(slotOf(target));
      if (target === "591") {
        // 591 填完了：樂屋那格若還在排隊，現在開它的分頁（會變成前景分頁，接著填）
        const rk = slotOf("rakuya");
        const o = await chrome.storage.session.get(rk);
        if (o[rk] && o[rk].queued) {
          const p = { ...o[rk] };
          delete p.queued;
          await chrome.storage.session.set({ [rk]: p });
          await chrome.tabs.create({ url: launchUrl(p) });
          return { ok: true, opened: "rakuya" };
        }
      }
      return { ok: true };
    });
  }
  if (msg.type === "p591:scan") {
    // 只抓使用者自己貼進來的那一頁愛屋型錄（es.houseol.com.tw/*.aspx），回傳 HTML 讓頁面端撈這一戶的照片網址
    return reply(async () => {
      const u = new URL(String(msg.url || ""));
      if (!(u.hostname === "houseol.com.tw" || u.hostname.endsWith(".houseol.com.tw"))) throw new Error("只掃愛屋型錄頁");
      // 帶 cookie（2026-09-14 起）：登入愛屋的型錄頁才有「顯示」門牌那顆按鈕（完整地址在它的 alt），匿名頁只印路名。
      // 只會用在使用者自己貼的那一頁愛屋型錄，而且只是讀。
      const res = await fetch(u.href, { credentials: "include" });
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
  if (msg.type === "p591:photo-stats") {
    /**
     * 每張照片的「長相統計」：白底比例、灰階比例、尺寸 —— 用來認出格局圖（591 出售有專屬那一格）。
     * 為什麼在背景算：頁面讀不到跨網域圖片的像素（canvas 會被污染），背景有這幾個網域的權限。
     * 縮到 64 寬再數，一張約幾毫秒；判斷門檻不在這裡，在 post591-parser 的 pickFloorPlan（那支有測試）。
     */
    return reply(async () => {
      const urls = (Array.isArray(msg.urls) ? msg.urls : []).slice(0, 40);
      const stats = [];
      for (const url of urls) {
        try {
          const res = await fetch(url, { credentials: "omit" });
          if (!res.ok) continue;
          const bmp = await createImageBitmap(await res.blob());
          const w = Math.min(64, bmp.width);
          const h = Math.max(1, Math.round((bmp.height / bmp.width) * w));
          const cv = new OffscreenCanvas(w, h);
          const cx = cv.getContext("2d", { willReadFrequently: true });
          cx.drawImage(bmp, 0, 0, w, h);
          const { data } = cx.getImageData(0, 0, w, h);
          let white = 0,
            gray = 0;
          const n = w * h;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i],
              g = data[i + 1],
              b = data[i + 2];
            const mx = Math.max(r, g, b),
              mn = Math.min(r, g, b);
            if (mn > 235) white++;
            if (mx - mn < 24) gray++;
          }
          stats.push({ url, white: white / n, gray: gray / n, width: bmp.width, height: bmp.height });
          bmp.close();
        } catch {
          /* 這張算不出來就跳過（壞連結、格式怪），不影響其他張 */
        }
      }
      return { ok: true, stats };
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

/**
 * PRIM 店內查詢頁（prim.pacific.com.tw/store/*，要登入）—— 把「畫面上看得到的那一行門牌」記在這台電腦。
 *
 * 2026-11-20 他要「用委託編號或 S／P／R 編號帶到門牌號」。公開來源（官網、分享連結、愛屋型錄）都只到路名，
 * 完整門牌只在登入後的 PRIM 物件抽屜最上面那一行。這支程式做的事只有一件：
 *   使用者自己查詢／點開物件 → 讀畫面上那幾列的「門牌」「委託編號」「案名」→ 存進 chrome.storage.local。
 * 之後在外掛頁貼分享連結／編號帶入時，app.js 用委託編號或案名對回來，自動填「號、樓、之」。
 *
 * 🔴 界線（不要越過）：
 *   - 只讀 DOM 上已經顯示的字。**不呼叫 PRIM 的接口、不碰登入權杖／cookie**（那支接口光帶 cookie 回 401，別想辦法繞）。
 *   - 門牌只存在這台電腦的瀏覽器（chrome.storage.local），**不送伺服器、不進 repo**。
 *   - 只記使用者自己查出來、畫面上看得到的那幾列，不主動查詢、不翻頁、不批次抓。
 */
(() => {
  "use strict";
  const KEY = "p591:primAddr";
  const MAX = 300; // 最多記幾戶（舊的先丟）
  const TTL = 180 * 24 * 3600 * 1000; // 半年沒再看過的丟掉

  const txt = (e) => (e && e.textContent ? e.textContent.replace(/\s+/g, " ").trim() : "");
  const CONTRACT = /^A[A-Z]\d{7}$/;
  // 門牌長相：縣市＋區＋…＋號（後面可有「○樓之○」）。一定要有「號」才算完整門牌
  const ADDR = /^[一-龥]{2}[縣市][一-龥]{1,4}[區鄉鎮市].{1,30}\d+\s*號.{0,12}$/;

  /** PRIM 把沒有「段」的路也印成「測試三路段9號」—— 「路／街／道」後面直接接「段」又接數字，那個「段」是空的，拿掉 */
  const cleanAddr = (s) =>
    s
      .replace(/\s+/g, "")
      .replace(/([路街道])段(?=\d)/, "$1")
      .replace(/^臺/, "台");

  /**
   * 畫面上每一個「委託編號」往上找，找到同時包住一條門牌的那一層（搜尋結果是同一列 <tr>、物件明細是同一個區塊）。
   * 往上爬到那一層如果包住兩個以上的委託編號＝已經爬到整張表了，分不出誰是誰 → 這一個放棄。
   * 2026-11-20 實看：搜尋結果每一列就有 案名（div.font-bold）／委託編號（div.font-mono）／門牌（span.truncate）。
   */
  function readAll() {
    const visible = (e) => e.offsetParent !== null;
    const leaves = [...document.querySelectorAll("td, div, span, p, h1, h2, h3")].filter((e) => e.children.length === 0 && visible(e));
    const ids = leaves.filter((e) => CONTRACT.test(txt(e)));
    const out = [];
    for (const idEl of ids) {
      let box = idEl.parentElement;
      for (let i = 0; i < 10 && box && box !== document.body; i++, box = box.parentElement) {
        const inside = [...box.querySelectorAll("td, div, span, p, h1, h2, h3")].filter((e) => e.children.length === 0 && visible(e));
        if (inside.filter((e) => CONTRACT.test(txt(e))).length > 1) break;
        const addrEl = inside.find((e) => ADDR.test(txt(e).replace(/ /g, "")));
        if (!addrEl) continue;
        // 案名：這一層裡粗體或標題、4～40 字、不是門牌也不是編號的，取字最大的那個
        const cands = inside.filter((e) => {
          const t = txt(e);
          if (t.length < 4 || t.length > 40 || e === addrEl || e === idEl) return false;
          return /^H[1-3]$/.test(e.tagName) || Number(getComputedStyle(e).fontWeight) >= 600;
        });
        cands.sort((x, y) => parseFloat(getComputedStyle(y).fontSize) - parseFloat(getComputedStyle(x).fontSize));
        out.push({ id: txt(idEl).toUpperCase(), title: cands.length ? txt(cands[0]) : "", addr: cleanAddr(txt(addrEl)) });
        break;
      }
    }
    return out;
  }

  let lastSaved = "";
  async function save(recs) {
    const sig = recs.map((r) => `${r.id}|${r.title}|${r.addr}`).join(";");
    if (sig === lastSaved) return;
    lastSaved = sig;
    try {
      const o = await chrome.storage.local.get(KEY);
      const now = Date.now();
      let list = Array.isArray(o[KEY]) ? o[KEY] : [];
      const before = new Set(list.map((x) => x && `${x.id}|${x.addr}`));
      const fresh = recs.filter((r) => !before.has(`${r.id}|${r.addr}`)).length;
      const ids = new Set(recs.map((r) => r.id));
      list = list.filter((x) => x && now - (x.t || 0) < TTL && !ids.has(x.id));
      list.unshift(...recs.map((r) => ({ id: r.id, title: r.title, addr: r.addr, t: now })));
      await chrome.storage.local.set({ [KEY]: list.slice(0, MAX) });
      if (fresh) toast(`591 刊登助手：記下 ${fresh} 戶的門牌，之後帶入會自動填`);
    } catch {
      /* 外掛剛重新載入、舊分頁的 chrome.storage 失效：重新整理這一頁就好，不吵他 */
    }
  }

  let toastEl = null;
  let toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.style.cssText =
        "position:fixed;left:16px;bottom:16px;z-index:2147483647;background:#1f2937;color:#fff;padding:8px 12px;border-radius:8px;font:13px/1.4 system-ui,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.25);pointer-events:none;max-width:60vw";
      document.documentElement.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.display = "block";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastEl.style.display = "none"), 3500);
  }

  let timer = null;
  const check = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const recs = readAll();
      if (recs.length) save(recs);
    }, 600);
  };
  new MutationObserver(check).observe(document.documentElement, { childList: true, subtree: true });
  check();
})();

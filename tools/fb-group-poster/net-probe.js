/**
 * FB 社團廣告助手：網路探針（跑在頁面本身的 world，不是外掛的隔離 world；manifest 用 "world": "MAIN"）。
 *
 * 為什麼要有這支（2026-10-12）：他一天遇到好幾次「無法上傳相片／抱歉，沒有上傳新的相片」，哪幾張失敗每次不一樣
 * （ad-2；ad-1、2、3 加 3 張；ad-9、10），光看畫面查不出 Facebook 為什麼退件。這支把頁面送出的「上傳類」請求的**結果**
 * 記下來（狀態碼、耗時、FB 回的錯誤碼與錯誤文字、當時分頁在不在前景），用 postMessage 丟給 content.js 印在面板、
 * 寫進發佈紀錄，下次再失敗就看得到真正的原因。
 *
 * 🔴 只記錄：不改任何請求、不攔截、不送到任何地方（留在這個分頁裡，content.js 收了也只寫進他自己瀏覽器的紀錄）。
 * 🔴 記的是網址的主機＋路徑（不含查詢字串，那裡面有 token）、檔名（外掛自己取的 ad-N.jpg）、大小；
 *    回應只留 error／errorSummary／errorDescription 三個欄位，其他一律丟掉。
 */
(() => {
  if (window.__fbqNetProbe) return;
  window.__fbqNetProbe = true;

  const WATCH = /upload|photo|attachment|media/i;
  // 刪除貼文（2026-11-05）：分頁在背景時 FB 不更新畫面，看不到確認框關掉；改看 FB 的 GraphQL 請求——
  // 刪除是 POST /api/graphql/，body 裡 fb_api_req_friendly_name=…Delete…Mutation。只記「名字像刪除」的那幾筆，回應只看有沒有 errors。
  const GQL = /\/api\/graphql\/?$/i;
  const DELETE_OP = /delet|remov/i;
  const opOf = (body) => {
    try {
      if (!body) return "";
      if (typeof body === "string") {
        const m = body.match(/(?:^|&)fb_api_req_friendly_name=([^&]*)/);
        return m ? decodeURIComponent(m[1]) : "";
      }
      if (body instanceof URLSearchParams) return body.get("fb_api_req_friendly_name") || "";
      if (body instanceof FormData) return String(body.get("fb_api_req_friendly_name") || "");
    } catch {}
    return "";
  };
  const pathOf = (url) => {
    try {
      const u = new URL(String(url), location.href);
      return u.host + u.pathname;
    } catch {
      return String(url || "").slice(0, 120);
    }
  };
  const filesIn = (body) => {
    const out = [];
    if (!body) return out;
    try {
      if (body instanceof FormData) {
        for (const v of body.values()) if (v instanceof Blob) out.push({ name: v.name || "", size: v.size });
      } else if (body instanceof Blob) {
        out.push({ name: body.name || "", size: body.size });
      }
    } catch {}
    return out;
  };
  const parseFb = (text) => {
    const t = String(text || "")
      .replace(/^for \(;;\);/, "")
      .trim();
    if (!t) return { empty: true };
    try {
      const j = JSON.parse(t);
      // GraphQL 回應：{ data, errors:[{message|summary}] }——只留第一條錯誤的字
      const ge = Array.isArray(j.errors) && j.errors.length ? String(j.errors[0].summary || j.errors[0].message || "error").slice(0, 120) : undefined;
      return { error: j.error, summary: j.errorSummary, desc: j.errorDescription, payload: !!j.payload, data: !!j.data, gqlError: ge };
    } catch {
      return { raw: t.slice(0, 120) };
    }
  };
  const report = (rec) => {
    try {
      window.postMessage({ source: "fbq-net", rec }, location.origin);
    } catch {}
  };
  // content.js 載入後會 ping 一下，確認探針真的裝上了（沒按 ↻ 的舊分頁就沒有）
  // fbq-net-watch：接下來 ms 毫秒內「所有」GraphQL 請求的名字都記（刪除那一下用：萬一 FB 的刪除叫別的名字，面板印出來就知道要補哪個字）
  let watchUntil = 0;
  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data) return;
    if (e.data.source === "fbq-net-ping") report({ kind: "hello" });
    if (e.data.source === "fbq-net-watch") watchUntil = Date.now() + Math.min(Number(e.data.ms) || 0, 30000);
  });
  const wantOp = (op) => !!op && (DELETE_OP.test(op) || Date.now() < watchUntil);

  // XMLHttpRequest
  const XO = XMLHttpRequest.prototype.open;
  const XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__fbq = { method: String(method || "GET"), url: pathOf(url) };
    return XO.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    const info = this.__fbq;
    const files = filesIn(body);
    const op = info && GQL.test(info.url) ? opOf(body) : "";
    if (wantOp(op)) info.op = op;
    if (info && (WATCH.test(info.url) || files.length || info.op)) {
      const t0 = Date.now();
      const done = (kind) => {
        let text = "";
        try {
          if (kind === "load") {
            if (this.responseType === "" || this.responseType === "text") text = this.responseText;
            else if (this.responseType === "json") text = JSON.stringify(this.response);
          }
        } catch {}
        report({ ...info, kind, status: this.status, t0, ms: Date.now() - t0, files, fb: kind === "load" ? parseFb(text) : undefined, vis: document.visibilityState });
      };
      this.addEventListener("load", () => done("load"));
      this.addEventListener("error", () => done("error"));
      this.addEventListener("abort", () => done("abort"));
      this.addEventListener("timeout", () => done("timeout"));
    }
    return XS.apply(this, arguments);
  };

  // fetch
  const F = window.fetch;
  window.fetch = function (input, init) {
    const url = pathOf(typeof input === "string" ? input : input && input.url);
    const body = init && init.body;
    const files = filesIn(body);
    const op0 = GQL.test(url) ? opOf(body) : "";
    const op = wantOp(op0) ? op0 : "";
    if (!WATCH.test(url) && !files.length && !op) return F.apply(this, arguments);
    const t0 = Date.now();
    const base = { method: String((init && init.method) || (input && input.method) || "GET"), url, t0, files, op: op || undefined };
    return F.apply(this, arguments).then(
      (res) => {
        try {
          res
            .clone()
            .text()
            .then(
              (text) => report({ ...base, kind: "load", status: res.status, ms: Date.now() - t0, fb: parseFb(text), vis: document.visibilityState }),
              () => report({ ...base, kind: "load", status: res.status, ms: Date.now() - t0, fb: { unreadable: true }, vis: document.visibilityState }),
            );
        } catch {}
        return res;
      },
      (err) => {
        report({ ...base, kind: err && err.name === "AbortError" ? "abort" : "error", ms: Date.now() - t0, vis: document.visibilityState });
        throw err;
      },
    );
  };
})();

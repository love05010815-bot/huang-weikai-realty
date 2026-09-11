/**
 * 同事版的授權檢查（2026-09-11 他說的：同事版 9/20 後失效、要綁定不可外流）。
 *
 * 背景程式 importScripts 這個檔；app.html／content.js／rakuya.js 都透過訊息（p591:license-check）問背景程式，
 * 不自己打伺服器。規則：
 *   - 授權碼存 chrome.storage.local（p591:licenseKey）；安裝編號第一次用時 crypto.randomUUID() 產一個存起來，
 *     這台 Chrome 就靠它綁定（重裝／換資料夾載入會變成新的一台，要請黃瑋凱解除綁定）。
 *   - 向 https://weikaihouse.com/api/post591-ext/verify 驗；伺服器說 ok 就快取 6 小時，不 ok 不快取（下次再問，
 *     後台改了立刻生效）。按「上架」那一次帶 event=launch 一定打伺服器，伺服器順便記上架次數（後台看使用人次用）。
 *   - 連不上伺服器（沒網路、伺服器掛、限流）：上次驗證回來的到期日已過 → 擋；3 天內驗過 ok → 先放行；否則擋。
 *     所以離線用不會超過到期日，資料庫短暫掛掉也不會讓大家一起停擺。
 *   - 後台（weikaihouse.com）來的資料包不驗 —— 那是他自己，後台已經有 Google 登入白名單。
 *
 * ⚠️ 這是明碼 JS，擋的是「檔案轉傳就能用」，不是防駭。
 * 寫成 deps 注入（storage／fetch／now／uuid）是為了 scripts/check-ext-license.mjs 能在 node 裡測規則。
 */
(function (root) {
  const VERIFY_URL = "https://weikaihouse.com/api/post591-ext/verify";
  const KEY = "p591:licenseKey";
  const INSTALL = "p591:installId";
  const CACHE = "p591:licenseCache";
  const OK_TTL = 6 * 60 * 60 * 1000; // 驗過 ok 的 6 小時內不再打伺服器
  const OFFLINE_GRACE = 3 * 24 * 60 * 60 * 1000; // 連不上伺服器：3 天內驗過 ok 就先放行

  function create(deps) {
    const storage = deps.storage; // { get(key) → { [key]: value }, set(obj) }
    const fetchFn = deps.fetch;
    const now = deps.now || (() => Date.now());
    const uuid = deps.uuid || (() => crypto.randomUUID());
    const version = deps.version || "";

    async function installId() {
      const o = await storage.get(INSTALL);
      if (o[INSTALL]) return o[INSTALL];
      const id = uuid();
      await storage.set({ [INSTALL]: id });
      return id;
    }
    async function getKey() {
      const o = await storage.get(KEY);
      return String(o[KEY] || "").trim();
    }
    /** 使用者在外掛頁存了新的授權碼：清掉快取、立刻驗一次 */
    async function setKey(key) {
      await storage.set({ [KEY]: String(key || "").trim(), [CACHE]: null });
      return check({ force: true });
    }
    async function check(opts) {
      // event="launch"：按上架那一次一定打伺服器（不用快取），伺服器順便記一次上架 —— 後台「有幾個人在用」看的就是這個
      const event = opts && typeof opts.event === "string" ? opts.event : "";
      const force = !!(opts && opts.force) || !!event;
      const id = await installId();
      const key = await getKey();
      if (!key) return { ok: false, reason: "no_key_set", installId: id };
      const o = await storage.get(CACHE);
      const c = o[CACHE] && o[CACHE].key === key ? o[CACHE] : null;
      const t = now();
      // 本機硬上限：上次伺服器回來的到期日過了，就算離線也擋
      const expiredLocally = !!(c && c.expiresAt && t > Date.parse(c.expiresAt));
      if (!force && c && c.ok && !expiredLocally && t - c.checkedAt < OK_TTL) return { ...c, cached: true, installId: id };

      let r;
      try {
        const res = await fetchFn(VERIFY_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key, installId: id, version, event }),
          credentials: "omit",
        });
        if (res.status === 429 || res.status >= 500) throw new Error("HTTP " + res.status);
        r = await res.json();
        if (!r || typeof r.ok !== "boolean") throw new Error("回應格式不對");
      } catch (e) {
        if (expiredLocally) return { ok: false, reason: "expired", expiresAt: c.expiresAt, expiresText: c.expiresText, name: c.name, installId: id };
        if (c && c.ok && t - c.checkedAt < OFFLINE_GRACE) return { ...c, cached: true, offline: true, installId: id };
        return { ok: false, reason: "offline", detail: String((e && e.message) || e), installId: id };
      }
      const entry = {
        ok: r.ok,
        reason: r.reason || "",
        name: r.name || "",
        expiresAt: r.expiresAt || "",
        expiresText: r.expiresText || "",
        key,
        checkedAt: t,
      };
      await storage.set({ [CACHE]: entry });
      return { ...entry, installId: id };
    }
    return { check, setKey, getKey, installId };
  }

  const MESSAGES = {
    no_key_set: "還沒填授權碼：到「⚙ 我的資料」最上面貼上黃瑋凱給你的授權碼，按儲存。",
    no_key: "授權碼不對（多打或少打了字？），跟黃瑋凱核對一下。",
    revoked: "這組授權碼已被停用，請找黃瑋凱。",
    expired: "授權已到期，請找黃瑋凱延長。",
    bound_elsewhere: "這組授權碼已綁在另一台電腦的 Chrome。換電腦或重裝要請黃瑋凱解除綁定，再填一次。",
    offline: "連不上驗證伺服器（weikaihouse.com），確認網路後再試一次。",
    server_error: "驗證伺服器暫時有問題，等幾分鐘再試。",
    bad_request: "驗證資料不完整，到 chrome://extensions 按 ↻ 重新載入外掛再試。",
    rate_limited: "驗證太頻繁，等一分鐘再試。",
  };
  /** 把 check() 的結果變成同事看得懂的一句話；ok 就回空字串 */
  function message(r) {
    if (!r) return "授權狀態不明，到 chrome://extensions 按 ↻ 重新載入外掛。";
    if (r.ok) return "";
    if (r.reason === "expired" && r.expiresText) return "授權已於 " + r.expiresText + " 到期，請找黃瑋凱延長。";
    return MESSAGES[r.reason] || "授權驗證失敗（" + (r.reason || "未知") + "），請找黃瑋凱。";
  }

  root.P591License = { create, message, VERIFY_URL };
})(typeof self !== "undefined" ? self : globalThis);

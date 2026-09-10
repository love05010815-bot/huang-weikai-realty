/**
 * 樂屋網刊登助手 —— 在 member.rakuya.com.tw/sell/post/*、/rent/post/* 跑的填表程式（2026-09-10 實測）。
 *
 * 進場方式跟 591 一樣：後台／外掛頁把資料包交給 background（target = "rakuya"）→ background 開樂屋刊登頁 →
 * 這支程式向 background 要資料 → 填表 → 清掉。**永遠不按「庫存」「上架」**，那兩顆是使用者自己按。
 *
 * 樂屋是一頁式、原生 <select>／<input>／<radio>，欄位用 name 定位（表單改版時看 rakuya-map.ts 檔頭那串名單）：
 *   - 三個類型下拉是串接的：法定用途 → 現況型式 → 現況類型；選了現況類型才會長出樓層／格局／屋齡／車位那一大段
 *   - 地址：縣市 → 行政區 → 街道 三個下拉串接（換一個要等下一個的選項載入），巷／弄／號是文字框
 *   - 出售樓層「單層／多層」各有一個 name=floors 的輸入框，要拿看得見的那個
 *   - 描述是 Summernote（.note-editable），設 innerHTML 再發 input／keyup 就會同步
 *   - 照片 input[name=surface_image_input]，最多 25 張
 */
(() => {
  "use strict";
  const path = location.pathname;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const txt = (e) => (e && e.textContent ? e.textContent.replace(/\s+/g, " ").trim() : "");
  const visible = (e) => !!(e && e.offsetParent !== null && getComputedStyle(e).visibility !== "hidden");
  async function waitFor(fn, timeout = 8000, step = 150) {
    const t0 = Date.now();
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() - t0 > timeout) return null;
      await sleep(step);
    }
  }
  const msg = (type, extra) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type, ...(extra || {}) }, (r) =>
          resolve(chrome.runtime.lastError ? { ok: false, error: chrome.runtime.lastError.message } : r || { ok: false, error: "no response" }),
        );
      } catch (e) {
        resolve({ ok: false, error: String(e) });
      }
    });

  /* ───────── 面板（跟 591 共用 panel.css） ───────── */
  let panel, list, missBox;
  function ensurePanel() {
    if (panel) return;
    panel = document.createElement("div");
    panel.id = "p591-panel";
    panel.innerHTML = `<h4><span>樂屋刊登助手</span><button type="button" id="p591-close">關閉</button></h4><ul></ul><div class="miss" hidden></div><div class="foot">填完請自己核對一遍，再按 <b>庫存</b>（先存不上架）或 <b>上架</b>；兩顆都是你按。</div>`;
    document.body.appendChild(panel);
    list = panel.querySelector("ul");
    missBox = panel.querySelector(".miss");
    panel.querySelector("#p591-close").onclick = () => panel.remove();
  }
  function log(m, cls = "") {
    ensurePanel();
    const li = document.createElement("li");
    if (cls) li.className = cls;
    li.textContent = m;
    list.appendChild(li);
    list.scrollTop = list.scrollHeight;
  }
  function showMissing(items) {
    ensurePanel();
    missBox.hidden = !items.length;
    if (items.length) missBox.innerHTML = `<b>還要你自己補：</b>${items.map((s) => `<div>• ${s}</div>`).join("")}`;
  }

  /* ───────── 原生表單操作 ───────── */
  const byName = (name) => document.querySelector(`[name="${name}"]`) || document.getElementById(name);
  const fire = (el, types) => types.forEach((t) => el.dispatchEvent(new Event(t, { bubbles: true })));
  function setText(name, value) {
    const el = [...document.querySelectorAll(`[name="${name}"]`)].find(visible) || byName(name);
    if (!el) return false;
    el.focus();
    el.value = value == null ? "" : String(value);
    fire(el, ["input", "change", "blur"]);
    return true;
  }
  /** 原生下拉：等選項載入（串接的下拉要等上一個 change 之後才有東西），照文字選 */
  async function setSelect(name, wants, timeout = 4000) {
    const el = byName(name);
    if (!el || el.tagName !== "SELECT") return false;
    const want = (Array.isArray(wants) ? wants : [wants]).filter(Boolean);
    const find = () => {
      const opts = [...el.options];
      for (const w of want) {
        const o = w instanceof RegExp ? opts.find((x) => w.test(x.text)) : opts.find((x) => x.text.trim() === w) || opts.find((x) => x.text.trim().includes(w));
        if (o) return o;
      }
      return null;
    };
    const o = await waitFor(find, timeout);
    if (!o) return false;
    el.value = o.value;
    fire(el, ["change"]);
    return true;
  }
  const labelOf = (i) => txt(i.closest("label") || (i.id && document.querySelector(`label[for="${i.id}"]`)));
  function clickRadio(name, labelText) {
    const inputs = [...document.querySelectorAll(`input[type=radio][name="${name}"]`)];
    const r = inputs.find((i) => labelOf(i) === labelText) || inputs.find((i) => labelOf(i).startsWith(labelText));
    if (!r) return false;
    if (!r.checked) r.click();
    return true;
  }
  function setCheck(name, labelText, want) {
    const boxes = [...document.querySelectorAll(`input[type=checkbox][name="${name}"]`)];
    const b = labelText ? boxes.find((i) => labelOf(i) === labelText) || boxes.find((i) => labelOf(i).startsWith(labelText)) : boxes[0];
    if (!b) return false;
    if (b.checked !== want) b.click();
    return true;
  }
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  /** Summernote：直接寫 innerHTML，再發 input／keyup 讓它把內容同步進底下的 textarea */
  function setSummernote(html, text) {
    const ed = document.querySelector(".note-editable");
    if (!ed) return false;
    ed.focus();
    ed.innerHTML = html || (text || "").split("\n").map((l) => `<p>${esc(l) || "<br>"}</p>`).join("");
    fire(ed, ["input", "keyup", "change", "blur"]);
    return true;
  }
  async function uploadPhotos(urls, inputName, onStep) {
    const input = byName(inputName);
    if (!input) return { done: 0, failed: urls.length };
    let done = 0,
      failed = 0;
    const batch = input.multiple ? 5 : 1;
    for (let i = 0; i < urls.length; i += batch) {
      const chunk = urls.slice(i, i + batch);
      const dt = new DataTransfer();
      for (const [j, u] of chunk.entries()) {
        const r = await msg("p591:fetch", { url: u });
        if (!r.ok) {
          failed++;
          continue;
        }
        const bin = atob(r.b64);
        const bytes = new Uint8Array(bin.length);
        for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
        const ext = /png/i.test(r.type) ? "png" : "jpg";
        dt.items.add(new File([bytes], `${String(i + j + 1).padStart(2, "0")}.${ext}`, { type: r.type }));
        done++;
      }
      if (dt.files.length) {
        const fresh = byName(inputName) || input;
        fresh.files = dt.files;
        fire(fresh, ["change"]);
        onStep && onStep(done, urls.length);
        await sleep(2500);
      }
    }
    return { done, failed };
  }

  /* ───────── 填表 ───────── */
  async function fill(p) {
    const missing = [];
    const r = p.rakuya || {};
    const a = p.addr || {};
    const A = p.area || {};
    const P = p.price || {};
    const L = p.layout || {};
    const rent = p.deal === "rent";
    const ok = await waitFor(() => byName("usecode") && byName("city"), 15000);
    if (!ok) {
      log("等不到樂屋表單，重新整理一次再試", "bad");
      return;
    }
    log(`樂屋（${rent ? "出租" : "出售"}）：開始填`);

    /* 1. 類型三連選（串接） */
    try {
      if (!(await setSelect("selectPropertyUsecode", r.legal))) log(`法定用途「${r.legal}」沒選到`, "warn");
      await sleep(400);
      if (!(await setSelect("usecode", r.usecode))) log(`現況型式「${r.usecode}」沒選到`, "bad");
      await sleep(600);
      if (!(await setSelect("typecode", r.typecode, 6000))) log(`現況類型「${r.typecode}」沒選到，請自己選`, "bad");
      await waitFor(() => byName("surfloors") && visible(byName("surfloors")), 6000);
      await sleep(400);
      if (!rent && r.ageType) clickRadio("agetype", r.ageType);
      log("類型選好", "ok");
    } catch (e) {
      log(`類型出錯：${e.message}`, "bad");
    }

    /* 2. 名稱＋地址＋社區 */
    try {
      setText("hname", r.title25 || p.title || "");
      if (r.titleTruncated) log("物件名稱超過 25 字，已截短", "warn");
      if (!(await setSelect("city", a.city))) log("縣市沒選到", "bad");
      await sleep(600);
      if (!(await setSelect("zipcode", a.town, 6000))) log("行政區沒選到", "bad");
      await sleep(800);
      if (a.road && !(await setSelect("addr_road", [a.road], 8000))) {
        log(`街道「${a.road}」樂屋清單裡沒有，請自己選`, "bad");
        missing.push("街道");
      }
      setText("addr_lane", a.lane || "");
      setText("addr_alley", a.alley || "");
      setText("addr_num", a.no ? `${a.no}${a.sub ? `之${a.sub}` : ""}` : "");
      if (!a.no) missing.push("門牌「號」（資料裡沒有）");
      clickRadio("is_community", r.isCommunity ? "是社區" : "非社區");
      if (r.isCommunity && p.community) {
        await sleep(900);
        const cs = byName("community");
        const cn = byName("community_new");
        let done = false;
        if (cs && cs.tagName === "SELECT" && visible(cs)) done = await setSelect("community", p.community, 3000);
        if (!done && cn && visible(cn)) done = setText("community_new", p.community);
        if (!done) missing.push(`社區名稱「${p.community}」（樂屋清單裡沒有，自己選或填新增）`);
      }
      log(`地址：${a.city}${a.town}${a.road}${a.no ? a.no + "號" : ""}`, "ok");
    } catch (e) {
      log(`地址區出錯：${e.message}`, "bad");
    }

    /* 3. 樓層／格局／屋齡／朝向／電梯／車位／坪數 */
    try {
      const f = p.floor || {};
      clickRadio("floors_type", r.floorsType || "單層");
      await sleep(300);
      if (r.floorsType === "多層") {
        const vis = [...document.querySelectorAll(`[name="floors"]`)].filter(visible);
        if (vis[0]) {
          vis[0].value = "1";
          fire(vis[0], ["input", "change"]);
        }
        setText("floors_max", r.floorsMax ?? f.total ?? "");
      } else if (f.sell !== "" && f.sell != null) setText("floors", f.sell);
      else missing.push("樓層");
      setText("surfloors", f.total ?? "");
      if (L.room != null) await setSelect("bedrooms", String(L.room));
      if (L.hall != null) await setSelect("livingrooms", String(L.hall));
      if (L.bath != null) await setSelect("bathrooms", String(L.bath));
      if (r.ageYears != null) setText("findate", r.ageYears);
      else setCheck("findateUnknow", null, true);
      if (p.facing) await setSelect("direction", p.facing);
      clickRadio("lifts", /電梯大廈|華廈/.test(r.typecode || "") ? "有" : "無");
      if (rent) clickRadio("parkings", r.parkStatus === "無車位" ? "無車位" : "自有");
      else {
        clickRadio("parkings", r.parkStatus || "無車位");
        if (r.parkStatus === "有車位") {
          await sleep(500);
          if (r.parkKind) clickRadio("parkings_kind", r.parkKind);
          if (A.park != null) setText("reg_garagesize", A.park);
        }
      }
      if (rent) {
        setText("mainsize", (p.rent && p.rent.usePing) ?? A.main ?? "");
      } else {
        setText("totalsize", A.reg ?? "");
        setCheck("is_size_including_parkings", null, !!A.inclPark);
        setText("mainsize", A.main ?? "");
        setText("subsize", A.att ?? "");
        setText("sharesize", A.pub ?? "");
      }
      if (A.land != null) setText("basesize", A.land);
      await setSelect("manage", r.manage || "無");
      await sleep(300);
      if (r.manageFee != null) setText("securityfee", r.manageFee);
      log("基礎資料填完", "ok");
    } catch (e) {
      log(`基礎資料出錯：${e.message}`, "bad");
    }

    /* 4. 價格（出售）／租住條件（出租） */
    try {
      if (rent) {
        const R = p.rent || {};
        const X = r.rent || {};
        setText("rental", R.monthly ?? "");
        for (const x of X.includes || []) setCheck("rental_include[]", x, true);
        await setSelect("deposit_m", X.depositSel || "2個月租金");
        clickRadio("property_right", X.propertyRight || "有");
        clickRadio("short_rent", X.shortRent || "不可");
        setCheck("is_immigrate_anytime", null, X.anytime !== false);
        clickRadio("cook", X.cook || "可");
        clickRadio("pet", X.pet || "不可");
        clickRadio("sex", X.sex || "不限");
        clickRadio("ridentity", X.identity || "不限");
        clickRadio("landlord", X.landlord || "不與房東同住");
        missing.push("提供設備、提供傢俱（照照片勾）");
        log("租住條件填完", "ok");
      } else {
        setText("listprice", P.total ?? "");
        setCheck("is_price_including_parkings", null, !!P.inclPark);
        setCheck("is_calc_single_price", null, true);
        log("價格填完", "ok");
      }
    } catch (e) {
      log(`價格區出錯：${e.message}`, "bad");
    }

    /* 5. 描述、周圍環境 */
    try {
      if (p.desc) {
        setSummernote(p.descHtml, p.desc);
        log(p.descHtml ? "文案已貼入（版型＋字級顏色）" : "文案已貼入（版型）", "ok");
      }
      const env = r.env || {};
      for (const k of ["elementary", "market", "park", "transport", "mrt", "vital_function"]) if (env[k]) setText(k, env[k]);
    } catch (e) {
      log(`文案出錯：${e.message}`, "bad");
    }

    /* 6. 聯絡人：切到「自行填寫」時樂屋會把個人檔案帶的電話／Email 清掉，所以先記下來、切完再填回去，只改名字 */
    try {
      const keep = {};
      for (const k of ["tel2", "email", "tel1", "tel1_pre"]) {
        const el = byName(k);
        if (el && el.value) keep[k] = el.value;
      }
      clickRadio("isOwnerContact", "自行填寫");
      await sleep(400);
      if (r.contactName) setText("contact_name", r.contactName);
      if (r.contactPhone) setText("tel2", r.contactPhone);
      else if (keep.tel2 && !byName("tel2").value) setText("tel2", keep.tel2);
      if (keep.email && !byName("email").value) setText("email", keep.email);
      if (keep.tel1 && !byName("tel1").value) setText("tel1", keep.tel1);
      if (keep.tel1_pre) await setSelect("tel1_pre", keep.tel1_pre, 500);
      if (!byName("tel2").value) missing.push("行動電話");
      if (!byName("email").value) missing.push("Email");
      log("聯絡資料填完", "ok");
    } catch (e) {
      log(`聯絡資料出錯：${e.message}`, "bad");
    }

    /* 7. 照片 */
    if (p.photos && p.photos.length) {
      log(`照片：開始上傳 ${p.photos.length} 張…`);
      const res = await uploadPhotos(p.photos.slice(0, 25), "surface_image_input", (d, n) => log(`照片 ${d}/${n}`));
      log(`照片完成 ${res.done} 張${res.failed ? `，失敗 ${res.failed} 張` : ""}`, res.failed ? "warn" : "ok");
    } else missing.push("照片（自己上傳）");

    showMissing(missing);
    log("✅ 填完。請從上往下核對一遍，再自己按「庫存」或「上架」。", "ok");
  }

  async function main() {
    if (!/\/(sell|rent)\/post\//.test(path)) return;
    const res = await msg("p591:get");
    const p = res && res.ok ? res.payload : null;
    if (!p || p.v !== 1 || p.target !== "rakuya") return; // 不是給樂屋的資料就不動
    ensurePanel();
    if (document.hidden) log("這個分頁在背景，Chrome 會把它放慢；請點回這個分頁等它填完", "warn");
    await fill(p);
    await msg("p591:clear");
  }
  main().catch((e) => log(`程式出錯：${e.message}`, "bad"));
})();

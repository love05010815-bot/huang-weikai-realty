/**
 * 591 刊登助手 —— 在 591 刊登頁裡跑的填表程式。
 *
 * 進場方式：官網後台按「🚀 上架到 591」會開
 *   https://user.591.com.tw/post/first#p591=<base64 的物件資料>
 * 這支程式在第 ① 頁讀網址 # 後面的資料、存進 sessionStorage、幫你點完四連點；
 * 到第 ② 頁再把每一格、文案、照片填進去，右下角面板列出還缺什麼。
 *
 * 🔴 **永遠不按「保存資料，下一步」與「立即支付」**，那兩顆是你自己按的。
 * 🔴 不抓 591 任何資料、不送任何東西到別的地方；資料只在 # 片段（不會傳到 591 伺服器）與 sessionStorage。
 *
 * 591 表單是 Vue 3 + Ant Design Vue（2026-09 實測）：
 *   - 文字欄 .ant-input／數字欄 .ant-input-number-input：設 value 後要發 input＋change 事件 Vue 才會收到
 *   - 單選／勾選：要點 <label class="ant-radio-wrapper|ant-checkbox-wrapper">，點 input 不會生效
 *   - 下拉 .ant-select：點 .ant-select-selector 打開，選項在 body 底下的 .ant-select-dropdown，
 *     鄉鎮那種長清單是虛擬捲動（.rc-virtual-list-holder），沒捲到就不會渲染
 *   - 現況特色描述是 ProseMirror（div.ProseMirror[contenteditable]）
 *   - 照片：第一個 input[type=file][multiple]
 */
(() => {
  "use strict";
  const KEY = "p591:payload";
  const path = location.pathname;

  /* ───────── 小工具 ───────── */
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
  function decodePayload(hash) {
    const m = /[#&]p591=([^&]+)/.exec(hash || "");
    if (!m) return null;
    try {
      return JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1])))));
    } catch {
      return null;
    }
  }

  /* ───────── 面板 ───────── */
  let panel, list, missBox;
  function ensurePanel() {
    if (panel) return;
    panel = document.createElement("div");
    panel.id = "p591-panel";
    panel.innerHTML = `<h4><span>591 刊登助手</span><button type="button" id="p591-close">關閉</button></h4><ul></ul><div class="miss" hidden></div><div class="foot">填完請自己核對一遍，再按 <b>保存資料，下一步</b>；<b>立即支付</b> 也是你按。</div>`;
    document.body.appendChild(panel);
    list = panel.querySelector("ul");
    missBox = panel.querySelector(".miss");
    panel.querySelector("#p591-close").onclick = () => panel.remove();
  }
  function log(msg, cls = "") {
    ensurePanel();
    const li = document.createElement("li");
    if (cls) li.className = cls;
    li.textContent = msg;
    list.appendChild(li);
    list.scrollTop = list.scrollHeight;
  }
  function showMissing(items) {
    ensurePanel();
    if (!items.length) {
      missBox.hidden = true;
      return;
    }
    missBox.hidden = false;
    missBox.innerHTML = `<b>還要你自己補：</b>${items.map((s) => `<div>• ${s}</div>`).join("")}`;
  }

  /* ───────── 表單操作 ───────── */
  function setNative(el, value) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    el.focus();
    setter.call(el, value == null ? "" : String(value));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }
  /** 找到「文字完全等於 label」的標籤元素（label / span / div，內容短的） */
  function labelEl(text) {
    const cands = document.querySelectorAll("label, .ant-form-item-label > label, span, div");
    for (const e of cands) {
      if (e.children.length > 2) continue;
      const t = txt(e);
      if (t === text) return e;
    }
    for (const e of cands) {
      if (e.children.length > 2) continue;
      const t = txt(e);
      if (t.length <= 14 && t.startsWith(text)) return e;
    }
    return null;
  }
  /** label 之後（DOM 順序）符合 selector 的前 n 個元素 */
  function after(label, selector, n = 1) {
    const L = typeof label === "string" ? labelEl(label) : label;
    if (!L) return [];
    const out = [];
    for (const el of document.querySelectorAll(selector)) {
      if (L.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) {
        out.push(el);
        if (out.length >= n) break;
      }
    }
    return out;
  }
  const NUM = ".ant-input-number-input";
  const TXT = "input.ant-input";
  const SEL = ".ant-select";

  function clickLabel(text, want = true) {
    const labels = [...document.querySelectorAll("label.ant-radio-wrapper, label.ant-checkbox-wrapper")];
    const L = labels.find((l) => txt(l) === text) || labels.find((l) => txt(l).startsWith(text));
    if (!L) return false;
    const isRadio = L.classList.contains("ant-radio-wrapper");
    const checked = isRadio ? L.classList.contains("ant-radio-wrapper-checked") : L.classList.contains("ant-checkbox-wrapper-checked");
    if (checked === want) return true;
    L.click();
    return true;
  }
  /** 在某個 label 後面的單選群裡點文字為 text 的那顆 */
  function clickRadioAfter(label, text) {
    const L = labelEl(label);
    if (!L) return false;
    const radios = after(L, "label.ant-radio-wrapper", 6);
    const R = radios.find((l) => txt(l) === text) || radios.find((l) => txt(l).startsWith(text));
    if (!R) return false;
    if (!R.classList.contains("ant-radio-wrapper-checked")) R.click();
    return true;
  }
  function visibleDropdowns() {
    return [...document.querySelectorAll(".ant-select-dropdown")].filter((d) => !d.classList.contains("ant-select-dropdown-hidden") && visible(d));
  }
  /** Ant Select：打開 → 找選項（虛擬清單就捲）→ 點 */
  async function pickSelect(sel, text) {
    if (!sel) return false;
    const selector = sel.querySelector(".ant-select-selector") || sel;
    const current = txt(sel.querySelector(".ant-select-selection-item"));
    if (current === text) return true;
    selector.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    let dd = await waitFor(() => visibleDropdowns().at(-1), 3000);
    if (!dd) {
      selector.click();
      dd = await waitFor(() => visibleDropdowns().at(-1), 3000);
    }
    if (!dd) return false;
    const holder = dd.querySelector(".rc-virtual-list-holder");
    for (let i = 0; i < 40; i++) {
      const opts = [...dd.querySelectorAll(".ant-select-item-option")];
      const hit = opts.find((o) => (o.getAttribute("title") || txt(o)) === text) || opts.find((o) => txt(o).includes(text));
      if (hit) {
        hit.scrollIntoView({ block: "nearest" });
        hit.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        hit.click();
        const ok = await waitFor(() => txt(sel.querySelector(".ant-select-selection-item")) === text, 2000);
        if (!ok) document.body.click();
        return !!ok;
      }
      if (!holder) break;
      holder.scrollTop += holder.clientHeight * 0.8;
      holder.dispatchEvent(new Event("scroll", { bubbles: true }));
      await sleep(120);
      if (holder.scrollTop + holder.clientHeight >= holder.scrollHeight - 2 && i > 3) break;
    }
    document.body.click();
    return false;
  }
  /** 街道那種自訂面板：打開後在可見的浮層裡找文字剛好等於 text 的節點點下去 */
  async function pickInPopup(sel, text) {
    if (!sel) return false;
    const selector = sel.querySelector(".ant-select-selector") || sel;
    if (txt(sel.querySelector(".ant-select-selection-item")) === text) return true;
    selector.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    selector.click();
    const hit = await waitFor(() => {
      const nodes = [...document.querySelectorAll("li, .ant-select-item-option, span, div")].filter((n) => n.children.length === 0 && txt(n) === text && visible(n));
      return nodes.find((n) => !sel.contains(n)) || null;
    }, 4000);
    if (!hit) {
      document.body.click();
      return false;
    }
    hit.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    hit.click();
    await sleep(300);
    return txt(sel.querySelector(".ant-select-selection-item")) === text;
  }
  function setProseMirror(text) {
    const pm = document.querySelector("div.ProseMirror[contenteditable='true']");
    if (!pm) return false;
    pm.focus();
    document.execCommand("selectAll", false, null);
    const ok = document.execCommand("insertText", false, text);
    if (!ok || txt(pm).length < 20) {
      // 退路：用貼上事件，ProseMirror 對 paste 的處理最穩
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      pm.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    }
    return true;
  }
  function fetchViaBackground(url) {
    return new Promise((resolve) => chrome.runtime.sendMessage({ type: "p591:fetch", url }, (r) => resolve(r || { ok: false, error: "no response" })));
  }
  async function uploadPhotos(urls, onStep) {
    const input = document.querySelector("input[type=file][multiple]");
    if (!input) return { done: 0, failed: urls.length };
    let done = 0, failed = 0;
    for (let i = 0; i < urls.length; i += 5) {
      const chunk = urls.slice(i, i + 5);
      const dt = new DataTransfer();
      for (const [j, u] of chunk.entries()) {
        const r = await fetchViaBackground(u);
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
        const fresh = document.querySelector("input[type=file][multiple]") || input;
        fresh.files = dt.files;
        fresh.dispatchEvent(new Event("change", { bubbles: true }));
        onStep && onStep(done, urls.length);
        await sleep(2500);
      }
    }
    return { done, failed };
  }

  /* ───────── 第 ① 頁：四連點 ───────── */
  async function runFirst(p) {
    log("第①頁：開始四連點");
    async function clickItem(text) {
      const li = await waitFor(() => [...document.querySelectorAll("li")].find((l) => txt(l) === text && visible(l)), 6000);
      if (!li) {
        log(`找不到「${text}」`, "bad");
        return false;
      }
      li.click();
      await sleep(600);
      log(`點了「${text}」`, "ok");
      return true;
    }
    if (!(await clickItem("出售"))) return;
    if (!(await clickItem(p.first.legal))) return;
    if (!(await clickItem(p.first.status))) return;
    await clickItem(p.first.type); // 這一下會跳到第 ② 頁，sessionStorage 已經存好
  }

  /* ───────── 第 ② 頁：填表 ───────── */
  async function runSecond(p) {
    const missing = [];
    const ok = await waitFor(() => labelEl("出售總樓層"), 15000);
    if (!ok) {
      log("等不到表單，重新整理一次再試", "bad");
      return;
    }
    log("第②頁：開始填");

    /* 1. 地址 */
    try {
      const a = p.addr || {};
      const quick = labelEl("填寫地址") && after("填寫地址", TXT, 1)[0];
      const full = [a.city, a.town, a.road, a.lane ? `${a.lane}巷` : "", a.alley ? `${a.alley}弄` : "", a.no ? `${a.no}${a.sub ? `之${a.sub}` : ""}號` : ""].join("");
      if (quick && a.town && a.road) {
        setNative(quick, full);
        const btn = [...document.querySelectorAll("button")].find((b) => txt(b) === "匯入地址");
        if (btn) {
          btn.click();
          const yes = await waitFor(() => [...document.querySelectorAll(".ant-modal button, .ant-modal-confirm-btns button")].find((b) => /確\s*定/.test(txt(b)) && visible(b)), 3000);
          if (yes) yes.click();
          await waitFor(() => txt((after("門牌地址", SEL, 2)[1] || {})) === a.town, 6000);
          log(`地址匯入：${full}`, "ok");
        }
      } else {
        const addrLabel = labelEl("門牌地址") || labelEl("出售地址");
        const sels = after(addrLabel, SEL, 3);
        if (a.city && !(await pickSelect(sels[0], a.city))) log("縣市沒選到，請自己選", "bad");
        await sleep(600);
        if (a.town && !(await pickSelect(after(addrLabel, SEL, 3)[1], a.town))) log("鄉鎮沒選到，請自己選", "bad");
        await sleep(600);
        if (a.road && !(await pickInPopup(after(addrLabel, SEL, 3)[2], a.road))) log("街道沒選到，請自己選", "bad");
        log("地址三格處理完", "ok");
      }
      const addrLabel2 = labelEl("門牌地址") || labelEl("出售地址");
      const texts = after(addrLabel2, TXT, 5); // 巷 號 之 樓 樓之
      const nums = after(addrLabel2, NUM, 1); // 弄
      if (texts[0]) setNative(texts[0], a.lane || "");
      if (nums[0]) setNative(nums[0], a.alley || "");
      if (texts[1]) setNative(texts[1], a.no || "");
      if (texts[2]) setNative(texts[2], a.sub || "");
      if (!a.no) missing.push("門牌「號」（資料裡沒有）");
      if (a.hide) clickLabel("隱藏門號", true);
      const f = p.floor || {};
      if (texts[3]) setNative(texts[3], f.sell === "" || f.sell == null ? "" : f.sell);
      if (texts[4]) setNative(texts[4], f.sub || "");
      if (f.sell === "" || f.sell == null) missing.push("出售樓層");
    } catch (e) {
      log(`地址區出錯：${e.message}`, "bad");
    }

    /* 2. 基礎資料 */
    const setNumAfter = (label, values) => {
      const els = after(label, NUM, values.length);
      values.forEach((v, i) => els[i] && setNative(els[i], v == null ? "" : v));
      return els.length;
    };
    const setTxtAfter = (label, value) => {
      const el = after(label, TXT, 1)[0];
      if (el) setNative(el, value == null ? "" : value);
      return !!el;
    };
    try {
      if (p.floor && p.floor.total != null) setNumAfter("出售總樓層", [p.floor.total]);
      else missing.push("出售總樓層");
      setTxtAfter("社區名稱", p.community || "");
      if (/電梯大樓|華廈/.test(p.first.type) && !p.community) missing.push("社區名稱");
      const L = p.layout || {};
      setNumAfter("格局", [L.room, L.hall, L.bath, ""]);
      clickRadioAfter("建築完工時間", "成屋");
      const D = p.done || {};
      setNumAfter("建築完工時間", [D.y, D.m, D.d]);
      if (D.y == null) missing.push("完工 民國年");
      if (p.facing) {
        const s = after("朝向", SEL, 1)[0];
        if (!(await pickSelect(s, p.facing))) log(`朝向「${p.facing}」沒選到`, "warn");
      }
      const A = p.area || {};
      setNumAfter("權狀坪數", [A.reg]);
      clickRadioAfter("權狀坪數", A.inclPark ? "含車位面積" : "不含車位面積");
      if (A.inclPark) {
        await sleep(500);
        const row = await waitFor(() => labelEl("車位面積"), 3000);
        if (row) {
          setNumAfter("車位面積", [A.park]);
          if (A.parkType) {
            const s = after("車位面積", SEL, 1)[0];
            if (!(await pickSelect(s, A.parkType))) log(`車位型式「${A.parkType}」沒選到`, "warn");
          }
        }
      }
      setNumAfter("主建物", [A.main]);
      setNumAfter("附屬建物", [A.att]);
      setNumAfter("共有部分", [A.pub]);
      if (A.land != null) setNumAfter("土地坪數", [A.land]);
      log("基礎資料填完", "ok");
    } catch (e) {
      log(`基礎資料出錯：${e.message}`, "bad");
    }

    /* 3. 價格 */
    try {
      const P = p.price || {};
      setTxtAfter("售價", P.total);
      clickRadioAfter("售價", P.inclPark ? "含車位價格" : "不含車位價格");
      await sleep(300);
      const down = after("自備款", TXT, 1)[0];
      if (down && P.down != null) setNative(down, P.down);
      const F = p.fee || {};
      if (F.has === true) {
        clickRadioAfter("管理費", "有");
        if (F.amount != null) setNumAfter("管理費", [F.amount]);
        else missing.push("管理費金額");
      } else if (F.has === false) clickRadioAfter("管理費", "無");
      else missing.push("管理費有／無");
      clickRadioAfter("帶租約", p.lease ? "是" : "否");
      if (p.deco) clickRadioAfter("裝潢程度", p.deco);
      else missing.push("裝潢程度（要你看過屋況再選）");
      log("價格填完", "ok");
    } catch (e) {
      log(`價格區出錯：${e.message}`, "bad");
    }

    /* 4. 生活機能 */
    for (const item of p.life || []) clickLabel(item, true);

    /* 5. 標題與描述 */
    try {
      setTxtAfter("廣告標題", p.title || "");
      if (!p.title) missing.push("廣告標題");
      if (p.desc) {
        setProseMirror(p.desc);
        log("文案已貼入（版型）", "ok");
      }
    } catch (e) {
      log(`文案出錯：${e.message}`, "bad");
    }

    /* 6. 聯絡資料 */
    try {
      const C = p.contact || {};
      const name = after("聯絡人", TXT, 1)[0];
      if (name && C.name) setNative(name, C.name);
      if (C.contract) clickRadioAfter("委託書", C.contract);
      clickRadioAfter("服務費", C.serviceFee === false ? "不須服務費" : "收取服務費");
      clickLabel("我已閲讀並確認經紀業資料無誤", true) || clickLabel("我已閱讀並確認經紀業資料無誤", true);
      log("聯絡資料填完", "ok");
    } catch (e) {
      log(`聯絡資料出錯：${e.message}`, "bad");
    }

    /* 7. 照片（有網址才傳；LINE 文字那種沒照片就跳過） */
    if (p.photos && p.photos.length) {
      log(`照片：開始上傳 ${p.photos.length} 張…`);
      const r = await uploadPhotos(p.photos, (d, n) => log(`照片 ${d}/${n}`));
      log(`照片完成 ${r.done} 張${r.failed ? `，失敗 ${r.failed} 張` : ""}`, r.failed ? "warn" : "ok");
    } else {
      missing.push("照片（自己上傳）");
    }

    showMissing(missing);
    log("✅ 填完。請從上往下核對一遍，再自己按「保存資料，下一步」。", "ok");
  }

  /* ───────── 進場 ───────── */
  async function main() {
    const fromHash = decodePayload(location.hash);
    if (fromHash) {
      sessionStorage.setItem(KEY, JSON.stringify(fromHash));
      history.replaceState(null, "", location.pathname + location.search); // 把資料從網址拿掉
    }
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return; // 不是從後台來的，什麼都不做
    const p = JSON.parse(raw);
    if (!p || p.v !== 1) return;
    ensurePanel();
    if (/\/post\/first/.test(path)) await runFirst(p);
    else if (/\/post\/two\//.test(path)) {
      await runSecond(p);
      sessionStorage.removeItem(KEY); // 填過就清掉，重新整理不會再自動填一次
    }
  }
  main().catch((e) => log(`程式出錯：${e.message}`, "bad"));
})();

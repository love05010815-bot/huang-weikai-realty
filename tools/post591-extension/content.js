/**
 * 591 刊登助手 —— 在 591 刊登頁裡跑的填表程式。
 *
 * 進場方式：官網後台按「🚀 上架到 591」→ bridge.js 把資料包交給 background.js → 開 591 分頁
 *   → 這支程式向 background 要資料（p591:get）→ 填表 → 填完清掉（p591:clear）。
 *   認得的物件組合會直接開第②頁（網址帶 kind/shape/purpose）；不認得的開第①頁，這裡幫他四連點。
 *
 * 🔴 **永遠不按「保存資料，下一步」與「立即支付」**，那兩顆是他自己按的。
 * 🔴 不抓 591 任何資料、不送任何東西到別的地方。
 *
 * 591 表單是 Vue 3 + Ant Design Vue（2026-09-05 實測）：
 *   - 第②頁一進來會先跳「請選擇你想要刊登物件的所屬縣市」彈窗（li.light 是縣市名）
 *   - 地址用「建議填寫完整地址…」那格 + 「匯入地址」鈕最穩：會自動選好 縣市／鄉鎮／街道 並填「號」，但**不填「樓」**
 *   - 標籤文字常帶尾巴（「格局（現況）(說明)」「建築完工時間(說明)」「土地坪數土地持分坪數」），所以 labelEl 用「開頭符合」退路
 *   - 文字欄 .ant-input／數字欄 .ant-input-number-input：設 value 後要發 input＋change 事件 Vue 才會收到
 *   - 單選／勾選：要點 <label class="ant-radio-wrapper|ant-checkbox-wrapper">
 *   - 下拉 .ant-select：點 .ant-select-selector 打開；選項清單在 body 底下，要用 input[role=combobox] 的
 *     aria-controls 找到「自己那份」清單（頁面上同時會有好幾個看得見的下拉殘影，抓最後一個會抓錯）
 *   - 現況特色描述是 ProseMirror；照片是第一個 input[type=file][multiple]
 *
 * ⚠️ Chrome 對「放到背景超過 5 分鐘」的分頁會把計時器凍住（每分鐘才動一次），這支程式就會像卡住。
 *   後台開的是新分頁、會在最前面；填的時候不要切走，切走了就點回來等它跑完。
 */
(() => {
  "use strict";
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
  /** 找到「文字等於 label」的標籤元素；找不到就退而求「開頭是 label、很短」的（591 的標籤常帶 (說明) 尾巴） */
  function labelEl(text) {
    const cands = document.querySelectorAll("label, span, div");
    for (const e of cands) if (e.children.length <= 2 && txt(e) === text) return e;
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
  function clickLabel(text, want = true) {
    const labels = [...document.querySelectorAll("label.ant-radio-wrapper, label.ant-checkbox-wrapper")];
    const L = labels.find((l) => txt(l) === text) || labels.find((l) => txt(l).startsWith(text));
    if (!L) return false;
    const isRadio = L.classList.contains("ant-radio-wrapper");
    const checked = isRadio ? L.classList.contains("ant-radio-wrapper-checked") : L.classList.contains("ant-checkbox-wrapper-checked");
    if (checked !== want) L.click();
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
  const visibleDropdowns = () => [...document.querySelectorAll(".ant-select-dropdown")].filter((d) => !d.classList.contains("ant-select-dropdown-hidden") && visible(d));
  /** Ant Select：打開 → 找到自己那份清單（aria-controls）→ 找選項（虛擬清單就捲）→ 點。texts 可給多個候選字 */
  async function pickSelect(sel, texts) {
    if (!sel) return false;
    const wants = (Array.isArray(texts) ? texts : [texts]).filter(Boolean);
    const current = () => txt(sel.querySelector(".ant-select-selection-item"));
    if (wants.includes(current())) return true;
    const selector = sel.querySelector(".ant-select-selector") || sel;
    const combo = sel.querySelector("input[role=combobox]");
    const listId = combo && combo.getAttribute("aria-controls");
    const ownDropdown = () => {
      if (listId) {
        const el = document.getElementById(listId);
        const d = el && el.closest(".ant-select-dropdown");
        return d && visible(d) ? d : null;
      }
      return visibleDropdowns().at(-1) || null;
    };
    selector.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    let dd = await waitFor(ownDropdown, 3000);
    if (!dd) {
      selector.click();
      dd = await waitFor(ownDropdown, 3000);
    }
    if (!dd) return false;
    const holder = dd.querySelector(".rc-virtual-list-holder");
    const name = (o) => o.getAttribute("title") || txt(o);
    for (let i = 0; i < 40; i++) {
      const opts = [...dd.querySelectorAll(".ant-select-item-option")];
      let hit = null;
      for (const w of wants) {
        hit = opts.find((o) => name(o) === w) || opts.find((o) => name(o).includes(w));
        if (hit) break;
      }
      if (hit) {
        const picked = name(hit);
        hit.scrollIntoView({ block: "nearest" });
        hit.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        hit.click();
        const ok = await waitFor(() => current() === picked, 3000);
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
  function setProseMirror(text) {
    const pm = document.querySelector("div.ProseMirror[contenteditable=true]");
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
  async function uploadPhotos(urls, onStep) {
    const input = document.querySelector("input[type=file][multiple]");
    if (!input) return { done: 0, failed: urls.length };
    let done = 0,
      failed = 0;
    for (let i = 0; i < urls.length; i += 5) {
      const chunk = urls.slice(i, i + 5);
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
        const fresh = document.querySelector("input[type=file][multiple]") || input;
        fresh.files = dt.files;
        fresh.dispatchEvent(new Event("change", { bubbles: true }));
        onStep && onStep(done, urls.length);
        await sleep(2500);
      }
    }
    return { done, failed };
  }

  /* ───────── 第 ① 頁：四連點（只有不認得的組合才會走到這裡） ───────── */
  async function runFirst(p) {
    log("第①頁：開始四連點");
    async function clickItem(text) {
      const li = await waitFor(() => [...document.querySelectorAll("li")].find((l) => txt(l) === text && visible(l)), 6000);
      if (!li) {
        log(`找不到「${text}」，請自己點`, "bad");
        return false;
      }
      if (li.classList.contains("active")) {
        log(`「${text}」已經是選中的`, "ok");
        return true;
      }
      li.click();
      await sleep(600);
      log(`點了「${text}」`, "ok");
      return true;
    }
    if (!(await clickItem("出售"))) return;
    if (!(await clickItem(p.first.legal))) return;
    if (!(await clickItem(p.first.status))) return;
    await clickItem(p.first.type); // 這一下 591 會整頁跳到第②頁，這支程式會在那頁重新跑（資料還在 background）
  }

  /* ───────── 第 ② 頁：填表 ───────── */
  async function runSecond(p) {
    const missing = [];
    const a = p.addr || {};

    /* 0. 一進來的「所屬縣市」彈窗 */
    const cityModal = await waitFor(() => [...document.querySelectorAll(".ant-modal")].find((m) => /所屬縣市/.test(txt(m)) && visible(m)), 4000);
    if (cityModal) {
      const want = a.city || "台中市";
      const item = [...cityModal.querySelectorAll("li, span, div")].find((e) => e.children.length === 0 && txt(e) === want);
      if (item) {
        item.click();
        log(`縣市彈窗：選了 ${want}`, "ok");
      } else log(`縣市彈窗裡找不到「${want}」，請自己點`, "bad");
    }
    const ready = await waitFor(() => labelEl("出售總樓層") && (labelEl("門牌地址") || labelEl("出售地址")), 20000);
    if (!ready) {
      log("等不到表單，重新整理一次再試", "bad");
      return;
    }
    log("第②頁：開始填");

    /* 1. 地址 */
    try {
      const quick = [...document.querySelectorAll("input")].find((i) => /完整地址/.test(i.placeholder || ""));
      const full = [a.city, a.town, a.road, a.lane ? `${a.lane}巷` : "", a.alley ? `${a.alley}弄` : "", a.no ? `${a.no}${a.sub ? `之${a.sub}` : ""}號` : ""].join("");
      let imported = false;
      if (quick && a.town && a.road) {
        setNative(quick, full);
        const btn = await waitFor(() => [...document.querySelectorAll("button")].find((b) => txt(b) === "匯入地址" && visible(b)), 5000);
        if (btn) {
          btn.click();
          const yes = await waitFor(() => [...document.querySelectorAll(".ant-modal button")].find((b) => /確\s*定/.test(txt(b)) && visible(b)), 1500);
          if (yes) yes.click();
          imported = !!(await waitFor(() => [...document.querySelectorAll(".ant-select .ant-select-selection-item")].some((e) => txt(e) === a.town), 8000));
          log(imported ? `地址匯入：${full}` : "地址匯入沒成功，改一格一格選", imported ? "ok" : "warn");
        }
      }
      const addrLabel = labelEl("門牌地址") || labelEl("出售地址");
      if (!imported) {
        const sels = after(addrLabel, SEL, 2);
        if (a.city && !(await pickSelect(sels[0], a.city))) log("縣市沒選到，請自己選", "bad");
        await sleep(500);
        if (a.town && !(await pickSelect(after(addrLabel, SEL, 2)[1], a.town))) log("鄉鎮沒選到，請自己選", "bad");
        const street = [...document.querySelectorAll("input")].find((i) => /街道/.test(i.placeholder || ""));
        if (street && a.road) {
          setNative(street, a.road);
          const opt = await waitFor(
            () => [...document.querySelectorAll(".ant-select-dropdown .ant-select-item-option, .ant-dropdown li, .ant-dropdown-menu-item")].find((o) => visible(o) && txt(o).includes(a.road)),
            4000,
          );
          if (opt) opt.click();
          else log(`街道「${a.road}」沒選到，請自己選`, "bad");
        }
      }
      // 巷 號 之 樓 樓之 是五個 placeholder 為 選填／必填 的文字框（匯入只會填「號」，樓要自己填）
      const boxes = after(addrLabel, TXT, 14).filter((i) => /^(選填|必填)$/.test(i.placeholder || ""));
      const [lane, no, sub, floor, floorSub] = boxes;
      if (lane && a.lane && !lane.value) setNative(lane, a.lane);
      if (no && a.no && no.value !== String(a.no)) setNative(no, a.no);
      if (sub && a.sub && !sub.value) setNative(sub, a.sub);
      const alley = after(addrLabel, NUM, 1)[0];
      if (alley && a.alley) setNative(alley, a.alley);
      if (!a.no) missing.push("門牌「號」（資料裡沒有）");
      const f = p.floor || {};
      if (floor && f.sell != null && f.sell !== "") setNative(floor, f.sell);
      if (floorSub && f.sub) setNative(floorSub, f.sub);
      if (f.sell == null || f.sell === "") missing.push("出售樓層");
      if (a.hide) clickLabel("隱藏門號", true);
    } catch (e) {
      log(`地址區出錯：${e.message}`, "bad");
    }

    /* 2. 基礎資料 */
    try {
      if (p.floor && p.floor.total != null) setNumAfter("出售總樓層", [p.floor.total]);
      else missing.push("出售總樓層");
      setTxtAfter("社區名稱", p.community || "");
      if (/電梯大樓|華廈/.test(p.first.type) && !p.community) missing.push("社區名稱");
      const L = p.layout || {};
      setNumAfter("格局", [L.room, L.hall, L.bath, ""]); // 標籤實際是「格局（現況）(說明)」，靠開頭符合
      clickRadioAfter("建築完工時間", "成屋");
      const D = p.done || {};
      setNumAfter("建築完工時間", [D.y, D.m, D.d]);
      if (D.y == null) missing.push("完工 民國年");
      if (p.facing && !(await pickSelect(after("朝向", SEL, 1)[0], p.facing))) log(`朝向「${p.facing}」沒選到`, "warn");
      const A = p.area || {};
      setNumAfter("權狀坪數", [A.reg]);
      clickRadioAfter("權狀坪數", A.inclPark ? "含車位面積" : "不含車位面積");
      if (A.inclPark) {
        await sleep(500);
        if (await waitFor(() => labelEl("車位面積"), 3000)) {
          setNumAfter("車位面積", [A.park]);
          if (A.parkType) {
            // 591 的選項：平面式停車位／機械式停車位／平面式+機械式／其他
            const cands = [A.parkType, /平面.*機械|機械.*平面/.test(A.parkType) ? "平面式+機械式" : "", /平面/.test(A.parkType) ? "平面式停車位" : "", /機械/.test(A.parkType) ? "機械式停車位" : ""];
            if (!(await pickSelect(after("車位面積", SEL, 1)[0], cands))) missing.push(`車位型式（想選「${A.parkType}」，沒選到）`);
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
      if (name && C.name && name.value !== C.name) setNative(name, C.name);
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
    const r = await msg("p591:get");
    const p = r && r.ok ? r.payload : null;
    if (!p || p.v !== 1) return; // 不是從後台來的，什麼都不做
    ensurePanel();
    if (document.hidden) log("這個分頁在背景，Chrome 會把它放慢；請點回這個分頁等它填完", "warn");
    if (/\/post\/first/.test(path)) await runFirst(p);
    else if (/\/post\/two\//.test(path)) {
      await runSecond(p);
      await msg("p591:clear"); // 填過就清掉，重新整理不會再自動填一次
    }
  }
  main().catch((e) => log(`程式出錯：${e.message}`, "bad"));
})();

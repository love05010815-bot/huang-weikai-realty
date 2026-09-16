/**
 * FB 社團廣告助手 —— 在 Facebook 社團頁裡跑的填表程式。
 *
 * 進場：後台按「開始發佈」→ 背景程式開社團分頁 → 這支向背景要資料（fbq:current）→ 沒有任務就什麼都不做
 *   （你自己在逛 FB 不會被打擾）；有任務就：確認粉專身分 → 打開發文框 → 填文案 → 上傳圖片 → 停手。
 *
 * 🔴 **永遠不替你按「發佈」。** 填好後右下角面板請你自己核對、按 Facebook 的「發佈」，
 *    發佈完再按面板的「下一個社團」，才會換下一個。
 * 🔴 不抓 Facebook 任何資料、不送任何東西到別的地方。
 *
 * Chrome 對「放到背景超過 5 分鐘」的分頁會凍住計時器，填表看起來會像卡住 —— 別切走，讓它在前景跑完。
 */
(() => {
  "use strict";
  if (window.__fbqRan) return;
  window.__fbqRan = true;
  const FBQ = self.FBQ;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const send = (type, extra) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type, ...(extra || {}) }, (r) => {
          const err = chrome.runtime.lastError;
          resolve(err ? { ok: false, error: err.message } : r || { ok: false, error: "no response" });
        });
      } catch (e) {
        resolve({ ok: false, error: String(e && e.message ? e.message : e) });
      }
    });

  /* ───────── 面板 ───────── */
  let panel, listEl, btnRow, headEl;
  function ensurePanel() {
    if (panel) return;
    panel = document.createElement("div");
    panel.id = "fbq-panel";
    panel.innerHTML =
      '<h4><span id="fbq-title">FB 社團廣告助手</span><button type="button" id="fbq-hide">—</button></h4>' +
      '<ul id="fbq-list"></ul>' +
      '<div id="fbq-btns" class="fbq-btns"></div>';
    document.documentElement.appendChild(panel);
    listEl = panel.querySelector("#fbq-list");
    btnRow = panel.querySelector("#fbq-btns");
    headEl = panel.querySelector("#fbq-title");
    panel.querySelector("#fbq-hide").onclick = () => panel.classList.toggle("fbq-min");
  }
  function setTitle(t) {
    ensurePanel();
    headEl.textContent = t;
  }
  function log(m, cls) {
    ensurePanel();
    const li = document.createElement("li");
    if (cls) li.className = cls;
    li.textContent = m;
    listEl.appendChild(li);
    listEl.scrollTop = listEl.scrollHeight;
  }
  function buttons(defs) {
    ensurePanel();
    btnRow.innerHTML = "";
    for (const d of defs) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = d.label;
      if (d.primary) b.className = "fbq-primary";
      if (d.danger) b.className = "fbq-danger";
      b.onclick = d.onClick;
      btnRow.appendChild(b);
    }
  }

  /* ───────── DOM 小工具 ───────── */
  async function firstVisible(locators, timeoutMs) {
    const deadline = Date.now() + (timeoutMs || 8000);
    while (Date.now() < deadline) {
      for (const find of locators) {
        const el = find();
        if (el && el.offsetParent !== null) return el;
      }
      await sleep(300);
    }
    return null;
  }
  const textOf = (e) => (e && e.textContent ? e.textContent.replace(/\s+/g, " ").trim() : "");
  function byRoleName(role, re, max) {
    const out = [];
    for (const el of document.querySelectorAll('[role="' + role + '"]')) {
      if (re.test(textOf(el) || el.getAttribute("aria-label") || "")) {
        out.push(el);
        if (out.length >= (max || 8)) break;
      }
    }
    return out;
  }

  async function dataUrlToFile(dataUrl, name) {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
    return new File([blob], name + "." + ext, { type: blob.type || "image/jpeg" });
  }

  /* ───────── 填文案（保留後台的排版）───────── */
  const countLines = (s) => String(s || "").split("\n").filter((x) => x.trim()).length;

  function clearBox(box) {
    box.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(box);
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand("delete");
  }

  /**
   * 把文案填進 Facebook 的編輯器，**換行與空行原封不動照後台的排版**。
   *
   * 🔴 不要一次把整段（含 \n）丟給 execCommand("insertText")：FB 用 Lexical 編輯器，
   *    會把 \n 正規化掉，結果後台排得好好的版型貼到 FB 變成一大段（2026-09-16 他回報）。
   * ① 先模擬「貼上」：Lexical 的 paste 處理會照實保留換行與空行，最接近他在後台看到的樣子。
   * ② 貼上沒生效才一行一行填，中間用 insertLineBreak 換行。
   */
  async function fillComposer(box, text) {
    const norm = String(text).replace(/\r\n/g, "\n");
    const want = countLines(norm);
    const got = () => countLines(box.innerText);
    box.focus();
    await sleep(150);

    try {
      const dt = new DataTransfer();
      dt.setData("text/plain", norm);
      box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
      await sleep(600);
    } catch {}
    if (got() >= want) return "paste";

    clearBox(box);
    await sleep(150);
    const lines = norm.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (i > 0 && !document.execCommand("insertLineBreak")) {
        box.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertLineBreak", bubbles: true, cancelable: true }));
      }
      if (lines[i]) document.execCommand("insertText", false, lines[i]);
      await sleep(12);
    }
    await sleep(300);
    return got() >= want ? "lines" : got() > 0 ? "partial" : "failed";
  }

  /* ───────── 主流程 ───────── */
  async function run() {
    const cur = await send("fbq:current");
    if (!cur.ok || !cur.job) return; // 沒有任務：不打擾
    const job = cur.job;
    const L = job.locale;
    const g = job.group || {};
    const pos = "第 " + (job.index + 1) + " / " + job.total + " 個";
    setTitle("FB 社團廣告助手（" + pos + "）");
    log("社團：" + (g.name || g.url), "fbq-strong");

    const report = (status, message) => send("fbq:report", { status, message });

    // 換下一個 / 跳過 / 停止（先掛上，讓使用者隨時能停）
    const controls = (canNext) =>
      buttons([
        canNext
          ? { label: "✅ 我按過發佈了，下一個社團", primary: true, onClick: onNext }
          : { label: "重試這個社團", onClick: () => location.reload() },
        { label: "跳過這個", onClick: onSkip },
        { label: "停止全部", danger: true, onClick: onStop },
      ]);
    let advancing = false;
    async function onNext() {
      if (advancing) return;
      advancing = true;
      buttons([{ label: "換下一個社團中…", onClick: () => {} }]);
      const r = await send("fbq:next", { status: "posted" });
      if (r.done) finishScreen(r.reason);
    }
    async function onSkip() {
      if (advancing) return;
      advancing = true;
      const r = await send("fbq:skip", { message: "你選擇跳過" });
      if (r.done) finishScreen(r.reason);
    }
    async function onStop() {
      advancing = true;
      await send("fbq:stop");
      log("已停止。你可以關掉這個分頁。", "fbq-strong");
      buttons([{ label: "關閉面板", onClick: () => panel.remove() }]);
    }
    function finishScreen(reason) {
      setTitle("FB 社團廣告助手（全部完成）");
      log(reason === "daily-limit" ? "已達今天的每日上限，剩下的社團今天不發。" : "這一批社團都處理完了 🎉", "fbq-ok");
      log("回後台的『社團廣告發佈』看整批結果。", "");
      buttons([{ label: "關閉面板", onClick: () => panel.remove() }]);
    }

    controls(false);

    // 登入檢查
    if (/\/login|\/checkpoint/.test(location.pathname) || (document.querySelector('input[name="pass"]') || {}).offsetParent) {
      log("看起來還沒登入 Facebook。請先登入、切換成粉專身分，再回後台重新開始。", "fbq-bad");
      await report("failed", "尚未登入");
      controls(false);
      return;
    }

    // 頁面無法顯示
    const bodyText = (document.body.innerText || "").slice(0, 3000);
    if (FBQ.anyRe(FBQ.words(L, "notAvailable")).test(bodyText)) {
      log("這個社團頁面打不開（網址錯誤、社團不存在或你沒有權限）。可以按「跳過這個」。", "fbq-bad");
      await report("failed", "社團頁面無法顯示");
      controls(false);
      return;
    }

    try {
      // 1. 打開發文框
      log("尋找發文框…");
      const trigRe = FBQ.anyRe(FBQ.words(L, "composerTrigger"));
      // 🔴 安全鎖：發文框一定不在任何一則貼文裡面。少了這道，萬一沒找到發文框就可能誤點
      //    別人貼文的「留言」，把廣告打進別人的留言欄。
      const inPost = (el) => !!el.closest('[role="article"]');
      const findTrigger = () => {
        // 1) 按鈕／輸入框：文字、aria-label 或 placeholder 命中（FB 各社團用字不一，例如「留個言吧…」）
        for (const el of document.querySelectorAll('[role="button"], [role="textbox"], [contenteditable="true"]')) {
          if (el.offsetParent === null || inPost(el)) continue;
          const t = textOf(el);
          const al = el.getAttribute("aria-label") || el.getAttribute("placeholder") || "";
          if ((trigRe.test(t) && t.length < 40) || trigRe.test(al)) return el;
        }
        // 2) 命中文字的小元素 → 找最近可點的祖先
        const hit = [...document.querySelectorAll("span, div, a")].find(
          (e) => e.offsetParent !== null && !inPost(e) && e.childElementCount <= 2 && trigRe.test(textOf(e)) && textOf(e).length < 40,
        );
        return hit ? hit.closest('[role="button"]') || hit : null;
      };
      const trigger = await firstVisible([findTrigger], 12000);
      if (!trigger) {
        const joinable = byRoleName("button", FBQ.anyRe(FBQ.words(L, "joinGroup")), 1)[0];
        log(joinable ? "找不到發文框：你（或粉專）還沒加入這個社團。" : "找不到發文框：社團可能不開放發文，或 Facebook 改版了。", "fbq-bad");
        log("可以按「跳過這個」換下一個。", "");
        await report("failed", joinable ? "尚未加入社團" : "找不到發文框");
        controls(false);
        return;
      }
      // 命中的可能是 placeholder 的 span，點它的可點祖先比較穩
      const clickable = trigger.closest('[role="button"]') || trigger;
      clickable.scrollIntoView({ block: "center" });
      await sleep(500);
      clickable.click();

      // 2. 等發文視窗（先等真正的 modal；等不到才用「就地展開」的退路，免得太早抓到收合狀態的輸入框）
      let dialog = await firstVisible(
        [() => [...document.querySelectorAll('div[role="dialog"]')].reverse().find((d) => d.querySelector('div[role="textbox"]'))],
        12000,
      );
      if (!dialog) {
        dialog = await firstVisible(
          [
            () => {
              const tb = [...document.querySelectorAll('div[role="textbox"]')].find((t) => t.offsetParent !== null);
              return tb ? tb.closest('form, div[role="dialog"]') || tb.parentElement : null;
            },
          ],
          5000,
        );
        if (dialog) log("這個社團是就地展開的發文框（不是彈出視窗），照樣幫你填。", "");
      }
      if (!dialog) {
        log("發文視窗沒有跳出來，可能是 Facebook 改版。可以按「跳過這個」。", "fbq-bad");
        await report("failed", "發文視窗未出現");
        controls(false);
        return;
      }
      await sleep(1000);

      // 3. 確認發文身分
      // 🔴 他有兩三個粉專／帳號輪流發，用錯身分發出去收不回來 —— 認不出來就**停在這裡問**，
      //    不會先把文案填好讓他順手按發佈。帳號（不是粉專）一律只認人、不自動切：切帳號要碰密碼。
      const idName = (job.identity && job.identity.name) || job.pageName || "";
      const idKind = (job.identity && job.identity.kind) || "page";
      if (idName) {
        const askIdentity = () => {
          log(
            "⛔ 目前的發文身分不是「" + idName + "」" + (idKind === "account" ? "（這是另一個帳號，要你自己切 Chrome 使用者／登入）" : "（請在發文視窗左上角切換）") + "。",
            "fbq-bad",
          );
          log("怕用錯身分發出去，先停在這裡。切好之後再按下面。", "fbq-strong");
          return new Promise((resolve) => {
            buttons([
              { label: "我切好了，繼續填", primary: true, onClick: () => resolve("retry") },
              { label: "跳過這個", onClick: () => resolve("skip") },
              { label: "停止全部", danger: true, onClick: () => resolve("stop") },
            ]);
          });
        };
        let ok = await ensureIdentity(dialog, idName, L, idKind === "account");
        while (!ok) {
          await report("waiting", "等你切到「" + idName + "」");
          const choice = await askIdentity();
          if (choice === "skip") {
            await send("fbq:skip", { message: "身分不是「" + idName + "」，跳過" });
            return;
          }
          if (choice === "stop") {
            await send("fbq:stop");
            log("已停止。你可以關掉這個分頁。", "fbq-strong");
            buttons([{ label: "關閉面板", onClick: () => panel.remove() }]);
            return;
          }
          controls(false);
          ok = await ensureIdentity(dialog, idName, L, idKind === "account");
        }
        log("發文身分：" + idName + " ✓", "fbq-ok");
      }

      // 4. 填文案（排版照後台，換行與空行一模一樣）
      if (job.ad.text && job.ad.text.trim()) {
        log("填入文案…");
        const box = dialog.querySelector('div[role="textbox"]');
        const how = await fillComposer(box, job.ad.text);
        if (how === "failed") log("文案沒填進去，請自己貼上再發佈。", "fbq-bad");
        else if (how === "partial") log("⚠ 排版可能沒完全照後台，發佈前請看一下換行。", "fbq-bad");
        else log("文案已填好，排版照後台。", "");
      }

      // 5. 上傳圖片
      if (job.ad.images && job.ad.images.length) {
        log("上傳 " + job.ad.images.length + " 張圖片…");
        try {
          await uploadImages(dialog, job.ad.images, L);
          log("圖片已加入。", "");
        } catch (e) {
          log("圖片上傳沒成功（" + (e.message || e) + "）。你可以自己在視窗裡拖圖片進去。", "fbq-bad");
        }
      }

      // 6. 交給使用者按發佈
      log("內容已填好。請核對後按 Facebook 的「發佈」。", "fbq-ok");
      log("發佈完，回來按下面的「✅ 我按過發佈了，下一個社團」。", "fbq-strong");
      await report("ready", "已填好，等你按發佈");
      controls(true);
      try {
        window.focus();
      } catch {}
    } catch (e) {
      log("發生問題：" + (e && e.message ? e.message : e), "fbq-bad");
      log("你可以自己把文案補一補再發，或按「跳過這個」。", "");
      await report("failed", String(e && e.message ? e.message : e));
      controls(true);
    }
  }

  /* ───────── 發文身分 ───────── */
  /** checkOnly=true（另一個 FB 帳號）只認人、不嘗試切換：切帳號要密碼，工具不碰。 */
  async function ensureIdentity(dialog, pageName, L, checkOnly) {
    const nameRe = new RegExp(FBQ.escapeRe(pageName), "i");
    const shown = () => {
      const box = dialog.getBoundingClientRect();
      const cands = dialog.querySelectorAll("span, strong, h2, h3");
      for (const c of cands) {
        if (!nameRe.test(textOf(c))) continue;
        const r = c.getBoundingClientRect();
        if (r.top < box.top + 190) return true;
      }
      return false;
    };
    if (shown()) return true;
    if (checkOnly) return false;

    let switcher = byRoleName("button", FBQ.anyRe(FBQ.words(L, "switchProfile")), 1)[0];
    if (!switcher) {
      const box = dialog.getBoundingClientRect();
      for (const el of dialog.querySelectorAll('div[role="button"]')) {
        const r = el.getBoundingClientRect();
        if (r.top > box.top + 190 || r.width > box.width * 0.8) continue;
        if (el.querySelector("img, svg image") && textOf(el).length < 60) {
          switcher = el;
          break;
        }
      }
    }
    if (!switcher) return false;
    switcher.click();
    await sleep(1200);
    const option = await firstVisible(
      [
        () => [...document.querySelectorAll('[role="radio"], [role="menuitemradio"], [role="menuitem"]')].find((e) => nameRe.test(textOf(e))),
        () => {
          const menu = [...document.querySelectorAll('div[role="dialog"], div[role="menu"]')].pop();
          return menu ? [...menu.querySelectorAll('div[role="button"], label')].find((e) => nameRe.test(textOf(e))) : null;
        },
      ],
      4000,
    );
    if (!option) {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return false;
    }
    option.click();
    await sleep(1500);
    return shown();
  }

  /* ───────── 圖片 ───────── */
  async function uploadImages(dialog, dataUrls, L) {
    let input = dialog.querySelector('input[type="file"]');
    if (!input) {
      const btn = await firstVisible(
        [
          () => byRoleName("button", FBQ.anyRe(FBQ.words(L, "photoButton")), 1)[0],
          () => [...dialog.querySelectorAll("[aria-label]")].find((e) => FBQ.anyRe(FBQ.words(L, "photoButton")).test(e.getAttribute("aria-label") || "")),
        ],
        6000,
      );
      if (!btn) throw new Error("找不到相片按鈕");
      btn.click();
      await sleep(1200);
      input = dialog.querySelector('input[type="file"]') || document.querySelector('input[type="file"]');
    }
    if (!input) throw new Error("找不到上傳欄位");
    const files = [];
    for (let i = 0; i < dataUrls.length; i++) files.push(await dataUrlToFile(dataUrls[i], "ad-" + (i + 1)));
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    // 等縮圖出現
    const before = dialog.querySelectorAll("img").length;
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      if (dialog.querySelectorAll("img").length > before) break;
      await sleep(500);
    }
    await sleep(1500);
  }

  run();
})();

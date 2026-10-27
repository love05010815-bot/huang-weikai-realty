/**
 * FB 社團廣告助手 —— 在 Facebook 社團頁裡跑的填表程式。
 *
 * 進場：後台按「開始發佈」→ 背景程式開社團分頁 → 這支向背景要資料（fbq:current）→ 沒有任務就什麼都不做
 *   （你自己在逛 FB 不會被打擾）；有任務就：確認粉專身分 → 打開發文框 → 填文案 → 上傳圖片 → 停手。
 *
 * 兩種模式（後台「設定 → 自動按發佈」決定，隨任務送來 job.autoPost）：
 *   - 半自動（設定裡把「自動按發佈」關掉）：填好後右下角面板請你自己核對、按 Facebook 的「發佈」，發佈完再按面板的「下一個社團」。
 *   - 自動（預設開；他 2026-10-06 要的「全部自動發布，發布完我再一一檢查」，10/07 說同事版也預設開）：填好、圖片傳完、「發佈」鈕可按 → 替他按 →
 *     看到視窗關掉才算發出去 → 等 job.autoGapSec 秒 → 自動換下一個。🔴 身分對不上、文案沒填完整、圖片沒傳好、
 *     找不到可按的發佈鈕、FB 說不能發 —— 一律退回半自動停在那裡等他，不硬發；每日上限照樣由背景程式擋。
 *     照片一定要等 FB **真的收完**才按發佈（縮圖張數＝檔案張數再多等幾秒），不然 FB 會跳
 *     「抱歉，沒有上傳新的相片」整則發不出去 —— 見 uploadImages 的說明。
 * 🔴 不抓 Facebook 任何資料、不送任何東西到別的地方。
 *
 * 計時全部走背景程式（sleep() → fbq:sleep）：Chrome 對看不到的分頁會把頁面計時器放慢，service worker 不會，
 * 所以分頁切走、縮小、被蓋住都照跑（他 2026-10-12 要的「不用一直開著視窗」）；只有關掉分頁、電腦睡著才會停。
 */
(() => {
  "use strict";
  if (window.__fbqRan) return;
  window.__fbqRan = true;
  const FBQ = self.FBQ;

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
  /**
   * 睡 ms 毫秒。🔴 不用頁面的 setTimeout：Chrome 對看不到的分頁（切走、縮小、被蓋住、鎖螢幕）會把計時器放慢，
   * 5 分鐘後一分鐘才動一下，整個流程看起來像卡住。他 2026-10-12 要「不用一直開著視窗也能自動發」，
   * 改請背景程式（service worker，不看分頁可見不可見）計時再回話——訊息往返不受那個放慢影響。
   * 每段最多 20 秒：MV3 的 service worker 閒置 30 秒會被回收，分段送讓它一直有事做。背景沒回話就退回 setTimeout。
   */
  async function sleep(ms) {
    let left = Math.max(0, Number(ms) || 0);
    while (left > 0) {
      const chunk = Math.min(left, 20000);
      const t0 = Date.now();
      const r = await send("fbq:sleep", { ms: chunk });
      if (!r || !r.ok) await new Promise((res) => setTimeout(res, chunk));
      left -= Math.max(chunk, Date.now() - t0);
    }
  }

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

    // 這個社團剛才已經回報「發出去了」、分頁卻重新載入（倒數中按了 F5、Chrome 卸載再載入…）→ 絕不能再發一次，直接換下一個
    if (job.doneStatus) {
      log("這個社團剛才已經發出去了（分頁重新載入過），不會再發一次，直接換下一個。", "fbq-ok");
      const r = await send("fbq:next", { status: job.doneStatus, message: job.doneStatus === "pending" ? "自動發佈，等待審核" : "自動發佈" });
      if (r.done) finishScreen(r.reason);
      return;
    }

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
    let postVia = ""; // 走「商品拍賣」表單發的，紀錄後面標一下
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
      log("回「FB社團廣告助手」頁看整批結果。", "");
      buttons([{ label: "關閉面板", onClick: () => panel.remove() }]);
    }

    /** 自動模式：替他按「發佈」、確認發出去、等一下、換下一個。任何不確定都退回半自動停著等他。 */
    async function autoPost(dialog, photos) {
      // 🔴 商品拍賣（runSell 來的）：他 2026-10-27 錄影——按了「發佈」之後「分享到更多地方」視窗一直不關，外掛停著等他按，
      //    整批就卡在那個社團。他說「遇到這種狀況，若超過 5 秒沒回應直接跳過這則」→ 這條流程在前景時不停下來問：
      //    「發佈」鈕等不到、按了「發佈」5 秒沒看到結果，都標成跳過換下一個（紀錄寫清楚原因，事後抽查）。
      //    分頁在背景時 FB 本來就不更新畫面、看不到結果是常態，照舊走下面的「背景未確認」，不然背景跑的商品貼文會整批被跳掉。
      //    一般發文框那條完全不變：前景照舊停下來問他、背景 75 秒當作發出去。
      const sellFlow = !!postVia;
      log("自動發佈：等「發佈」鈕可以按（照片還在傳的時候 FB 會先鎖住）…", "");
      const btn = await waitPostButton(dialog, L, sellFlow ? 15000 : 90000);
      if (!btn && sellFlow) {
        log("⚠ 「分享到更多地方」裡等了 15 秒都沒有可以按的「發佈」鈕，這則不等了。", "fbq-bad");
        return await autoSkip("商品拍賣的「發佈」鈕 15 秒內按不了");
      }
      if (!btn) {
        log("⚠ 找不到可以按的「發佈」鈕（圖片可能還在上傳，或 Facebook 改版）。請你自己按。", "fbq-bad");
        await report("ready", "自動發佈沒做：找不到可按的發佈鈕，等你自己按");
        controls(true);
        return;
      }
      // FB 說照片沒傳上去時它自己寫「請再試一次」，所以最多按兩次；第二次之前要先確認照片還在，
      // 不然會發出一則沒有照片的廣告（2026-10-09 他遇到「抱歉，沒有上傳新的相片」那次）。
      let outcome = "";
      let base = null; // 按之前頁面與彈出視窗上就有的字、動態牆上已有的貼文，之後不算數
      const snippet = postSnippet(job.ad.text); // 發出去後動態牆上會多一篇含這幾個字的貼文（分頁在背景時視窗常關不掉，靠這個）
      for (let attempt = 1; attempt <= 2; attempt++) {
        const press = findPostButton(dialog, L) || btn;
        await sleep(800);
        base = snapshotBeforePost(dialog);
        if (findQuestionsDialog(L)) {
          outcome = "questions"; // 「入社審核」疊在發文視窗上面：發佈先別按
          break;
        }
        press.click();
        log(attempt === 1 ? "已替你按下「發佈」，等 Facebook 回應…" + (sellFlow ? "（商品拍賣：最多等 5 秒）" : "") : "再按一次「發佈」…", "");
        outcome = await waitPostOutcome(dialog, L, sellFlow ? 5000 : 30000, base, snippet);
        if (outcome === "unknown" && document.visibilityState === "hidden") {
          // 分頁在背景：FB 的畫面更新會慢，再多等一陣子（動態牆那篇或審核訊息出現就算）
          log("分頁在背景，Facebook 的畫面更新會慢一點，再等最多 45 秒看結果…", "");
          outcome = await waitPostOutcome(dialog, L, 45000, base, snippet);
          if (outcome === "unknown" && document.visibilityState === "hidden") {
            // 🔴 分頁在背景時 FB 根本不更新畫面：關視窗的動畫不跑、動態牆也不插新貼文（他 2026-10-12 兩次截圖，
            //    貼文都已經在牆上「剛剛」，外掛卻等到超時）。貼文在按下去那一刻就送出了，這 75 秒裡也沒看到任何錯誤，
            //    所以當作發出去了、繼續下一個；紀錄標「背景未確認」請他事後抽查。分頁在前景時照舊停下來問他。
            log("分頁在背景時 Facebook 不更新畫面，外掛看不到確認。貼文在按下去那一刻就送出了、也沒看到錯誤，當作發出去、繼續下一個；紀錄會標「背景未確認」，發完請到發佈紀錄抽查。", "fbq-strong");
            log("（視窗" + (document.contains(dialog) ? "還在" : "已關") + "、發文框" + (dialog.querySelector('[role="textbox"]') ? "還在" : "沒了") + "、發佈鈕" + (findPostButton(dialog, L) ? "還在" : "沒了") + "）", "");
            outcome = "posted-unconfirmed";
          }
        }
        if (outcome !== "uploadfail" || attempt === 2) break;
        log("⚠ Facebook 說照片沒傳上去。關掉錯誤訊息，等 8 秒再試一次…", "fbq-bad");
        log("🔎 " + netSummary(lastUploadT0), "");
        closeAlert(dialog, L);
        await sleep(8000);
        if (photos && photos.check && !photos.check()) {
          log("照片只剩 " + photos.count() + "／" + photos.want + " 張，再按下去會變成沒有照片的貼文，不按了。", "fbq-bad");
          outcome = "nophoto";
          break;
        }
        if (!(await waitPostButton(dialog, L, 30000))) {
          log("「發佈」鈕一直按不下去。", "fbq-bad");
          outcome = "nophoto";
          break;
        }
      }
      let note = ""; // 附在發佈紀錄後面的提醒
      if (outcome === "questions") {
        // 🔴 「入社審核」：社團要他先回答管理員的問題。外掛不替他答、不按「提交」（他 2026-10-12 說「遇到要回答社團問題的先跳過」）。
        //    關掉那個視窗後看牆上：貼文已經在牆上或進審核（FB 有時先收下貼文再問問題）就照實記成已發佈／審核中，
        //    免得之後「勾選未發佈的」補發變成重複；牆上沒有就標跳過，他自己回答完問題再補發。
        log("⚠ 這個社團跳出「入社審核」，要先回答管理員的問題才能發文。外掛不替你回答，先關掉它。", "fbq-bad");
        const qbox = findQuestionsDialog(L);
        if (qbox) closeBox(qbox, L);
        await sleep(2500);
        const pend = freshAny(FBQ.words(L, "pendingApproval"), base.text, pageProbe());
        const onFeed = feedHasPost(dialog, base.articles, snippet);
        if (pend || onFeed) {
          outcome = pend ? "pending" : "posted";
          note = "；這個社團要你回答入社問題，外掛沒答，請自己去回答";
          log(pend ? "貼文已經送出、在等審核。" : "貼文已經在牆上了。", "");
        } else {
          log("貼文沒送出。這個社團標成跳過：你自己去回答入社問題後，再按「勾選未發佈的」補發。", "fbq-bad");
          return await autoSkip("這個社團要先回答入社問題（貼文沒送出）");
        }
      }
      if (outcome === "uploadfail" || outcome === "nophoto") {
        log("⛔ 照片沒傳成功，這則沒發出去。這個社團標成失敗，等一下換下一個；之後在後台按「勾選未發佈的」補發。", "fbq-bad");
        await report("failed", (outcome === "nophoto" ? "照片沒傳上去（重試前照片已經被 Facebook 丟掉）" : "照片沒傳上去，Facebook 擋下這則（已重試一次）") + "；" + netSummary(lastUploadT0));
        return await autoSkip("照片沒傳成功");
      }
      if (outcome === "blocked") {
        log("⛔ Facebook 說不能發（暫時被封鎖／違反守則之類）。這個社團標成失敗，停在這裡讓你看。", "fbq-bad");
        await report("failed", "自動發佈：Facebook 拒絕");
        controls(false);
        return;
      }
      if (outcome === "unknown" && sellFlow) {
        log("⚠ 按了「發佈」5 秒內沒看到視窗關掉、也沒看到任何訊息。商品拍賣這種不等了，標成跳過換下一個；事後到發佈紀錄抽查，萬一其實有刊登成功就不要補發。", "fbq-bad");
        return await autoSkip("商品拍賣按了「發佈」5 秒沒回應");
      }
      if (outcome === "unknown") {
        log("⚠ 按了「發佈」但沒看到視窗關掉，不確定有沒有發出去。請你自己看一下，再按下面。", "fbq-bad");
        await report("ready", "自動按了發佈但不確定有沒有成功，等你確認");
        controls(true);
        return;
      }
      const unconfirmed = outcome === "posted-unconfirmed";
      if (unconfirmed) outcome = "posted";
      const doneMsg = (outcome === "pending" ? "自動發佈，等待審核" : unconfirmed ? "自動發佈（分頁在背景、沒看到畫面確認，請事後檢查）" : "自動發佈") + postVia + note;
      log(outcome === "pending" ? "已送出，等社團管理員審核。" : unconfirmed ? "當作已發佈（背景未確認）" : "已發佈 ✓", "fbq-ok");
      await report(outcome, doneMsg);
      // 等多久：固定秒數，或在他設的範圍內每次隨機抽（他 10/07 要的「不固定的秒數間隔」）
      let gap = Number(job.autoGapSec) || 0;
      let gapNote = "";
      if (job.autoGapMode === "random") {
        let lo = Math.max(0, Number(job.autoGapMin) || 0);
        let hi = Math.max(0, Number(job.autoGapMax) || 0);
        if (lo > hi) [lo, hi] = [hi, lo];
        gap = lo + Math.floor(Math.random() * (hi - lo + 1));
        gapNote = "（這次在 " + lo + "～" + hi + " 秒裡抽到）";
      }
      if (gap > 0) {
        log("等 " + gap + " 秒再換下一個" + gapNote + "（連發太快容易被當垃圾訊息）。", "");
        if ((await countdown(gap)) === "stop") return onStop();
      }
      if (advancing) return;
      advancing = true;
      buttons([{ label: "換下一個社團中…", onClick: () => {} }]);
      const r = await send("fbq:next", { status: outcome, message: doneMsg });
      if (r.done) finishScreen(r.reason);
    }

    /**
     * 商品買賣社團：按「商品拍賣」→「選擇商品類型」選「出售商品」→ 第一步填標題／價格／狀況／（更多詳情→）說明／照片 →
     * 「繼續」→ 第二步「分享到更多地方」（這個社團已勾、Marketplace 預設不勾）→ 自動模式替他按「發佈」。
     * 2026-10-15 在他的社團（台中海線專攻房地產買賣）用他的 Chrome 一步一步實看過，欄位字與流程照那個寫。
     * 🔴 跟一般發文框不一樣的地方：每一格認不到就不填；缺任何一樣就**跳過換下一個**，不停下來等他：
     *    這種社團一批裡可能好幾個，分頁又多半縮小在背景，停著整批就卡住。半自動模式照舊停下來讓他自己補。
     * 🔴 商品貼文是 Marketplace 那套：一律用他登入的個人帳號刊登，表單上沒有粉專身分可切，所以不做身分核對。
     */
    async function runSell(sellBtn) {
      postVia = "（商品拍賣）";
      const a = sellBtn.tagName === "A" ? sellBtn : sellBtn.closest("a");
      const href = (a && a.getAttribute("href")) || "";
      if (href && !/\/groups\//.test(href)) {
        log("這個社團的「商品拍賣」會跳到別的頁面（" + href.slice(0, 60) + "），外掛還不會填那種表單。", "fbq-bad");
        await report("failed", "商品拍賣會跳到 Marketplace 頁面，外掛填不了");
        await autoSkip("商品拍賣會跳到別的頁面");
        return;
      }
      log("這是商品買賣社團，按「商品拍賣」…", "");
      const before = new Set(document.querySelectorAll('[role="dialog"]'));
      sellBtn.scrollIntoView({ block: "center" });
      await sleep(400);
      sellBtn.click();
      const hasField = (d) => !!d.querySelector('input:not([type="file"]):not([type="hidden"]), textarea, [role="textbox"], [contenteditable="true"]');
      let dialog = await firstVisible([() => [...document.querySelectorAll('div[role="dialog"]')].reverse().find((d) => !before.has(d) && isVisible(d))], 12000);
      if (!dialog) {
        log("按了「商品拍賣」但沒有視窗跳出來，可能是 Facebook 改版。", "fbq-bad");
        await report("failed", "商品拍賣視窗未出現");
        await autoSkip("商品拍賣視窗沒有跳出來");
        return;
      }
      // 🔴 視窗元素先出現、內容 1～2 秒後才長出來（10/15 在他的社團實測：按下去 300ms 就有一個空的 dialog，1.8 秒才有
      //    「選擇商品類型」；第一版只等 1 秒就說「認不出來」跳過）→ 等到視窗裡有欄位或有「出售商品」可以選為止，最多 12 秒
      const optRe = FBQ.anyRe(FBQ.words(L, "sellItemOption"));
      const findOpt = (d) => [...d.querySelectorAll('[role="button"], [role="radio"], [role="menuitem"], a')].find((el) => isVisible(el) && optRe.test(textOf(el)) && textOf(el).length < 60) || null;
      const liveDialog = () => [...document.querySelectorAll('div[role="dialog"]')].reverse().find((d) => !before.has(d) && isVisible(d)) || dialog;
      let ready = false;
      for (let i = 0; i < 40 && !ready; i++) {
        dialog = liveDialog();
        if (hasField(dialog) || findOpt(dialog)) ready = true;
        else await sleep(300);
      }
      // 先跳「上架新商品／選擇商品類型」→ 選「出售商品」。
      // 🔴 不選「出售或出租房屋」：2026-10-15 在他的社團實看，那張只有出租欄位（出租類型、每月價格、可入住日期），賣房用了會變租屋廣告
      if (!hasField(dialog)) {
        const opt = findOpt(dialog);
        if (opt) {
          log("選「出售商品」…", "");
          opt.click();
          await sleep(1500);
          const again = await firstVisible([() => [...document.querySelectorAll('div[role="dialog"]')].reverse().find((d) => isVisible(d) && hasField(d))], 10000);
          if (again) dialog = again;
        }
      }
      if (!hasField(dialog)) {
        const seen = (dialog.innerText || "").replace(/\s+/g, " ").slice(0, 80);
        log("商品拍賣的視窗裡找不到可以填的欄位（視窗上寫：" + (seen || "空白") + "…）。", "fbq-bad");
        await report("failed", "商品拍賣表單認不出來（視窗上寫：" + (seen || "空白") + "）");
        await autoSkip("商品拍賣表單認不出來（視窗上寫：" + (seen || "空白") + "）");
        return;
      }
      // 🔴 商品貼文是 Marketplace 那套，一律用他登入的個人帳號刊登，表單上沒有粉專身分可以切，所以這裡不做身分核對（他 10/15 知道）
      log("商品貼文會用你登入的個人帳號刊登（Facebook 的商品功能沒有粉專身分）。", "");
      const missing = [];
      // 標題／價格／狀況／說明
      const text = job.ad.text || "";
      const title = titleFromText(text, 80);
      const price = parsePrice(text);
      const fTitle = fieldByLabel(dialog, FBQ.words(L, "sellTitle"));
      const fPrice = fieldByLabel(dialog, FBQ.words(L, "sellPrice"));
      if (!fTitle) missing.push("找不到標題欄");
      else if (!title) missing.push("文案第一行是空的，沒東西當標題");
      else if (await fillField(fTitle, title)) log("標題：" + title, "");
      else missing.push("標題沒填進去");
      if (!price) missing.push("文案裡抓不到價格（要有「開價 2988 萬」這種字）");
      else if (!fPrice) missing.push("找不到價格欄");
      else if (await fillField(fPrice, price)) log("價格：" + Number(price).toLocaleString("en-US"), "");
      else missing.push("價格沒填進去");
      const cond = await pickCondition(dialog, L, text);
      if (cond) log("狀況：" + cond, "");
      else missing.push("「狀況」下拉選不到");
      // 「說明」藏在「更多詳情」底下
      if (text.trim()) {
        if (!fieldByLabel(dialog, FBQ.words(L, "sellDesc"))) {
          const more = findButton(dialog, FBQ.words(L, "sellMoreDetails")) || [...dialog.querySelectorAll('[role="button"]')].find((el) => isVisible(el) && FBQ.anyRe(FBQ.words(L, "sellMoreDetails")).test(textOf(el)));
          if (more) {
            more.click();
            await sleep(1200);
          }
        }
        const fDesc = fieldByLabel(dialog, FBQ.words(L, "sellDesc"));
        if (!fDesc) missing.push("找不到說明欄");
        else if (await fillField(fDesc, text)) log("說明已填（文案全文）。", "");
        else missing.push("說明沒完整填進去");
      }
      // 照片（跟發文框同一套：等 FB 真的收完；商品至少要一張，不然「繼續」不會亮）
      let photos = null;
      if (job.ad.images && job.ad.images.length) {
        log("上傳 " + job.ad.images.length + " 張圖片…", "");
        try {
          photos = await uploadImages(dialog, job.ad.images, L);
          if (!photos.ok) missing.push("照片只看到 " + photos.got + "／" + photos.want + " 張");
          log("🔎 " + netSummary(lastUploadT0), "");
        } catch (e) {
          missing.push("照片沒傳成功（" + (e && e.message ? e.message : e) + "）");
        }
      } else missing.push("商品貼文至少要一張照片，這篇文案沒有照片");
      // 第一步填齊 →「繼續」→ 第二步「分享到更多地方」（這個社團已經勾好、Marketplace 預設不勾）→ 那裡才有「發佈」
      if (!missing.length) {
        const cont = await waitButton(dialog, FBQ.words(L, "sellContinue"), 20000);
        if (!cont) {
          missing.push("「繼續」鈕一直按不下去，表單可能還缺外掛不認得的欄位（視窗上寫：" + (dialog.innerText || "").replace(/\s+/g, " ").slice(0, 80) + "…）");
        } else {
          cont.click();
          log("按「繼續」，到「分享到更多地方」…", "");
          await sleep(2500);
        }
      }
      if (missing.length) {
        log("⚠ 商品拍賣表單沒填齊：" + missing.join("；") + "。", "fbq-bad");
        if (job.autoPost) {
          await report("failed", "商品拍賣表單沒填齊：" + missing.join("；"));
          await autoSkip("商品拍賣表單沒填齊（" + missing[0] + "）");
          return;
        }
        log("請你自己把缺的補一補再按「發佈」。", "fbq-strong");
        await report("ready", "商品拍賣表單沒填齊，等你補：" + missing.join("；"));
        controls(true);
        return;
      }
      if (job.autoPost) return await autoPost(dialog, photos);
      log("商品拍賣表單已填好、也按過「繼續」了。請核對後按 Facebook 的「發佈」。", "fbq-ok");
      log("發佈完，回來按下面的「✅ 我按過發佈了，下一個社團」。", "fbq-strong");
      await report("ready", "商品拍賣表單已填好，等你按發佈");
      controls(true);
    }

    /**
     * 這個社團根本發不了（頁面打不開／找不到發文框／發文視窗沒出現）：
     * 自動模式幾秒後自動跳過換下一個（他 2026-10-06 說「找不到發文框的，自動跳過先進行下個」）；半自動照舊停著等他按。
     * 只用在「發不了」這幾種；身分不對、文案沒填好、FB 拒絕那些還是停下來，因為那些需要他看一眼。
     */
    async function autoSkip(reason) {
      if (!job.autoPost) return controls(false);
      log("自動模式：" + reason + "，5 秒後自動跳過換下一個。", "fbq-strong");
      if ((await countdown(5)) === "stop") return onStop();
      if (advancing) return;
      advancing = true;
      buttons([{ label: "換下一個社團中…", onClick: () => {} }]);
      const r = await send("fbq:skip", { message: reason + "，自動跳過" });
      if (r.done) finishScreen(r.reason);
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
      await autoSkip("社團頁面打不開");
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
      // 商品買賣社團：沒有發文框、只有「商品拍賣」鈕（他 2026-10-15 要的）。兩種都有的話以「商品拍賣」為準——他說這種社團就發商品貼文
      const sellRe = FBQ.anyRe(FBQ.words(L, "sellButton"));
      const findSell = () =>
        [...document.querySelectorAll('[role="button"], a')].find((el) => {
          if (!isVisible(el) || inPost(el)) return false;
          const t = textOf(el);
          return t.length < 30 && (sellRe.test(t) || sellRe.test(el.getAttribute("aria-label") || ""));
        }) || null;
      const trigger = await firstVisible([findSell, findTrigger], 12000);
      if (trigger && (sellRe.test(textOf(trigger)) || sellRe.test(trigger.getAttribute("aria-label") || ""))) return await runSell(trigger);
      if (!trigger) {
        const joinable = byRoleName("button", FBQ.anyRe(FBQ.words(L, "joinGroup")), 1)[0];
        log(joinable ? "找不到發文框：你（或粉專）還沒加入這個社團。" : "找不到發文框：社團可能不開放發文，或 Facebook 改版了。", "fbq-bad");
        log("可以按「跳過這個」換下一個。", "");
        await report("failed", joinable ? "尚未加入社團" : "找不到發文框");
        await autoSkip(joinable ? "你（或粉專）還沒加入這個社團" : "找不到發文框");
        return;
      }
      // 命中的可能是 placeholder 的 span，點它的可點祖先比較穩
      const clickable = trigger.closest('[role="button"]') || trigger;
      clickable.scrollIntoView({ block: "center" });
      await sleep(500);
      clickable.click();

      // 2. 等發文視窗（先等真正的 modal；等不到才用「就地展開」的退路，免得太早抓到收合狀態的輸入框）
      //    🔴 先認「入社審核」那種視窗：它裡面也有要你填答案的欄位，不先認出來就會把廣告填進答案欄
      let dialog = await firstVisible(
        [() => findQuestionsDialog(L), () => [...document.querySelectorAll('div[role="dialog"]')].reverse().find((d) => d.querySelector('div[role="textbox"]'))],
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
        await autoSkip("發文視窗沒有跳出來");
        return;
      }
      await sleep(1000);
      // 發文視窗出來的同時（或之後一秒）FB 疊上「入社審核」→ 這個社團要先回答管理員的問題，外掛不替他答，直接跳過
      const qbox = findQuestionsDialog(L);
      if (qbox) {
        log("⚠ 這個社團跳出「入社審核」，要先回答管理員的問題才能發文。外掛不替你回答，先關掉它。", "fbq-bad");
        closeBox(qbox, L);
        log("你自己去回答入社問題後，再按「勾選未發佈的」補發這個社團。", "");
        await report("failed", "要先回答入社問題");
        await autoSkip("這個社團要先回答入社問題");
        return;
      }

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
      let fillOk = true; // 自動模式只在文案完整填進去時才替他按發佈
      if (job.ad.text && job.ad.text.trim()) {
        log("填入文案…");
        const box = dialog.querySelector('div[role="textbox"]');
        const how = await fillComposer(box, job.ad.text);
        fillOk = how === "paste" || how === "lines";
        if (how === "failed") log("文案沒填進去，請自己貼上再發佈。", "fbq-bad");
        else if (how === "partial") log("⚠ 排版可能沒完全照後台，發佈前請看一下換行。", "fbq-bad");
        else log("文案已填好，排版照後台。", "");
      }

      // 5. 上傳圖片
      let imagesOk = true;
      let photos = null;
      let imgNote = ""; // 照片沒傳完時，網路探針看到的原因（寫進發佈紀錄）
      if (job.ad.images && job.ad.images.length) {
        log("上傳 " + job.ad.images.length + " 張圖片…（等 Facebook 真的收完，不是看到縮圖就算）");
        try {
          photos = await uploadImages(dialog, job.ad.images, L);
          imagesOk = photos.ok;
          if (photos.got >= photos.want) log("照片 " + photos.got + "／" + photos.want + " 張都進去了。", "");
          else if (photos.ok) log("看到 " + photos.got + " 格縮圖（Facebook 最多顯示 " + photos.shown + " 格），" + photos.want + " 張照片當作都進去了。", "");
          else log("⚠ 只看到 " + photos.got + "／" + photos.want + " 張照片進去，自己看一下視窗裡的照片對不對。", "fbq-bad");
          log("🔎 " + netSummary(lastUploadT0), "");
        } catch (e) {
          imagesOk = false;
          log("圖片上傳沒成功（" + (e.message || e) + "）。你可以自己在視窗裡拖圖片進去。", "fbq-bad");
          imgNote = netSummary(lastUploadT0);
          log("🔎 " + imgNote, "fbq-bad");
        }
      }

      // 6. 自動模式：替他按「發佈」；條件不齊就退回半自動
      if (job.autoPost) {
        if (fillOk && imagesOk) return await autoPost(dialog, photos);
        if (!imagesOk) {
          // 🔴 照片沒傳完（Facebook 上傳回 500、或縮圖張數對不上）：他 2026-10-27 截圖——第 62／100 個停在
          //    「自動發佈先不做：照片沒傳完，請你自己核對後按發佈」等他，整批卡住。他說「遇到這種情況超過 5 秒也直接跳過下則」
          //    → 自動模式不停了：標成跳過換下一個，紀錄帶探針看到的原因；之後在後台「勾選未發佈的」補發。半自動照舊停著等他補。
          const why = photos ? "照片只進去 " + photos.got + "／" + photos.want + " 張" : "照片沒傳成功";
          const net = String(imgNote || netSummary(lastUploadT0) || "").slice(0, 200);
          log("⚠ " + why + (fillOk ? "" : "、文案也沒完整填進去") + "。自動模式不等你補，這則跳過換下一個；之後在後台按「勾選未發佈的」補發。", "fbq-bad");
          return await autoSkip(why + (net ? "（" + net + "）" : ""));
        }
        log("⚠ 自動發佈先不做：文案沒完整填進去。請你自己核對後按「發佈」。", "fbq-bad");
      }

      // 6'. 半自動：交給使用者按發佈
      log("內容已填好。請核對後按 Facebook 的「發佈」。", "fbq-ok");
      log("發佈完，回來按下面的「✅ 我按過發佈了，下一個社團」。", "fbq-strong");
      await report("ready", "已填好，等你按發佈" + (imgNote ? "（照片沒傳完：" + imgNote + "）" : ""));
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

  /* ───────── 自動按「發佈」 ───────── */
  /**
   * 發文視窗裡的「發佈」鈕：文字要**整個**就是「發佈／張貼／Post」（不是「發佈到…」「排程發佈」那種），
   * 而且不在任何一則貼文裡（跟找發文框同一道安全鎖）。同名的取視窗最下面那顆。
   */
  function findPostButton(dialog, L) {
    const re = FBQ.exactRe(FBQ.words(L, "postButton"));
    const cands = [...dialog.querySelectorAll('[role="button"], button')].filter((el) => {
      if (el.offsetParent === null || el.closest('[role="article"]')) return false;
      return re.test(textOf(el)) || re.test(el.getAttribute("aria-label") || "");
    });
    return cands.length ? cands[cands.length - 1] : null;
  }
  const isDisabled = (el) => !el || el.getAttribute("aria-disabled") === "true" || el.disabled === true;

  /** 等「發佈」鈕變成可按（圖片還在上傳時 FB 會先把它鎖住） */
  async function waitPostButton(dialog, L, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const b = findPostButton(dialog, L);
      if (b && !isDisabled(b)) return b;
      await sleep(500);
    }
    return null;
  }

  /**
   * 看結果用的文字：**先放所有彈出視窗的字**，再接頁面本文。
   * 社團頁本文常常很長，錯誤框的字在 DOM 最後面，直接切前 6000 字會把它切掉、永遠看不到
   * 「抱歉，沒有上傳新的相片」這種訊息。
   */
  function pageProbe() {
    const boxes = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].map((d) => d.innerText || "").join("\n");
    return (boxes + "\n" + (document.body.innerText || "")).slice(0, 12000);
  }

  /**
   * 只認「按下去之後才新出現」的字：社團頁側欄本來就可能有「待審核貼文」這種字，不能算。
   * 一個詞一個詞比（不是整組 regex）：側欄有「待審核」，發出去後跳出「等待管理員審核」仍要算進審核。
   */
  function freshAny(words, base, now) {
    return words.some((w) => {
      const re = new RegExp(FBQ.escapeRe(w), "i");
      return re.test(now) && !re.test(base || "");
    });
  }

  /**
   * 關掉 FB 跳出來的提示框（例如「無法上傳相片」）。
   * 🔴 只比**看得見的文字**、而且跳過發文視窗本身：發文視窗右上角那顆 X 的 aria-label 也是「關閉」，
   *    比到它就會把寫好的貼文整個關掉。「捨棄」那種按鈕一律不碰。
   */
  function closeAlert(dialog, L) {
    const re = FBQ.exactRe(FBQ.words(L, "close"));
    const skip = FBQ.anyRe(FBQ.words(L, "discard"));
    const boxes = [...document.querySelectorAll('[role="alertdialog"], [role="dialog"]')].filter((d) => d !== dialog && !d.contains(dialog));
    for (const box of boxes.reverse()) {
      for (const el of box.querySelectorAll('[role="button"], button')) {
        if (el.offsetParent === null) continue;
        const t = textOf(el);
        if (!t || skip.test(t)) continue;
        if (re.test(t)) {
          el.click();
          return true;
        }
      }
    }
    return false;
  }

  /**
   * 🔴 「入社審核」視窗（2026-10-12 同事遇到的）：有些社團要先回答管理員的問題才算正式能發文，
   *    FB 會跳一個「入社審核／你快要能夠發佈貼文和留言了。回答這些問題，協助管理員瞭解你」的視窗，裡面是幾格要你填答案的欄位。
   *    外掛**不替他回答、不按「提交」**（那是管理員要認識本人的問題），他說「遇到要回答社團問題的先跳過」。
   *    只在彈出視窗裡找這些字（不看頁面本文：動態牆上別人的貼文也可能寫「入社審核」），而且這個視窗裡也可能有輸入框，
   *    找發文框時要先把它認出來，不然廣告會被填進答案欄。
   */
  function findQuestionsDialog(L) {
    const re = FBQ.anyRe(FBQ.words(L, "membershipQuestions"));
    const boxes = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].filter((d) => d.getClientRects().length > 0);
    return boxes.reverse().find((d) => re.test(d.innerText || "")) || null;
  }

  /** 關掉**指定的**那個視窗：點它裡面的「關閉」（右上角的 X 通常只有 aria-label）；「捨棄／提交」那種一律不碰，找不到就按 Esc。 */
  function closeBox(box, L) {
    const re = FBQ.exactRe(FBQ.words(L, "close"));
    const skip = FBQ.anyRe(FBQ.words(L, "discard"));
    for (const el of box.querySelectorAll('[role="button"], button')) {
      if (el.getClientRects().length === 0) continue;
      const t = textOf(el);
      const al = el.getAttribute("aria-label") || "";
      if (skip.test(t) || skip.test(al)) continue;
      if (re.test(al) || (t && re.test(t))) {
        el.click();
        return true;
      }
    }
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return false;
  }

  /** 比對用的文字：去掉表情符號、控制字元（FB 把表情符號換成 <img>，textContent 裡沒有它們）、把空白壓成一格 */
  const normText = (s) =>
    String(s || "")
      .replace(/[\p{S}\p{C}\p{M}]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
  /** 文案開頭那幾個字（第一行有內容的、去掉表情符號後取前 20 字）：發出去後動態牆上會多一篇含這幾個字的貼文 */
  function postSnippet(text) {
    const line =
      String(text || "")
        .split("\n")
        .map((s) => normText(s))
        .find((s) => s.length >= 4) || "";
    return line.slice(0, 20);
  }
  /** 按「發佈」之前先記下：頁面與彈出視窗上已有的字、動態牆上已有的貼文（同一篇文案昨天發過的那篇不能算這次的） */
  function snapshotBeforePost(dialog) {
    return {
      text: pageProbe(),
      articles: new Set([...document.querySelectorAll('[role="article"]')].filter((a) => !dialog.contains(a))),
    };
  }

  /** 動態牆上**新**多出一篇、內容含文案開頭那幾個字（按發佈前就在的貼文不算、發文視窗裡的也不算） */
  function feedHasPost(dialog, baseArticles, snip) {
    if (!snip) return false;
    return [...document.querySelectorAll('[role="article"]')].some(
      (a) => !baseArticles.has(a) && !(dialog && dialog.contains(a)) && normText(a.textContent).includes(snip),
    );
  }

  /**
   * 按下「發佈」之後看結果，三個訊號任一個都算：
   *   ① 發文視窗消失＝發出去了（同時出現「等待審核」字樣＝進審核）
   *   ② 🔵 動態牆上**新**多出一篇、內容含文案開頭那幾個字＝發出去了（連續 4 秒都在、也沒跳錯誤才算）——
   *      分頁在背景時 FB 關視窗的動畫不會跑、視窗一直留著，光看①會等到超時說「不確定」，他 2026-10-12 縮小視窗就遇到
   *   ③ 新出現「等待審核」字樣＝進審核（同樣不必等視窗關）
   * ④ 跳出「入社審核」視窗＝這個社團要先回答管理員的問題（questions：呼叫端關掉它，看牆上有沒有這篇再決定記什麼）
   * 出現「沒有上傳新的相片」類字＝照片沒傳上去（uploadfail，呼叫端會重試一次）；
   * 出現「暫時被封鎖／違反守則」類字＝FB 拒絕；時間到什麼都沒看到＝不確定（退回半自動讓他看）。
   * base＝snapshotBeforePost() 的結果（舊呼叫端傳字串也吃）。
   */
  async function waitPostOutcome(dialog, L, timeoutMs, base, snippet) {
    const deadline = Date.now() + timeoutMs;
    const pendWords = FBQ.words(L, "pendingApproval");
    const blockWords = FBQ.words(L, "blocked");
    const failWords = FBQ.words(L, "uploadFailed");
    const baseText = typeof base === "string" ? base : (base && base.text) || "";
    const baseArticles = (base && base.articles) || new Set();
    const snip = String(snippet || "").trim();
    const postInFeed = () => feedHasPost(dialog, baseArticles, snip);
    let feedSeenAt = 0;
    while (Date.now() < deadline) {
      const body = pageProbe();
      // 上傳失敗要排在封鎖前面比：兩邊的字有機會同時出現，但「照片沒傳上去」是可以重試的，封鎖不是
      if (freshAny(failWords, baseText, body)) return "uploadfail";
      if (freshAny(blockWords, baseText, body)) return "blocked";
      // ④「入社審核」：FB 有時是把發文視窗整個換成它（同一個元素），所以要排在「視窗消失」前面看
      if (findQuestionsDialog(L)) return "questions";
      const gone = !document.contains(dialog) || dialog.offsetParent === null;
      const pend = freshAny(pendWords, baseText, body);
      if (gone) return pend ? "pending" : "posted";
      if (pend) return "pending";
      if (postInFeed()) {
        if (!feedSeenAt) feedSeenAt = Date.now();
        else if (Date.now() - feedSeenAt >= 4000) return "posted";
      } else {
        feedSeenAt = 0;
      }
      await sleep(500);
    }
    return "unknown";
  }

  /** 自動模式換下一個社團前先等一下：面板倒數，可以立刻換或停止。用 sleep()（走背景計時），分頁在背景也照樣數。 */
  async function countdown(sec) {
    let left = Math.max(0, Math.round(sec));
    let choice = "";
    const draw = () =>
      buttons([
        { label: "立刻換下一個（" + left + " 秒後自動換）", primary: true, onClick: () => (choice = "next") },
        { label: "停止全部", danger: true, onClick: () => (choice = "stop") },
      ]);
    draw();
    while (left > 0 && !choice) {
      await sleep(1000);
      if (choice) break;
      left -= 1;
      if (left > 0) draw();
    }
    return choice || "next";
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

  /* ───────── 網路探針（net-probe.js 從頁面 world 丟過來的上傳結果）───────── */
  // 🔴 2026-10-12 他一天撞到好幾次「沒有上傳新的相片」，哪幾張失敗每次不一樣，畫面上查不出原因。
  //    net-probe.js 把上傳請求的狀態碼、耗時、FB 回的錯誤碼記下來送到這裡；上傳失敗時印在面板、寫進發佈紀錄，
  //    成功時也印一行（看得出探針有沒有接上、上傳花了多久）。
  const netLog = [];
  let probeSeen = false;
  let lastUploadT0 = 0; // 這個社團開始塞照片的時間，摘要只看這之後的請求
  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data || e.data.source !== "fbq-net" || !e.data.rec) return;
    if (e.data.rec.kind === "hello") {
      probeSeen = true;
      return;
    }
    netLog.push(e.data.rec);
    if (netLog.length > 80) netLog.shift();
  });
  try {
    window.postMessage({ source: "fbq-net-ping" }, location.origin);
  } catch {}
  /** 這次上傳的請求摘要（給人看的一行字）；探針沒接上、沒看到請求也要講清楚 */
  function netSummary(sinceTs) {
    if (!probeSeen) return "網路探針沒接上（外掛剛更新的話，到 chrome://extensions 按 ↻，這個社團重新載入就有）";
    const recs = netLog.filter((r) => (r.t0 || 0) >= (sinceTs || 0) && ((r.files && r.files.length) || /upload/i.test(r.url || "")));
    if (!recs.length) return "網路探針在這段時間沒看到上傳請求";
    const isOk = (r) => r.kind === "load" && r.status >= 200 && r.status < 300 && !(r.fb && r.fb.error);
    const ok = recs.filter(isOk);
    const bad = recs.filter((r) => !isOk(r));
    const name = (r) => (r.files && r.files.length ? r.files.map((f) => f.name || Math.round(f.size / 1024) + "KB").join("+") : r.url);
    const why = (r) => {
      if (r.kind === "error") return "網路中斷或被擋";
      if (r.kind === "abort") return "被 Facebook 自己取消";
      if (r.kind === "timeout") return "逾時";
      const fb = r.fb || {};
      if (fb.error) return "HTTP " + r.status + "、FB 錯誤 " + fb.error + (fb.summary ? "「" + fb.summary + (fb.desc ? "：" + fb.desc : "") + "」" : "");
      if (fb.raw) return "HTTP " + r.status + "、回應看不懂：" + fb.raw.slice(0, 60);
      return "HTTP " + r.status;
    };
    const where = (r) => "分頁在" + (r.vis === "hidden" ? "背景" : "前景");
    let s = "上傳請求 " + recs.length + " 個：" + ok.length + " 個成功";
    if (bad.length) s += "；失敗 " + bad.length + " 個 → " + bad.map((r) => name(r) + "（" + why(r) + "，耗時 " + Math.round((r.ms || 0) / 1000) + " 秒，" + where(r) + "）").join("；");
    else s += "（最慢 " + Math.round(Math.max(...recs.map((r) => r.ms || 0)) / 1000) + " 秒，" + where(recs[recs.length - 1]) + "）";
    return s;
  }

  /* ───────── 商品買賣社團：「商品拍賣」表單 ───────── */
  // 🔴 2026-10-15 他說「遇到商品買賣的社團也請按下商品買賣貼文」：這種社團預設落在「商品買賣」頁籤，沒有一般的發文框，
  //    只有一顆「商品拍賣」。按下去是 Marketplace 式的表單（標題／價格／說明／相片，可能還有類別、狀況）。
  //    表單長相沒親眼看過，所以每一格都用標籤字認，認不到就不填；自動模式只在標題、價格、說明、照片、身分都確認了才替他按發佈，
  //    缺任何一樣就跳過換下一個（不停下來等他：這種社團一批裡可能好幾個，分頁又多半縮小在背景，停著整批就卡住）。
  const isVisible = (el) => !!el && el.getClientRects().length > 0;
  /** 在表單裡用「標籤字」找欄位：aria-label／placeholder／<label for>／包著它的 label／同一個小容器裡的字 */
  function fieldByLabel(dialog, words) {
    const re = FBQ.anyRe(words);
    const sel = 'input:not([type="file"]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea, [role="textbox"], [contenteditable="true"]';
    for (const el of [...dialog.querySelectorAll(sel)].filter(isVisible)) {
      const al = (el.getAttribute("aria-label") || "") + " " + (el.getAttribute("placeholder") || "");
      if (re.test(al)) return el;
      if (el.id) {
        let lab = null;
        try {
          lab = dialog.querySelector('label[for="' + CSS.escape(el.id) + '"]');
        } catch {}
        if (lab && re.test(textOf(lab))) return el;
      }
      const wrap = el.closest("label");
      if (wrap && textOf(wrap).length < 40 && re.test(textOf(wrap))) return el;
      const box = el.parentElement && el.parentElement.parentElement;
      if (box && box !== dialog && textOf(box).length < 40 && re.test(textOf(box))) return el;
    }
    return null;
  }
  /** 把值填進 React 控制的 input／textarea：直接改 .value React 不會知道，要走原生 setter 再發 input 事件 */
  function setNativeValue(el, value) {
    el.focus();
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  /** 填一格：input／textarea 走原生 setter；contenteditable 走貼上（跟發文框同一套）。回傳有沒有真的填進去 */
  async function fillField(el, value) {
    const v = String(value || "");
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      setNativeValue(el, v);
      await sleep(250);
      const after = String(el.value || "");
      const squash = (s) => s.replace(/\s+/g, " ").trim();
      // 價格欄 FB 會自己加千分位（29,880,000），只比數字
      if (/^\d+$/.test(v)) return after.replace(/\D/g, "") === v;
      return squash(after) === squash(v);
    }
    const how = await fillComposer(el, v);
    return how === "paste" || how === "lines";
  }
  /** 從文案抓價格：「開價 2988 萬」→ 29880000、「1.2億」→ 120000000。抓不到回空字串（不猜，寧可跳過） */
  function parsePrice(text) {
    const t = String(text || "").replace(/[,，]/g, "");
    let m = t.match(/(?:開價|售價|總價|價格|價錢)\s*[:：]?\s*(?:NT\$|NTD|\$)?\s*(\d+(?:\.\d+)?)\s*(億|萬)?/);
    if (!m) m = t.match(/(\d+(?:\.\d+)?)\s*(億|萬)(?![坪元])/);
    if (!m) return "";
    let n = Number(m[1]);
    if (m[2] === "億") n *= 1e8;
    else if (m[2] === "萬") n *= 1e4;
    if (!isFinite(n) || n <= 0 || n > 1e11) return "";
    return String(Math.round(n));
  }
  /** 視窗裡文字（或 aria-label）**整個**等於 words 之一、而且可以按的按鈕 */
  function findButton(dialog, words) {
    const re = FBQ.exactRe(words);
    const cands = [...dialog.querySelectorAll('[role="button"], button')].filter((el) => {
      if (!isVisible(el) || el.closest('[role="article"]')) return false;
      return re.test(textOf(el)) || re.test(el.getAttribute("aria-label") || "");
    });
    return cands.length ? cands[cands.length - 1] : null;
  }
  async function waitButton(dialog, words, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const b = findButton(dialog, words);
      if (b && !isDisabled(b)) return b;
      await sleep(500);
    }
    return null;
  }
  /**
   * 「狀況」必填下拉（2026-10-15 實看：全新／二手 - 近全新／二手 - 良好／二手 - 普通）：
   * 文案寫新成屋／預售就選「全新」，其他一律「二手 - 良好」——房子本來就沒有這種分法，挑一個不難看的。
   */
  async function pickCondition(dialog, L, text) {
    const re = FBQ.anyRe(FBQ.words(L, "sellCondition"));
    const cb = [...dialog.querySelectorAll('[role="combobox"]')].find((el) => isVisible(el) && re.test(textOf(el) + " " + textOf(el.parentElement && el.parentElement.parentElement)));
    if (!cb) return "";
    const wantNew = /新成屋|預售|新屋|新建|全新/.test(String(text || ""));
    const prefer = FBQ.words(L, wantNew ? "sellConditionNew" : "sellConditionUsed");
    cb.click();
    await sleep(800);
    const opts = () => [...document.querySelectorAll('[role="option"], [role="menuitem"], [role="menuitemradio"]')].filter(isVisible);
    let list = opts();
    if (!list.length) {
      await sleep(1000);
      list = opts();
    }
    const squash = (s) => String(s || "").replace(/\s+/g, "");
    let pick = null;
    for (const w of prefer) {
      pick = list.find((o) => squash(textOf(o)) === squash(w));
      if (pick) break;
    }
    if (!pick) for (const w of prefer) {
      pick = list.find((o) => squash(textOf(o)).includes(squash(w)));
      if (pick) break;
    }
    if (!pick) {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return "";
    }
    const label = textOf(pick);
    pick.click();
    await sleep(500);
    return label;
  }
  /** 商品標題：文案第一個有內容的句子（去掉表情符號），最多 max 字 */
  function titleFromText(text, max) {
    const line =
      String(text || "")
        .split("\n")
        .map((s) => normText(s))
        .find((s) => s.length >= 2) || "";
    return line.slice(0, max || 80);
  }

  /* ───────── 圖片 ───────── */
  /**
   * 把圖片塞進發文視窗，**等 Facebook 真的收完**才回來。
   *
   * 🔴 為什麼要等得這麼囉嗦（2026-10-09 他遇到的狀況）：FB 的縮圖是本機預覽，檔案一選好就出現，
   *    但照片還在背景往 FB 的伺服器傳。舊版只要「視窗裡的 img 變多」就當作傳好、再等 1.5 秒就按「發佈」，
   *    FB 收尾時手上沒有傳完的照片，就跳「抱歉，沒有上傳新的相片。請再試一次」，整則發不出去。
   *    所以改成：**新長出來的縮圖張數要跟檔案張數一樣**，再多等一段（張數越多等越久），
   *    中間看到 FB 的上傳錯誤就直接當失敗。數不到就回報沒齊，自動模式不會硬按。
   *
   * 回傳 { want, got, count }：count() 可以之後再數一次（按發佈前再確認一遍照片還在）。
   */
  async function uploadImages(dialog, dataUrls, L) {
    lastUploadT0 = Date.now();
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
    // 哪些 img 是「這次新長出來的」要在觸發 change **之前**記下來。記元素本身而不是數量：
    // 頭像、小圖示也是 img，光比數量會把它們算進來（縮圖同步長出來時還會一直等不到「變多」、白等）。
    const beforeImgs = new Set(dialog.querySelectorAll("img"));
    const beforeText = new Set(dialog.querySelectorAll("span, div"));
    const tiles = () =>
      [...dialog.querySelectorAll("img")].filter((im) => {
        if (beforeImgs.has(im) || im.offsetParent === null) return false;
        const r = im.getBoundingClientRect();
        return r.width >= 40 && r.height >= 40; // 新長出來的小圖示不算
      }).length;
    // 🔴 FB 的發文視窗最多只顯示 5 格縮圖，第 6 張起疊在最後一格的「+N」裡（2026-10-12 他 10 張照片只看到 5 格，
    //    整批都退回半自動）：「+N」的 N 要加回來；萬一這版 FB 沒有「+N」字樣，看到 5 格也當作都進去了——
    //    FB 是整批收檔，不會只收一半，收不到會跳「無法上傳你的檔案」，那條另外有在看。
    const COLLAGE_MAX = 5;
    const plusBadge = () => {
      let n = 0;
      for (const el of dialog.querySelectorAll("span, div")) {
        if (el.childElementCount || beforeText.has(el) || el.offsetParent === null) continue;
        const m = (el.textContent || "").trim().match(/^[+＋]\s*(\d{1,2})$/);
        if (m) n = Math.max(n, Number(m[1]));
      }
      return n;
    };
    const count = () => {
      const t = tiles();
      return t ? t + plusBadge() : 0;
    };
    const want = files.length;
    const enough = (n) => n >= want || n >= Math.min(want, COLLAGE_MAX);
    // 「選檔案之前頁面上就有的字」不算失敗（跟判斷發文結果同一套：只認新出現的）
    const failWords = FBQ.words(L, "uploadFailed");
    const failBase = pageProbe();
    const uploadFailed = () => freshAny(failWords, failBase, pageProbe());

    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));

    // ① 等縮圖張數到齊（最多 2 分鐘：10 張大圖在慢一點的網路上真的要這麼久）
    const deadline = Date.now() + 120000;
    let seen = 0;
    let lastChange = Date.now();
    while (Date.now() < deadline) {
      if (uploadFailed()) throw new Error("Facebook 說檔案上傳失敗");
      const n = count();
      if (n !== seen) {
        seen = n;
        lastChange = Date.now();
      }
      if (enough(seen)) break;
      // 張數卡住不動超過 20 秒就別再等：萬一 FB 改版把縮圖的版型又改了，等滿 2 分鐘也等不到，
      // 不如早點回去讓自動模式退回半自動（面板會寫看到幾張），不要每個社團都卡兩分鐘
      if (seen > 0 && Date.now() - lastChange > 20000) break;
      await sleep(500);
    }
    const got = count();
    // ② 張數到齊只代表 FB 收下檔案，實際上傳還在跑：張數越多等越久（1 張 4 秒、10 張 13 秒，上限 15 秒）。
    //    FB 上傳中通常也會把「發佈」鈕鎖住，autoPost 的 waitPostButton 再擋一次。
    if (enough(got)) {
      const settle = Math.min(3000 + 1000 * want, 15000);
      const until = Date.now() + settle;
      while (Date.now() < until) {
        if (uploadFailed()) throw new Error("Facebook 說檔案上傳失敗");
        await sleep(500);
      }
    }
    // check()：按發佈前／重試前再確認一次照片還在（跟這裡同一套算法）
    return { want, got, ok: enough(got), shown: COLLAGE_MAX, check: () => enough(count()), count };
  }

  /* ───────── 抓「我加入的社團」清單 ───────── */

  /** 捲到底讓 Facebook 載入更多。有些版型不是整頁在捲，而是內層容器在捲，兩個都推一下。 */
  function scrollDown() {
    window.scrollTo(0, document.documentElement.scrollHeight);
    let best = null;
    for (const el of document.querySelectorAll("div")) {
      if (el.clientHeight < 300 || el.scrollHeight < el.clientHeight + 200) continue;
      const oy = getComputedStyle(el).overflowY;
      if (oy !== "auto" && oy !== "scroll") continue;
      if (!best || el.scrollHeight > best.scrollHeight) best = el;
    }
    if (best) best.scrollTop = best.scrollHeight;
  }

  /**
   * 後台按「從 FB 抓我加入的社團」→ 背景開「你的社團」分頁 → 這支自動往下捲、把社團收集起來，
   * 回傳後台讓他自己勾。
   *
   * 🔴 只讀他自己已經加入的社團名稱與網址，**不發文、不按任何 Facebook 的按鈕、不碰帳號設定**。
   * 🔴 清單只回他自己的後台分頁（存在他的瀏覽器），不送去任何地方。
   */
  async function runScan(L) {
    ensurePanel();
    setTitle("FB 社團廣告助手（抓社團清單）");
    let stopped = false;
    buttons([
      {
        label: "停止抓取",
        danger: true,
        onClick: () => {
          stopped = true;
          log("停止中…", "");
        },
      },
    ]);

    if (/\/login|\/checkpoint/.test(location.pathname) || (document.querySelector('input[name="pass"]') || {}).offsetParent) {
      log("看起來還沒登入 Facebook。請先登入，再回後台按一次「從 FB 抓我加入的社團」。", "fbq-bad");
      await send("fbq:scan-done", { groups: [], error: "尚未登入" });
      buttons([{ label: "關閉面板", onClick: () => panel.remove() }]);
      return;
    }

    log("正在往下捲，收集你加入的社團…", "fbq-strong");
    log("這段期間請讓這個分頁留在前景（Chrome 會凍住背景分頁的計時器）。", "");

    const seen = new Map();
    let idle = 0;
    const deadline = Date.now() + 240000; // 最多 4 分鐘，免得 FB 一直有東西可捲就停不下來
    while (!stopped && Date.now() < deadline && idle < 5) {
      const head = FBQ.findSuggestedHeading(document, L); // 「建議的社團」以下是 FB 推薦的，不是他加入的
      const before = seen.size;
      for (const g of FBQ.collectGroups(document, { stopAt: head, locale: L })) {
        const prev = seen.get(g.id);
        if (!prev || prev.name.length < g.name.length) seen.set(g.id, g);
      }
      if (seen.size > before) {
        idle = 0;
        log("已找到 " + seen.size + " 個社團…");
        send("fbq:scan-progress", { found: seen.size });
      } else {
        idle++; // 連續幾輪都沒有新的＝捲到底了
      }
      scrollDown();
      await sleep(1400);
    }

    const list = [...seen.values()].sort((a, b) => String(a.name).localeCompare(String(b.name), "zh-Hant"));
    if (!list.length) {
      log("一個社團都沒抓到。確認這頁是「你的社團」清單（左邊選單的『你的社團』），或自己往下捲一點再按「再抓一次」。", "fbq-bad");
    } else {
      log("抓完了：" + list.length + " 個社團。" + (stopped ? "（你按了停止，可能還沒捲完）" : ""), "fbq-ok");
      log("回後台的『社團』分頁挑要用的，勾好按「加入清單」。", "fbq-strong");
    }
    await send("fbq:scan-done", { groups: list, stopped });
    buttons([
      { label: "再抓一次", onClick: () => location.reload() },
      { label: "關閉面板", onClick: () => panel.remove() },
    ]);
  }

  /**
   * 這個分頁是來抓社團清單的，還是來發文的？
   * 背景是「先開分頁、再存任務」，理論上分頁載完時任務已經在了；但 FB 偶爾載很快，所以重試幾次。
   */
  async function boot() {
    for (let i = 0; i < 3; i++) {
      const s = await send("fbq:scan-current");
      if (s && s.ok && s.scanning) return runScan(s.locale || "zh-TW");
      if (!s || !s.ok) break;
      if (!/\/groups\/joins/.test(location.pathname)) break; // 不是「你的社團」頁就不用等
      await sleep(700);
    }
    return run();
  }

  boot();
})();

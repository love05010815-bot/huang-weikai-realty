/**
 * Facebook 介面文字（中英文都試）＋「抓社團清單」用的解析。Facebook 常改版，改版後只要調整這裡。
 * 掛在 self.FBQ 給 content.js 用。
 */
(() => {
  const UI_TEXT = {
    "zh-TW": {
      // ⚠️ 不要放單獨的「留言」「分享」——那是每則貼文底下的按鈕，萬一發文框沒找到會誤點、
      //    最糟會把廣告打進別人貼文的留言欄。這裡只放發文框自己的招呼語。
      composerTrigger: ["留個言", "寫些什麼", "撰寫貼文", "在這個社團發佈", "建立公開貼文", "發佈貼文", "分享你的想法", "在想什麼", "你在想什麼", "有什麼新鮮事", "說點什麼"],
      photoButton: ["相片/影片", "相片／影片", "新增相片/影片", "相片或影片"],
      postButton: ["發佈", "張貼"],
      pendingApproval: ["等待管理員審核", "待審核", "等待審核", "正在審核"],
      blocked: ["暫時被封鎖", "暫時無法", "無法發佈", "違反社群守則", "請稍後再試"],
      discard: ["捨棄貼文", "捨棄", "離開"],
      switchProfile: ["選擇你要用來發佈的身分", "切換個人檔案", "選擇用來張貼的個人檔案", "以粉絲專頁身分"],
      notAvailable: ["此內容目前無法顯示", "這個頁面無法使用", "此內容不存在"],
      joinGroup: ["加入社團"],
      close: ["關閉"],
      // 「你的社團」頁上，這些標題以下是 FB 推薦你加入的、不是你已加入的 → 抓清單時在這裡切掉
      suggested: ["建議的社團", "推薦社團", "推薦的社團", "為你推薦", "你可能有興趣", "探索社團", "探索新社團"],
      // 抓清單時要略過的「不是社團名稱」的字（按鈕、統計）
      notAName: ["加入", "已加入", "查看社團", "檢視社團", "前往社團", "邀請", "邀請朋友", "更多", "管理", "設定", "分享", "取消"],
    },
    en: {
      composerTrigger: ["Write something", "Create a public post", "Create post", "What's on your mind", "Start a post", "Write to group"],
      photoButton: ["Photo/video", "Photo/Video", "Add photos/videos", "Photos/videos"],
      postButton: ["Post"],
      pendingApproval: ["pending approval", "pending review", "awaiting approval"],
      blocked: ["temporarily blocked", "couldn't post", "Community Standards", "restricted", "try again later"],
      discard: ["Discard post", "Discard", "Leave"],
      switchProfile: ["Select who to post as", "Switch profile", "Choose who to post as"],
      notAvailable: ["This content isn't available", "Page not found", "isn't available right now"],
      joinGroup: ["Join group", "Join Group"],
      close: ["Close"],
      suggested: ["Suggested for you", "Suggested groups", "Groups you may like", "Discover groups", "Recommended for you"],
      notAName: ["Join", "Joined", "View group", "Visit group", "Invite", "More", "Manage", "Settings", "Share", "Cancel"],
    },
  };

  function words(locale, key) {
    const primary = UI_TEXT[locale] || UI_TEXT["zh-TW"];
    const other = locale === "en" ? UI_TEXT["zh-TW"] : UI_TEXT.en;
    return [...(primary[key] || []), ...(other[key] || [])];
  }
  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function anyRe(list, flags) {
    return new RegExp(list.map(escapeRe).join("|"), flags || "i");
  }
  function exactRe(list) {
    return new RegExp("^\\s*(" + list.map(escapeRe).join("|") + ")\\s*$", "i");
  }

  /* ───────── 抓「我加入的社團」清單 ───────── */

  /**
   * 這些 /groups/xxx 不是社團，是 Facebook 自己的功能頁。
   * 少了這張表，抓回來的清單第一筆就會是「joins」「feed」這種假社團。
   */
  const NOT_A_GROUP = new Set([
    "feed", "joins", "discover", "create", "search", "your_groups", "category", "categories",
    "notifications", "invites", "requests", "member_requests", "member-requests", "browse",
    "new", "hidden", "pending", "archived", "drafts", "insights", "welcome",
  ]);

  const GROUP_PATH_RE = /^\/groups\/([^/?#]+)\/?$/;

  /** 從連結取社團代號；不是「社團首頁」的連結（貼文、成員、活動…）一律回空字串。 */
  function groupIdFromHref(href) {
    let path = "";
    try {
      path = new URL(String(href || ""), "https://www.facebook.com").pathname;
    } catch {
      return "";
    }
    const m = path.match(GROUP_PATH_RE);
    if (!m) return "";
    let id = m[1];
    try {
      id = decodeURIComponent(m[1]);
    } catch {
      /* 壞掉的百分號編碼就用原字串 */
    }
    if (!id || NOT_A_GROUP.has(id.toLowerCase())) return "";
    return id;
  }

  const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();

  /**
   * 從連結裡挑出「社團名稱」。
   * FB 把名稱放在巢狀的 span，旁邊常跟著「1.2萬位成員 · 每天 10 則貼文」這種統計，
   * 還有「加入」「查看社團」這種按鈕字 —— 都要濾掉，不然清單會出現一堆叫「加入」的社團。
   */
  function nameFromAnchor(a, locale) {
    const skip = exactRe(words(locale || "zh-TW", "notAName"));
    const meta = /(位成員|名成員|個成員|則貼文|\d+\s*(members?|posts?)\b|^·|^(公開|私密|Public|Private)(社團|group)?$)/i;
    const texts = [];
    for (const el of a.querySelectorAll("span, div, strong, h1, h2, h3, h4")) {
      if (el.childElementCount) continue; // 只要最內層那段純文字
      const t = clean(el.textContent);
      if (t) texts.push(t);
    }
    if (!texts.length) {
      const t = clean(a.textContent);
      if (t) texts.push(t);
    }
    const good = texts.filter((t) => t.length >= 2 && t.length <= 120 && !skip.test(t) && !meta.test(t));
    // 名稱通常是最上面那段可用的文字；真的挑不到才退回 aria-label
    return good[0] || clean(a.getAttribute("aria-label")) || "";
  }

  /**
   * 找「建議／推薦社團」的標題 —— 它後面的社團是 FB 要你加入的，不是你已加入的。
   * 🔴 只認真正的標題（role="heading" 或 h1~h4）：拿一般 span 去比對，
   *    隨便一個含「推薦」的字就會把清單從中間切斷，而且是靜默少抓，比多抓危險得多。
   */
  function findSuggestedHeading(doc, locale) {
    const re = anyRe(words(locale || "zh-TW", "suggested"));
    for (const el of (doc || document).querySelectorAll('[role="heading"], h1, h2, h3, h4')) {
      const t = clean(el.textContent);
      if (t && t.length <= 24 && re.test(t)) return el;
    }
    return null;
  }

  /**
   * 掃出頁面上所有「社團首頁」連結 → [{ id, name, url }]，同一個社團只留一筆（名稱取比較完整的那個）。
   * opts.stopAt：傳 findSuggestedHeading() 的結果，只收它前面的（切掉推薦區）。
   */
  function collectGroups(root, opts) {
    const scope = root && root.querySelectorAll ? root : document;
    const stopAt = (opts && opts.stopAt) || null;
    const locale = (opts && opts.locale) || "zh-TW";
    const out = new Map();
    for (const a of scope.querySelectorAll('a[href*="/groups/"]')) {
      // compareDocumentPosition 的 4 = DOCUMENT_POSITION_FOLLOWING：a 在標題後面 → 是推薦區的，不收
      if (stopAt && stopAt.compareDocumentPosition && stopAt.compareDocumentPosition(a) & 4) continue;
      const id = groupIdFromHref(a.getAttribute("href") || a.href || "");
      if (!id) continue;
      const name = nameFromAnchor(a, locale);
      const prev = out.get(id);
      if (prev && prev.name.length >= name.length) continue;
      out.set(id, { id, name: name || id, url: "https://www.facebook.com/groups/" + id + "/" });
    }
    return [...out.values()];
  }

  self.FBQ = { UI_TEXT, words, escapeRe, anyRe, exactRe, groupIdFromHref, nameFromAnchor, findSuggestedHeading, collectGroups };
})();

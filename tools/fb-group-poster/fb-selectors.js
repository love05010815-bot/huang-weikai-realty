/**
 * Facebook 介面文字（中英文都試）。Facebook 常改版，改版後只要調整這裡的字串。
 * 掛在 self.FBQ 給 content.js 用。
 */
(() => {
  const UI_TEXT = {
    "zh-TW": {
      composerTrigger: ["寫些什麼", "撰寫貼文", "在這個社團發佈", "建立公開貼文", "發佈貼文", "分享你的想法"],
      photoButton: ["相片/影片", "相片／影片", "新增相片/影片", "相片或影片"],
      postButton: ["發佈", "張貼"],
      pendingApproval: ["等待管理員審核", "待審核", "等待審核", "正在審核"],
      blocked: ["暫時被封鎖", "暫時無法", "無法發佈", "違反社群守則", "請稍後再試"],
      discard: ["捨棄貼文", "捨棄", "離開"],
      switchProfile: ["選擇你要用來發佈的身分", "切換個人檔案", "選擇用來張貼的個人檔案", "以粉絲專頁身分"],
      notAvailable: ["此內容目前無法顯示", "這個頁面無法使用", "此內容不存在"],
      joinGroup: ["加入社團"],
      close: ["關閉"],
    },
    en: {
      composerTrigger: ["Write something", "Create a public post", "Create post", "What's on your mind"],
      photoButton: ["Photo/video", "Photo/Video", "Add photos/videos", "Photos/videos"],
      postButton: ["Post"],
      pendingApproval: ["pending approval", "pending review", "awaiting approval"],
      blocked: ["temporarily blocked", "couldn't post", "Community Standards", "restricted", "try again later"],
      discard: ["Discard post", "Discard", "Leave"],
      switchProfile: ["Select who to post as", "Switch profile", "Choose who to post as"],
      notAvailable: ["This content isn't available", "Page not found", "isn't available right now"],
      joinGroup: ["Join group", "Join Group"],
      close: ["Close"],
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

  self.FBQ = { UI_TEXT, words, escapeRe, anyRe, exactRe };
})();

// 從資料夾雙擊 app.html 打開（file://）沒有 chrome.runtime，整頁不會動 —— 先把「怎麼正確打開」那一段顯示出來。
(function () {
  var ok = typeof chrome !== "undefined" && chrome.runtime && typeof chrome.runtime.getManifest === "function";
  if (ok) return;
  var w = document.getElementById("file-warn");
  if (w) w.hidden = false;
})();

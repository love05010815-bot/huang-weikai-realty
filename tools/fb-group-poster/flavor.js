/**
 * 這一份外掛是誰的：
 *   colleague=false → 黃瑋凱自己那份（repo 的 tools/fb-group-poster）：工具列圖示開後台 /admin/fb，畫面在後台。
 *   colleague=true  → 同事版（build-colleague.mjs 打包時會改寫這個檔）：圖示開外掛自己的 app.html，貼授權碼才能用。
 * 背景程式 importScripts 這個檔；只有這一個旗標，別放別的東西。
 */
self.FBQ_FLAVOR = { colleague: false };

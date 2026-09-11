// 把外掛資料夾當靜態網站，給 Browser pane 預覽 app.html（chrome.* 不存在時 app.js 走預覽模式：設定存 localStorage、不能上架）。
// 回應帶跟 MV3 外掛頁一樣的 CSP（script-src self），inline script／importmap 在這裡也會被擋，看到的行為跟真外掛一致。
// 用法：node scripts/preview-post591-ext.mjs → http://localhost:8591/app.html（.claude/launch.json 有一組 post591-ext-preview）
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "tools", "post591-extension");
const PORT = Number(process.env.PORT || 8591);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".md": "text/plain; charset=utf-8" };

http
  .createServer((req, res) => {
    const p = decodeURIComponent((req.url || "/").split("?")[0]);
    const file = path.join(ROOT, p === "/" ? "app.html" : p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end("not found");
    }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream", "cache-control": "no-store", "content-security-policy": "script-src 'self'; object-src 'self'" });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, () => console.log(`post591-ext preview on http://localhost:${PORT}/app.html`));

/**
 * 打包同事版「FB 社團廣告助手」：npm run build:fb-ext
 *
 *   ① esbuild 把 app/app-main.tsx（＝後台 /admin/fb 的 React 畫面 ＋ 授權碼卡片）連 React 一起編成 app.js／app.css
 *   ② 組出 D:\Agent-os\FB社團廣告助手_v<版本>\（manifest.json 在最外層，chrome://extensions 直接載入這個資料夾）
 *      同事版的 flavor.js 寫成 colleague=true、manifest 拿掉後台那條 content script（同事進不了後台，不用注入）
 *   ③ 🔴 掃一次有沒有黃瑋凱的個資殘留（電話、LINE、經紀人證號、他的網址）—— 有就直接失敗，不出 zip
 *   ④ 壓成 D:\Agent-os\FB社團廣告助手_v<版本>.zip；手冊另存 FB社團廣告助手_同事手冊_v<版本>.html（跟 591 同一套命名）
 *
 * 他自己那份（repo 的 tools/fb-group-poster）不受影響：flavor.js 是 colleague=false，圖示照舊開後台。
 * app.js／app.css 是產物、不進 git（.gitignore）。
 */
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const manifest = JSON.parse(fs.readFileSync(path.join(here, "manifest.json"), "utf8"));
const version = manifest.version;
const outRoot = process.env.FBQ_OUT_ROOT || "D:/Agent-os";
const outDir = path.join(outRoot, `FB社團廣告助手_v${version}`);
const zipPath = path.join(outRoot, `FB社團廣告助手_v${version}.zip`);
const handbookOut = path.join(outRoot, `FB社團廣告助手_同事手冊_v${version}.html`);

// ① 編 app.js／app.css
await build({
  entryPoints: [path.join(here, "app", "app-main.tsx")],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["chrome110"],
  platform: "browser",
  jsx: "automatic",
  outfile: path.join(here, "app.js"),
  tsconfig: path.join(root, "tsconfig.json"),
  define: { "process.env.NODE_ENV": '"production"' },
  legalComments: "none",
  logLevel: "warning",
});
if (!fs.existsSync(path.join(here, "app.css"))) throw new Error("esbuild 沒有產生 app.css（fb.module.css 沒被 import 到？）");

// ② 組資料夾
const FILES = ["manifest.json", "background.js", "bridge.js", "net-probe.js", "content.js", "fb-selectors.js", "panel.css", "license.js", "app.html", "app-guard.js", "app.css", "app.js", "README_同事版.md"];
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
for (const f of FILES) {
  const src = path.join(here, f);
  if (!fs.existsSync(src)) throw new Error(`少了 ${f}`);
  fs.copyFileSync(src, path.join(outDir, f));
}
// 同事版口味
fs.writeFileSync(path.join(outDir, "flavor.js"), "// 同事版（build-colleague.mjs 產生）：工具列圖示開外掛自己的 app.html，貼授權碼才能用\nself.FBQ_FLAVOR = { colleague: true };\n");
// manifest：拿掉後台那條 content script、標題改成同事版的、塞固定的 key
// 🔴 固定外掛編號（2026-10-13 他說「跟 591 一樣：同事不用覆蓋、直接下載檔案就能用、不影響電腦的綁定」）：
//    Chrome 給未封裝外掛的編號本來是看資料夾路徑算的，manifest 有 "key"（公鑰）就改成看 key 算 → 同事把新版解到任何資料夾
//    「載入未封裝項目」都是同一個外掛，chrome.storage（授權碼、安裝編號）與 IndexedDB（設定、社團、文案）原封不動。
//    公鑰在 colleague-key.json（進 repo 沒關係），私鑰在 D:\Agent-os\secrets\（不進 repo，只有以後上 Web Store 保同編號才用）。
//    只塞進同事包、不放 repo 的 manifest：他自己那份是直接從 repo 資料夾載入的，加了 key 會換編號、要移除重載一次。
const ck = JSON.parse(fs.readFileSync(path.join(here, "colleague-key.json"), "utf8"));
const idOf = (b64) =>
  crypto
    .createHash("sha256")
    .update(Buffer.from(b64, "base64"))
    .digest("hex")
    .slice(0, 32)
    .replace(/[0-9a-f]/g, (c) => String.fromCharCode(97 + parseInt(c, 16)));
if (!ck.key || idOf(ck.key) !== ck.extensionId) throw new Error("colleague-key.json 的 key 跟 extensionId 對不上（別手改那個檔）");
if (manifest.key) throw new Error("repo 的 manifest.json 不該有 key（他自己那份會換編號）：拿掉它，key 只放 colleague-key.json");
const { manifest_version, name, version: ver, ...rest } = manifest;
const m = { manifest_version, name, version: ver, key: ck.key, ...JSON.parse(JSON.stringify(rest)) };
m.content_scripts = (m.content_scripts || []).filter((cs) => !(cs.matches || []).some((u) => /weikaihouse|vercel\.app|localhost/.test(u)));
m.action = { default_title: "FB 社團廣告助手：點我打開" };
fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(m, null, 2) + "\n");

// ③ 個資掃描：這些字一個都不准出現在同事拿到的檔案裡
const FORBIDDEN = [/0909[-\s]?787[-\s]?865/, /@a8865/, /嚴意情/, /00887/, /wei\.kai\.dream/, /swujnuty0325/, /108472157721504/, /broker1019/, /vip\.rakuya\.com\.tw\/0909/];
const hits = [];
// esbuild 預設 charset=ascii，app.js 裡的中文會寫成 \uXXXX（「嚴意情」會變 嚴意情），掃之前先還原，不然中文那幾條形同沒掃
const unescapeJs = (s) => s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
for (const f of fs.readdirSync(outDir)) {
  const text = unescapeJs(fs.readFileSync(path.join(outDir, f), "utf8"));
  for (const re of FORBIDDEN) if (re.test(text)) hits.push(`${f}: ${re}`);
}
if (hits.length) {
  fs.rmSync(outDir, { recursive: true, force: true });
  throw new Error("🔴 同事版裡有個資殘留，已把資料夾刪掉，不出 zip：\n  " + hits.join("\n  "));
}

// ④ zip（PowerShell 的 .NET ZipFile：中文檔名會用 UTF-8 存，跟 591 那個 zip 一樣）
fs.rmSync(zipPath, { force: true });
execFileSync(
  "powershell",
  ["-NoProfile", "-Command", `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('${outDir.replace(/\//g, "\\")}', '${zipPath.replace(/\//g, "\\")}', 'Optimal', $false)`],
  { stdio: "inherit" },
);
// 手冊
const handbookSrc = path.join(here, "手冊_同事版.html");
if (fs.existsSync(handbookSrc)) fs.writeFileSync(handbookOut, fs.readFileSync(handbookSrc, "utf8").replaceAll("{{VERSION}}", version));

const size = (p) => `${(fs.statSync(p).size / 1024).toFixed(0)} KB`;
console.log(`✅ 同事版 v${version}（外掛編號固定 ${ck.extensionId}）`);
console.log(`   資料夾  ${outDir}`);
console.log(`   zip     ${zipPath}（${size(zipPath)}）`);
if (fs.existsSync(handbookOut)) console.log(`   手冊    ${handbookOut}`);
console.log(`   app.js  ${size(path.join(outDir, "app.js"))}、app.css ${size(path.join(outDir, "app.css"))}`);

/**
 * 同事版外掛的「去個人化」後處理 —— tsc 編完 lib/ 之後跑（npm run build:post591-ext 會自動接著跑）。
 *
 * 為什麼：辨識與對應規則跟官網後台共用同一套 TypeScript，但 src/config/post591-template.ts 裡是黃瑋凱本人的
 * 固定文案（電話、LINE、口號、經紀人證號），他 2026-09-05 拍板：**給同事的 zip 只留愛屋型錄的資訊，不帶他的固定特色。**
 * 所以這裡把編出來的 lib/config/post591-template.js 重寫成 DESC_TAIL = ""（版型頭與預設值照舊），
 * 並把 lib/ 裡殘留的他的名字換掉（buildRows／buildPayload 的聯絡人退路值 —— 外掛頁一律用使用者自己填的姓名蓋過，
 * 這個退路值本來就用不到，但不該留在同事拿到的檔案裡）。
 *
 * 後台（weikaihouse.com）不受影響：它直接 import TS，不用這份 lib/。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.join(here, "lib");
const tplPath = path.join(lib, "config", "post591-template.js");

const tpl = await import(`file://${tplPath.replace(/\\/g, "/")}`);
const out = [
  "// 同事版：由 strip-template.mjs 產生。版型尾段留空 —— 文案只有「☆主推特色介紹:」＋型錄的 ✨ 特色行，",
  "// 每個人想固定接的一段（電話、LINE、店名）在外掛頁「⚙ 我的資料」自己填。",
  `export const DESC_HEAD = ${JSON.stringify(tpl.DESC_HEAD)};`,
  `export const DESC_TAIL = "";`,
  `export const POST591_DEFAULTS = ${JSON.stringify(tpl.POST591_DEFAULTS)};`,
  "",
].join("\n");
fs.writeFileSync(tplPath, out, "utf8");

const PERSONAL = [
  ["591 名片預設會帶「黃先生」，要改", "用你在「⚙ 我的資料」填的姓名"],
  ["黃瑋凱", ""],
];
let touched = 0;
for (const f of fs.readdirSync(path.join(lib, "lib"))) {
  const p = path.join(lib, "lib", f);
  let s = fs.readFileSync(p, "utf8");
  const before = s;
  for (const [from, to] of PERSONAL) s = s.split(from).join(to);
  if (s !== before) {
    fs.writeFileSync(p, s, "utf8");
    touched++;
  }
}
console.log(`strip-template: DESC_TAIL 清空、${touched} 個檔案移除個人名字`);

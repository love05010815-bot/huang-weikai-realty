/**
 * 讓 `node --experimental-strip-types` 認得專案的 `@/*` 別名（= src/*）。
 * Next.js 是靠 tsconfig 的 paths 解析的，node 不讀 tsconfig，所以自己補一個。
 * ⚠️ 只給 scripts/ 底下的臨時檢查腳本用，正式程式碼不經過這裡。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const EXTS = ["", ".ts", ".tsx", ".mjs", ".js", "/index.ts", "/index.tsx"];

/** 依序試各種副檔名，回第一個真的存在的檔 */
function firstExisting(base) {
  for (const ext of EXTS) {
    const p = base + ext;
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

export function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const base = path.join(SRC, specifier.slice(2));
    const hit = firstExisting(base);
    if (hit) return next(pathToFileURL(hit).href, context);
    throw new Error(`別名解析不到：${specifier}（找過 ${base}{${EXTS.join(",")}}）`);
  }

  // TypeScript 的相對 import 不寫副檔名（`./agents`），node 只認完整檔名。
  // 原樣找得到就不要多事，找不到才補副檔名試一次 ——
  // 少了這段，一支模組只要 import 過隔壁的兄弟檔，檢查腳本就整個載不起來。
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const parent = context.parentURL;
    if (parent?.startsWith("file:")) {
      const base = path.resolve(path.dirname(fileURLToPath(parent)), specifier);
      if (!fs.existsSync(base)) {
        const hit = firstExisting(base);
        if (hit) return next(pathToFileURL(hit).href, context);
      }
    }
  }

  return next(specifier, context);
}

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

export function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const base = path.join(SRC, specifier.slice(2));
    for (const ext of EXTS) {
      const p = base + ext;
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        return next(pathToFileURL(p).href, context);
      }
    }
    throw new Error(`別名解析不到：${specifier}（找過 ${base}{${EXTS.join(",")}}）`);
  }
  return next(specifier, context);
}

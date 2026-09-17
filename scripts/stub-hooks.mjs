/**
 * 檢查腳本用的模組替身：把幾支「一 import 就會拖進資料庫或不支援的語法」的模組換掉。
 *
 * 目前只有一條：`@/lib/google-calendar` → fixtures/config-store-stub.mjs
 * （原因寫在那個 stub 的檔頭）。
 *
 * ⚠️ 要跟 alias-hooks.mjs 一起註冊，而且**這支要後註冊** ——
 *    Node 的 hook 是後註冊的先跑，這支攔不到的才交給 alias-hooks 解 `@/` 別名。
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const STUBS = {
  "@/lib/google-calendar": path.join(HERE, "fixtures", "config-store-stub.mjs"),
};

export function resolve(specifier, context, next) {
  const stub = STUBS[specifier];
  if (stub) return next(pathToFileURL(stub).href, context);
  return next(specifier, context);
}

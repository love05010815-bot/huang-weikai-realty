/**
 * `@/lib/google-calendar` 的替身，只給 scripts/ 底下的檢查腳本用。
 *
 * 為什麼需要它：那支檔案用了 TypeScript 的「建構子參數屬性」
 * （`constructor(readonly reason: …)`），**`node --experimental-strip-types` 不支援**，
 * 一 import 就整個腳本掛掉。而 lib/threads.ts 只跟它借 getConfig／setConfig 兩支
 * 讀寫設定的函式，測純函式時本來也不該碰到真的資料庫。
 *
 * ⚠️ 用記憶體的 Map，跑完就沒了。真的要驗資料庫行為不能靠這支。
 */
const store = new Map();

export async function getConfig(k) {
  return store.has(k) ? store.get(k) : null;
}

export async function setConfig(k, v) {
  if (v === null || v === undefined) store.delete(k);
  else store.set(k, String(v));
}

/** 測試要自己塞初始值時用 */
export function __seed(entries) {
  for (const [k, v] of Object.entries(entries)) store.set(k, v);
}

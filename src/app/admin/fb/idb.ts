/**
 * /admin/fb 的本機儲存 —— 用瀏覽器的 IndexedDB，存廣告（含圖片）、社團清單、設定、發佈紀錄。
 *
 * 為什麼不進資料庫：跟「廣告刊登助手」一樣，這些是他自己的行銷素材與公開社團網址，
 * 只在他自己這台電腦操作（外掛也裝在這台），沒必要上雲、也不想讓廣告圖佔 Vercel Blob。
 * IndexedDB 的容量夠放幾組廣告的圖片（localStorage 的 5MB 放不下）。
 *
 * 就是一個 key→value 表：ads / groups / settings / history 各一筆。
 */
const DB_NAME = "fbq";
const STORE = "kv";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGet<T>(key: string, fallback: T): Promise<T> {
  try {
    const db = await open();
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result === undefined ? fallback : (req.result as T));
      req.onerror = () => reject(req.error);
    });
  } catch {
    return fallback;
  }
}

export async function idbSet<T>(key: string, value: T): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

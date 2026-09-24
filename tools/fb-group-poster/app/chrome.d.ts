/**
 * Chrome 擴充套件 API 的型別 —— 只宣告這個面板真的用到的那幾個。
 *
 * 🔴 為什麼需要這個檔：`app-main.tsx` 是 tools/ 底下唯一的 TypeScript 檔，
 *    而根目錄的 tsconfig 會把專案裡每一個 .ts／.tsx 都收進來檢查。
 *    少了這份宣告，`npx next build` 會停在「Cannot find name 'chrome'」——
 *    **不是外掛壞掉，是整個網站部署不出去**（2026-09-24 真的擋住過一次上線）。
 *
 * 刻意不裝 @types/chrome：那包很大，而這裡只用到下面這幾個。
 * 用到新的 API 就往下加一行，**不要改成 `any`** —— 改成 any 之後
 * `o[KEY_STORE]` 那種存取就再也沒人幫你檢查了。
 */
declare namespace chrome {
  namespace runtime {
    /** 上一次呼叫出錯時才有值；背景程式沒載入時就是靠它發現的 */
    const lastError: { message?: string } | undefined;
    function sendMessage<T = unknown>(message: unknown, callback: (response: T) => void): void;
    function getManifest(): { version: string; [key: string]: unknown };
  }
  namespace storage {
    const local: {
      get(keys: string | string[]): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
    };
  }
}

/**
 * 同事版外掛的頁面（app.html）—— 把後台 /admin/fb 那一頁的操作介面（FbGroupManager）整包搬進外掛裡，
 * 外面包一張「授權碼」卡片。esbuild 會把這支連 React 一起編成 app.js（build-colleague.mjs）。
 *
 * 跟後台那頁的差別只有這幾件事，全部用 props 傳：
 *   - defaultTail=""：同事的固定尾段自己填（他的電話／證號不在這份檔案裡）
 *   - licensed／licenseHint：授權碼沒過就不給發佈、抓社團、帶入
 *   - importApi：「從愛屋帶入」打 weikaihouse.com/api/fb-ext/*，帶授權碼而不是 Google 登入
 * 外掛頁 ↔ 背景程式的溝通照舊走 bridge.js（它在這一頁當一般 script 載入，chrome.runtime 都有）。
 */
import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { COMPARE_THEME } from "@/app/admin/compare/theme";
import FbGroupManager, { type FbImportApi } from "@/app/admin/fb/FbGroupManager";
import styles from "@/app/admin/fb/fb.module.css";
import "./app-shell.css";

const API_BASE = "https://weikaihouse.com";
const KEY_STORE = "fbq:licenseKey";
const INSTALL_STORE = "fbq:installId";

type Lic = { ok: boolean; reason?: string; name?: string; expiresText?: string; offline?: boolean; cached?: boolean; message?: string };
type LicReply = { ok: boolean; license?: Lic; message?: string; error?: string };

function send<T>(msg: Record<string, unknown>): Promise<T> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(msg, (r: T) => {
        const err = chrome.runtime.lastError;
        resolve(err ? ({ ok: false, error: err.message } as T) : r);
      });
    } catch (e) {
      resolve({ ok: false, error: String(e instanceof Error ? e.message : e) } as T);
    }
  });
}

/** 打後台的同事版 API：每一筆都帶授權碼＋這台 Chrome 的安裝編號，伺服器那邊驗 */
async function postExt<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const o = await chrome.storage.local.get([KEY_STORE, INSTALL_STORE]);
  const res = await fetch(API_BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, key: o[KEY_STORE] || "", installId: o[INSTALL_STORE] || "", version: chrome.runtime.getManifest().version }),
    credentials: "omit",
  });
  return (await res.json()) as T;
}

const extApi: FbImportApi = {
  houseol: (input) => postExt("/api/fb-ext/houseol", { input }),
  photo: (url) => postExt("/api/fb-ext/houseol-photo", { url }),
};

function App() {
  const [lic, setLic] = useState<Lic | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  const apply = (r: LicReply) =>
    setLic(r.ok && r.license ? { ...r.license, message: r.message } : { ok: false, reason: "offline", message: r.error || "外掛背景程式沒回應，到 chrome://extensions 按 ↻ 重新載入" });

  const refresh = useCallback(async () => apply(await send<LicReply>({ type: "fbq:license-check" })), []);

  useEffect(() => {
    chrome.storage.local.get(KEY_STORE).then((o) => setKey(String(o[KEY_STORE] || "")));
    refresh();
  }, [refresh]);

  async function save() {
    setBusy(true);
    apply(await send<LicReply>({ type: "fbq:license-set", key: key.trim().toUpperCase() }));
    setBusy(false);
  }

  const licensed = !!lic?.ok;
  const status = !lic
    ? "檢查授權中…"
    : lic.ok
      ? `✅ 授權有效：${lic.name || ""}，到 ${lic.expiresText || "？"} 為止${lic.offline ? "（暫時連不上伺服器，先用上次的驗證結果）" : ""}`
      : `🔒 ${lic.message || "還沒有有效的授權碼"}`;

  return (
    <div className={`shell ${styles.page}`} style={COMPARE_THEME}>
      <header className="shell-head">
        <h1>FB 社團廣告助手</h1>
        <p>
          寫一版廣告、勾好要發的 Facebook 社團，外掛用你登入的<b>粉專身分</b>逐一打開社團、填好文案和圖片。
          <b>「發佈」永遠是你自己按</b>，按完再點面板的「下一個社團」。內容只存在這台電腦、不會上傳。
        </p>
      </header>

      <section className="lic">
        <label htmlFor="lic-key">授權碼（黃瑋凱給的，這批同事共用一組；只給店內同事用、不要轉傳。沒有有效授權碼，發佈、抓社團、帶入都不會動）</label>
        <div className="lic-row">
          <input
            id="lic-key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              }
            }}
            placeholder="例：WK-ABCD-EFGH-JKLM"
            spellCheck={false}
            autoComplete="off"
          />
          <button type="button" onClick={save} disabled={busy}>
            {busy ? "驗證中…" : "儲存並驗證"}
          </button>
        </div>
        <p className={`lic-msg ${licensed ? "lic-ok" : "lic-bad"}`}>{status}</p>
        <p className="lic-hint">期限寫在黃瑋凱給你的授權訊息裡；到期或換電腦不用重裝，找他處理後按一次「儲存並驗證」就恢復。</p>
      </section>

      <FbGroupManager mode="extension" defaultTail="" licensed={licensed} licenseHint={lic?.message || "先在最上面貼授權碼、按「儲存並驗證」"} importApi={extApi} />
    </div>
  );
}

const rootEl = document.getElementById("root");
if (rootEl) createRoot(rootEl).render(<App />);

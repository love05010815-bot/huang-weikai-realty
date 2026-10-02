/**
 * 🔗 建案地圖物件的「連結還點得開嗎」檢查
 *
 * ## 為什麼要有這個
 *
 * 2026-10-02 系統擁有者：「建案地圖若有客戶點不開的物件請於後台跳警示下架通知」。
 * `/map` 上每一筆在售物件有一顆「物件資訊」按鈕，連到愛屋的電子型錄。
 * 物件成交或被收回之後那一頁就變成「案件不存在或已下架。」，但**後台這邊不會知道** ——
 * 客戶點進去撲空，他要等有人跟他講才發現。
 *
 * 寫下來那天實測 90 筆：**88 筆標著「上架中」，其中 3 筆已經是死的**。
 *
 * ## 🔴 判定規則（實測來的，不是猜的）
 *
 * **愛屋的「已下架」頁回的是 HTTP 200，不是 404。** 只看狀態碼一筆都抓不到 ——
 * 這正是這個專案一再踩到的「靜默失效」。實測兩種頁面長這樣：
 *
 * | | HTTP | 長度 | 第一行可見文字 |
 * |---|---|---|---|
 * | 還在賣 | 200 | 50,316–56,667 | 案名＋價格（頁內有「物件編號」「委託總價」） |
 * | 已下架 | 200 | 27,457（固定） | **「案件不存在或已下架。」** |
 *
 * 所以 `classifyHouseolPage()` 是**兩面判定**：
 *   ・有「案件不存在或已下架」→ `gone`
 *   ・有型錄該有的欄位（物件編號＋委託總價）→ `live`
 *   ・兩個都不符 → `unknown`，**不是 live**
 *
 * ⚠️ **第三種狀態一定要留著。** 愛屋哪天改版、改字，單面判定會變成「全部都好好的」，
 *    那是最糟的結果（畫面正常、資料全錯、沒有人會發現）。回 `unknown` 至少後台看得到
 *    「N 筆檢查不出來」，有人會去看一眼。長度不拿來判定（同一張頁面長度會隨物件變），
 *    只在 `unknown` 時附在備註裡當線索。
 *
 * ## 🔴 只打愛屋，其他網域一律不碰
 *
 * `linkHref` 的註解寫的是「591、FB 貼文之類」。**591 明文禁止程式自動抓取**
 * （見 `learning_591_no_scraping`，違反每筆求償 3,000 元）—— 所以這裡**白名單**只放
 * houseol.com.tw，其餘網域一律回 `skipped`、連一個請求都不發，後台顯示「這個網域不自動檢查」。
 * 寫下來那天資料庫裡 90 筆全是愛屋、一筆 591 都沒有，但規則先立好，之後他貼 591 也不會出事。
 */

/** 一筆連結檢查的結論 */
export type LinkState =
  /** 頁面還是正常的物件型錄 */
  | "live"
  /** 愛屋明講「案件不存在或已下架」—— 客戶點進去會撲空 */
  | "gone"
  /** 連不上、非 200、或頁面兩種特徵都不符（愛屋可能改版）。**不等於沒事** */
  | "unknown"
  /** 不是白名單內的網域，刻意不發請求 */
  | "skipped";

export type LinkCheck = {
  state: LinkState;
  /** 給後台看的一句話。不要放整頁內容 */
  note: string;
};

/** 自動檢查的白名單。**只有愛屋**，理由見檔頭 */
const ALLOWED_HOST = /(^|\.)houseol\.com\.tw$/i;

/** 愛屋「已下架」頁的招牌字。實測整頁可見文字的第一句就是它 */
const GONE_MARK = "案件不存在或已下架";

/** 還在賣的型錄一定有的欄位標籤（兩個都要有，單一個字太容易誤判） */
const LIVE_MARKS = ["物件編號", "委託總價"] as const;

/**
 * 判斷一頁愛屋 HTML 是什麼狀態。**純函式**，沒有網路、好測。
 *
 * ⚠️ 順序是故意的：**先看「已下架」再看型錄欄位**。愛屋的下架頁仍然套同一個版型，
 *    頁尾選單裡可能帶到型錄的字；先判 live 的話會把死的判成活的。
 */
export function classifyHouseolPage(html: string): LinkCheck {
  const text = String(html ?? "");
  if (!text.trim()) return { state: "unknown", note: "愛屋回了一頁空的" };
  if (text.includes(GONE_MARK)) {
    return { state: "gone", note: "愛屋顯示「案件不存在或已下架」" };
  }
  if (LIVE_MARKS.every((m) => text.includes(m))) {
    return { state: "live", note: "" };
  }
  return {
    state: "unknown",
    note: `這一頁既沒有「${GONE_MARK}」、也沒有型錄欄位（${LIVE_MARKS.join("、")}），長度 ${text.length} —— 愛屋可能改版了，去點一次看看`,
  };
}

/** 這個網址會不會被自動檢查。回 false 的一律不發請求 */
export function isCheckableLink(href: string): boolean {
  try {
    const u = new URL(href);
    return (u.protocol === "https:" || u.protocol === "http:") && ALLOWED_HOST.test(u.hostname);
  } catch {
    return false;
  }
}

const UA = "Mozilla/5.0 (compatible; weikaihouse.com/1.0; +https://weikaihouse.com)";

/**
 * 真的去打一次那個網址。**失敗一律回 `unknown`，不回 `gone`** ——
 * 網路抖一下就叫他下架還在賣的物件，比漏掉一筆死連結糟得多。
 */
export async function checkLink(href: string, timeoutMs = 12000): Promise<LinkCheck> {
  const raw = (href ?? "").trim();
  if (!raw) return { state: "skipped", note: "沒有連結" };
  let host = "";
  try {
    host = new URL(raw).hostname;
  } catch {
    return { state: "unknown", note: "這串不是合法網址" };
  }
  if (!isCheckableLink(raw)) {
    // 🔴 591 就是走這條：不發請求、不抓頁面。理由見檔頭
    return { state: "skipped", note: `${host} 不自動檢查（只自動檢查愛屋 houseol.com.tw）` };
  }

  try {
    const res = await fetch(raw, {
      headers: { "user-agent": UA, accept: "text/html" },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
      redirect: "follow",
    });
    if (!res.ok) {
      // 非 200 也只是「檢查不到」。愛屋的下架頁本來就回 200，所以這裡的非 200 多半是它自己出事
      return { state: "unknown", note: `愛屋回應 ${res.status}` };
    }
    return classifyHouseolPage(await res.text());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      state: "unknown",
      note: /timeout|abort/i.test(msg) ? `愛屋 ${Math.round(timeoutMs / 1000)} 秒沒回應` : `連不上愛屋：${msg.slice(0, 80)}`,
    };
  }
}

/**
 * 一批網址一起檢查。`concurrency` 預設 3 ——
 * 90 筆序列跑約 32 秒，會頂到 serverless 的 60 秒上限；3 條並行約 12 秒，
 * 對愛屋也不算打太兇（它本來就被這個站的物件同步定時打）。
 */
export async function checkLinks(
  items: ReadonlyArray<{ id: string; href: string | null }>,
  opts: { concurrency?: number; timeoutMs?: number } = {},
): Promise<Map<string, LinkCheck>> {
  const concurrency = Math.max(1, Math.min(6, opts.concurrency ?? 3));
  const out = new Map<string, LinkCheck>();
  let i = 0;
  async function worker() {
    for (;;) {
      const k = i++;
      if (k >= items.length) return;
      const it = items[k];
      out.set(it.id, it.href ? await checkLink(it.href, opts.timeoutMs) : { state: "skipped", note: "沒有連結" });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return out;
}

/** 後台橫幅要講的話。`gone` 擺第一，那是真的要他動手的 */
export function summarize(states: ReadonlyArray<LinkState>): {
  gone: number;
  unknown: number;
  live: number;
  skipped: number;
} {
  const n = { gone: 0, unknown: 0, live: 0, skipped: 0 };
  for (const s of states) n[s] += 1;
  return n;
}

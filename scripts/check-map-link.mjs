/**
 * 建案地圖「連結還點得開嗎」的回歸測試。
 *
 *   npm run check:map-link
 *
 * ⚠️ **不連網**。用的是 2026-10-02 從愛屋真的抓下來的兩種頁面特徵（見 fixtures 說明），
 * 愛屋改版之後這支還是會過 —— 它測的是「規則有沒有被改壞」，不是「愛屋今天長怎樣」。
 * 線上到底有幾筆死連結，看後台 /admin/map-listings 的橫幅，或打 /api/map-listings/check。
 */
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
const { classifyHouseolPage, isCheckableLink, summarize } = await import("@/lib/map-listing-check.ts");

let pass = 0;
const fails = [];
function eq(name, got, want) {
  if (got === want) { pass += 1; return; }
  fails.push(`${name}\n      得到 ${JSON.stringify(got)}\n      應為 ${JSON.stringify(want)}`);
}

/* ── 真實特徵（2026-10-02 實測）──
   ・已下架：HTTP 200、長度固定 27457、可見文字第一句就是「案件不存在或已下架。」
   ・還在賣：HTTP 200、長度 50316–56667、頁內有「物件編號」「委託總價」
   下面只留判定會用到的字，整頁 HTML 不進 repo（太大，而且含物件資訊）。 */
const GONE_PAGE = `<html><body><div class="msg">案件不存在或已下架。</div><div>回首頁</div></body></html>`;
const LIVE_PAGE = `<html><body><h1>「某某社區」兩房平車</h1><table><tr><td>物件編號</td><td>AA1234567</td></tr>
  <tr><td>委託總價</td><td>598萬</td></tr><tr><td>登記坪數</td><td>30坪</td></tr></table></body></html>`;

eq("已下架頁 → gone", classifyHouseolPage(GONE_PAGE).state, "gone");
eq("型錄頁 → live", classifyHouseolPage(LIVE_PAGE).state, "live");

/* 🔴 這題是整支測試的重點：下架頁若同時帶到型錄的字，**還是要判 gone**。
   愛屋的下架頁套同一個版型，頁尾選單有可能帶到那些詞；先判 live 就會把死的說成活的。 */
eq(
  "下架頁即使也含型錄欄位 → 仍然 gone",
  classifyHouseolPage(`${GONE_PAGE}<footer>物件編號 委託總價</footer>`).state,
  "gone",
);

/* 兩種特徵都沒有 → unknown，**不可以是 live**。愛屋改版時要看得見 */
eq("改版後的陌生頁 → unknown", classifyHouseolPage(`<html><body>系統維護中</body></html>`).state, "unknown");
eq("空頁 → unknown", classifyHouseolPage("").state, "unknown");
eq("null → unknown", classifyHouseolPage(null).state, "unknown");
eq("只有一半欄位 → unknown", classifyHouseolPage(`<html>物件編號</html>`).state, "unknown");

/* ── 白名單：591 一定要擋掉（禁止程式自動抓取，每筆求償 3,000）── */
eq("愛屋店網 → 檢查", isCheckableLink("https://es.houseol.com.tw/Ecatalog.aspx?No=AA1"), true);
eq("愛屋主站 → 檢查", isCheckableLink("https://www.houseol.com.tw/sell_item/H229-S1/"), true);
eq("🔴 591 → 不檢查", isCheckableLink("https://sale.591.com.tw/home/house/detail/2/123.html"), false);
eq("🔴 591 短網址 → 不檢查", isCheckableLink("https://591.com.tw/abc"), false);
eq("FB → 不檢查", isCheckableLink("https://www.facebook.com/permalink/123"), false);
eq("不是網址 → 不檢查", isCheckableLink("沒有連結"), false);
eq("空字串 → 不檢查", isCheckableLink(""), false);
/* 擋掉「把 houseol 放在別人網域裡」的假網址 */
eq("🔴 houseol.com.tw.evil.com → 不檢查", isCheckableLink("https://houseol.com.tw.evil.com/x"), false);
eq("🔴 路徑裡有 houseol → 不檢查", isCheckableLink("https://evil.com/houseol.com.tw"), false);

/* ── 統計 ── */
const s = summarize(["gone", "gone", "live", "unknown", "skipped", "live"]);
eq("統計 gone", s.gone, 2);
eq("統計 live", s.live, 2);
eq("統計 unknown", s.unknown, 1);
eq("統計 skipped", s.skipped, 1);

if (fails.length) {
  console.error(`🔴 ${fails.length} 項不過（通過 ${pass}）：`);
  fails.forEach((f) => console.error("   ✗ " + f));
  process.exit(1);
}
console.log(`✅ 連結檢查規則 ${pass} 項全過`);

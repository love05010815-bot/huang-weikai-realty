/**
 * 房產新聞抓取的煙霧測試（src/lib/news-fetch.ts）—— 只抓、不進資料庫。
 * 用法：node --experimental-strip-types scripts/check-news-fetch.mjs
 *      加 --live 會真的連網抓一次，看各來源與地區分布。
 * 改到分區規則、房產相關詞、RSS 解析前後都跑一次。
 */
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
const NF = await import("../src/lib/news-fetch.ts");

let pass = true;
const ok = (cond, label, got, want) => {
  if (!cond) pass = false;
  console.log(`${cond ? "  ✅" : "  ❌"} ${String(label).padEnd(34)} ${String(got).padEnd(20)}${cond ? "" : "應為 " + want}`);
};

console.log("=== A 日期 ===");
ok(NF.parseDateToTaipei("Mon,14 Sep 2026 18:13:00 +0800") === "2026-09-14 18:13:00", "ETtoday 少空格也能解", NF.parseDateToTaipei("Mon,14 Sep 2026 18:13:00 +0800"), "2026-09-14 18:13:00");
ok(NF.parseDateToTaipei("Tue, 15 Sep 2026 01:33:00 GMT") === "2026-09-15 09:33:00", "GMT 換成台北", NF.parseDateToTaipei("Tue, 15 Sep 2026 01:33:00 GMT"), "2026-09-15 09:33:00");
ok(NF.parseDateToTaipei("garbage") === null, "壞日期回 null", NF.parseDateToTaipei("garbage"), "null");

console.log("=== B 標題正規化（中文要留著）===");
ok(NF.normalizeTitle("台中海線是「最後窪地」？專家：首購優先！") === "台中海線是最後窪地專家首購優先", "去標點留中文", NF.normalizeTitle("台中海線是「最後窪地」？專家：首購優先！"), "台中海線是最後窪地專家首購優先");

console.log("=== C 分區 ===");
const cls = (title, summary = "", content = null) => NF.classifyRegion({ title, summary, content });
ok(cls("富宇台中龍井新建工程「富宇綻」停工") === "coast", "龍井 → 海線", cls("富宇台中龍井新建工程「富宇綻」停工"), "coast");
ok(cls("大安區均價113萬 北市十大熱銷社區") === "national", "台北大安 → 全台（沒提台中）", cls("大安區均價113萬 北市十大熱銷社區"), "national");
ok(cls("台中清水區新案開賣") === "coast", "清水＋台中 → 海線", cls("台中清水區新案開賣"), "coast");
ok(cls("同在13期價差27萬！區域品牌大戰", "台中") === "central", "台中 → 中部", cls("同在13期價差27萬！區域品牌大戰", "台中"), "central");
ok(cls("房市預售解約潮", "", "…台中沙鹿的建案也出現解約，沙鹿一帶去化放緩…") === "coast", "內文提兩次沙鹿 → 海線", cls("房市預售解約潮", "", "…台中沙鹿的建案也出現解約，沙鹿一帶去化放緩…"), "coast");
ok(cls("房市預售解約潮", "", "…相較之下台中只提一次…") === "national", "內文只提一次台中 → 全台", cls("房市預售解約潮", "", "…相較之下台中只提一次…"), "national");

console.log("=== D 房產相關性 ===");
ok(NF.isHousingNews("【中台灣女力】「海線媳婦」何欣純拚逆轉勝", "") === false, "海線政治新聞 → 不收", NF.isHousingNews("【中台灣女力】「海線媳婦」何欣純拚逆轉勝", ""), "false");
ok(NF.isHousingNews("臺中體育嘉年華920清水登場", "") === false, "清水運動新聞 → 不收", NF.isHousingNews("臺中體育嘉年華920清水登場", ""), "false");
ok(NF.isHousingNews("超級央行週將登場！美日升息機率飆", "") === false, "純央行升息 → 不收", NF.isHousingNews("超級央行週將登場！美日升息機率飆", ""), "false");
ok(NF.isHousingNews("央行理監事會周四登場 6成民眾支持信用管制鬆綁", "") === true, "信用管制 → 收", NF.isHousingNews("央行理監事會周四登場 6成民眾支持信用管制鬆綁", ""), "true");
ok(NF.isHousingNews("中山站赤峰街租金漲5倍 知名店家扛不住出走", "") === true, "租金 → 收", NF.isHousingNews("中山站赤峰街租金漲5倍 知名店家扛不住出走", ""), "true");

console.log("=== E RSS 解析 ===");
const xml = `<rss><channel><item><title><![CDATA[標題 A &amp; B - 富聯網]]></title><link>https://example.com/a</link><pubDate>Mon,14 Sep 2026 18:13:00 +0800</pubDate><description><![CDATA[<p>摘要<b>粗</b></p>]]></description><source url="https://x">富聯網</source></item><item><title>只有 guid</title><guid isPermaLink="true">https://example.com/b</guid></item></channel></rss>`;
const parsed = NF.parseRssItems(xml);
ok(parsed.length === 2, "拆出 2 筆", parsed.length, 2);
ok(parsed[0].title === "標題 A & B - 富聯網", "CDATA＋entity 還原", parsed[0].title, "標題 A & B - 富聯網");
ok(parsed[0].link === "https://example.com/a", "link", parsed[0].link, "https://example.com/a");
ok(parsed[0].source === "富聯網", "source 含屬性", parsed[0].source, "富聯網");
ok(parsed[1].link === "https://example.com/b", "沒 link 用 guid", parsed[1].link, "https://example.com/b");

console.log("=== F 全文擷取 ===");
const html = `<html><head><style>p{}</style><script>x()</script></head><body><nav><p>選單選單選單選單選單選單選單</p></nav><article><p>第一段內文，超過十五個字的一段文字，用來測試。</p><p>短</p><p>第二段內文，同樣超過十五個字，應該被留下來。</p></article></body></html>`;
const text = NF.extractMainText(html);
ok(text.includes("第一段內文") && text.includes("第二段內文") && !text.includes("選單"), "只留 article 的長段落", JSON.stringify(text.slice(0, 30)), "含第一段與第二段、不含選單");

if (process.argv.includes("--live")) {
  console.log("=== G 真的抓一次（不進資料庫）===");
  const { items, counts } = await NF.collectNews((l) => console.log("   ", l));
  ok(items.length > 20, "抓到超過 20 則", items.length, ">20");
  console.log(`   海線 ${counts.coast}、中部 ${counts.central}、全台 ${counts.national}`);
  for (const it of items.filter((i) => i.region === "coast").slice(0, 8)) console.log("    海線 -", it.source, "|", it.title.slice(0, 50));
}

console.log(pass ? "\n全部通過" : "\n有失敗的項目");
process.exit(pass ? 0 : 1);

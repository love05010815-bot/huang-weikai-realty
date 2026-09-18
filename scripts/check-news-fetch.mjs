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
ok(NF.isHousingNews("超級央行週將登場！美日升息機率飆", "") === false, "美日央行週 → 不收", NF.isHousingNews("超級央行週將登場！美日升息機率飆", ""), "false");
ok(NF.isHousingNews("央行理監事會周四登場 6成民眾支持信用管制鬆綁", "") === true, "信用管制 → 收", NF.isHousingNews("央行理監事會周四登場 6成民眾支持信用管制鬆綁", ""), "true");
ok(NF.isHousingNews("中山站赤峰街租金漲5倍 知名店家扛不住出走", "") === true, "租金 → 收", NF.isHousingNews("中山站赤峰街租金漲5倍 知名店家扛不住出走", ""), "true");

// 2026-09-18 他指定「規範要包含房屋貸款、央行、房屋買賣、房市、建案、租金」。
// 央行／升息／利率／貸款是「要有伴」的詞：同篇要提到房地產的字才收，不然股匯市新聞整批灌進來。
const H = (t) => NF.isHousingNews(t, "");
ok(H("房屋貸款利率明年恐再降") === true, "房屋貸款 → 收", H("房屋貸款利率明年恐再降"), "true");
ok(H("房屋買賣移轉棟數創新低") === true, "房屋買賣 → 收", H("房屋買賣移轉棟數創新低"), "true");
ok(H("央行：不動產放款集中度仍偏高") === true, "央行＋不動產 → 收", H("央行：不動產放款集中度仍偏高"), "true");
ok(H("央行今日召開理監事會議 市場關注房貸水位") === true, "央行＋房貸 → 收", H("央行今日召開理監事會議 市場關注房貸水位"), "true");
// ⚠️ 這一條 2026-09-18 下午改了預期值：他第二次指定要收央行之後，
// 「台灣央行但不是房市」的新聞（經濟成長率、黃金代幣）變成刻意收進來，一天約 2 到 4 則。
// 要再收緊就把 `evenIf`／`unless` 拿掉，回到「一定要提到房才收」。
ok(H("央行下修今年經濟成長率至3.05%") === true, "台灣央行但非房市 → 現在收（他指定的）", H("央行下修今年經濟成長率至3.05%"), "true");
ok(H("美國聯準會降息一碼 台股開高走高") === false, "降息＋台股 → 不收", H("美國聯準會降息一碼 台股開高走高"), "false");
ok(H("升息循環結束 首購族購屋信心回升") === true, "升息＋購屋 → 收", H("升息循環結束 首購族購屋信心回升"), "true");
ok(H("利率走揚 租屋族面臨轉嫁壓力") === true, "利率＋租 → 收", H("利率走揚 租屋族面臨轉嫁壓力"), "true");
ok(H("學生貸款申請人數創高") === false, "貸款但跟房無關 → 不收", H("學生貸款申請人數創高"), "false");

// 2026-09-18 第二輪：他再次指定要收央行。台灣央行的照收（那種標題常常一個房字都沒有），
// 外國央行的擋掉 —— 實測無條件收一天多 74 則，幾乎全是日銀與 Fed。
ok(H("台灣央行走自己的路 利率連10凍") === true, "台灣央行利率連10凍 → 收", H("台灣央行走自己的路 利率連10凍"), "true");
ok(H("楊金龍走自己的路 央行宣布政策利率連十凍") === true, "楊金龍＋央行 → 收", H("楊金龍走自己的路 央行宣布政策利率連十凍"), "true");
ok(H("央行理監事會議下週登場") === true, "理監事會 → 收", H("央行理監事會議下週登場"), "true");
ok(H("日本央行宣布升息1碼 利率創31年來新高") === false, "日本央行 → 不收", H("日本央行宣布升息1碼 利率創31年來新高"), "false");
ok(H("美升息1碼…我央行利率連10凍") === true, "拿美國對照但主角是我央行 → 收", H("美升息1碼…我央行利率連10凍"), "true");
ok(H("Fed升息利空出盡？新台幣早盤升破31.8元") === false, "Fed → 不收", H("Fed升息利空出盡？新台幣早盤升破31.8元"), "false");
ok(H("黃金走勢：日央行加息25基點、金價反彈") === false, "日央行（簡寫）→ 不收", H("黃金走勢：日央行加息25基點、金價反彈"), "false");
ok(H("穩懋轉型效益顯現，毛利率攀30%常態化") === false, "毛利率不是利率 → 不收", H("穩懋轉型效益顯現，毛利率攀30%常態化"), "false");

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

console.log("=== G 貼連結：從 HTML 挖標題／來源／時間 ===");
const page = `<html><head>
<meta property="og:title" content="青埔都市發展關鍵拼圖 亞矽創研中心啟動實質招商 | 房市話題 | 房市 | 經濟日報">
<meta content="2026-09-17T17:12:00+08:00" property="article:published_time">
<meta property="og:site_name" content="經濟日報">
<title>不該用到的 title</title></head><body><p>內文</p></body></html>`;
ok(NF.extractTitle(page) === "青埔都市發展關鍵拼圖 亞矽創研中心啟動實質招商", "og:title 優先＋剝掉分類與站名", NF.extractTitle(page), "青埔都市發展關鍵拼圖 亞矽創研中心啟動實質招商");
ok(NF.extractSource(page, "https://money.udn.com/a") === "經濟日報", "og:site_name 當來源", NF.extractSource(page, "https://money.udn.com/a"), "經濟日報");
ok(NF.extractPublishedAt(page) === "2026-09-17 17:12:00", "屬性順序反過來也讀得到時間", NF.extractPublishedAt(page), "2026-09-17 17:12:00");
ok(NF.extractSource("<html></html>", "https://www.watchmedia01.com/x") === "watchmedia01.com", "沒 og 就用網域", NF.extractSource("<html></html>", "https://www.watchmedia01.com/x"), "watchmedia01.com");
ok(NF.extractTitle("<html><head><title>台中10大中古屋熱區 - 觀傳媒</title></head></html>") === "台中10大中古屋熱區", "退回 <title> 也剝站名", NF.extractTitle("<html><head><title>台中10大中古屋熱區 - 觀傳媒</title></head></html>"), "台中10大中古屋熱區");
ok(NF.extractTitle("<html><head><title>房市 | 房價</title></head></html>") === "房市 | 房價", "太短就不剝（免得吃掉真標題）", NF.extractTitle("<html><head><title>房市 | 房價</title></head></html>"), "房市 | 房價");
ok(NF.extractPublishedAt("<html><body><time datetime='2026-09-18T07:54:36+08:00'>今天</time></body></html>") === "2026-09-18 07:54:36", "沒 meta 就看 <time>", NF.extractPublishedAt("<html><body><time datetime='2026-09-18T07:54:36+08:00'>今天</time></body></html>"), "2026-09-18 07:54:36");

console.log("=== H 貼連結：擋下來的情況 ===");
const grabFails = async (url, why) => {
  try {
    await NF.fetchArticleByUrl(url);
    return `沒有擋下來（${why}）`;
  } catch (e) {
    return e;
  }
};
const g1 = await grabFails("https://www.591.com.tw/home/livesearch/rent", "591");
ok(g1 instanceof NF.BlockedHostError, "591 的連結直接擋掉（服務條款禁止自動抓取）", g1?.message?.slice(0, 40), "BlockedHostError");
const g2 = await grabFails("看到一則新聞", "不是網址");
ok(g2 instanceof Error && !(g2 instanceof NF.BlockedHostError) && g2.message.includes("完整的網址"), "不是網址 → 講人話", g2?.message?.slice(0, 20), "請貼完整的網址…");
const g3 = await grabFails("ftp://example.com/a", "協定不對");
ok(g3 instanceof Error && g3.message.includes("完整的網址"), "非 http(s) → 擋掉", g3?.message?.slice(0, 20), "請貼完整的網址…");

if (process.argv.includes("--live")) {
  console.log("=== G 真的抓一次（不進資料庫）===");
  const { items, counts } = await NF.collectNews((l) => console.log("   ", l));
  ok(items.length > 20, "抓到超過 20 則", items.length, ">20");
  console.log(`   海線 ${counts.coast}、中部 ${counts.central}、全台 ${counts.national}`);
  for (const it of items.filter((i) => i.region === "coast").slice(0, 8)) console.log("    海線 -", it.source, "|", it.title.slice(0, 50));
}

console.log(pass ? "\n全部通過" : "\n有失敗的項目");
process.exit(pass ? 0 : 1);

/**
 * 迴歸測試：愛屋公開型錄 → FB 社團廣告草稿（lib/houseol-catalog.ts 的 parseCatalogText ＋ buildAdDraft）。
 * 用法：npm run check:fb-ad
 *
 * ⚠️ 測試 HTML 一律自己編（假社區、假數字、假案號），不要貼真實型錄 —— 這個 repo 是公開的。
 *    版面結構照 2026-09-18 實測的公開型錄：每格是 `<div class="title">標籤</div><p>值</p>`，
 *    環境特色在 `#GoodSpan` 裡，地址在 `.caption`（公開頁沒有門牌號，只到路名）。
 *
 * 🔴 這裡守的底線：**型錄讀不到的欄位不准出現在廣告裡**，要列進 missing 讓他自己補。
 *    廣告是對外的，猜一個數字出去就是不實資訊。
 */
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
const { buildAdDraft, parseCatalogText } = await import("../src/lib/houseol-catalog.ts");
const { houseolHtmlToText } = await import("../src/lib/post591-parser.ts");

let pass = true;
const ok = (cond, label, got, want) => {
  if (!cond) pass = false;
  console.log(`${cond ? "  ✅" : "  ❌"} ${String(label).padEnd(34)} ${String(got).slice(0, 60).padEnd(62)}${cond ? "" : "應為 " + want}`);
};
const eq = (label, got, want) => ok(JSON.stringify(got) === JSON.stringify(want), label, JSON.stringify(got), JSON.stringify(want));

/** 照公開型錄的結構組一頁。fields 給 null ＝ 那一格整個不存在 */
function page(fields, { title = "測試社區稀有兩房平車", addr = "測試區測試路", features = [] } = {}) {
  const cells = Object.entries(fields)
    .filter(([, v]) => v !== null)
    .map(([k, v]) => `<div class="t-td"><div class="title">${k}</div><p>${v}</p></div>`)
    .join("\n");
  const good = features.length
    ? `<div id="GoodDiv"><div id="GoodSpan">${features.map((f) => `<div class='points_m'><strong>${f}</strong></div>`).join(" ")}</div></div>`
    : "";
  return `<html><body><dl><dt>
<header><h3>2026/09/18 印</h3><h3>${title}</h3></header>
<div class="caption">${addr}</div>
${cells}
<div class="t-th mobile">環境特色</div>${good}
<div class="menu"><a id="otherfunc3" href="https://es.houseol.com.tw/EInfos.aspx?type=3&amp;google=24.2,120.5&amp;picstr=https://hq.houseol.com.tw/images/pictures/H229ZZ0000001f.jpg">更多照片</a></div></dt>
<dd><div id="personal_div" class="personal"><h2>經紀人員：測試</h2></div></dd></dl></body></html>`;
}

const 有車位 = {
  委託總價: "768萬",
  登記坪數: "33.81 坪",
  "(含車位面積": "7.4坪)",
  建物面積: "26.41 坪",
  "主&ensp;+附屬": "17.67 坪",
  主建物坪: "16.256 坪",
  附屬建物: "1.418 坪",
  "樓別/樓高": "8 /15",
  "房/廳/衛": "2/ 2/ 1",
  車位型式: "坡道/平面",
  "車位/編號": "公設車位/B3-171",
  "類型/現況": "大樓 /空屋",
  社區: "測試社區",
  竣工日期: "2025/10/2",
  "屋　　齡": "未滿一年",
  鄰近學校: "市立測試國小",
  物件編號: "ZZ0000001",
};

console.log("A. 有車位的新成屋（屋齡是「未滿一年」不是數字）");
{
  const html = page(有車位, { features: ["✨測試社區，一層四戶雙梯。", "✨近測試國小。"] });
  const l = parseCatalogText(houseolHtmlToText(html), html);
  eq("案號／標題／路名", [l.caseId, l.title, l.address], ["ZZ0000001", "測試社區稀有兩房平車", "測試區測試路"]);
  eq("開價（萬）", l.price, 768);
  eq("登記坪數", l.ping, 33.81);
  eq("主+附屬", l.mainPlusAux, 17.67);
  eq("格局", [l.rooms, l.halls, l.baths], [2, 2, 1]);
  eq("樓別/樓高", l.floor, "8/15");
  eq("屋齡原文（新成屋沒有數字）", [l.ageText, l.age], ["未滿一年", null]);
  eq("車位：有、型式讀得到、算問過", [l.hasParking, l.parkingType, l.parkingKnown], [true, "坡道/平面", true]);

  const d = buildAdDraft(l);
  eq("草稿標題＝型錄案名", d.title, "測試社區稀有兩房平車");
  eq("沒有缺的欄位", d.missing, []);
  eq(
    "草稿全文（欄位與順序照他指定的）",
    d.text,
    [
      "【測試社區稀有兩房平車】",
      "",
      "💰 開價 768 萬",
      "📍 測試區測試路",
      "🏠 2房2廳1衛",
      "📐 登記 33.81 坪（主＋附屬 17.67 坪）",
      "🏢 8樓／共 15 樓",
      "🗓 屋齡 未滿一年",
      "🚗 車位：坡道/平面",
      "",
      "✨ 環境特色",
      "・測試社區，一層四戶雙梯。",
      "・近測試國小。",
    ].join("\n"),
  );
}

console.log("B. 沒有車位（型錄有講「0 坪／空的」）→ 可以寫「無車位」");
{
  const 無車位 = { ...有車位 };
  delete 無車位.車位型式;
  delete 無車位["車位/編號"];
  無車位["(含車位面積"] = "0坪)";
  無車位.公設車位 = "0 坪";
  無車位.產權車位 = "";
  無車位["屋　　齡"] = "3.4 年";
  const html = page(無車位, { features: [] });
  const l = parseCatalogText(houseolHtmlToText(html), html);
  eq("車位：沒有、但問過了", [l.hasParking, l.parkingType, l.parkingKnown], [false, "", true]);
  eq("屋齡是數字時原文照留", [l.ageText, l.age], ["3.4 年", 3.4]);
  const d = buildAdDraft(l);
  ok(d.text.includes("🚗 無車位"), "寫得出「無車位」", "有", "有");
  ok(d.text.includes("🗓 屋齡 3.4 年") && !d.text.includes("3.4 年 年"), "屋齡用原文、不會多一個「年」", "ok", "ok");
  ok(d.text.includes("✨ 生活機能") && d.text.includes("・學校：市立測試國小"), "沒有環境特色時退回生活機能", "ok", "ok");
  eq("缺的欄位：無（生活機能補上了）", d.missing, []);
}

console.log("C. 型錄根本沒提車位 → 不准自己寫「無車位」");
{
  const 沒提 = { ...有車位 };
  delete 沒提.車位型式;
  delete 沒提["車位/編號"];
  delete 沒提["(含車位面積"];
  const html = page(沒提);
  const l = parseCatalogText(houseolHtmlToText(html), html);
  eq("沒問過就是沒問過", [l.hasParking, l.parkingKnown], [false, false]);
  const d = buildAdDraft(l);
  ok(!d.text.includes("無車位"), "沒有「無車位」這一行", d.text.includes("無車位") ? "寫了" : "沒寫", "沒寫");
  ok(d.missing.includes("車位"), "車位列進要自己補的", d.missing.join("、"), "含車位");
}

console.log("D. 型錄殘缺 → 缺的欄位不寫進廣告，全部列出來讓他補");
{
  const 殘缺 = { 委託總價: "", "房/廳/衛": "", 物件編號: "ZZ0000002", "屋　　齡": "" };
  const html = page(殘缺, { title: "測試透天", addr: "測試區測試二路", features: [] });
  const l = parseCatalogText(houseolHtmlToText(html), html);
  const d = buildAdDraft(l);
  eq("缺的欄位全都列出來", d.missing.sort(), ["主+附屬", "屋齡", "格局", "樓別/樓高", "登記坪數", "環境特色", "車位", "開價"].sort());
  eq("只有讀得到的那兩行，一個數字都不猜", d.text, "【測試透天】\n\n📍 測試區測試二路");
}

console.log("E. 愛屋改版把抬頭讀壞時，標題／路名不可以變成欄位標籤");
{
  // 型錄的標題與地址是「照位置讀」的（第 2、3 行）。抬頭一改版，這兩行就會滑成後面的欄位標籤，
  // 照發出去會變成【委託總價】📍登記坪數 —— 這一關就是守這個。
  // 抬頭的兩行沒了 → 整批往上滑一格：標題變成第一個欄位標籤、路名變成那個標籤的值
  const 壞掉的文字 = ["不動產電子型錄", "委託總價", "768萬", "登記坪數", "33.81 坪", "社區", "測試社區", "物件編號", "ZZ0000003"].join("\n");
  const l = parseCatalogText(壞掉的文字);
  eq("（前提）標題滑成標籤、路名滑成價格", [l.title, l.address], ["委託總價", "768萬"]);
  const d = buildAdDraft(l);
  ok(!/【委託總價】|📍 768萬/.test(d.text), "草稿不會把標籤當標題、也不會把價格當地址", JSON.stringify(d.text), "都擋掉");
  ok(d.missing.includes("標題") && d.missing.includes("路名"), "兩個都列進要自己補的", d.missing.join("、"), "含標題與路名");
  eq("標題欄退回社區名", d.title, "測試社區");
  ok(d.text.includes("💰 開價 768 萬"), "讀得到的欄位照常帶入", "ok", "ok");
}

console.log("F. 讀不到案號就不回物件（不要回一個空殼）");
eq("沒有物件編號 → null", parseCatalogText("不動產電子型錄\n標題\n地址\n"), null);

console.log(pass ? "\n全部通過 ✅" : "\n有失敗 ❌");
process.exit(pass ? 0 : 1);

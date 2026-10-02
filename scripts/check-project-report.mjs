/**
 * 迴歸測試：社區銷售報告書 —— ChatGPT 回覆的解析（lib/project-report.ts）＋ 指令（config/report-prompt.ts）。
 * 用法：npm run check:report
 *
 * ⚠️ 測試文字一律自己編（假社區、假數字），不要貼真實 ChatGPT 回覆 —— 這個 repo 是公開的。
 */
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
const {
  BASIC_FIELDS,
  LOCATION_LABELS,
  LVR_DISTRICT_BY_AREA,
  competitorRows,
  extractJsonBlock,
  findPriceMentions,
  lvrHrefFor,
  matchProjectByName,
  mergeBasics,
  normalizeProjectName,
  parseJsonLoose,
  parseReportPaste,
  stampLabel,
} = await import("../src/lib/project-report.ts");
const { buildReportPrompt, reportSkeleton } = await import("../src/config/report-prompt.ts");
const { AREA_LABEL, PROJECTS } = await import("../src/data/port-projects.ts");
const { LVR_DISTRICTS } = await import("../src/lib/lvr-parse.ts");

let pass = true;
const ok = (cond, label, got, want) => {
  if (!cond) pass = false;
  console.log(`${cond ? "  ✅" : "  ❌"} ${String(label).padEnd(30)} ${String(got).slice(0, 60).padEnd(24)}${cond ? "" : "應為 " + want}`);
};
const eq = (label, got, want) => ok(JSON.stringify(got) === JSON.stringify(want), label, JSON.stringify(got), JSON.stringify(want));

/** 一份完整、合格的回覆（假資料） */
const GOOD = {
  tagline: "戶戶邊間雙面採光，測試區交界的中型社區",
  basics: {
    builder: "測試建設（登記名稱：測試建設股份有限公司）",
    team: "測試建築師事務所｜測試室內設計",
    location: "台中市測試區測試路二段",
    siteArea: "約 1,200 坪",
    units: "約 188 戶（含店面 6 戶）",
    floors: "地上 14 樓、地下 2 樓",
    completion: "2023 年",
    layouts: "2 房 23–26 坪、3 房 33–34 坪",
    publicRatio: "待確認",
    parking: "坡道平面車位約 150 個",
    management: "管理費約 80 元／坪，24 小時警衛",
    structure: "RC 結構、二丁掛外牆",
  },
  positioning: { title: "交界處的中型社區", body: "測試建設在這一帶陸續推出多個案子，是在地熟面孔。".repeat(2) },
  locationValues: [
    { label: "生活機能", body: "步行約 1 分鐘到便利商店，步行約 8 分鐘到全聯。" },
    { label: "商圈", body: "開車約 5 分鐘到中山路商圈。" },
    { label: "學區", body: "鄰近測試國小、測試國中。" },
    { label: "交通", body: "開車約 5 分鐘上台 61 線。" },
  ],
  highlights: ["戶戶邊間雙面採光", "一層四戶雙電梯", "飯店式管理"],
  competitors: [
    { name: "遠雄幸福成", note: "同區大型社區" },
    { name: "聯悦臻", note: "同區、屋齡相近（刻意用異體字「悦」）" },
    { name: "不存在的社區", note: "總表沒有" },
  ],
  buyers: ["首購小家庭，看重已交屋的安心感", "在地換屋族"],
  sellingPoints: [
    { title: "地段雙生活圈", body: "兩邊生活機能都吃得到。" },
    { title: "採光格局", body: "戶戶邊間、格局方正。" },
    { title: "已交屋安心", body: "屋況看得到，比預售更有保障。" },
  ],
  sources: ["測試建設官網", "https://example.com/news/1"],
  unverified: ["公設比", "車位數量"],
};

/* ───── A. 挖 JSON ───── */
console.log("A. 從回覆裡挖 JSON");
const fenced = "以下是整理好的資料：\n```json\n" + JSON.stringify(GOOD, null, 2) + "\n```\n如需調整請告訴我。";
ok(extractJsonBlock(fenced)?.startsWith("{"), "```json 圍起來的", extractJsonBlock(fenced)?.slice(0, 1), "{");
ok(extractJsonBlock("前言 " + JSON.stringify(GOOD) + " 後記")?.endsWith("}"), "沒有圍欄、前後有字", "ok", "ok");
eq("完全沒有大括號 → null", extractJsonBlock("沒有東西"), null);
eq("BOM 開頭也行", typeof extractJsonBlock("﻿{\"a\":1}"), "string");
eq("尾巴多逗號修得回來", parseJsonLoose('{"a": [1,2,],}'), { a: [1, 2] });
eq("全形引號修得回來", parseJsonLoose("{“a”: “b”}"), { a: "b" });
eq("壞到修不回來 → undefined", parseJsonLoose("{a: b"), undefined);

/* ───── B. 完整回覆 ───── */
console.log("B. 完整回覆");
const B = parseReportPaste(fenced);
eq("ok", B.ok, true);
if (B.ok) {
  eq("tagline", B.data.tagline, GOOD.tagline);
  eq("待確認 → 空字串", B.data.basics.publicRatio, "");
  eq("locationValues 四項", B.data.locationValues.length, 4);
  eq("競品三個", B.data.competitors.length, 3);
  eq("賣點三個", B.data.sellingPoints.length, 3);
  ok(B.warnings.some((w) => w.includes("不存在的社區")), "總表沒有的競品會提醒", B.warnings.find((w) => w.includes("不存在")), "有");
  ok(!B.warnings.some((w) => w.includes("聯悦臻")), "異體字的競品對得上、不提醒", "ok", "ok");
  ok(B.warnings.some((w) => w.startsWith("ChatGPT 標了 2 項")), "unverified 會提醒", B.warnings.find((w) => w.startsWith("ChatGPT")), "有");
  ok(B.warnings.some((w) => w.includes("公設比")), "基本資料待確認格會點名", "ok", "ok");
  eq("沒有風險字", B.risks.length, 0);
  ok(!B.warnings.some((w) => w.includes("價格數字")), "沒有價格 → 不提醒價格", "ok", "ok");
}

/* ───── C. 缺東少西、風險字、價格 ───── */
console.log("C. 缺東少西");
const C = parseReportPaste(JSON.stringify({ tagline: "全台第一的保證增值社區", basics: { builder: "X" }, highlights: "一行一條\n第二條", sellingPoints: [{ title: "開價 1,128 萬起", body: "單價 25 萬/坪" }] }));
eq("ok（缺段落不算失敗）", C.ok, true);
if (C.ok) {
  eq("highlights 字串換行也能拆", C.data.highlights, ["一行一條", "第二條"]);
  ok(C.warnings.some((w) => w.includes("區域市場定位")), "缺定位會提醒", "ok", "ok");
  ok(C.warnings.some((w) => w.includes("地段價值只有 0 項")), "缺地段會提醒", "ok", "ok");
  ok(C.warnings.some((w) => w.includes("買方輪廓")), "缺買方會提醒", "ok", "ok");
  ok(C.warnings.some((w) => w.includes("資料來源")), "缺來源會提醒", "ok", "ok");
  const riskWords = C.risks.map((r) => r.word);
  ok(riskWords.includes("最高級用語") && riskWords.includes("保證") && riskWords.includes("增值承諾"), "三種風險字都抓到", riskWords.join("/"), "最高級用語/保證/增值承諾");
  ok(C.warnings.some((w) => w.includes("價格數字") && w.includes("1,128萬")), "價格數字會提醒", C.warnings.find((w) => w.includes("價格")), "有");
}
eq("findPriceMentions", findPriceMentions("開價 1,128 萬，單價 25.3萬/坪，管理費 80 元"), ["1,128萬", "25.3萬/坪"]);
const bad = parseReportPaste("這不是 JSON");
eq("沒有 JSON → 失敗", bad.ok, false);
const broken = parseReportPaste("{ tagline: 沒有引號 }");
eq("壞 JSON → 失敗", broken.ok, false);

/* ───── D. 建案名比對 ───── */
console.log("D. 建案名比對");
eq("正規化：異體字＋括號＋空白", normalizeProjectName("聯悦臻（本案）  "), "聯悅臻");
ok(matchProjectByName("遠雄幸福成")?.name === "遠雄幸福成", "直接對上", matchProjectByName("遠雄幸福成")?.name, "遠雄幸福成");
ok(matchProjectByName("聯悦臻") !== null, "異體字對得上", matchProjectByName("聯悦臻")?.name, "聯悅臻");
eq("對不上 → null", matchProjectByName("不存在的社區"), null);
eq("空字串 → null", matchProjectByName(""), null);

/* ───── E. 合併基本資料 ───── */
console.log("E. 合併基本資料（總表優先）");
const self = PROJECTS.find((p) => p.name === "遠雄幸福成");
ok(!!self, "總表有遠雄幸福成", self?.id, "有");
if (self) {
  const rows = mergeBasics(self, { ...GOOD.basics, builder: "別的建商", units: `約 ${self.units} 戶（含店面）` });
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  eq("建商：總表贏", by.builder.value, self.builder);
  eq("建商來源 site", by.builder.from, "site");
  ok(by.units.from === "chat" && by.units.value.includes("含店面"), "戶數：ChatGPT 的包含總表值且更長 → 用 ChatGPT 的", by.units.value, "含店面");
  eq("建築團隊：只有 ChatGPT 有", by.team.from, "chat");
  ok(by.completion.value.includes("完工"), "完工：總表年份＋屋齡", by.completion.value, "…完工（屋齡…）");
  eq("欄位順序照 BASIC_FIELDS", rows.map((r) => r.key), BASIC_FIELDS.map((f) => f.key));

  const comp = competitorRows(self, { ...GOOD, competitors: [{ name: "遠雄幸福成", note: "把本案也列進來" }, { name: "聯悦臻", note: "同區" }, { name: "不存在的社區", note: "x" }] });
  eq("本案永遠第一列", comp[0].self, true);
  eq("ChatGPT 把本案列進競品 → 跳過", comp.filter((r) => r.project?.id === self.id).length, 1);
  eq("對得上的帶建案、對不上的 null", comp.slice(1).map((r) => !!r.project), [true, false]);
}

/* ───── F. 實價登錄連結 ───── */
console.log("F. 實價登錄連結");
const areas = Object.keys(AREA_LABEL);
eq("每個 ProjectArea 都有對到行政區", Object.keys(LVR_DISTRICT_BY_AREA).sort(), areas.sort());
ok(Object.values(LVR_DISTRICT_BY_AREA).every((d) => LVR_DISTRICTS.includes(d)), "行政區值都在 LVR_DISTRICTS 裡", [...new Set(Object.values(LVR_DISTRICT_BY_AREA))].join("/"), LVR_DISTRICTS.join("/"));
if (self) {
  const l = lvrHrefFor(self);
  ok(l.href.startsWith("/lvr?area=") && l.href.includes("q="), "href 形狀", l.href, "/lvr?area=…&q=…");
  eq("梧棲的案子 → 梧棲區", l.district, "梧棲區");
}
const presale = PROJECTS.find((p) => p.status === "presale");
if (presale) ok(lvrHrefFor(presale).href.includes("kind=presale"), "預售案連到預售屋分頁", lvrHrefFor(presale).href, "…kind=presale");
eq("stampLabel", stampLabel(new Date(Date.UTC(2026, 9, 2, 10))), "2026 年 10 月");
eq("stampLabel 月底晚上（UTC 9/30 20:00 ＝ 台北 10/1）", stampLabel(new Date(Date.UTC(2026, 8, 30, 20))), "2026 年 10 月");

/* ───── G. 指令 ───── */
console.log("G. 指令");
if (self) {
  const prompt = buildReportPrompt(self, { mineCount: 2, now: new Date(Date.UTC(2026, 9, 2)) });
  ok(prompt.includes(self.name) && prompt.includes(self.builder), "帶建案名與建商", "ok", "ok");
  ok(prompt.includes("在這個社區有 2 件物件在售"), "帶在售件數", "ok", "ok");
  for (const f of BASIC_FIELDS) ok(prompt.includes(`"${f.key}"`), `骨架有 ${f.key}`, "ok", "ok");
  for (const l of LOCATION_LABELS) ok(prompt.includes(`"label": "${l}"`), `骨架有地段「${l}」`, "ok", "ok");
  ok(/不寫價格/.test(prompt) && /「最」「第一」/.test(prompt) && /藍線尚未通車/.test(prompt), "三條紅線都在", "ok", "ok");
  ok(prompt.includes("```json"), "要求 ```json 回覆", "ok", "ok");
  ok(parseJsonLoose(reportSkeleton()) !== undefined, "骨架本身是合法 JSON", "ok", "ok");
  const skel = parseReportPaste(prompt);
  eq("把指令本身貼回來也解得出骨架（全空、不會炸）", skel.ok, true);
}

console.log(pass ? "\n全部通過" : "\n有失敗");
process.exit(pass ? 0 : 1);

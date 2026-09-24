/**
 * 學區解析的驗收：
 *   npm run check:school            跑解析單元案例＋檢查 src/data/school-districts.json 的不變量
 *   npm run check:school -- --dump 梧棲區,清水區   把那幾區每所學校解析出來的里印出來給人看
 *
 * 教育局公告的寫法很雜，改 school-district.ts 之後一定要跑這支：
 * 型別過、build 過都不代表「東勢里(全里)」還解析得出來。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeText, parseTail, parseSchoolRow, linStatus, schoolsForLi } from "../src/lib/school-district.ts";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const villages = JSON.parse(readFileSync(here("../src/data/taichung-villages.json"), "utf8"));
const data = JSON.parse(readFileSync(here("../public/data/school-districts.json"), "utf8"));

let failures = 0;
const fail = (msg) => {
  failures++;
  console.log("✗ " + msg);
};
const eqSet = (a, b) => a.length === b.length && [...a].sort((x, y) => x - y).every((v, i) => v === [...b].sort((x, y) => x - y)[i]);
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/* ── 1) 尾巴解析 ── */
const TAIL_CASES = [
  ["（第6、12、20鄰及第7鄰福智街以南）", { mode: "part", lins: [6, 12, 20], condLins: [7] }],
  ["(全里)", { mode: "all" }],
  ["(1、2、5、13、19、21、22鄰)為力行與進德共同學區", { mode: "part", lins: [1, 2, 5, 13, 19, 21, 22], shared: true }],
  ["（第16鄰進德路以東）為臺中國小及樂業國小共同學區", { mode: "part", condLins: [16], shared: true }],
  ["(全里)【第14、15鄰除外】", { mode: "allExcept", excluded: [14, 15] }],
  ["(1-25 鄰、29-37鄰，11.12.13.17 鄰除外)", { mode: "part", lins: [...range(1, 25), ...range(29, 37)].filter((n) => ![11, 12, 13, 17].includes(n)), excluded: [11, 12, 13, 17] }],
  ["(1-4鄰、28、29鄰除外)", { mode: "allExcept", excluded: [1, 2, 3, 4, 28, 29] }],
  ["〈不含36鄰〉", { mode: "allExcept", excluded: [36] }],
  ["(第十八鄰除外)", { mode: "allExcept", excluded: [18] }],
  ["(13、15、17-20)", { mode: "part", lins: [13, 15, 17, 18, 19, 20] }],
  ["中山路以東", { mode: "cond", conds: ["中山路以東"] }],
  [
    "--【 5 鄰 正義路以南 、 8 鄰 正義路以南 、 13 鄰 屏西路以西 、 1 4 鄰 屏西路以西 、 16 鄰 正義路以南 、 17 鄰、18 鄰 正德路 230 巷以西 、 21 鄰、 22 鄰 正義路以西 】",
    { mode: "part", lins: [17, 21], condLins: [5, 8, 13, 14, 16, 18, 22] },
  ],
  [
    "【第1-2、7-9、11~25、26(軍福十八路以南）、27-35、38、39(軍福十八路以南)、40鄰)】",
    { mode: "part", lins: [1, 2, 7, 8, 9, ...range(11, 25), ...range(27, 35), 38, 40], condLins: [26, 39] },
  ],
  ["（第22-24鄰）(1鄰：復興路三段384巷22、24、26號)", { mode: "part", lins: [22, 23, 24], condLins: [1] }],
  ["全部(1-15鄰),從北(思源埡口)到南(清泉橋)開車近五十分鐘", { mode: "all" }],
  ["1-22鄰(全里)", { mode: "all" }],
  ["（全部，第4、13、20、22鄰為文昌國小及文心國小之共同學區）", { mode: "all", shared: true }],
  ["18~29鄰(24鄰與竹林國小共同學區)", { mode: "part", lins: range(18, 29), shared: true }],
  [
    "（第8-30鄰、第32-36鄰、第39、40鄰） (5鄰：中山路金星一巷、中山路金星二巷【46-56(偶數)、61、63、65、71、73號】)",
    { mode: "part", lins: [...range(8, 30), ...range(32, 36), 39, 40], condLins: [5] },
  ],
  ["(2-10鄰，第5鄰甲后路一段788號(不含)以前(一支線以東))", { mode: "part", lins: [2, 3, 4, 6, 7, 8, 9, 10], condLins: [5], excluded: [] }],
  ["(12鄰312巷105弄除外)", { mode: "allExcept", excluded: [12] }],
  ["(1鄰除外)", { mode: "allExcept", excluded: [1] }],
  ["（第19~21鄰除外）", { mode: "allExcept", excluded: [19, 20, 21] }],
  ["（共同學區）", { mode: "all", shared: true }],
  ["(自由學區)", { mode: "all", free: true }],
  ["全部;", { mode: "all" }],
  ["1至6鄰、10至12鄰、23鄰、36至41鄰", { mode: "part", lins: [...range(1, 6), 10, 11, 12, 23, ...range(36, 41)] }],
  ["一至八鄰、十至十八鄰", { mode: "part", lins: [...range(1, 8), ...range(10, 18)] }],
  ["四鄰與九至十七鄰", { mode: "part", lins: [4, ...range(9, 17)] }],
  ["各鄰(第一至十一鄰)", { mode: "all" }],
  ["(11-12)鄰", { mode: "part", lins: [11, 12] }],
  ["(6.7鄰以高速公路東側部分)", { mode: "part", condLins: [6, 7] }],
  ["11、12、13、17、26-28鄰（國光路以西，德芳路二段以北）", { mode: "part", condLins: [11, 12, 13, 17, 26, 27, 28] }],
  ["（全里：111學年度起2-6年級 ）", { mode: "all", excluded: [] }],
  ["（第l~8 、13~15 、17~21、22~23 鄰及第16 鄰天津路以北）", { mode: "part", lins: [...range(1, 8), 13, 14, 15, ...range(17, 23)], condLins: [16] }],
  ["（ 1 鄰 , 3～6 鄰 , 17～31 鄰）（ 8鄰：新生路250、251、262、263-269奇數號）", { mode: "part", lins: [1, ...range(3, 6), ...range(17, 31)], condLins: [8] }],
  ["1鄰至25鄰", { mode: "part", lins: range(1, 25) }],
  ["（4鄰-10鄰）（13鄰-16鄰）", { mode: "part", lins: [...range(4, 10), ...range(13, 16)] }],
  ["第１－１３、１７－１９鄰", { mode: "part", lins: [...range(1, 13), 17, 18, 19] }],
  ["(6鄰(松竹五路一段以南)、11鄰)", { mode: "part", lins: [11], condLins: [6] }],
  ["【7 鄰(崇德路三段以西、崇德八路以北)、18 鄰(崇德八路以北)、27 鄰、31 鄰(崇德八路以北)】為松竹/松強國小共同學區", { mode: "part", lins: [27], condLins: [7, 18, 31], shared: true }],
  ["(第1-6、11-33鄰)【其中第3-6、12、17、18、25、27、31、32鄰及14鄰(大慶街二段以南)為光德國中共同學區】", { mode: "part", shared: true }],
  ["龍安地區", { mode: "cond" }],
  ["中央路107號以前是大秀國小", { mode: "cond" }],
];

for (const [input, want] of TAIL_CASES) {
  const got = parseTail(normalizeText(input));
  const problems = [];
  if (want.mode && got.mode !== want.mode) problems.push(`mode ${got.mode}≠${want.mode}`);
  if (want.lins && !eqSet(got.lins, want.lins)) problems.push(`lins [${got.lins}]≠[${want.lins}]`);
  if (want.condLins && !eqSet(got.condLins, want.condLins)) problems.push(`condLins [${got.condLins}]≠[${want.condLins}]`);
  if (want.excluded && !eqSet(got.excluded, want.excluded)) problems.push(`excluded [${got.excluded}]≠[${want.excluded}]`);
  if (want.shared !== undefined && got.shared !== want.shared) problems.push(`shared ${got.shared}`);
  if (want.free !== undefined && got.free !== want.free) problems.push(`free ${got.free}`);
  if (want.conds && !want.conds.every((c) => got.conds.includes(c))) problems.push(`conds ${JSON.stringify(got.conds)}`);
  if (problems.length) fail(`parseTail「${input.slice(0, 40)}」：${problems.join("；")}`);
}
console.log(`尾巴解析 ${TAIL_CASES.length} 例`);

/* ── 2) 整所學校（拿真資料裡的公告原文） ── */
const bySchool = new Map();
for (const s of data.schools) bySchool.set(`${s.level}:${s.district}:${s.shortName}`, s);
const school = (level, district, shortName) => {
  const s = bySchool.get(`${level}:${district}:${shortName}`);
  if (!s) fail(`找不到 ${district} ${shortName}（${level}）`);
  return s;
};
const zone = (s, li, district) => {
  if (!s) return null;
  const z = s.zones.find((x) => x.li === li && (!district || x.district === district));
  if (!z) fail(`${s.shortName}：沒有 ${district ?? ""}${li} 的 zone（有：${s.zones.map((x) => x.district + x.li).join("、")}）`);
  return z;
};
const expectZone = (s, li, want, district) => {
  const z = zone(s, li, district);
  if (!z) return;
  const problems = [];
  if (want.district && z.district !== want.district) problems.push(`區 ${z.district}≠${want.district}`);
  if (want.mode && z.mode !== want.mode) problems.push(`mode ${z.mode}≠${want.mode}`);
  if (want.lins && !eqSet(z.lins, want.lins)) problems.push(`lins [${z.lins}]≠[${want.lins}]`);
  if (want.condLins && !eqSet(z.condLins, want.condLins)) problems.push(`condLins [${z.condLins}]≠[${want.condLins}]`);
  if (want.excluded && !eqSet(z.excluded, want.excluded)) problems.push(`excluded [${z.excluded}]`);
  if (want.shared !== undefined && z.shared !== want.shared) problems.push(`shared ${z.shared}`);
  if (want.free !== undefined && z.free !== want.free) problems.push(`free ${z.free}`);
  if (problems.length) fail(`${s.district} ${s.shortName}／${li}：${problems.join("；")}`);
};

expectZone(school("junior", "東區", "東峰國中"), "南門里", { district: "南區", mode: "all" });
expectZone(school("junior", "東區", "東峰國中"), "東門里", { district: "東區", mode: "part" });
expectZone(school("elementary", "東區", "力行國小"), "建德里", { district: "北區", lins: range(1, 19) });
expectZone(school("junior", "北區", "雙十國中"), "東勢里", { district: "東區", mode: "all" });
expectZone(school("elementary", "北區", "中華國小"), "何福里", { district: "西屯區", lins: [1, 2, 4, 5, 6, 7, 8, 9] });
expectZone(school("junior", "潭子區", "潭子國中"), "潭陽里", { mode: "cond" });
expectZone(school("junior", "潭子區", "潭子國中"), "嘉仁里", { mode: "all" });
expectZone(school("junior", "梧棲區", "梧棲國中"), "福德里", { mode: "allExcept", excluded: [18] });
expectZone(school("junior", "梧棲區", "梧棲國中"), "草湳里", { mode: "all", shared: true });
expectZone(school("junior", "梧棲區", "梧棲國中"), "頂寮里", { mode: "all", shared: false });
expectZone(school("junior", "梧棲區", "中港高中"), "大庄里", { mode: "allExcept", excluded: [36] });
expectZone(school("junior", "梧棲區", "中港高中"), "福德里", { mode: "part", lins: [18] });
expectZone(school("junior", "梧棲區", "中港高中"), "草湳里", { shared: true });
expectZone(school("elementary", "梧棲區", "梧棲國小"), "草湳里", { mode: "part", lins: [1, 14, 16, 17, 18, 27, 28, ...range(30, 43)] });
expectZone(school("elementary", "梧棲區", "梧棲國小"), "文化里", { mode: "all" });
expectZone(school("elementary", "梧棲區", "中正國小"), "福德里", { mode: "allExcept", excluded: [18] });
expectZone(school("elementary", "梧棲區", "永寧國小"), "興農里", { mode: "allExcept", excluded: [19, 20, 21] });
expectZone(school("elementary", "梧棲區", "中港國小"), "鹿寮里", { district: "沙鹿區", lins: [32], shared: true });
expectZone(school("elementary", "梧棲區", "大德國小"), "大村里", { lins: [...range(1, 15), ...range(25, 34), ...range(37, 41)] });
{
  const s = school("junior", "新社區", "新社高中");
  if (s) {
    const n = villages["新社區"].length;
    if (s.zones.length !== n - 1) fail(`新社高中：應有 ${n - 1} 個里，得到 ${s.zones.length}`);
    if (s.zones.some((z) => z.li === "福興里")) fail("新社高中：福興里應該被排除");
    expectZone(s, "中和里", { mode: "cond" });
    expectZone(s, "新社里", { mode: "all" });
  }
}
{
  const both = data.schools.filter((s) => s.shortName === "梨山國中小");
  if (both.length !== 2) fail(`梨山國中小應拆成兩筆，得到 ${both.length}`);
  const jr = both.find((s) => s.level === "junior");
  if (jr) expectZone(jr, "平等里", { district: "和平區", mode: "all" });
}
expectZone(school("elementary", "霧峰區", "光復國中小"), "南柳里", { lins: range(9, 16), free: true });
expectZone(school("elementary", "霧峰區", "光復國中小"), "六股里", { lins: [10, 18] });
expectZone(school("junior", "霧峰區", "光復國中小"), "坑口里", { mode: "all" });
expectZone(school("junior", "南屯區", "大業國中"), "溝墘里", { lins: [...range(1, 13), 17, 18, 19] });
expectZone(school("junior", "南屯區", "大業國中"), "大業里", { mode: "all" });
expectZone(school("junior", "南屯區", "大業國中"), "公正里", { district: "西區", mode: "all" });
expectZone(school("elementary", "新社區", "協成國小"), "協成里", { lins: [1, 2, 3, ...range(5, 12), ...range(19, 22)] });
expectZone(school("elementary", "龍井區", "龍港國小"), "麗水里", { mode: "all" });
expectZone(school("elementary", "龍井區", "龍海國小"), "忠和里", { mode: "all" });
expectZone(school("elementary", "和平區", "平等國小"), "平等里", { mode: "all" });
expectZone(school("elementary", "北屯區", "建功國小"), "水景里", { mode: "all" });
{
  const s = school("elementary", "大里區", "大里國小");
  if (s && s.zones.length < 6) fail(`大里國小只有 ${s.zones.length} 個里`);
  expectZone(s, "新里里", { mode: "part", excluded: [11, 12, 13, 17] });
}
expectZone(school("elementary", "清水區", "清水國小"), "鰲峰里", { lins: [13, 15, 17, 18, 19, 20] });
expectZone(school("elementary", "清水區", "清水國小"), "南寧里", { mode: "all" });
expectZone(school("elementary", "清水區", "清水國小"), "西寧里", { lins: [1, 2, 3, 4] });
expectZone(school("elementary", "清水區", "西寧國小"), "北寧里", { mode: "all" });
expectZone(school("elementary", "清水區", "甲南國小"), "高東里", { lins: [11, 12] });
{
  const s = school("elementary", "北屯區", "松竹國小");
  if (s) {
    if (s.zones.some((z) => z.li === "仁和里" && eqSet(z.lins, [7, 18, 27, 31]))) fail("松竹國小：113 學年度那段沒有被丟掉");
    expectZone(s, "松竹里", { lins: [...range(1, 10), ...range(12, 18), 21, 22, 23] });
  }
}
expectZone(school("junior", "東勢區", "東勢國中"), "詒福里", { lins: [5, 6, 7, 8, 12, 13] });
expectZone(school("junior", "東勢區", "東勢國中"), "中坑里", { district: "和平區", mode: "all" });
{
  const s = school("elementary", "大肚區", "瑞峰國小");
  if (s && s.zones.some((z) => z.li === "瑞井里")) fail("瑞峰國小：瑞井里那句是備註，不該變成學區");
  expectZone(s, "蔗廍里", { mode: "all" });
}
{
  const s = school("elementary", "大肚區", "永順國小");
  if (s && s.zones.length !== 3) fail(`永順國小應為 3 個里，得到 ${s.zones.length}`);
}
{
  const s = school("junior", "豐原區", "豐南國中");
  if (s && s.zones.length < 12) fail(`豐南國中只有 ${s.zones.length} 個里`);
}
expectZone(school("junior", "沙鹿區", "公明國中"), "晉江里", { lins: [11] });
expectZone(school("elementary", "新社區", "福民國小"), "南勢里", { district: "和平區", lins: [1, 2, 3] });
expectZone(school("elementary", "新社區", "福民國小"), "福興里", { district: "新社區", lins: [1, 2, 19] });
expectZone(school("elementary", "烏日區", "喀哩國小"), "溪埧里", { district: "烏日區", lins: range(1, 8) });
expectZone(school("elementary", "大安區", "三光國小"), "龜殼里", { lins: range(1, 5) });
expectZone(school("elementary", "沙鹿區", "竹林國小"), "犁分里", { mode: "all" });
expectZone(school("junior", "西區", "向上國中"), "双龍里", { district: "西區", mode: "all" });
expectZone(school("junior", "西區", "向上國中"), "中華里", { district: "中區" });
expectZone(school("junior", "西區", "向上國中"), "中正里", { district: "北區" });
expectZone(school("junior", "南區", "崇倫國中"), "公舘里", { district: "西區", mode: "all", shared: true });
expectZone(school("junior", "南區", "崇倫國中"), "大同里", { district: "南屯區" });
expectZone(school("junior", "東勢區", "東華國中"), "福興里", { district: "新社區", mode: "all" });
expectZone(school("junior", "東勢區", "東華國中"), "中和里", { district: "新社區", mode: "cond" });
expectZone(school("elementary", "沙鹿區", "北勢國小"), "埔子里", { lins: [1, 2, 3, 4, 6, 7, 9, 10, 11, 12, 15, 19, 20], condLins: [5, 8, 13, 14, 16, 18, 22] });
expectZone(school("elementary", "沙鹿區", "鹿陽國小"), "三鹿里", { mode: "all" });
expectZone(school("elementary", "沙鹿區", "鹿陽國小"), "南勢里", { lins: [...range(1, 9), 11], condLins: [10], shared: true });
expectZone(school("elementary", "沙鹿區", "沙鹿國小"), "北勢里", { lins: range(18, 29), shared: true });
expectZone(school("elementary", "西屯區", "國安國小"), "林厝里", { lins: [2, 8, 11, 12, 14, 15] });
{
  const s = school("elementary", "西屯區", "永安國小");
  const shared = s?.zones.filter((z) => z.li === "林厝里" && z.shared);
  if (s && (!shared || shared.length === 0)) fail("永安國小：句首的【為永安國小與國安國小共同學區】沒套到林厝里");
}
expectZone(school("elementary", "大甲區", "東陽國小"), "大東里", { district: "外埔區", free: true });
expectZone(school("elementary", "大安區", "永安國小"), "永安里", { district: "大安區", lins: range(1, 7) });
expectZone(school("elementary", "太平區", "坪林國小"), "頭汴里", { lins: [11, 12], free: true });
expectZone(school("elementary", "太平區", "黃竹國小"), "黃竹里", { mode: "all" });
// 備註只屬於最後那個里、條件才套整串
expectZone(school("junior", "龍井區", "四箴國中"), "東海里", { shared: true });
expectZone(school("junior", "龍井區", "四箴國中"), "新東里", { shared: false });
expectZone(school("junior", "潭子區", "潭子國中"), "福仁里", { mode: "cond" });
{
  const s = school("junior", "龍井區", "龍井國中");
  const n = s?.zones.filter((z) => z.li === "福田里").length;
  if (s && n !== 1) fail(`龍井國中：福田里應併成 1 筆，得到 ${n}`);
  expectZone(s, "福田里", { mode: "all", shared: true });
}
{
  const leaked = [];
  for (const s of data.schools) for (const z of s.zones) for (const c of z.conds) if (/§|\s{2,}/.test(c)) leaked.push(`${s.shortName} ${z.li}：${c}`);
  if (leaked.length) fail(`條件文字裡還有標記或多餘空白：\n    ${leaked.slice(0, 5).join("\n    ")}`);
}

/* ── 3) 查詢 ── */
{
  const r = schoolsForLi(data.schools, "梧棲區", "草湳里");
  const e = r.elementary.map((m) => m.school.shortName);
  const j = r.junior.map((m) => m.school.shortName);
  if (!e.includes("梧棲國小") || !e.includes("梧南國小")) fail(`草湳里國小應含梧棲＋梧南，得到 ${e}`);
  if (!j.includes("梧棲國中") || !j.includes("中港高中")) fail(`草湳里國中應含梧棲國中＋中港高中，得到 ${j}`);
  const r2 = schoolsForLi(data.schools, "梧棲區", "草湳里", 20);
  const e2 = r2.elementary.map((m) => m.school.shortName);
  if (e2.includes("梧棲國小") || !e2.includes("梧南國小")) fail(`草湳里 20 鄰只該剩梧南國小，得到 ${e2}`);
  const r3 = schoolsForLi(data.schools, "梧棲區", "福德里", 18);
  if (r3.elementary.some((m) => m.school.shortName === "中正國小")) fail("福德里 18 鄰不該有中正國小");
  if (!r3.elementary.some((m) => m.school.shortName === "大德國小")) fail("福德里 18 鄰應有大德國小");
}
{
  const z = { district: "x", li: "x", mode: "allExcept", lins: [], condLins: [], excluded: [18], conds: [], shared: false, free: false, raw: "" };
  if (linStatus(z, 18) !== "excluded" || linStatus(z, 3) !== "in" || linStatus(z, null) !== "unknown") fail("linStatus allExcept");
}

/* ── 4) 不變量 ── */
{
  let unknownLi = 0;
  for (const s of data.schools) {
    if (s.zones.length === 0) fail(`${s.district} ${s.shortName}（${s.level}）沒有任何里`);
    for (const z of s.zones) {
      if (!(villages[z.district] ?? []).includes(z.li)) {
        unknownLi++;
        console.log(`  ? ${s.district} ${s.shortName}：${z.district}${z.li} 不在官方村里界`);
      }
      for (const n of [...z.lins, ...z.condLins, ...z.excluded]) if (n < 1 || n > 99) fail(`${s.shortName} ${z.li} 鄰 ${n} 超出範圍`);
      if (z.mode === "part" && z.lins.length + z.condLins.length === 0) fail(`${s.shortName} ${z.li} mode=part 但沒有鄰`);
      if (z.mode === "cond" && z.conds.length === 0) fail(`${s.shortName} ${z.li} mode=cond 但沒有條件`);
    }
  }
  if (unknownLi > 0) fail(`${unknownLi} 個里對不上官方村里界`);
  const levels = { elementary: 0, junior: 0 };
  for (const s of data.schools) levels[s.level]++;
  console.log(`資料：學校 ${data.schools.length}（國小 ${levels.elementary}／國中 ${levels.junior}），里 ${data.schools.reduce((n, s) => n + s.zones.length, 0)}，抓取日 ${data.fetchedAt}`);
  if (levels.elementary < 230 || levels.junior < 75) fail("學校數比預期少，教育局頁面可能沒抓全");
}

/* ── dump ── */
const dumpArg = process.argv.indexOf("--dump");
if (dumpArg >= 0) {
  const wanted = (process.argv[dumpArg + 1] || "").split(",").filter(Boolean);
  for (const s of data.schools) {
    if (wanted.length && !wanted.includes(s.district)) continue;
    console.log(`\n■ ${s.district}｜${s.shortName}（${s.level}）${s.warnings.length ? "  ⚠️ " + s.warnings.join("／") : ""}`);
    for (const z of s.zones) {
      const flags = [z.shared ? "共同" : "", z.free ? "自由" : ""].filter(Boolean).join(",");
      const nums =
        z.mode === "all" ? "全里" : z.mode === "allExcept" ? `全里除 ${z.excluded}` : z.mode === "part" ? `鄰 ${z.lins}${z.condLins.length ? " ｜條件鄰 " + z.condLins : ""}` : "條件";
      console.log(`   ${z.district !== s.district ? z.district : ""}${z.li}  ${nums}  ${flags}  ${z.conds.length ? "〔" + z.conds.join(" / ") + "〕" : ""}`);
    }
  }
}

console.log(failures === 0 ? "\n✅ 全部通過" : `\n❌ ${failures} 個問題`);
process.exit(failures === 0 ? 0 : 1);

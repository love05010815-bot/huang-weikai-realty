/**
 * 門牌索引的驗收：
 *   npm run check:addr
 *
 * 1) 客戶打的字怎麼拆（區／路／巷弄／號）的固定案例
 * 2) public/data/addr/ 的不變量（29 區都在、段不重疊、里索引不越界）
 * 3) 從資料裡隨機抽段回查，resolveHouse 一定要對回同一個里鄰
 * 4) 幾條海線大路查得到
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { splitDistrict, parseHouse, findRoads, candidatesFor, resolveHouse, lanesOf, normAddr } from "../src/lib/address-index.ts";
import { DISTRICTS } from "../src/lib/school-district.ts";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
let failures = 0;
const fail = (m) => {
  failures++;
  console.log("✗ " + m);
};

/* ── 1) 拆字 ── */
const D = [...DISTRICTS];
const SPLIT = [
  ["台中市梧棲區中央路一段100號", "梧棲區", "中央路一段100號"],
  ["臺中市沙鹿區中山路", "沙鹿區", "中山路"],
  ["梧棲區 中央路", "梧棲區", "中央路"],
  ["中央路一段", null, "中央路一段"],
  ["台中中央路", null, "中央路"],
  ["北屯區崇德路三段", "北屯區", "崇德路三段"],
];
for (const [q, d, rest] of SPLIT) {
  const got = splitDistrict(q, D);
  if (got.district !== d || got.rest !== rest) fail(`splitDistrict「${q}」→ ${JSON.stringify(got)}，要 ${d}／${rest}`);
}
const HOUSE = [
  ["100巷5弄12之3號5樓", "100巷5弄", 12],
  ["１００號", "", 100],
  ["12之1巷3號", "12之1巷", 3],
  ["12-1巷3號", "12之1巷", 3],
  ["30弄7號", "30弄", 7],
  ["", "", null],
  ["100巷", "100巷", null],
  ["55號之2", "", 55],
];
for (const [t, lane, no] of HOUSE) {
  const got = parseHouse(t);
  if (got.lane !== lane || got.no !== no) fail(`parseHouse「${t}」→ ${JSON.stringify(got)}，要 ${lane}／${no}`);
}
if (normAddr("臺灣大道１段") !== "台灣大道1段") fail("normAddr 臺→台、全形→半形");

/* ── 2) 不變量 ── */
const index = JSON.parse(readFileSync(here("../public/data/addr/index.json"), "utf8"));
const files = new Map();
const load = (d) => {
  if (!files.has(d)) files.set(d, JSON.parse(readFileSync(here(`../public/data/addr/${d}.json`), "utf8")));
  return files.get(d);
};
const names = Object.keys(index.districts);
if (names.length !== 29) fail(`index.json 應有 29 區，得到 ${names.length}`);
for (const d of D) if (!index.districts[d]) fail(`index.json 少了 ${d}`);
const onDisk = readdirSync(here("../public/data/addr")).filter((f) => f.endsWith(".json") && f !== "index.json");
if (onDisk.length !== 29) fail(`public/data/addr 應有 29 個區檔，得到 ${onDisk.length}`);
if (!/^\d{3}年\d{1,2}月$/.test(index.month)) fail(`index.month 格式怪：${index.month}`);

let runCount = 0;
let roadCount = 0;
const samples = [];
for (const d of names) {
  const f = load(d);
  if (!Array.isArray(f.li) || f.li.length === 0) fail(`${d}：沒有里`);
  const roads = Object.keys(f.roads);
  roadCount += roads.length;
  if (roads.length !== index.districts[d].length) fail(`${d}：index 的路數 ${index.districts[d].length} ≠ 檔案 ${roads.length}`);
  for (const road of roads) {
    if (road !== normAddr(road)) fail(`${d}${road}：路名沒正規化`);
    for (const [lane, entry] of Object.entries(f.roads[road])) {
      for (const parity of ["o", "e"]) {
        let prev = null;
        for (const run of entry[parity]) {
          runCount++;
          const [a, b, li, lin] = run;
          if (!(a <= b)) fail(`${d}${road}${lane}：段 ${a}-${b} 起迄顛倒`);
          // 同一個號碼有好幾個里鄰時會有好幾條起迄完全一樣的段；除此之外不准重疊
          if (prev && a <= prev[1] && !(a === prev[0] && b === prev[1])) fail(`${d}${road}${lane}：段 ${a}-${b} 跟前一段 ${prev[0]}-${prev[1]} 重疊`);
          if ((a % 2 === 1) !== (parity === "o")) fail(`${d}${road}${lane}：${a} 放錯單雙`);
          if (li < 0 || li >= f.li.length) fail(`${d}${road}${lane}：里索引 ${li} 越界`);
          if (!(lin >= 1 && lin <= 99)) fail(`${d}${road}${lane}：鄰 ${lin} 怪`);
          prev = run;
          if (samples.length < 20000 && (runCount % 7 === 0)) samples.push({ d, road, lane, no: a, li: f.li[li], lin });
          if (samples.length < 20000 && (runCount % 11 === 0)) samples.push({ d, road, lane, no: b, li: f.li[li], lin });
        }
      }
    }
  }
}
console.log(`門牌索引：${names.length} 區、${roadCount} 條路、${runCount.toLocaleString()} 段，資料月份 ${index.month}`);

/* ── 3) 回查 ── */
let ok = 0;
let shown = 0;
for (const s of samples) {
  const r = resolveHouse(load(s.d), s.d, s.road, s.lane, s.no);
  if (r && r.exact && r.hits.some((h) => h.li === s.li && h.lins.includes(s.lin))) ok++;
  else if (shown++ < 6) console.log(`  回查錯：${JSON.stringify(s)} → ${JSON.stringify(r)}`);
}
if (ok !== samples.length) fail(`回查 ${samples.length} 筆只對 ${ok}`);
else console.log(`回查 ${samples.length} 筆全對`);

/* ── 4) 海線大路 ── */
const expectRoad = (query, district, roadPart) => {
  const hits = findRoads(index, query);
  if (!hits.some((h) => h.district === district && h.road.includes(roadPart))) {
    fail(`findRoads「${query}」找不到 ${district}${roadPart}，得到 ${hits.map((h) => h.district + h.road).slice(0, 5).join("、")}`);
  }
  return hits;
};
expectRoad("梧棲區中央路", "梧棲區", "中央路");
expectRoad("沙鹿區中山路", "沙鹿區", "中山路");
expectRoad("清水區中山路", "清水區", "中山路");
expectRoad("台灣大道", "西屯區", "台灣大道");
expectRoad("臺灣大道八段", "梧棲區", "台灣大道八段");
{
  // 整條地址：最長路名優先、尾巴留給巷弄號
  const hits = findRoads(index, "台中市梧棲區中央路一段100號");
  if (!hits.length || !hits[0].prefix || hits[0].district !== "梧棲區" || !hits[0].road.startsWith("中央路")) {
    fail(`整條地址沒對到路：${JSON.stringify(hits.slice(0, 3))}`);
  } else {
    const h = parseHouse(hits[0].tail);
    if (h.no !== 100) fail(`整條地址的門牌沒拆出來：${JSON.stringify(h)}`);
    const f = load("梧棲區");
    const r = resolveHouse(f, "梧棲區", hits[0].road, h.lane, 100);
    if (!r) fail("梧棲區中央路一段100號 查不到");
    else if (r.hits.length === 0 || !r.hits.every((x) => f.li.includes(x.li) && x.lins.length > 0)) fail("resolve 回了不存在的里或空的鄰");
    const cands = candidatesFor(f, hits[0].road, "");
    if (cands.length === 0) fail("中央路一段沒有候選里");
    if (lanesOf(f, hits[0].road).some((l) => !/[巷弄]/.test(l))) fail("lanesOf 混進不是巷弄的 key");
  }
}
{
  // 不存在的門牌要「推算」不是 null
  const f = load("梧棲區");
  const road = index.districts["梧棲區"].find((r) => r.startsWith("中央路"));
  const r = resolveHouse(f, "梧棲區", road, "", 99999);
  if (!r || r.exact) fail(`不存在的門牌應回推算結果：${JSON.stringify(r)}`);
}

console.log(failures === 0 ? "\n✅ 全部通過" : `\n❌ ${failures} 個問題`);
process.exit(failures === 0 ? 0 : 1);

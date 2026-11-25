/**
 * 垃圾車查詢的驗收：
 *   npm run check:garbage
 *
 * A) 規則的固定案例（地址正規化、巷弄拆法、內插、一週時間、今天／下一班）
 * B) public/data/garbage/ 的不變量（29 區都在、座標在臺中市範圍、時間格式、索引不越界）
 * C) 資料品質門檻（定位成功率、同一台車前後兩站的距離）—— 門檻被打破多半是環保局改了地址寫法，
 *    或 build-garbage 的定位規則被改壞；先看 build 印的報告，不要調鬆門檻。
 * D) 從收運點隨機抽樣：拿收運點自己的地址當客戶打的字，查回來一定要看到它自己、距離接近 0
 *
 * 範例地址一律用假的或公共場所，不要放真的住家門牌（repo 是公開的）。
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
const G = await import("../src/lib/garbage-truck.ts");

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
let pass = true;
const ok = (cond, label, got = "") => {
  if (!cond) pass = false;
  console.log(`${cond ? "  ✅" : "  ❌"} ${label}${cond ? "" : "　→ 拿到 " + JSON.stringify(got)}`);
};
const eq = (got, want, label) => ok(JSON.stringify(got) === JSON.stringify(want), label, got);

console.log("=== A 規則 ===");
eq([1, 5, 10, 12, 20, 21, 99].map(G.toChineseNumber), ["一", "五", "十", "十二", "二十", "二十一", "九十九"], "數字 → 國字");
eq(G.chineseOrdinals("崇德5路146巷40號"), "崇德五路146巷40號", "「崇德5路」→ 崇德五路，巷和號不動");
eq(G.chineseOrdinals("文昌路3段1巷103號"), "文昌路三段1巷103號", "「3段」→ 三段");
eq(G.normCaption("建成巷１６號(四收)", "軍功里"), "建成巷16號", "去括號備註、全形轉半形");
eq(G.normCaption("南勢里巴新街", "南勢里"), "巴新街", "開頭的里名拿掉");
eq(G.longestRoadPrefix("中央路一段100號", ["中央路", "中央路一段", "中央"]), "中央路一段", "最長的路名贏");
eq(G.longestRoadPrefix("不存在路1號", ["中央路"]), null, "沒有這條路 → null");

const lanes = { "": [], "39巷": [], "39巷5弄": [], 紅竹巷: [], 日新巷79弄: [] };
eq(G.splitTail(lanes, "100號"), { lane: "", no: 100 }, "只有號");
eq(G.splitTail(lanes, "39巷5弄12之3號5樓"), { lane: "39巷5弄", no: 12 }, "巷弄號（之幾、樓層不管）");
eq(G.splitTail(lanes, "39巷7弄2號"), { lane: "39巷7弄", no: 2 }, "資料裡沒有的弄：不能把弄的數字當門牌號");
eq(G.splitTail(lanes, "紅竹巷13號旁"), { lane: "紅竹巷", no: 13 }, "有名字的巷子（門牌資料記在巷那一欄）");
eq(G.splitTail(lanes, "日新巷79弄1號"), { lane: "日新巷79弄", no: 1 }, "有名字的巷子＋弄");
eq(G.splitTail(lanes, "12-1號"), { lane: "", no: 12 }, "12-1 號當 12 號");
eq(G.splitTail(lanes, "與福星路1號"), { lane: "", no: null }, "路口不是門牌：不從後面撈數字");
eq(G.splitTail(lanes, "(公園)號"), { lane: "", no: null }, "沒有數字的「號」");
eq(G.splitTail(undefined, "8巷3號"), { lane: "8巷", no: 3 }, "這條路沒資料也拆得出來");

// 一條假的路：1 號在 (24.00000,120.00000)、101 號在 (24.00100,120.00000)；另有「5巷」
const geo = { roads: { 測試路: { "": [1, 2400000, 12000000, 101, 2400100, 12000000], "5巷": [1, 2400010, 12000050, 9, 2400010, 12000090] } } };
const mid = G.locate(geo, "測試路", "", 51);
ok(mid && mid.how === "exact" && Math.abs(mid.lat - 24.0005) < 1e-6, "51 號在 1 號與 101 號正中間", mid);
eq(G.locate(geo, "測試路", "", 130)?.how, "near", "超出範圍 → near");
eq(G.locate(geo, "測試路", "", 130)?.gap, 29, "超出 29 號");
eq(G.locate(geo, "測試路", "5巷", 9)?.lng, 120.0009, "巷子裡的門牌");
eq(G.locate(geo, "測試路", "61巷", 3)?.how, "lane", "資料裡沒有的數字巷 → 巷口（路上的 61 號）");
ok(Math.abs((G.locate(geo, "測試路", "61巷", 3)?.lat ?? 0) - 24.0006) < 1e-6, "巷口位置＝路上同號");
eq(G.locate(geo, "測試路", "不存在巷", 3), null, "有名字的巷子找不到 → 不定位");
eq(G.locate(geo, "測試路", "", null)?.how, "road", "沒給號碼 → 路的中間（how=road）");
eq(G.locate(geo, "沒有這條路", "", 1), null, "沒有這條路 → null");

const week = G.encodeWeek([
  { start: "17:35", end: "17:36" },
  { start: "17:25", end: "17:25" },
  { start: "", end: "" },
  { start: "17:35", end: "17:50" },
  { start: "", end: "" },
  { start: "07:01", end: "07:06" },
  { start: "", end: "" },
]);
eq(week, "1735-1736,1725,,1735-1750,,0701-0706,", "一週壓成字串");
const decoded = G.decodeWeek(week);
eq(decoded[0], { start: "17:35", end: "17:36" }, "週一解回來");
eq(decoded[1], { start: "17:25", end: "17:25" }, "那一刻經過：起訖一樣");
eq(decoded[2], null, "週三不收");
eq(G.slotText(decoded[1]), "17:25", "起訖一樣只印一個時間");
eq(G.slotText(decoded[3]), "17:35–17:50", "定點印起訖");

const file = { li: ["甲里"], cars: ["AAA-0001", "BBB-0002"], stops: [
  ["測試路10號", 0, 0, 0, 2400009, 12000000, week, 1],
  ["測試路10號", 0, 1, 1, 2400009, 12000000, "0800-0810,,,,,,", 0],
  ["測試路90號", 0, 0, 0, 2400089, 12000000, week, "1735-1736,,,,,,"],
  ["測試路與假路口", 0, 0, 0, null, null, week, 1],
] };
const origin = { lat: 24.0001, lng: 120 };
const places = G.buildPlaces([{ district: "測試區", file }], origin);
eq(places.length, 3, "同一個地址的兩班車併成一個地點");
eq(places[0].visits.length, 2, "那個地點有兩班");
const near = G.nearestPlaces(places);
eq(near.places.map((p) => p.caption), ["測試路10號", "測試路90號"], "照距離排、沒座標的不在附近清單");
eq(near.widened, false, "400 公尺內有 → 不放寬");
eq(G.unlocatedOnRoad(places, "測試區", "測試路").map((p) => p.caption), ["測試路與假路口"], "沒座標的靠路名找回來");
eq(G.visitsOn(places[0], 0).map((v) => v.slot.start), ["08:00", "17:35"], "週一兩班照時間排");
eq(G.visitsOn(places[0], 0).map((v) => v.recycle), [false, true], "回收：0＝不收、1＝跟垃圾同時間");
eq(G.visitsOn(places[1], 1).map((v) => v.recycle), [false], "回收只列了週一 → 週二不收回收");
eq(G.nextVisit(places[0], 0, 7 * 60), { inDays: 0, day: 0, slot: { start: "08:00", end: "08:10" }, recycle: false }, "週一早上 7 點 → 今天 08:00");
eq(G.nextVisit(places[0], 0, 8 * 60 + 5)?.slot.start, "08:00", "定點還沒走（08:05）→ 還是這一班");
eq(G.nextVisit(places[0], 0, 9 * 60)?.slot.start, "17:35", "早上那班走了 → 傍晚那班");
eq(G.nextVisit(places[0], 0, 18 * 60), { inDays: 1, day: 1, slot: { start: "17:25", end: "17:25" }, recycle: true }, "今天都過了 → 明天");
eq(G.nextVisit(places[0], 2, 600)?.inDays, 1, "週三不收 → 週四");
eq(G.nextVisit(places[0], 6, 600), { inDays: 1, day: 0, slot: { start: "08:00", end: "08:10" }, recycle: false }, "週日 → 跨到週一");
eq(G.taipeiNow(new Date("2026-11-25T02:30:00Z")), { day: 2, minutes: 630 }, "台北時間 2026-11-25 10:30 是週三");
eq(G.taipeiNow(new Date("2026-11-22T17:00:00Z")), { day: 0, minutes: 60 }, "UTC 週日 17:00 ＝ 台北週一 01:00");
eq([10, 123, 1490].map(G.distanceText), ["就在旁邊", "約 120 公尺", "約 1.5 公里"], "距離怎麼講");
const comms = [{ name: "假社區一期", area: "甲區", lat: 1, lng: 1 }, { name: "大假社區", area: "乙區", lat: 2, lng: 2 }];
eq(G.findCommunities(comms, "假社區").map((c) => c.name), ["假社區一期", "大假社區"], "社區名：開頭符合的排前面");
eq(G.findCommunities(comms, "假"), [], "只打一個字不搜");

console.log("=== B 資料檔不變量 ===");
const dir = here("../public/data/garbage/");
const meta = JSON.parse(readFileSync(dir + "meta.json", "utf8"));
const grid = JSON.parse(readFileSync(dir + "grid.json", "utf8"));
const stopFiles = readdirSync(dir + "stops").filter((f) => f.endsWith(".json"));
const geoFiles = readdirSync(dir + "geo").filter((f) => f.endsWith(".json"));
eq(geoFiles.length, 29, "門牌座標 29 區都在");
eq(stopFiles.length, 29, "收運點 29 區都在");
eq(grid.districts.length, 29, "格子表 29 區");
ok(/^\d{4}-\d{2}-\d{2}$/.test(meta.fetched), "meta 有抓取日期", meta);

let total = 0;
let located = 0;
let bad = [];
const hops = [];
const all = new Map();
for (const fn of stopFiles) {
  const district = fn.replace(".json", "");
  const f = JSON.parse(readFileSync(dir + "stops/" + fn, "utf8"));
  all.set(district, f);
  const byCar = new Map();
  for (const row of f.stops) {
    total++;
    if (row.length !== 8 || !row[0] || !(row[1] < f.li.length) || !(row[2] < f.cars.length) || ![0, 1].includes(row[3])) bad.push([district, row[0], "欄位"]);
    if (!/^(\d{4}(-\d{4})?)?(,(\d{4}(-\d{4})?)?){6}$/.test(row[6]) || !/\d/.test(row[6])) bad.push([district, row[0], "垃圾時間"]);
    if (!(row[7] === 0 || row[7] === 1 || /^(\d{4}(-\d{4})?)?(,(\d{4}(-\d{4})?)?){6}$/.test(row[7]))) bad.push([district, row[0], "回收時間"]);
    if (row[4] == null) continue;
    located++;
    const lat = row[4] / 1e5;
    const lng = row[5] / 1e5;
    if (!(lat > 23.9 && lat < 24.5 && lng > 120.4 && lng < 121.5)) bad.push([district, row[0], "座標不在臺中"]);
    if (!grid.cells[G.cellKey(lng, lat)]?.includes(grid.districts.indexOf(district))) bad.push([district, row[0], "格子表沒有這一區"]);
    const wk = G.decodeWeek(row[6]);
    const di = wk.findIndex(Boolean);
    const key = `${row[2]}|${di}`;
    if (!byCar.has(key)) byCar.set(key, []);
    byCar.get(key).push({ t: wk[di].start, lat, lng });
  }
  for (const arr of byCar.values()) {
    arr.sort((a, b) => a.t.localeCompare(b.t));
    for (let i = 1; i < arr.length; i++) hops.push(G.distanceM(arr[i - 1], arr[i]));
  }
}
eq(bad.slice(0, 5), [], "每一筆收運點的欄位、時間格式、座標都合格");
eq([meta.stops, meta.located], [total, located], "meta 的筆數跟檔案一致");

let geoBad = 0;
let biggest = 0;
for (const fn of geoFiles) {
  const raw = readFileSync(dir + "geo/" + fn, "utf8");
  biggest = Math.max(biggest, raw.length);
  for (const lanesOf of Object.values(JSON.parse(raw).roads)) {
    for (const flat of Object.values(lanesOf)) {
      if (flat.length === 0 || flat.length % 3 !== 0) geoBad++;
      for (let i = 3; i < flat.length; i += 3) if (flat[i] <= flat[i - 3]) geoBad++;
    }
  }
}
eq(geoBad, 0, "門牌座標：每條巷弄三個一組、號碼遞增");
ok(biggest < 900_000, `最大的一區門牌檔 ${(biggest / 1000).toFixed(0)}KB，手機抓得動（上限 900KB）`, biggest);

console.log("=== C 資料品質 ===");
const rate = located / total;
ok(total > 15000, `收運點 ${total} 筆（平常約兩萬）`, total);
ok(rate > 0.93, `定位成功率 ${(rate * 100).toFixed(1)}%（門檻 93%）`, rate);
hops.sort((a, b) => a - b);
const median = hops[hops.length >> 1];
ok(median < 250, `同一台車前後兩站的距離中位數 ${Math.round(median)} 公尺（門檻 250；定位亂掉這個數字會暴增）`, median);

console.log("=== D 抽樣回查 ===");
// 固定的抽法（每區每隔幾筆抽一筆），結果才能重現
let tried = 0;
let found = 0;
const misses = [];
for (const [district, f] of all) {
  const withLl = f.stops.filter((r) => r[4] != null);
  for (let i = 0; i < withLl.length; i += Math.max(1, Math.floor(withLl.length / 20))) {
    const row = withLl[i];
    const at = { lat: row[4] / 1e5, lng: row[5] / 1e5 };
    const districts = G.districtsNear(grid, at);
    const placesNear = G.buildPlaces(districts.map((d) => ({ district: d, file: all.get(d) })), at);
    const hit = G.nearestPlaces(placesNear).places.find((p) => p.district === district && p.caption === row[0]);
    tried++;
    if (hit && hit.distance < 5) found++;
    else misses.push(`${district} ${row[0]}`);
  }
}
ok(found / tried > 0.97, `站在收運點上查，查得到它自己：${found}／${tried}（沒查到的是同一個位置擠了超過 12 個點）`, misses.slice(0, 5));

// 海線四區各要有一定數量（他的客戶在這裡）
for (const [d, min] of [["梧棲區", 150], ["清水區", 400], ["沙鹿區", 400], ["龍井區", 300]]) {
  const n = all.get(d)?.stops.filter((r) => r[4] != null).length ?? 0;
  ok(n >= min, `${d} 有座標的收運點 ${n} 筆（至少 ${min}）`, n);
}

console.log(pass ? "\n全部通過 ✅" : "\n有沒過的 ❌");
process.exit(pass ? 0 : 1);

/**
 * 把臺中市民政局的「GIS 門牌號碼」CSV 壓成學區查詢用的門牌索引。
 *
 *   npm run build:addr -- <門牌CSV路徑> <資料月份，例：115年1月>
 *
 * CSV 從哪裡拿：
 *   https://opendata.taichung.gov.tw/search/f0c0712a-a604-4716-8b3f-33e9f4c8049e
 *   那一頁的 CSV 只是「說明檔」，每一列的「地圖網址」欄才是各月份門牌 CSV 的 Google Drive 連結
 *   （每月約 130 萬筆、150MB，Excel 開不了，直接餵這支就好）。
 *   Drive 檔案 id 可以這樣直接抓：
 *   curl -L -o doors.csv "https://drive.usercontent.google.com/download?id=<id>&export=download&confirm=t"
 *
 * 欄位（沒有標題也照這個順序）：
 *   省市縣市代碼, 鄉鎮市區代碼, 村里, 鄰, 街_路段, 地區, 巷, 弄, 號, TWD97橫坐標, TWD97縱坐標, WGS84經度, WGS84緯度
 *   鄉鎮市區代碼是 7 碼「66 0 NN 00」，NN 跟村里界圖 VILLCODE 的第 7–8 碼一樣，用那個對回區名。
 *
 * 輸出（格式說明在 src/lib/address-index.ts 檔頭）：
 *   public/data/addr/index.json 與 public/data/addr/<區>.json
 *
 * 跑完會抽 3,000 筆門牌回查一次（自我驗證），準確率要 100%，不然就是壓法壞了。
 * 門牌資料一年更新一次就夠（新建案交屋才會多門牌），跟學區一起更新。
 */
import { createReadStream, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { normalizeLi } from "../src/lib/school-district.ts";
import { normAddr, resolveHouse } from "../src/lib/address-index.ts";

const [, , csvPath, monthLabel] = process.argv;
if (!csvPath || !monthLabel) {
  console.error("用法：node --experimental-strip-types scripts/build-address-index.mjs <門牌CSV> <月份，例 115年1月>");
  process.exit(1);
}
const here = (p) => fileURLToPath(new URL(p, import.meta.url));

/* ── 區代碼 → 區名、區 → 官方里名 ── */
const geo = JSON.parse(readFileSync(here("../public/data/taichung-villages.geojson"), "utf8"));
const districtByNo = new Map();
const villagesByDistrict = new Map();
for (const f of geo.features) {
  const { c, t, v } = f.properties;
  // VILLCODE「66000 010 001」：第 6–7 碼是區的流水號（中區 01 … 和平區 29）；門牌的「6600100」第 4–5 碼同一個號
  districtByNo.set(c.slice(5, 7), t);
  if (!villagesByDistrict.has(t)) villagesByDistrict.set(t, new Map());
  villagesByDistrict.get(t).set(normalizeLi(v), v);
}

/* ── 讀 CSV ── */
function splitCsv(line) {
  if (!line.includes('"')) return line.split(",");
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

const houseNo = (s) => {
  const m = /^(\d+)/.exec(normAddr(s));
  return m ? Number(m[1]) : null;
};

/** 區 → { li: Map<名,索引>, roads: Map<路, Map<巷弄, Map<parity, Array<[號, 里索引, 鄰]>>>> } */
const districts = new Map();
const unknownLi = new Map();
let rows = 0;
let skipped = 0;
let headerSeen = false;
const sampleRows = [];

const rl = createInterface({ input: createReadStream(csvPath, { encoding: "utf8" }) });
for await (const raw of rl) {
  const line = raw.replace(/^﻿+/, "").replace(/\r$/, "");
  if (!line) continue;
  const f = splitCsv(line);
  if (!headerSeen) {
    headerSeen = true;
    if (!/^\d/.test(f[1] ?? "")) continue; // 標題列
  }
  if (f.length < 9) {
    skipped++;
    continue;
  }
  const [, townCode, liRaw, linRaw, roadRaw, areaRaw, laneRaw, alleyRaw, noRaw] = f;
  const district = districtByNo.get(String(townCode).slice(3, 5));
  const lin = Number(normAddr(linRaw));
  const no = houseNo(noRaw);
  if (!district || !Number.isInteger(lin) || lin < 1 || no == null) {
    skipped++;
    continue;
  }
  const liNorm = normalizeLi(liRaw);
  const official = villagesByDistrict.get(district)?.get(liNorm);
  if (!official) {
    unknownLi.set(`${district}${liRaw}`, (unknownLi.get(`${district}${liRaw}`) ?? 0) + 1);
    skipped++;
    continue;
  }
  // 路名：沒有路名的地址用「地區」欄當路名（資料裡兩欄不會同時有值；例：東區十甲里「十甲巷」30弄7號）
  const roadName = normAddr(roadRaw) || normAddr(areaRaw);
  if (!roadName) {
    skipped++;
    continue;
  }
  const laneKey = `${normAddr(laneRaw)}${normAddr(alleyRaw)}`;

  let d = districts.get(district);
  if (!d) {
    d = { li: new Map(), roads: new Map() };
    districts.set(district, d);
  }
  let liIdx = d.li.get(official);
  if (liIdx === undefined) {
    liIdx = d.li.size;
    d.li.set(official, liIdx);
  }
  let road = d.roads.get(roadName);
  if (!road) {
    road = new Map();
    d.roads.set(roadName, road);
  }
  let lane = road.get(laneKey);
  if (!lane) {
    lane = { o: [], e: [] };
    road.set(laneKey, lane);
  }
  lane[no % 2 === 1 ? "o" : "e"].push([no, liIdx, lin]);
  rows++;
  if (rows % 431 === 0 && sampleRows.length < 3000) sampleRows.push({ district, road: roadName, lane: laneKey, no, li: official, lin });
}

/* ── 壓成段 ──
 * 同一個門牌可能有好幾個「里鄰」：整棟大樓不同樓層編在不同鄰（很常見），少數門牌整編中的還跨兩個里。
 * 所以先算出每個號碼的「里鄰集合」，連續號碼集合完全一樣的併成一段，集合裡每個里鄰各出一條 [起, 迄, 里, 鄰]。
 * 查的時候把所有蓋到那個號碼的段都收回來，就是那個門牌的全部里鄰。 */
let multiLin = 0;
let multiLi = 0;
function toRuns(points) {
  const byNo = new Map();
  for (const [no, li, lin] of points) {
    if (!byNo.has(no)) byNo.set(no, new Set());
    byNo.get(no).add(li * 1000 + lin);
  }
  const nos = [...byNo.keys()].sort((a, b) => a - b);
  const runs = [];
  let start = null;
  let end = null;
  let key = null;
  const flush = () => {
    if (start == null) return;
    for (const code of key.split(",").map(Number)) runs.push([start, end, Math.floor(code / 1000), code % 1000]);
  };
  for (const no of nos) {
    const set = byNo.get(no);
    if (set.size > 1) {
      const lis = new Set([...set].map((c) => Math.floor(c / 1000)));
      if (lis.size > 1) multiLi++;
      else multiLin++;
    }
    const k = [...set].sort((a, b) => a - b).join(",");
    if (k === key) end = no;
    else {
      flush();
      start = no;
      end = no;
      key = k;
    }
  }
  flush();
  return runs;
}

mkdirSync(here("../public/data/addr"), { recursive: true });
const index = { month: monthLabel, source: "臺中市政府民政局 GIS 門牌號碼", districts: {} };
let totalRuns = 0;
const fileSizes = [];
for (const [district, d] of [...districts.entries()].sort((a, b) => a[0].localeCompare(b[0], "zh-Hant"))) {
  const li = [...d.li.keys()];
  const roads = {};
  for (const [roadName, lanes] of [...d.roads.entries()].sort((a, b) => a[0].localeCompare(b[0], "zh-Hant"))) {
    const entry = {};
    for (const [laneKey, pts] of [...lanes.entries()].sort((a, b) => a[0].localeCompare(b[0], "zh-Hant"))) {
      entry[laneKey] = { o: toRuns(pts.o), e: toRuns(pts.e) };
      totalRuns += entry[laneKey].o.length + entry[laneKey].e.length;
    }
    roads[roadName] = entry;
  }
  index.districts[district] = Object.keys(roads);
  const out = here(`../public/data/addr/${district}.json`);
  writeFileSync(out, JSON.stringify({ li, roads }));
  fileSizes.push([district, statSync(out).size]);
}
writeFileSync(here("../public/data/addr/index.json"), JSON.stringify(index));

/* ── 自我驗證：抽樣回查 ── */
const cache = new Map();
const load = (district) => {
  if (!cache.has(district)) cache.set(district, JSON.parse(readFileSync(here(`../public/data/addr/${district}.json`), "utf8")));
  return cache.get(district);
};
let ok = 0;
let bad = 0;
const badSamples = [];
for (const s of sampleRows) {
  const r = resolveHouse(load(s.district), s.district, s.road, s.lane, s.no);
  if (r && r.exact && r.hits.some((h) => h.li === s.li && h.lins.includes(s.lin))) ok++;
  else {
    bad++;
    if (badSamples.length < 8) badSamples.push({ ...s, got: r });
  }
}

/* ── 報告 ── */
console.log(
  `門牌 ${rows.toLocaleString()} 筆（跳過 ${skipped.toLocaleString()}；同號多鄰 ${multiLin.toLocaleString()}、同號跨里 ${multiLi}），${districts.size} 區，壓成 ${totalRuns.toLocaleString()} 段`,
);
console.log(`路名（含段）共 ${Object.values(index.districts).reduce((n, a) => n + a.length, 0)} 條，index.json ${(statSync(here("../public/data/addr/index.json")).size / 1024).toFixed(0)} KB`);
for (const [d, size] of fileSizes) console.log(`  ${d} ${(size / 1024).toFixed(0)} KB，${index.districts[d].length} 條路`);
console.log(`自我驗證：抽 ${sampleRows.length} 筆回查，對 ${ok}、錯 ${bad}`);
if (badSamples.length) console.log("  錯的例子：", JSON.stringify(badSamples, null, 1));
if (unknownLi.size) {
  console.log(`⚠️ 對不上官方村里界的里（這些門牌被跳過）：`);
  for (const [k, n] of [...unknownLi.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k} ×${n}`);
}
if (bad > 0) process.exit(1);

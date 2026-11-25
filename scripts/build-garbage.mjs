/**
 * 建垃圾車查詢（/garbage）的資料。
 *
 *   npm run build:garbage -- <門牌CSV路徑> <門牌月份，例：115年1月> [環保局收運點JSON路徑]
 *
 * 兩份來源（都是政府資料開放授權）：
 *   ① 收運點：環保局「臺中市定時定點垃圾收運地點」。第三個參數沒給就現抓
 *      https://opendata.taichung.gov.tw/search/7bb28898-6971-4f9b-972e-6e28edf52a56
 *      （下載網址在那頁的「JSON」，寫在下面 STOPS_URL；市府換平台時 rid 會變，抓不到就去那頁重抄）。
 *   ② 門牌座標：民政局「GIS 門牌號碼」，跟學區查詢的 build:addr 用同一份 CSV（拿法見 build-address-index.mjs 檔頭）。
 *
 * 做三件事：
 *   A. 把每個門牌的座標壓成「路 → 巷弄 → 號碼沿線的座標」（geo/<區>.json），前台用它把客戶打的地址換成位置。
 *   B. 用 A 替每個收運點的地址定位（環保局不給座標），寫成 stops/<區>.json。
 *   C. grid.json：哪一格（0.01 度）裡有哪些行政區，前台用來決定要抓哪幾區的收運點（住在區界旁邊的人兩區都要看）。
 *
 * 跑完看最後印的「定位成功率」與「里不符」：成功率掉很多＝環保局改了地址寫法；里不符變多＝對錯路了。
 * 再跑 `npm run check:garbage`。
 */
import { createReadStream, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import {
  normAddr,
  normCaption,
  longestRoadPrefix,
  locate,
  splitTail,
  encodeWeek,
  cellKey,
  distanceM,
} from "../src/lib/garbage-truck.ts";

const STOPS_URL =
  "https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download?rid=68d1a87f-7baa-4b50-8408-c36a3a7eda68";

const [, , csvPath, monthLabel, stopsPath] = process.argv;
if (!csvPath || !monthLabel) {
  console.error("用法：npm run build:garbage -- <門牌CSV> <月份，例 115年1月> [收運點JSON]");
  process.exit(1);
}
const here = (p) => fileURLToPath(new URL(p, import.meta.url));

/** 沿著號碼內插的容許誤差（公尺）：比這個小的門牌點就丟掉，檔案才不會大到不能給手機抓 */
const SIMPLIFY_M = 20;

/* ── 區代碼 → 區名（跟 build-address-index.mjs 同一套：VILLCODE 第 6–7 碼＝門牌區代碼第 4–5 碼） ── */
const geo = JSON.parse(readFileSync(here("../public/data/taichung-villages.geojson"), "utf8"));
const districtByNo = new Map();
/** 「區|里」→ 這個里的外環們（用來擋「定位到離環保局寫的里很遠」的點） */
const villageRings = new Map();
for (const f of geo.features) {
  districtByNo.set(f.properties.c.slice(5, 7), f.properties.t);
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  const key = `${f.properties.t}|${normAddr(f.properties.v)}`;
  villageRings.set(key, [...(villageRings.get(key) ?? []), ...polys.map((p) => p[0])]);
}
function inRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** 這個點離那個里多遠（公尺，在裡面是 0；用邊界的頂點估，夠判斷「差很遠」）。里名對不到官方界線回 null */
function distanceToVillage(district, village, at) {
  const rings = villageRings.get(`${district}|${village}`);
  if (!rings) return null;
  let best = Infinity;
  for (const ring of rings) {
    if (inRing(at.lng, at.lat, ring)) return 0;
    for (const [x, y] of ring) best = Math.min(best, distanceM(at, { lat: y, lng: x }));
  }
  return best;
}

/** 門牌號超出這條路的範圍幾號以內還算數（再多就當作定不到） */
const MAX_NUMBER_GAP = 20;
/** 定位點離環保局寫的里超過這麼遠（公尺）就不採用 —— 多半是對錯路、或地址寫錯 */
const MAX_VILLAGE_M = 800;

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

/* ── A. 讀門牌 ── */
/** 區 → 路 → 巷弄 → Map<號, [緯度和, 經度和, 筆數, Map<里,筆數>]> */
const doors = new Map();
/** 格子 → Set<區> */
const cells = new Map();
let doorRows = 0;
let doorSkipped = 0;

const rl = createInterface({ input: createReadStream(csvPath, "utf8"), crlfDelay: Infinity });
let first = true;
for await (const raw of rl) {
  if (first) {
    first = false;
    if (raw.includes("省市縣市代碼")) continue;
  }
  if (!raw) continue;
  const c = splitCsv(raw);
  const district = districtByNo.get((c[1] ?? "").slice(3, 5));
  const road = normAddr(c[4] || c[5] || "");
  const lng = Number(c[11]);
  const lat = Number(c[12]);
  const noM = /^(\d+)/.exec(normAddr(c[8] ?? ""));
  if (!district || !road || !noM || !(lat > 23.9 && lat < 24.5 && lng > 120.4 && lng < 121.5)) {
    doorSkipped++;
    continue;
  }
  doorRows++;
  const lane = normAddr(c[6] ?? "") + normAddr(c[7] ?? "");
  const no = Number(noM[1]);
  if (!doors.has(district)) doors.set(district, new Map());
  const roads = doors.get(district);
  if (!roads.has(road)) roads.set(road, new Map());
  const lanes = roads.get(road);
  if (!lanes.has(lane)) lanes.set(lane, new Map());
  const nos = lanes.get(lane);
  let acc = nos.get(no);
  if (!acc) nos.set(no, (acc = [0, 0, 0, new Map()]));
  acc[0] += lat;
  acc[1] += lng;
  acc[2]++;
  const li = normAddr(c[2] ?? "");
  acc[3].set(li, (acc[3].get(li) ?? 0) + 1);

  const key = cellKey(lng, lat);
  if (!cells.has(key)) cells.set(key, new Set());
  cells.get(key).add(district);
}
console.log(`門牌：${doorRows.toLocaleString()} 筆（跳過 ${doorSkipped.toLocaleString()} 筆沒有路名、號碼或座標的）`);

/** 照號碼排好的點 [號, 緯, 經]，丟掉「拿前後兩點內插也差不到 SIMPLIFY_M」的 */
function simplify(points) {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    const [na, la, ga] = points[a];
    const [nb, lb, gb] = points[b];
    let worst = -1;
    let worstD = SIMPLIFY_M;
    for (let i = a + 1; i < b; i++) {
      const t = nb === na ? 0 : (points[i][0] - na) / (nb - na);
      const d = distanceM(
        { lat: la + (lb - la) * t, lng: ga + (gb - ga) * t },
        { lat: points[i][1], lng: points[i][2] },
      );
      if (d > worstD) {
        worstD = d;
        worst = i;
      }
    }
    if (worst > 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const outDir = here("../public/data/garbage/");
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir + "geo", { recursive: true });
mkdirSync(outDir + "stops", { recursive: true });

/** 區 → GeoFile（留在記憶體裡替收運點定位） */
const geoFiles = new Map();
let geoBytes = 0;
let pointsBefore = 0;
let pointsAfter = 0;
for (const [district, roads] of doors) {
  const file = { roads: {} };
  for (const [road, lanes] of [...roads].sort((a, b) => a[0].localeCompare(b[0], "zh-Hant"))) {
    const outLanes = {};
    for (const [lane, nos] of [...lanes].sort((a, b) => a[0].localeCompare(b[0], "zh-Hant"))) {
      const pts = [...nos]
        .map(([no, [la, ln, n]]) => [no, la / n, ln / n])
        .sort((a, b) => a[0] - b[0]);
      pointsBefore += pts.length;
      const kept = simplify(pts);
      pointsAfter += kept.length;
      outLanes[lane] = kept.flatMap(([no, la, ln]) => [no, Math.round(la * 1e5), Math.round(ln * 1e5)]);
    }
    file.roads[road] = outLanes;
  }
  geoFiles.set(district, file);
  const json = JSON.stringify(file);
  geoBytes += json.length;
  writeFileSync(`${outDir}geo/${district}.json`, json);
}
console.log(
  `門牌座標：${pointsBefore.toLocaleString()} 個號碼 → 留 ${pointsAfter.toLocaleString()} 個（誤差 ${SIMPLIFY_M} 公尺內），共 ${(geoBytes / 1e6).toFixed(1)} MB`,
);

/* ── B. 收運點 ── */
let rawStops;
if (stopsPath) rawStops = JSON.parse(readFileSync(stopsPath, "utf8"));
else {
  const res = await fetch(STOPS_URL, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`環保局收運點抓不到：HTTP ${res.status}`);
  rawStops = await res.json();
}
if (!Array.isArray(rawStops) || rawStops.length < 10000) {
  throw new Error(`收運點只有 ${rawStops?.length} 筆，少得不合理（平常約兩萬筆），不覆蓋現有資料`);
}

const KIND = { 沿街: 0, 定點: 1 };
const byDistrict = new Map();
const stat = { total: 0, noTime: 0, otherKind: 0, located: 0, exact: 0, gapRejected: 0, villageRejected: 0, otherDistrict: 0 };
const unlocated = [];
for (const s of rawStops) {
  const district = normAddr(s.area ?? "");
  if (!geoFiles.has(district)) continue;
  const days = (p) =>
    [1, 2, 3, 4, 5, 6, 7].map((d) => ({ start: (s[`${p}_d${d}_time_s`] ?? "").trim(), end: (s[`${p}_d${d}_time_e`] ?? "").trim() }));
  const g = encodeWeek(days("g"));
  const r = encodeWeek(days("r"));
  // 一週都沒有垃圾時間的不是給民眾倒垃圾的點（往廠、清潔隊自己的點）
  if (!/\d/.test(g)) {
    stat.noTime++;
    continue;
  }
  if (!(s.task_type in KIND)) {
    stat.otherKind++;
    continue;
  }
  stat.total++;
  const village = normAddr(s.village ?? "");
  const caption = String(s.caption ?? "").trim();
  let text = normCaption(caption, village);
  // 「西屯區中清路二段221號」這種寫在別區名下的：照地址上的區去找門牌
  let geoDistrict = district;
  const dm = /^([一-鿿]{1,2}區)(?=.)/.exec(text);
  if (dm && geoFiles.has(dm[1])) {
    geoDistrict = dm[1];
    text = text.slice(dm[1].length);
    if (geoDistrict !== district) stat.otherDistrict++;
  }
  const file = geoFiles.get(geoDistrict);
  const road = longestRoadPrefix(text, Object.keys(file.roads));
  let ll = null;
  if (road) {
    const { lane, no } = splitTail(file.roads[road], text.slice(road.length));
    // 沒有號碼的（「○○路」「○○巷口」）不硬定位：整條路取中間點會差到幾百公尺
    const got = no != null ? locate(file, road, lane, no) : null;
    if (got) {
      const far = geoDistrict === district ? distanceToVillage(district, village, got) : null;
      if (got.gap > MAX_NUMBER_GAP) stat.gapRejected++;
      else if (far != null && far > MAX_VILLAGE_M) stat.villageRejected++;
      else {
        ll = got;
        stat.located++;
        if (got.how === "exact") stat.exact++;
      }
    }
  }
  if (!ll) unlocated.push(`${district}｜${village}｜${caption}`);
  if (!byDistrict.has(district)) byDistrict.set(district, { li: [], cars: [], stops: [], liIdx: new Map(), carIdx: new Map() });
  const d = byDistrict.get(district);
  const idx = (map, list, v) => {
    if (!map.has(v)) {
      map.set(v, list.length);
      list.push(v);
    }
    return map.get(v);
  };
  d.stops.push([
    caption,
    idx(d.liIdx, d.li, village),
    idx(d.carIdx, d.cars, String(s.car_licence ?? "").trim()),
    KIND[s.task_type],
    ll ? Math.round(ll.lat * 1e5) : null,
    ll ? Math.round(ll.lng * 1e5) : null,
    g,
    r === g ? 1 : /\d/.test(r) ? r : 0,
  ]);
}

let stopBytes = 0;
for (const [district, d] of byDistrict) {
  const json = JSON.stringify({ li: d.li, cars: d.cars, stops: d.stops });
  stopBytes += json.length;
  writeFileSync(`${outDir}stops/${district}.json`, json);
  // 有收運點的區一定要進格子（山區的點可能落在沒有門牌的格子）
  for (const row of d.stops) {
    if (row[4] == null) continue;
    const key = cellKey(row[5] / 1e5, row[4] / 1e5);
    if (!cells.has(key)) cells.set(key, new Set());
    cells.get(key).add(district);
  }
}

/* ── C. 格子 ── */
const districts = [...geoFiles.keys()].sort((a, b) => a.localeCompare(b, "zh-Hant"));
const grid = { districts, cells: {} };
for (const [key, set] of cells) grid.cells[key] = [...set].map((d) => districts.indexOf(d)).sort((a, b) => a - b);
writeFileSync(outDir + "grid.json", JSON.stringify(grid));

const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
writeFileSync(
  outDir + "meta.json",
  JSON.stringify({ fetched: today, doorsMonth: monthLabel, stops: stat.total, located: stat.located }),
);

console.log(
  `收運點：${stat.total.toLocaleString()} 筆（另有 ${stat.noTime} 筆整週沒時間、${stat.otherKind} 筆不是沿街／定點，沒收），共 ${(stopBytes / 1e6).toFixed(1)} MB`,
);
console.log(
  `定位成功率：${((stat.located / stat.total) * 100).toFixed(1)}%（${stat.located.toLocaleString()} 筆，其中門牌範圍內 ${stat.exact.toLocaleString()}）`,
);
console.log(
  `為了不定錯而放棄的：號碼超出門牌範圍 ${stat.gapRejected} 筆、離環保局寫的里超過 ${MAX_VILLAGE_M} 公尺 ${stat.villageRejected} 筆；地址寫別區的 ${stat.otherDistrict} 筆`,
);
console.log(`沒定位到 ${unlocated.length} 筆，前 40 筆：\n  ` + unlocated.slice(0, 40).join("\n  "));

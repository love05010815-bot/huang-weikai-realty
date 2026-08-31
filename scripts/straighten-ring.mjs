#!/usr/bin/env node
/**
 * 把手點出來的商圈界線「拉直」—— node scripts/straighten-ring.mjs
 *
 * ## 這支在做什麼
 *
 * 系統擁有者在 `/map?zones=1` 沿著邊界一路點，同一條直路上會點好幾下，
 * 每一下都有幾公尺誤差 —— 畫出來就是一條在抖的線，不是一條直線。
 *
 * 這支用 **Douglas–Peucker** 把「離兩端連線不超過 tol 公尺」的中間點整批刪掉：
 * 直路段上多餘的點會消失、變成真正的一條直線，**轉角一個都不會少**
 * （轉角離連線很遠，本來就不可能被刪）。
 *
 * ⚠️ 這**不是**幫他重畫界線，是把他自己點的那條線上的雜訊拿掉。
 *    位移上限就是 tol，而且演算法保證不超過。
 *
 * ## 官方界線預設拒絕，要套得自己打開
 *
 * 重劃區（`official: true`）是地政局公告的四至照 OSM 路網描出來的，不是手點的，
 * 所以預設 **exit 2 拒絕** —— 免得有人順手把七塊一起套下去。
 *
 * ⚠️ **2026-08-31 系統擁有者指定「重劃區這塊的線也拉直」，用 `--official-ok` 打開，
 *    而且那次用的是 `--tol 5` 不是 10。** 官方界線用比較緊的容差有理由：
 *    5 公尺的位移在 zoom 16 只有 2.2 px、zoom 15 只有 1.1 px，肉眼分不出來，
 *    等於純粹把「同一條直路上多描的幾點」拿掉，不會被說成「把界線改到別的地方」。
 *    要對官方界線用 10 公尺以上，先問過他。
 *
 * ## 用法
 *
 *   # 比較不同容差（不輸出 ring，只給表）
 *   node scripts/straighten-ring.mjs --zone luliao --tol 10,15,25,40
 *
 *   # 產生可以貼回 port-zones.ts 的 ring
 *   node scripts/straighten-ring.mjs --zone luliao --tol 20
 *
 *   # 吃系統擁有者剛貼過來的那段（檔案或 stdin 都可以）
 *   node scripts/straighten-ring.mjs --file /tmp/ring.txt --tol 20
 *
 *   # 官方界線（要明講，預設擋著）
 *   node scripts/straighten-ring.mjs --zone wuqi-qingshui-shizheng --tol 5 --official-ok
 *
 * ⚠️ `/map?zones=1` 收座標時是 `toFixed(4)`，也就是**每個點都已經被吸到
 *    約 11x10 公尺的格子上**。所以 tol 小於 15 公尺基本上不會有效果。
 */

import fs from "node:fs";

const ZONES_PATH = new URL("../src/data/port-zones.ts", import.meta.url);

/* ── 參數 ── */
function arg(name, fallback = null) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/* ── 讀 ring ── */
const RE_PT = /\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/g;
function parseRing(text) {
  const pts = [...text.matchAll(RE_PT)].map((m) => [+m[1], +m[2]]);
  if (pts.length < 3) throw new Error("解析不到 3 個以上的座標點");
  // 首尾重合的話拿掉尾巴 —— Leaflet 自己會閉合，重複點會讓長度 0 的邊搞亂自交判定
  const [a, b] = [pts[0], pts[pts.length - 1]];
  if (pts.length > 3 && a[0] === b[0] && a[1] === b[1]) pts.pop();
  return pts;
}

function zoneFromFile(id) {
  const src = fs.readFileSync(ZONES_PATH, "utf8");
  const at = src.indexOf(`id: "${id}"`);
  if (at < 0) throw new Error(`port-zones.ts 裡沒有 id "${id}"`);
  // 只取到下一塊為止，不然會把後面的 ring 一起吃進來
  const next = src.indexOf('    id: "', at + 10);
  const chunk = src.slice(at, next < 0 ? src.length : next);
  const name = /name:\s*"([^"]+)"/.exec(chunk)?.[1] ?? id;
  const official = /official:\s*true/.test(chunk);
  const rs = chunk.indexOf("ring: [");
  if (rs < 0) throw new Error(`"${id}" 裡找不到 ring`);
  return { id, name, official, ring: parseRing(chunk.slice(rs)) };
}

function assertNotOfficial(z, allowed) {
  if (!z.official) return;
  if (allowed) {
    console.error(`⚠️ 「${z.name}」是 official 界線，靠 --official-ok 放行。容差請壓在 5 公尺。`);
    return;
  }
  console.error(`拒絕：「${z.name}」是 official 界線（地政局公告的四至，照 OSM 路網描的）。`);
  console.error("預設擋著，免得七塊一起被套下去。系統擁有者 2026-08-31 已授權對這塊拉直，");
  console.error("要做請明確加 --official-ok，容差用 5 不是 10（理由見本檔檔頭）。");
  process.exit(2);
}

/* ── 經緯度 ↔ 公尺（在這個尺度用等距投影就夠，誤差遠小於 1 公尺）── */
function projector(ring) {
  const lat0 = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const mPerLat = 111320;
  const mPerLng = 111320 * Math.cos((lat0 * Math.PI) / 180);
  return {
    to: ([la, ln]) => [ln * mPerLng, la * mPerLat],
    dist: (a, b) => Math.hypot((a[1] - b[1]) * mPerLng, (a[0] - b[0]) * mPerLat),
  };
}

/* ── 點到線段的距離（公尺）── */
function segDist(p, a, b) {
  const [px, py] = p, [ax, ay] = a, [bx, by] = b;
  const dx = bx - ax, dy = by - ay;
  const L2 = dx * dx + dy * dy;
  if (L2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / L2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/* ── Douglas–Peucker（開放折線）── */
function rdp(pts, tol) {
  if (pts.length < 3) return pts.slice();
  let far = 0, best = -1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = segDist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > far) { far = d; best = i; }
  }
  if (far <= tol) return [pts[0], pts[pts.length - 1]];
  return [...rdp(pts.slice(0, best + 1), tol).slice(0, -1), ...rdp(pts.slice(best), tol)];
}

/**
 * 閉合環的 RDP。
 *
 * ⚠️ 不能直接把整圈當一條折線丟進 rdp —— 起點是隨便哪一下點的，
 *    從那裡切會讓結果隨起點而變，而且起點附近的轉角會被硬留下來。
 *    做法是先找**距離最遠的兩點**當錨，把環拆成兩條折線各自簡化再接回去。
 */
function rdpRing(xy, tol) {
  let ia = 0, ib = 0, far = -1;
  for (let i = 0; i < xy.length; i++)
    for (let j = i + 1; j < xy.length; j++) {
      const d = Math.hypot(xy[i][0] - xy[j][0], xy[i][1] - xy[j][1]);
      if (d > far) { far = d; ia = i; ib = j; }
    }
  const c1 = xy.slice(ia, ib + 1);
  const c2 = [...xy.slice(ib), ...xy.slice(0, ia + 1)];
  return [...rdp(c1, tol).slice(0, -1), ...rdp(c2, tol).slice(0, -1)];
}

/* ── 幾何檢查 ── */
function area(xy) {
  let a = 0;
  for (let i = 0, j = xy.length - 1; i < xy.length; j = i++)
    a += xy[j][0] * xy[i][1] - xy[i][0] * xy[j][1];
  return Math.abs(a) / 2;
}
function crosses(p1, p2, p3, p4) {
  const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}
function selfIntersections(xy) {
  const n = xy.length;
  let k = 0;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      if (crosses(xy[i], xy[(i + 1) % n], xy[j], xy[(j + 1) % n])) k++;
    }
  return k;
}
/** 簡化後的線離「原本每一個點」最遠多少公尺 —— 這才是他實際看到的位移 */
function maxShift(orig, kept) {
  let m = 0;
  for (const p of orig) {
    let best = Infinity;
    for (let i = 0; i < kept.length; i++)
      best = Math.min(best, segDist(p, kept[i], kept[(i + 1) % kept.length]));
    m = Math.max(m, best);
  }
  return m;
}

/* ── 主流程 ── */
const zoneId = arg("zone");
const file = arg("file");
const tols = (arg("tol", "20") ?? "20").split(",").map((s) => +s.trim()).filter((n) => n > 0);

let src;
if (zoneId) {
  src = zoneFromFile(zoneId);
  assertNotOfficial(src, process.argv.includes("--official-ok"));
} else {
  const text = file ? fs.readFileSync(file, "utf8") : fs.readFileSync(0, "utf8");
  src = { id: "(貼上的)", name: arg("name", "(貼上的)"), official: false, ring: parseRing(text) };
}

const proj = projector(src.ring);
const xy0 = src.ring.map(proj.to);
const a0 = area(xy0);
const si0 = selfIntersections(xy0);

console.log(`${src.name}：原始 ${src.ring.length} 點、面積 ${(a0 / 1e4).toFixed(1)} 公頃、自我交叉 ${si0} 處`);
if (si0 > 0) console.log("⚠️ 原始資料就有自我交叉，先修那個再拉直，不然結果不可信");
console.log("");
console.log("容差 | 點數 | 刪掉 | 實際最大位移 | 面積 | 面積變化 | 自交");
console.log("-----|------|------|--------------|------|----------|-----");

const results = [];
for (const tol of tols) {
  const kept = rdpRing(xy0, tol);
  const idx = kept.map((p) => xy0.findIndex((q) => q[0] === p[0] && q[1] === p[1]));
  const ring = idx.map((i) => src.ring[i]);
  const a1 = area(kept);
  results.push({ tol, ring, kept });
  console.log(
    `${String(tol).padStart(4)}m | ${String(kept.length).padStart(4)} | ` +
      `${String(xy0.length - kept.length).padStart(4)} | ` +
      `${maxShift(xy0, kept).toFixed(1).padStart(9)} m | ` +
      `${(a1 / 1e4).toFixed(1).padStart(4)}ha | ` +
      `${(((a1 - a0) / a0) * 100 >= 0 ? "+" : "") + (((a1 - a0) / a0) * 100).toFixed(2).padStart(6)}% | ` +
      `${selfIntersections(kept)}`
  );
}

/**
 * 逐段報告：拉直後的每一條邊「吃掉」了原本幾個點、那些點離這條邊最遠多少。
 *
 * ## 這才是決定容差的依據，不是那個數字本身
 *
 * 2026-08-31 學到的：系統擁有者沿一條**直路**點 21 下，那 21 點離兩端連線最遠
 * 只有 13 公尺、平均 5 公尺 —— 全部是手抖加上四位小數的格子（約 11x10 公尺）。
 * 這種情況下容差開 5 公尺**反而是把雜訊留下來**（那一段還剩 9 折），畫面就是他說的
 * 「歪七扭八」。開到 10 公尺才變成一條直線，而且離他的點最遠也只有 9 公尺 ——
 * **比他自己的點誤差還小，等於比原線更貼近那條路。**
 *
 * 所以判準是：**看每一段吃掉的那些點是不是本來就落在一條直線上**。
 *   ・最大偏離 <= 他的點誤差（格子 11 公尺上下） → 那條路是直的，可以併成一段
 *   ・明顯更大 → 那條路真的有彎，容差要降下來，不要把彎抹掉
 */
function runReport(orig, kept) {
  const idx = kept.map((p) => orig.findIndex((q) => q[0] === p[0] && q[1] === p[1]));
  const rows = [];
  for (let k = 0; k < kept.length; k++) {
    const a = idx[k], b = idx[(k + 1) % kept.length];
    const run = a <= b ? orig.slice(a, b + 1) : [...orig.slice(a), ...orig.slice(0, b + 1)];
    const A = kept[k], B = kept[(k + 1) % kept.length];
    const off = run.map((p) => segDist(p, A, B));
    rows.push({ i: k + 1, n: run.length, len: Math.hypot(A[0] - B[0], A[1] - B[1]),
                max: Math.max(...off), avg: off.reduce((x, y) => x + y, 0) / off.length });
  }
  return rows;
}
// 只指定一個容差才吐 ring —— 給了一串是在比較，不該讓人以為可以直接貼
if (results.length === 1) {
  const { tol, ring } = results[0];
  console.log("");
  console.log(`// 拉直：${src.ring.length} → ${ring.length} 點（Douglas–Peucker，容差 ${tol} 公尺）`);
  console.log("ring: [");
  for (const [la, ln] of ring) console.log(`      [${la}, ${ln}],`);
  console.log("    ],");

  const rows = runReport(xy0, results[0].kept);
  console.log("");
  console.log("逐段：吃掉幾點 | 這段多長 | 那些點離這段最遠／平均 | 判讀");
  for (const r of rows)
    console.log(
      `  #${String(r.i).padStart(2)} | ${String(r.n).padStart(3)} 點 | ${r.len.toFixed(0).padStart(5)}m | ` +
        `${r.max.toFixed(1).padStart(5)}m ／ ${r.avg.toFixed(1)}m | ` +
        (r.max <= 14 ? "直的，併成一段沒問題" : "⚠️ 這段可能真的有彎，容差要降")
    );
  console.log("");
  console.log("⚠️ 有任何一段標了 ⚠️，不要用這個容差 —— 那是把真正的轉彎抹掉了。");
}

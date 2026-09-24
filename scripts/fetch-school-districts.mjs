/**
 * 抓臺中市政府教育局「學區查詢」的整張表，解析成 public/data/school-districts.json。
 *
 *   npm run fetch:school
 *
 * 那一頁的「學校類型」篩選是伺服器端做的（?school_attr_id=…），所以分四次抓，
 * 國小／國中／中小學／完全中學（國中部）就不用靠校名猜。
 * 里名用 src/data/taichung-villages.json（官方村里界）比對，對不上的會印在最後，
 * 要先看過再 commit —— 對不上通常是公告打了異體字，補進 school-district.ts 的變體表即可。
 *
 * 需要 Node 22 以上（--experimental-strip-types 直接載入 TS）。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseSchoolRow } from "../src/lib/school-district.ts";

const SOURCE = "https://www.tc.edu.tw/page/02b0fa2f-7dda-404f-b411-8286cd97c9c1";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0";
const TYPES = [
  { id: "2", level: "elementary" },
  { id: "1", level: "junior" },
  { id: "6", level: "both" },
  { id: "other", level: "junior" },
];

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

function decode(s) {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n");
}

const ROW_RE =
  /<tr>\s*<td data-th="行政區">([^<]*)<\/td>\s*<td data-th="學校名稱"[^>]*>([\s\S]*?)<\/td>\s*<td data-th="學區劃分"[^>]*>([\s\S]*?)<\/td>/g;

async function fetchRows() {
  const rows = [];
  for (const t of TYPES) {
    const res = await fetch(`${SOURCE}?school_attr_id=${t.id}`, { headers: { "user-agent": UA } });
    if (!res.ok) throw new Error(`school_attr_id=${t.id}: HTTP ${res.status}`);
    const html = await res.text();
    let n = 0;
    for (const m of html.matchAll(ROW_RE)) {
      rows.push({ district: decode(m[1]), name: decode(m[2]), level: t.level, text: decode(m[3]) });
      n++;
    }
    console.log(`type ${t.id} (${t.level}): ${n} rows`);
    if (n === 0) throw new Error(`type ${t.id} 抓到 0 列，教育局頁面可能改版了`);
  }
  return rows;
}

const villages = JSON.parse(readFileSync(here("../src/data/taichung-villages.json"), "utf8"));
const rows = await fetchRows();

const schools = [];
for (const row of rows) schools.push(...parseSchoolRow(row, villages));

const data = {
  source: SOURCE,
  fetchedAt: new Date().toISOString().slice(0, 10),
  schools,
  villages,
};
writeFileSync(here("../public/data/school-districts.json"), JSON.stringify(data, null, 1), "utf8");

// ── 報告 ──
const byLevel = { elementary: 0, junior: 0 };
let zoneCount = 0;
const warnings = [];
for (const s of schools) {
  byLevel[s.level]++;
  zoneCount += s.zones.length;
  for (const w of s.warnings) warnings.push(`${s.district}｜${s.shortName}（${s.level}）：${w}`);
}
console.log(`\n學校 ${schools.length} 筆（國小 ${byLevel.elementary}／國中 ${byLevel.junior}），里 ${zoneCount} 筆`);
console.log(`已寫入 public/data/school-districts.json`);
if (warnings.length > 0) {
  console.log(`\n⚠️ 警告 ${warnings.length} 條（先看過再 commit）：`);
  for (const w of warnings) console.log("  - " + w);
}

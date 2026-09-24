/**
 * 門牌 → 里鄰 —— 讓不知道自己在哪個里的客戶，打路名（或整條地址）就能查學區。
 *
 * 資料：臺中市政府民政局「GIS 門牌號碼」開放資料（每月一版、約 130 萬筆門牌，每筆有村里＋鄰）。
 * scripts/build-address-index.mjs 把它壓成：
 *   public/data/addr/index.json        每區的路名清單（自動完成用，~100KB）
 *   public/data/addr/<區>.json          該區每條路、每條巷弄的門牌 → 里鄰（客戶選了路才抓那一區）
 *
 * 壓法：同一條路（或巷弄）的門牌先分單雙號，各自照號碼排序，連續號碼的「里鄰集合」完全一樣的併成一段，
 * 集合裡每個里鄰各出一條 [起號, 迄號, 里索引, 鄰]。查的時候把蓋到那個號碼的段全部收回來就是答案；
 * 沒有任何一段蓋到（資料裡沒那個門牌）就取最近的一段，並標成「推算」請客戶再確認。
 *
 * ⚠️ 只有主數字算：「12之3號」「12號五樓之2」都當 12 號。同一個門牌常常有好幾個鄰
 *    （整棟大樓不同樓層編在不同鄰），偶爾還跨兩個里（門牌整編中），所以答案是「集合」不是一個值。
 */

export const ADDR_INDEX_URL = "/data/addr/index.json";
export const addrDistrictUrl = (district: string): string => `/data/addr/${encodeURIComponent(district)}.json`;

/** [起號, 迄號, 里索引, 鄰] */
export type Run = [number, number, number, number];

export interface AddrEntry {
  /** 單號 */
  o: Run[];
  /** 雙號 */
  e: Run[];
}

/** 一條路：key "" 是路本身，其餘是「12巷」「12巷3弄」 */
export type AddrRoad = Record<string, AddrEntry>;

export interface AddrDistrictFile {
  li: string[];
  roads: Record<string, AddrRoad>;
}

export interface AddrIndex {
  /** 例：「115年1月」 */
  month: string;
  districts: Record<string, string[]>;
}

/* ───────────────────────── 正規化 ───────────────────────── */

/** 全形數字／字母 → 半形，臺 → 台，去空白。索引的 key 與客戶打的字都走這一條 */
export function normAddr(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[臺]/g, "台")
    .replace(/\s+/g, "")
    .replace(/[－—–‐]/g, "-");
}

const DISTRICT_RE = /^(?:台中市|台中縣|台中)?\s*([一-鿿]{1,2}區)/;

export interface ParsedQuery {
  district: string | null;
  /** 去掉市、區之後的字 */
  rest: string;
}

/** 「台中市梧棲區中央路一段100號」→ {district:"梧棲區", rest:"中央路一段100號"} */
export function splitDistrict(query: string, districts: readonly string[]): ParsedQuery {
  const q = normAddr(query);
  const m = DISTRICT_RE.exec(q);
  if (m && districts.includes(m[1])) return { district: m[1], rest: q.slice(m[0].length) };
  const stripped = q.replace(/^(?:台中市|台中縣|台中)/, "");
  return { district: null, rest: stripped };
}

export interface HouseParts {
  lane: string;
  no: number | null;
  /** 路名之後、巷弄號之前多出來的字（例：打錯的段） */
  leftover: string;
}

/** 「100巷5弄12之3號5樓」→ {lane:"100巷5弄", no:12}；「12之1巷3號」的巷是「12之1巷」 */
export function parseHouse(tail: string): HouseParts {
  let s = normAddr(tail).replace(/(\d)-(\d)/g, "$1之$2");
  let lane = "";
  const laneM = /(\d+(?:之\d+)?)巷/.exec(s);
  if (laneM) {
    lane = `${laneM[1]}巷`;
    s = s.slice(laneM.index + laneM[0].length);
    const alleyM = /^(\d+(?:之\d+)?)弄/.exec(s);
    if (alleyM) {
      lane += `${alleyM[1]}弄`;
      s = s.slice(alleyM[0].length);
    }
  } else {
    const alleyM = /(\d+(?:之\d+)?)弄/.exec(s);
    if (alleyM) {
      lane = `${alleyM[1]}弄`;
      s = s.slice(alleyM.index + alleyM[0].length);
    }
  }
  const noM = /(\d+)(?:之\d+)*\s*號?/.exec(s);
  const no = noM ? Number(noM[1]) : null;
  const leftover = laneM || noM ? "" : s;
  return { lane, no: no != null && no >= 1 && no <= 99999 ? no : null, leftover };
}

/* ───────────────────────── 找路 ───────────────────────── */

export interface RoadRef {
  district: string;
  road: string;
}

export interface RoadHit extends RoadRef {
  /** 路名之後剩下的字（可能含巷弄號） */
  tail: string;
  /** true＝客戶打的字以這條路開頭（整條地址）；false＝只是包含 */
  prefix: boolean;
}

/**
 * 從客戶打的字找路。先看有沒有「整條地址」（字以某條路名開頭，取最長的），
 * 沒有再找路名包含這些字的（自動完成）。
 */
export function findRoads(index: AddrIndex, query: string, limit = 12): RoadHit[] {
  const { district, rest } = splitDistrict(query, Object.keys(index.districts));
  const text = rest.trim();
  if (!text) return [];
  const districts = district ? [district] : Object.keys(index.districts);
  const prefixHits: RoadHit[] = [];
  const containHits: RoadHit[] = [];
  for (const d of districts) {
    for (const road of index.districts[d] ?? []) {
      const key = normAddr(road);
      if (text.startsWith(key)) prefixHits.push({ district: d, road, tail: text.slice(key.length), prefix: true });
      else if (key.includes(text) || key.replace(/[一二三四五六七八九十]段$/, "").includes(text)) {
        containHits.push({ district: d, road, tail: "", prefix: false });
      }
    }
  }
  // 整條地址：最長的路名最可信（「中央路一段」贏過「中央路」）
  prefixHits.sort((a, b) => b.road.length - a.road.length || a.district.localeCompare(b.district, "zh-Hant"));
  containHits.sort(
    (a, b) =>
      Number(normAddr(b.road).startsWith(text)) - Number(normAddr(a.road).startsWith(text)) ||
      a.road.length - b.road.length ||
      a.road.localeCompare(b.road, "zh-Hant"),
  );
  return [...prefixHits, ...containHits].slice(0, limit);
}

/* ───────────────────────── 門牌 → 里鄰 ───────────────────────── */

export interface ResolvedHit {
  li: string;
  /** 這個門牌在這個里的鄰（大樓常常不只一個） */
  lins: number[];
}

export interface Resolved {
  district: string;
  /** 通常只有一個里；門牌整編中的可能兩個 */
  hits: ResolvedHit[];
  /** true＝資料裡有這個門牌；false＝用最近的門牌推算 */
  exact: boolean;
  /** 推算時拿來比的門牌 */
  nearestNo: number | null;
  /** 巷弄找不到、退回用路本身查 */
  laneFallback: boolean;
}

export interface Candidate {
  li: string;
  /** 這條路（巷）在這個里有幾段門牌，多的排前面 */
  weight: number;
}

function runsOf(entry: AddrEntry | undefined): Run[] {
  return entry ? [...entry.o, ...entry.e] : [];
}

/** 這條路（或巷弄）經過哪些里 */
export function candidatesFor(file: AddrDistrictFile, road: string, lane: string): Candidate[] {
  const r = file.roads[road];
  if (!r) return [];
  const weights = new Map<number, number>();
  const bump = (runs: Run[]) => {
    for (const run of runs) weights.set(run[2], (weights.get(run[2]) ?? 0) + (run[1] - run[0] + 1));
  };
  if (lane && r[lane]) bump(runsOf(r[lane]));
  else if (lane) {
    // 巷弄沒有獨立資料：整條路的都算
    for (const entry of Object.values(r)) bump(runsOf(entry));
  } else {
    for (const entry of Object.values(r)) bump(runsOf(entry));
  }
  return [...weights.entries()]
    .map(([idx, weight]) => ({ li: file.li[idx], weight }))
    .sort((a, b) => b.weight - a.weight || a.li.localeCompare(b.li, "zh-Hant"));
}

interface Picked {
  runs: Run[];
  exact: boolean;
  nearest: number;
  dist: number;
}

/** 蓋到 no 的所有段；一段都沒有就取離 no 最近的那個號碼所在的段 */
function pickRuns(runs: Run[], no: number): Picked | null {
  const covering = runs.filter((run) => no >= run[0] && no <= run[1]);
  if (covering.length > 0) return { runs: covering, exact: true, nearest: no, dist: 0 };
  let nearest: number | null = null;
  let dist = Infinity;
  for (const run of runs) {
    const edge = no < run[0] ? run[0] : run[1];
    const d = Math.abs(no - edge);
    if (d < dist) {
      dist = d;
      nearest = edge;
    }
  }
  if (nearest == null) return null;
  const at = nearest;
  return { runs: runs.filter((run) => at >= run[0] && at <= run[1]), exact: false, nearest: at, dist };
}

function toHits(file: AddrDistrictFile, runs: Run[]): ResolvedHit[] {
  const byLi = new Map<number, Set<number>>();
  for (const run of runs) {
    if (!byLi.has(run[2])) byLi.set(run[2], new Set());
    byLi.get(run[2])!.add(run[3]);
  }
  return [...byLi.entries()].map(([li, lins]) => ({ li: file.li[li], lins: [...lins].sort((a, b) => a - b) }));
}

/** 門牌 → 里鄰。回 null 表示這條路在資料裡完全沒有門牌 */
export function resolveHouse(
  file: AddrDistrictFile,
  district: string,
  road: string,
  lane: string,
  no: number,
): Resolved | null {
  const r = file.roads[road];
  if (!r) return null;
  let entry = lane ? r[lane] : r[""];
  let laneFallback = false;
  if (!entry) {
    if (!lane) return null;
    // 「12巷3弄」沒有就退到「12巷」，再退到路本身
    const laneOnly = /^\d+(?:之\d+)?巷/.exec(lane)?.[0];
    entry = (laneOnly && r[laneOnly]) || r[""];
    laneFallback = true;
    if (!entry) return null;
  }
  const same = no % 2 === 1 ? entry.o : entry.e;
  const other = no % 2 === 1 ? entry.e : entry.o;
  let picked = pickRuns(same, no);
  // 這一側完全沒門牌（單邊有房子的路）、或最近的門牌離很遠，就看另一側有沒有更近的
  if (!picked || (!picked.exact && picked.dist > 20)) {
    const alt = pickRuns(other, no);
    if (alt && (!picked || alt.dist < picked.dist)) picked = alt;
  }
  if (!picked) return null;
  return {
    district,
    hits: toHits(file, picked.runs),
    exact: picked.exact && !laneFallback,
    nearestNo: picked.exact ? null : picked.nearest,
    laneFallback,
  };
}

/** 這條路有哪些巷弄（給下拉用），照數字排 */
export function lanesOf(file: AddrDistrictFile, road: string): string[] {
  const r = file.roads[road];
  if (!r) return [];
  const num = (s: string) => s.split(/[巷弄]/).filter(Boolean).map(Number);
  return Object.keys(r)
    .filter((k) => k !== "")
    .sort((a, b) => {
      const x = num(a);
      const y = num(b);
      for (let i = 0; i < Math.max(x.length, y.length); i++) {
        const d = (x[i] ?? -1) - (y[i] ?? -1);
        if (d !== 0) return d;
      }
      return 0;
    });
}

/**
 * 垃圾車查詢（/garbage）的規則 —— 純函式，前台畫面與 scripts/ 的建置、驗收共用。
 *
 * 資料兩份，都是政府開放資料（政府資料開放授權條款第 1 版）：
 *   ① 臺中市政府環境保護局「臺中市定時定點垃圾收運地點」：每個收運點的行政區、里、車牌、地址、
 *      沿街／定點、週一到週日各自的垃圾與資源回收時間。**沒有座標**（環保局在資料集留言回覆過不提供）。
 *   ② 臺中市政府民政局「GIS 門牌號碼」：每個門牌的經緯度。拿它替 ① 的地址定位，
 *      也讓客戶打的地址能換成座標（不用 Google）。
 *
 * scripts/build-garbage.mjs 把兩份壓成：
 *   public/data/garbage/meta.json          抓取日期、筆數、定位成功率
 *   public/data/garbage/grid.json          0.01 度的格子 → 這格裡有哪些行政區（決定要抓哪幾區的收運點）
 *   public/data/garbage/stops/<區>.json    這一區的收運點（座標＋一週時間）
 *   public/data/garbage/geo/<區>.json      這一區每條路、每條巷弄的「門牌號 → 座標」（客戶選了路才抓）
 *
 * ⚠️ 收運點的座標是「用地址對門牌」推出來的，不是環保局給的；對不到門牌的點沒有座標（ll 為 null），
 *    那些只會在「同一條路」的文字比對裡出現，不會出現在「附近」。
 * ⚠️ 時間是環保局排定的表定時間，實際會受天候、車流、節日影響 —— 畫面上一律講「表定」。
 */

/**
 * 跟 lib/address-index.ts 的 normAddr 同一條規則（全形→半形、臺→台、去空白）。
 * 這裡自己寫一份：scripts/ 是用 node 直接跑 .ts，lib 之間互相 import 要寫副檔名、tsc 又不准，乾脆不相依。
 */
export function normAddr(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[臺]/g, "台")
    .replace(/\s+/g, "")
    .replace(/[－—–‐]/g, "-");
}

export const GARBAGE_META_URL = "/data/garbage/meta.json";
export const GARBAGE_GRID_URL = "/data/garbage/grid.json";
export const garbageStopsUrl = (district: string): string => `/data/garbage/stops/${encodeURIComponent(district)}.json`;
export const garbageGeoUrl = (district: string): string => `/data/garbage/geo/${encodeURIComponent(district)}.json`;

/** 環保局資料集頁（給客戶看出處） */
export const GARBAGE_SOURCE_URL = "https://opendata.taichung.gov.tw/search/7bb28898-6971-4f9b-972e-6e28edf52a56";

/* ───────────────────────── 檔案格式 ───────────────────────── */

/** 0＝沿街（車子經過，要在路邊等）、1＝定點（車子停一段時間） */
export type StopKind = 0 | 1;

/**
 * 一個收運點的一班車：
 * [地址原文, 里索引, 車牌索引, 沿街／定點, 緯度×1e5 或 null, 經度×1e5 或 null, 垃圾時間, 回收時間]
 *
 * 時間是 7 欄（週一…週日）用逗號接起來的字串，每欄是 ""（不收）、"1735"（那一刻）或 "1735-1750"（一段時間）。
 * 回收時間跟垃圾時間一模一樣時存數字 1，整週都不收回收存 0。
 */
export type StopRow = [string, number, number, StopKind, number | null, number | null, string, string | 0 | 1];

export interface StopsFile {
  li: string[];
  cars: string[];
  stops: StopRow[];
}

/** 路 → 巷弄（"" 是路本身）→ 攤平的 [號, 緯度×1e5, 經度×1e5, 號, …]，照號碼排 */
export interface GeoFile {
  roads: Record<string, Record<string, number[]>>;
}

export interface GridFile {
  districts: string[];
  /** key「經度格,緯度格」（各是 floor(度×100)）→ 行政區索引 */
  cells: Record<string, number[]>;
}

export interface GarbageMeta {
  /** 抓環保局資料的日期 YYYY-MM-DD */
  fetched: string;
  /** 門牌資料的月份，例「115年1月」 */
  doorsMonth: string;
  stops: number;
  located: number;
}

/* ───────────────────────── 地址正規化 ───────────────────────── */

const CN = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

/** 1–99 → 國字（「5」→「五」、「12」→「十二」、「20」→「二十」）；其他原樣還回去 */
export function toChineseNumber(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 99) return String(n);
  if (n < 10) return CN[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return (tens === 1 ? "" : CN[tens]) + "十" + (ones ? CN[ones] : "");
}

/**
 * 環保局的地址把路名裡的數字打成阿拉伯數字（「崇德5路」「文昌路3段」），門牌資料是國字（崇德五路、文昌路三段）。
 * 只換「緊接著 路／街／段／村／鄰 以外」會誤傷門牌，所以只認後面是 路、街、段 的那一個數字。
 */
export function chineseOrdinals(s: string): string {
  return s.replace(/(\d{1,2})(?=[路街段])/g, (m) => toChineseNumber(Number(m)));
}

/** 收運點地址：去括號備註（「(四收)」「(二四)」）、去開頭的里名、數字路名換國字 */
export function normCaption(caption: string, village = ""): string {
  let s = normAddr(caption).replace(/\([^)]*\)/g, "").replace(/（[^）]*）/g, "");
  const v = normAddr(village);
  if (v && s.startsWith(v) && s.length > v.length) s = s.slice(v.length);
  return chineseOrdinals(s);
}

/** 在一串路名裡找「這段字以哪條路開頭」，取最長的。找不到回 null */
export function longestRoadPrefix(text: string, roads: Iterable<string>): string | null {
  let best: string | null = null;
  for (const road of roads) {
    if (road.length > (best?.length ?? 0) && text.startsWith(road)) best = road;
  }
  return best;
}

/* ───────────────────────── 門牌 → 座標 ───────────────────────── */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Located extends LatLng {
  /**
   * exact＝這條路（巷弄）有這個號碼前後的門牌，位置是內插出來的；
   * near＝號碼超出資料範圍，用最近的門牌；
   * lane＝巷弄在資料裡沒有，改用巷口（路上同號的位置）；
   * road＝沒給號碼，用這條路門牌的中間點。
   */
  how: "exact" | "near" | "lane" | "road";
  /** 號碼超出這條路門牌範圍多少號（範圍內是 0）。差很多表示這個位置不可信 */
  gap: number;
}

function pointAt(flat: number[], i: number): LatLng {
  return { lat: flat[i * 3 + 1] / 1e5, lng: flat[i * 3 + 2] / 1e5 };
}

/** 在一條 [號,緯,經,…] 上找 no 的位置：兩個門牌之間照號碼比例內插，超出頭尾就貼在頭尾（gap＝超出幾號） */
export function interpolate(flat: number[], no: number): { at: LatLng; gap: number } | null {
  const n = flat.length / 3;
  if (n < 1) return null;
  if (no <= flat[0]) return { at: pointAt(flat, 0), gap: flat[0] - no };
  if (no >= flat[(n - 1) * 3]) return { at: pointAt(flat, n - 1), gap: no - flat[(n - 1) * 3] };
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (flat[mid * 3] <= no) lo = mid;
    else hi = mid;
  }
  const a = flat[lo * 3];
  const b = flat[hi * 3];
  const t = b === a ? 0 : (no - a) / (b - a);
  const p = pointAt(flat, lo);
  const q = pointAt(flat, hi);
  return { at: { lat: p.lat + (q.lat - p.lat) * t, lng: p.lng + (q.lng - p.lng) * t }, gap: 0 };
}

/** 「39巷5弄」→ 39；「5弄」→ 5；「紅竹巷」→ null */
function laneNumber(lane: string): number | null {
  const m = /^(\d+)/.exec(lane);
  return m ? Number(m[1]) : null;
}

/**
 * 路名之後的字 → 巷弄＋號。
 * 先拿這條路在資料裡真的有的巷弄去比（最長的贏），這樣「紅竹巷13號」「日新巷79弄1號」這種
 * **有名字的巷子**才認得出來（門牌資料把它們記在巷那一欄：中山路＋紅竹巷）；
 * 比不到再照「12巷3弄」的樣子拆。號碼一定要緊接在巷弄後面 ——
 * 「與福星路1號」「（公園）號」這種不是門牌，回 no=null，不要從後面的字裡撈數字。
 */
export function splitTail(lanes: Record<string, unknown> | undefined, tail: string): { lane: string; no: number | null } {
  let s = normAddr(tail).replace(/(\d)-(\d)/g, "$1之$2");
  let lane = "";
  for (const key of Object.keys(lanes ?? {})) {
    if (key && key.length > lane.length && s.startsWith(key)) lane = key;
  }
  if (lane) s = s.slice(lane.length);
  else {
    const m = /^(?:\d+(?:之\d+)?巷)?(?:\d+(?:之\d+)?弄)?/.exec(s);
    const named = /^[^\d號]{1,8}?巷(?:\d+(?:之\d+)?弄)?/.exec(s);
    lane = m && m[0] ? m[0] : named ? named[0] : "";
    s = s.slice(lane.length);
  }
  // 「39巷」在資料裡、但「39巷5弄」不在：弄先拿掉，不要把 5 當成門牌號
  const alley = /^\d+(?:之\d+)?弄/.exec(s);
  if (alley) {
    lane += alley[0];
    s = s.slice(alley[0].length);
  }
  const noM = /^(\d+)/.exec(s);
  const no = noM ? Number(noM[1]) : null;
  return { lane, no: no != null && no >= 1 && no <= 99999 ? no : null };
}

/**
 * 路＋巷弄＋號 → 座標。回 null＝定不出來（寧可不定位，也不要給一個差很遠的點）。
 * 數字巷弄找不到時退一層（「12巷3弄」→「12巷」→ 路上的 12 號，也就是巷口）；有名字的巷子找不到就是找不到。
 * 沒有號碼時回這條路（巷弄）門牌的中間那一點（how＝road，只給「客戶只打路名」用）。
 */
export function locate(file: GeoFile, road: string, lane: string, no: number | null): Located | null {
  const r = file.roads[road];
  if (!r) return null;
  let flat: number[] | undefined = lane ? r[lane] : r[""];
  let viaLane = false;
  let target = no;
  if (!flat && lane) {
    viaLane = true;
    const laneOnly = /^\d+(?:之\d+)?巷/.exec(lane)?.[0];
    if (laneOnly && laneOnly !== lane && r[laneOnly]) flat = r[laneOnly];
    else if (r[""] && laneNumber(lane) != null) {
      // 巷口：路上跟巷子同號的門牌
      flat = r[""];
      target = laneNumber(lane);
    }
  }
  if (!flat) {
    if (lane || no != null) return null;
    // 只打路名、而這條路本身沒有門牌（只有巷弄有）：拿門牌最多的那條巷弄
    flat = Object.values(r).sort((a, b) => b.length - a.length)[0];
    if (!flat) return null;
  }
  if (target == null) {
    const mid = pointAt(flat, Math.floor(flat.length / 3 / 2));
    return { ...mid, how: "road", gap: 0 };
  }
  const got = interpolate(flat, target);
  if (!got) return null;
  return { ...got.at, how: viaLane ? "lane" : got.gap === 0 ? "exact" : "near", gap: got.gap };
}

/* ───────────────────────── 距離與格子 ───────────────────────── */

/** 兩點直線距離（公尺） */
export function distanceM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const cellKey = (lng: number, lat: number): string => `${Math.floor(lng * 100)},${Math.floor(lat * 100)}`;

/** 這個位置附近（自己那格＋周圍八格，約一公里）有哪些行政區 —— 要抓哪幾區的收運點 */
export function districtsNear(grid: GridFile, at: LatLng): string[] {
  const cx = Math.floor(at.lng * 100);
  const cy = Math.floor(at.lat * 100);
  const seen = new Set<number>();
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (const i of grid.cells[`${cx + dx},${cy + dy}`] ?? []) seen.add(i);
    }
  }
  return [...seen].map((i) => grid.districts[i]);
}

/* ───────────────────────── 一週時間 ───────────────────────── */

/** 週一＝0 … 週日＝6（環保局欄位 d1…d7 的順序） */
export const DAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"] as const;

export interface DaySlot {
  /** 「17:35」 */
  start: string;
  /** 跟 start 一樣就是「那一刻經過」 */
  end: string;
}

const hhmm = (s: string): string => `${s.slice(0, 2)}:${s.slice(2, 4)}`;

/** 把 "1735,1725-1740,,…" 解回 7 天；不收的那天是 null */
export function decodeWeek(code: string): Array<DaySlot | null> {
  const parts = code.split(",");
  const out: Array<DaySlot | null> = [];
  for (let d = 0; d < 7; d++) {
    const p = parts[d] ?? "";
    if (!/^\d{4}(-\d{4})?$/.test(p)) {
      out.push(null);
      continue;
    }
    const [s, e] = p.split("-");
    out.push({ start: hhmm(s), end: hhmm(e ?? s) });
  }
  return out;
}

/** 建置時用：把 7 天的起訖壓成字串。start 空白＝那天不收 */
export function encodeWeek(days: ReadonlyArray<{ start: string; end: string }>): string {
  return days
    .map(({ start, end }) => {
      const s = start.replace(":", "");
      const e = end.replace(":", "");
      if (!/^\d{4}$/.test(s)) return "";
      return /^\d{4}$/.test(e) && e !== s ? `${s}-${e}` : s;
    })
    .join(",");
}

export const slotText = (slot: DaySlot): string => (slot.end === slot.start ? slot.start : `${slot.start}–${slot.end}`);

export const minutesOf = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/* ───────────────────────── 附近的收運點 ───────────────────────── */

/** 一班車（同一個地點可能一天來兩班、或兩台車各來一次） */
export interface Visit {
  car: string;
  kind: StopKind;
  garbage: Array<DaySlot | null>;
  recycle: Array<DaySlot | null>;
}

/** 一個地點：同一個行政區、同一個地址的班次併在一起 */
export interface Place {
  district: string;
  li: string;
  caption: string;
  at: LatLng | null;
  /** 離查詢位置幾公尺；沒座標的是 null */
  distance: number | null;
  visits: Visit[];
}

export function rowToVisit(file: StopsFile, row: StopRow): Visit {
  const garbage = decodeWeek(row[6]);
  const recycle = row[7] === 1 ? garbage : row[7] === 0 ? decodeWeek("") : decodeWeek(row[7]);
  return { car: file.cars[row[2]] ?? "", kind: row[3], garbage, recycle };
}

/** 把幾區的收運點併成「地點」清單，算好離 origin 的距離（origin 給 null 就不算） */
export function buildPlaces(files: ReadonlyArray<{ district: string; file: StopsFile }>, origin: LatLng | null): Place[] {
  const byKey = new Map<string, Place>();
  for (const { district, file } of files) {
    for (const row of file.stops) {
      const key = `${district}|${row[0]}`;
      let place = byKey.get(key);
      if (!place) {
        const at = row[4] != null && row[5] != null ? { lat: row[4] / 1e5, lng: row[5] / 1e5 } : null;
        place = {
          district,
          li: file.li[row[1]] ?? "",
          caption: row[0],
          at,
          distance: at && origin ? distanceM(origin, at) : null,
          visits: [],
        };
        byKey.set(key, place);
      }
      place.visits.push(rowToVisit(file, row));
    }
  }
  return [...byKey.values()];
}

/** 預設找多遠（公尺）。走路五分鐘左右 */
export const NEAR_RADIUS_M = 400;
/** 400 公尺內一個都沒有時，最遠放寬到這裡，並在畫面上講明 */
export const FAR_RADIUS_M = 1500;
/** 清單最多列幾個地點 */
export const MAX_PLACES = 12;

export interface NearResult {
  places: Place[];
  /** true＝400 公尺內沒有，列的是比較遠的 */
  widened: boolean;
}

/** 離 origin 最近的幾個地點（只算有座標的） */
export function nearestPlaces(places: readonly Place[]): NearResult {
  const withDist = places.filter((p): p is Place & { distance: number } => p.distance != null);
  withDist.sort((a, b) => a.distance - b.distance);
  const near = withDist.filter((p) => p.distance <= NEAR_RADIUS_M);
  if (near.length > 0) return { places: near.slice(0, MAX_PLACES), widened: false };
  return { places: withDist.filter((p) => p.distance <= FAR_RADIUS_M).slice(0, 3), widened: true };
}

/** 沒座標、但地址寫在同一條路上的地點（定位不到的收運點只能這樣找回來） */
export function unlocatedOnRoad(places: readonly Place[], district: string, road: string): Place[] {
  const key = normAddr(road);
  return places.filter((p) => p.at == null && p.district === district && normCaption(p.caption, p.li).includes(key));
}

/* ───────────────────────── 今天幾點 ───────────────────────── */

export interface NextVisit {
  /** 0＝今天、1＝明天 … */
  inDays: number;
  /** 週一＝0 */
  day: number;
  slot: DaySlot;
  recycle: boolean;
}

/**
 * 這個地點接下來最近的一班垃圾車。
 * @param day 今天星期幾（週一＝0）
 * @param nowMin 現在是今天的第幾分鐘
 */
export function nextVisit(place: Place, day: number, nowMin: number): NextVisit | null {
  for (let ahead = 0; ahead < 8; ahead++) {
    const d = (day + ahead) % 7;
    let best: NextVisit | null = null;
    for (const v of place.visits) {
      const slot = v.garbage[d];
      if (!slot) continue;
      // 今天的：車還沒走才算（定點看結束時間）
      if (ahead === 0 && minutesOf(slot.end) < nowMin) continue;
      if (!best || minutesOf(slot.start) < minutesOf(best.slot.start)) {
        best = { inDays: ahead, day: d, slot, recycle: v.recycle[d] != null };
      }
    }
    if (best) return best;
  }
  return null;
}

/** 這個地點在星期 d 的所有班次，照時間排 */
export function visitsOn(place: Place, d: number): Array<{ slot: DaySlot; recycle: boolean; kind: StopKind; car: string }> {
  const out: Array<{ slot: DaySlot; recycle: boolean; kind: StopKind; car: string }> = [];
  for (const v of place.visits) {
    const slot = v.garbage[d];
    if (slot) out.push({ slot, recycle: v.recycle[d] != null, kind: v.kind, car: v.car });
  }
  return out.sort((a, b) => minutesOf(a.slot.start) - minutesOf(b.slot.start));
}

/** 台北時間的「星期幾（週一＝0）」與「第幾分鐘」。只在瀏覽器呼叫（頁面是靜態的，伺服器算的時間會過期） */
export function taipeiNow(now = new Date()): { day: number; minutes: number } {
  const t = new Date(now.getTime() + 8 * 3600 * 1000);
  return { day: (t.getUTCDay() + 6) % 7, minutes: t.getUTCHours() * 60 + t.getUTCMinutes() };
}

export function distanceText(m: number): string {
  if (m < 30) return "就在旁邊";
  if (m < 1000) return `約 ${Math.round(m / 10) * 10} 公尺`;
  return `約 ${(m / 1000).toFixed(1)} 公里`;
}

/* ───────────────────────── 社區名 ───────────────────────── */

export interface Community {
  name: string;
  /** 「梧棲區」這種給人看的位置 */
  area: string;
  lat: number;
  lng: number;
}

/** 社區名比對：去空白、全形轉半形；開頭符合的排前面 */
export function findCommunities(list: readonly Community[], query: string, limit = 8): Community[] {
  const q = normAddr(query);
  if (q.length < 2) return [];
  const hits = list.filter((c) => normAddr(c.name).includes(q));
  hits.sort(
    (a, b) =>
      Number(normAddr(b.name).startsWith(q)) - Number(normAddr(a.name).startsWith(q)) ||
      a.name.length - b.name.length ||
      a.name.localeCompare(b.name, "zh-Hant"),
  );
  return hits.slice(0, limit);
}

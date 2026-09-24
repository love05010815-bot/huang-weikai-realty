/**
 * 台中市國中小學區 —— 把教育局公告的「學區劃分」文字解析成查得到的結構。
 *
 * 資料來源：臺中市政府教育局「學區查詢」
 * https://www.tc.edu.tw/page/02b0fa2f-7dda-404f-b411-8286cd97c9c1
 * 抓取與解析由 scripts/fetch-school-districts.mjs 執行，結果存 public/data/school-districts.json
 * （前台用 fetch 拿，不打進 JS bundle；改完解析規則要跑 scripts/check-school-district.mjs）。
 *
 * 公告是 300 多所學校各自打的自由文字：括號有（）()【】﹝﹞〈〉、鄰有「1-5」「一至五」「１～５」、
 * 一個里可能只有幾個鄰、鄰內還可能再用某條路切一半。所以這裡的原則是：
 *
 *   1. 每個里的**原文一定保留**（`Zone.raw`），前台照原文顯示，解析出來的欄位只是輔助判讀。
 *   2. 解析只做「這個里是整里、部分鄰、還是有街道條件」＋「共同學區／自由學區」的旗標，
 *      不試圖把門牌條件算成答案 —— 那種只能請客戶對照門牌。
 *   3. 里名用官方村里界（src/data/taichung-villages.json）比對，抓不到的會列在警告裡，
 *      不會靜默消失。
 *
 * ⚠️ 學區每學年可能調整，重新抓資料只要跑 `npm run fetch:school`，這支不用改。
 */

export const DISTRICTS = [
  "中區",
  "東區",
  "南區",
  "西區",
  "北區",
  "北屯區",
  "西屯區",
  "南屯區",
  "豐原區",
  "后里區",
  "神岡區",
  "大雅區",
  "潭子區",
  "外埔區",
  "清水區",
  "梧棲區",
  "大甲區",
  "沙鹿區",
  "大安區",
  "龍井區",
  "大肚區",
  "石岡區",
  "烏日區",
  "新社區",
  "大里區",
  "和平區",
  "霧峰區",
  "太平區",
  "東勢區",
] as const;

export type District = (typeof DISTRICTS)[number];
export type SchoolLevel = "elementary" | "junior";
export type ZoneMode = "all" | "allExcept" | "part" | "cond";

/** 區 → 里名清單（官方村里界）。 */
export type VillageIndex = Record<string, string[]>;

export interface Zone {
  /** 行政區，含「區」 */
  district: string;
  /** 里名，含「里」，已正規化異體字 */
  li: string;
  /**
   * all＝整里；allExcept＝整里但 `excluded` 那幾鄰除外；
   * part＝只有 `lins`／`condLins` 列出的鄰；cond＝只寫了街道條件、沒有鄰
   */
  mode: ZoneMode;
  /** 明確納入的鄰（不含有條件的） */
  lins: number[];
  /** 有街道／門牌條件的鄰 */
  condLins: number[];
  /** 除外的鄰 */
  excluded: number[];
  /** 條件文字，例：「第20鄰：建德街以南」 */
  conds: string[];
  /** 共同學區（可選其中一校） */
  shared: boolean;
  /** 自由學區／可選擇就讀 */
  free: boolean;
  /** 這個里在公告裡的原文 */
  raw: string;
}

export interface School {
  id: string;
  /** 公告上的校名 */
  name: string;
  /** 短名，例：「梧棲國小」「中港高中」 */
  shortName: string;
  district: string;
  level: SchoolLevel;
  /** 整段公告原文 */
  raw: string;
  zones: Zone[];
  warnings: string[];
}

export interface SchoolDistrictData {
  source: string;
  fetchedAt: string;
  schools: School[];
  villages: VillageIndex;
}

/* ───────────────────────── 正規化 ───────────────────────── */

const CN_DIGITS: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

/** 一～九十九 → 數字；不是中文數字就回 null */
export function cnToNumber(s: string): number | null {
  if (!/^[一二三四五六七八九十]+$/.test(s)) return null;
  if (s === "十") return 10;
  const i = s.indexOf("十");
  if (i < 0) return s.length === 1 ? CN_DIGITS[s] : null;
  const tensPart = s.slice(0, i);
  const onesPart = s.slice(i + 1);
  if (tensPart.length > 1 || onesPart.length > 1) return null;
  const tens = tensPart === "" ? 1 : CN_DIGITS[tensPart];
  const ones = onesPart === "" ? 0 : CN_DIGITS[onesPart];
  if (tens == null || ones == null) return null;
  return tens * 10 + ones;
}

/**
 * 公告與官方村里界用字不一致的（兩邊都先換成同一個字再比對）：
 * 褔德里／福德里、公舘里／公館里、溝漧里／溝墘里、溪埧里／溪壩里、犁分里／犁份里、双龍里／雙龍里
 */
const CHAR_VARIANTS: Record<string, string> = { 褔: "福", 舘: "館", 漧: "墘", 壩: "埧", 份: "分", 雙: "双", 壳: "殼" };
const CHAR_VARIANT_RE = /[褔舘漧壩份雙壳]/g;

/** 整個里名對不上官方寫法的（跑過 fetch 之後從警告裡補） */
const NAME_VARIANTS: Record<string, string> = {};

const FULLWIDTH_ZERO = "０".charCodeAt(0);

export function normalizeText(input: string): string {
  let s = input.replace(/[０-９]/g, (c) => String(c.charCodeAt(0) - FULLWIDTH_ZERO));
  // 大里國小、岸裡國小那幾列的「里」是相容字（U+F9E9），長得一樣但跟一般的「里」（U+91CC）比對不到
  s = s.replace(/[豈-﫿]/g, (c) => c.normalize("NFKC"));
  s = s.replace(/[　\t]/g, " ");
  // 文心國小的「第l~8」是英文小寫 L
  s = s.replace(/第l(?=\s*[-－─—–~～至到\d])/g, "第1");
  // 中文數字只轉「後面接鄰／至／分隔符」的，三光里、十甲里這種名字不動
  s = s.replace(/([一二三四五六七八九十]{1,3})(?=\s*(?:鄰|至|到|、|．|\.|，|,|及|與|和|外|」|〉|】|\)|）))/g, (m) => {
    const n = cnToNumber(m);
    return n == null ? m : String(n);
  });
  s = s.replace(/[－─—–‐﹣~～]/g, "-");
  s = s.replace(/(\d)\s*[至到]\s*(\d)/g, "$1-$2");
  // 「4鄰-10鄰」「1鄰至25鄰」→「4-10鄰」
  s = s.replace(/(\d+)\s*鄰\s*[-至到]\s*(\d+)\s*鄰/g, "$1-$2鄰");
  // 鹿陽國小「1 4 鄰」＝ 14 鄰
  s = s.replace(/(?<![\d-])(\d)\s+(\d)(?=\s*鄰)/g, "$1$2");
  s = s.replace(/(\d)\s+鄰/g, "$1鄰");
  s = s.replace(/(\d)\s*-\s*(\d)/g, "$1-$2");
  return s;
}

/** 里名正規化：去空白、異體字、補「里」 */
export function normalizeLi(name: string): string {
  let n = name
    .replace(/\s/g, "")
    .replace(/[豈-﫿]/g, (c) => c.normalize("NFKC"))
    .replace(CHAR_VARIANT_RE, (c) => CHAR_VARIANTS[c]);
  if (!n.endsWith("里")) n += "里";
  return NAME_VARIANTS[n] ?? n;
}

export function shortSchoolName(name: string): string {
  let n = name.replace(/^(臺中市|台中市)/, "");
  for (const d of DISTRICTS) if (n.startsWith(d)) n = n.slice(d.length);
  return n
    .replace(/國民中小學$/, "國中小")
    .replace(/國民小學$/, "國小")
    .replace(/國民中學$/, "國中")
    .replace(/工業高中$/, "高工")
    .replace(/高級中學$/, "高中");
}

/* ───────────────────────── 切句 ───────────────────────── */

const LIST_PREFIX = /^\s*(?:[(（]\s*)?(?:\d{1,2}|[一二三四五六七八九十]{1,3})\s*[)）、.．]\s*/;
const BULLET = /^\s*[‧•※▪◆●*\-–—=]+\s*/;

function bracketBalance(s: string): number {
  let open = 0;
  for (const c of s) {
    if ("(（【﹝〈[".includes(c)) open++;
    else if (")）】﹞〉]".includes(c)) open--;
  }
  return open;
}

function shouldMerge(prev: string, line: string): boolean {
  if (/[、,，及與和：:]$/.test(prev)) return true;
  if (bracketBalance(prev) > 0) return true;
  if (/^[(（【﹝〈[]/.test(line)) return true;
  if (/^(第|全|\d)/.test(line)) return true;
  if (/里$/.test(prev)) return true;
  return false;
}

/** 松竹國小同時列了 113 與 114 學年度：只留最新那一段 */
function cutToLatestYear(lines: string[]): string[] {
  const headers: Array<{ i: number; y: number }> = [];
  lines.forEach((l, i) => {
    const m = /^(1\d\d)學年度\s*$/.exec(l.trim());
    if (m) headers.push({ i, y: Number(m[1]) });
  });
  if (headers.length < 2) return lines;
  const best = headers.reduce((a, b) => (b.y > a.y ? b : a));
  const next = headers.find((h) => h.i > best.i);
  return lines.slice(best.i + 1, next ? next.i : undefined);
}

function toSentences(text: string): string[] {
  const rawLines = text
    .split(/\n/)
    .map((l) => l.replace(BULLET, "").replace(LIST_PREFIX, "").trim())
    .filter((l) => l.length > 0);
  const merged: string[] = [];
  for (const line of cutToLatestYear(rawLines)) {
    const prev = merged[merged.length - 1];
    if (prev !== undefined && shouldMerge(prev, line)) {
      // 中文接中文不用空格（「中港高\n中國中部」是公告排版切開的）；接數字或括號才留一格
      const glue = /[一-鿿、，,；;：:（）()【】]$/.test(prev) && /^[一-鿿、，,；;：:（）()【】]/.test(line) ? "" : " ";
      merged[merged.length - 1] = `${prev}${glue}${line}`;
    } else merged.push(line);
  }
  return merged.flatMap((l) => l.split("。")).map((s) => s.trim()).filter((s) => s.length > 0);
}

/** 學校簡介、轉學須知這種句子，裡面就算有里名也不是學區（但只要句子裡有鄰的數字或「全里」就照常解析） */
const NOISE = /畢業|歡迎|申請|審查|校園|教學|戶口名簿|轉出入|學區國小為|資源教室|開車/;
const isNoise = (sentence: string): boolean => NOISE.test(sentence) && !/\d+鄰|全里|全部/.test(sentence);

/* ───────────────────────── 行政區與里名 ───────────────────────── */

const MULTI = DISTRICTS.filter((d) => d.length === 3).map((d) => d.slice(0, 2));
const DIST_RE = new RegExp(
  `(?:臺中市|台中市)?\\s*(?:行政區)?\\s*(?:(${MULTI.join("|")})\\s*區|([東南西北中])\\s*區)`,
  "g",
);
/** 「屬豐原區」「與沙鹿區竹林國小」這種是提到別區，不是切換行政區 */
const DIST_SKIP_BEFORE = "屬與往至到為及";

interface Tok {
  pos: number;
  end: number;
  kind: "district" | "li";
  name: string;
}

function findDistrictTokens(s: string): Tok[] {
  const out: Tok[] = [];
  for (const m of s.matchAll(DIST_RE)) {
    const before = m.index > 0 ? s[m.index - 1] : "";
    if (before !== "" && DIST_SKIP_BEFORE.includes(before)) continue;
    const name = `${m[1] ?? m[2]}區`;
    out.push({ pos: m.index, end: m.index + m[0].length, kind: "district", name });
  }
  return out;
}

const CJK = /[一-鿿]/;
/** 「里」後面接這些就不是里名結尾（大里路、后里區、里鄰、后里國小…） */
const NOT_LI_AFTER = "路街巷弄號段區里鄰國高";
const LI_BLACKLIST = new Set(["全", "各", "本", "該", "之", "同", "整", "此", "個", "里", "每", "以", "學", "鄰", "為", "含"]);

function districtAt(pos: number, districtToks: Tok[], fallback: string): string {
  let d = fallback;
  for (const t of districtToks) if (t.end <= pos) d = t.name;
  return d;
}

/** 官方村里界的查表：正規化後的名字 → 官方寫法（公告的「公館里」對得上官方的「公舘里」） */
interface Dict {
  byDistrict: Map<string, Map<string, string>>;
  byNorm: Map<string, Array<{ district: string; official: string }>>;
}

function buildDict(villages: VillageIndex): Dict {
  const byDistrict = new Map<string, Map<string, string>>();
  const byNorm = new Map<string, Array<{ district: string; official: string }>>();
  for (const [district, list] of Object.entries(villages)) {
    const m = new Map<string, string>();
    for (const official of list) {
      const norm = normalizeLi(official);
      m.set(norm, official);
      const arr = byNorm.get(norm) ?? [];
      arr.push({ district, official });
      byNorm.set(norm, arr);
    }
    byDistrict.set(district, m);
  }
  return { byDistrict, byNorm };
}

function findLiTokens(s: string, districtToks: Tok[], schoolDistrict: string, dict: Dict): Tok[] {
  const blank = s.split("");
  for (const t of districtToks) for (let i = t.pos; i < t.end; i++) blank[i] = " ";
  const text = blank.join("");
  const toks: Tok[] = [];
  const taken = new Array<boolean>(text.length).fill(false);

  for (let j = 0; j < text.length; j++) {
    if (text[j] !== "里") continue;
    const after = text[j + 1] ?? "";
    if (after !== "" && NOT_LI_AFTER.includes(after)) continue;
    const ctx = districtAt(j, districtToks, schoolDistrict);
    const local = dict.byDistrict.get(ctx) ?? new Map<string, string>();
    let picked: string | null = null;
    for (const len of [3, 2, 1]) {
      if (j - len < 0) continue;
      const cand = text.slice(j - len, j);
      if (![...cand].every((c) => CJK.test(c))) continue;
      // 一定要自己補「里」再正規化：大里里、新里里、后里里這種名字本身就以「里」結尾
      const li = normalizeLi(`${cand}里`);
      if (local.has(li) || dict.byNorm.has(li)) {
        picked = cand;
        break;
      }
    }
    if (picked === null) {
      // 官方名單裡沒有：退回兩個字，讓警告列出來
      const cand = text.slice(Math.max(0, j - 2), j);
      if ([...cand].every((c) => CJK.test(c)) && cand.length >= 1 && !LI_BLACKLIST.has(cand) && !LI_BLACKLIST.has(cand.slice(-1))) {
        picked = cand;
      }
    }
    if (picked === null || LI_BLACKLIST.has(picked)) continue;
    const pos = j - picked.length;
    toks.push({ pos, end: j + 1, kind: "li", name: normalizeLi(`${picked}里`) });
    for (let i = pos; i <= j; i++) taken[i] = true;
  }

  // 沒寫「里」字的（大業國中「溝墘 第1-13鄰」、協成國小「協成一鄰至三鄰」）：用官方名單找
  const bareFollow = /^(?:\s*[(（【第全]|\s*\d|\s*[一二三四五六七八九十]+鄰|\s+|$)/;
  for (let j = 0; j < text.length; j++) {
    if (taken[j] || !CJK.test(text[j])) continue;
    const before = j > 0 ? text[j - 1] : "";
    if (CJK.test(before) && before !== "區") continue;
    const ctx = districtAt(j, districtToks, schoolDistrict);
    const names = [...(dict.byDistrict.get(ctx)?.keys() ?? [])].map((v) => v.slice(0, -1)).filter((v) => v.length >= 2);
    for (const bare of names.sort((a, b) => b.length - a.length)) {
      if (!text.startsWith(bare, j)) continue;
      if (text[j + bare.length] === "里") continue;
      if (!bareFollow.test(text.slice(j + bare.length))) continue;
      let overlap = false;
      for (let i = j; i < j + bare.length; i++) if (taken[i]) overlap = true;
      if (overlap) continue;
      toks.push({ pos: j, end: j + bare.length, kind: "li", name: `${bare}里` });
      for (let i = j; i < j + bare.length; i++) taken[i] = true;
      break;
    }
  }
  return toks.sort((a, b) => a.pos - b.pos);
}

/* ───────────────────────── 里的尾巴 → 鄰 ───────────────────────── */

const COND_WORDS = /路|街|巷|弄|號|段|以北|以南|以東|以西|以上|以下|以內|以外|以前|以後|東側|西側|北側|南側|部分|部份|地區|單號|雙號|奇數|偶數|計畫道路|高速公路|支線|為界|米/;
const ALL_WORDS = /全里|全部|全區|各鄰|含全部之鄰|以上全部|[(（]\s*全\s*[)）]/;
const NOTE_WORDS = /共同學區|自由學區|可選擇|可選|亦得/;
const SEP = "[、,，.．\\s及與和]";
const LIST_CORE = `(?:\\d+(?:-\\d+)?(?:§\\d+§)*${SEP}*)+`;

function expandRange(item: string, out: number[]): void {
  const m = /^(\d+)(?:-(\d+))?$/.exec(item);
  if (!m) return;
  const a = Number(m[1]);
  const b = m[2] == null ? a : Number(m[2]);
  if (a < 1 || a > 99) return;
  if (b >= a && b - a <= 80) for (let n = a; n <= Math.min(b, 99); n++) out.push(n);
  else {
    out.push(a);
    if (b >= 1 && b <= 99) out.push(b);
  }
}

interface ParsedTail {
  mode: ZoneMode;
  lins: number[];
  condLins: number[];
  excluded: number[];
  conds: string[];
  shared: boolean;
  free: boolean;
}

const uniqSorted = (xs: number[]): number[] => [...new Set(xs)].sort((a, b) => a - b);

export function parseTail(tailIn: string): ParsedTail {
  const tail = tailIn.trim();
  const shared = /共同學區|共同/.test(tail);
  const free = /自由學區|可選擇|可選|亦得/.test(tail);
  const condTexts: string[] = [];

  // 1) 純條件的括號（沒有鄰、沒有全里）→ 換成標記，門牌數字才不會被當成鄰
  let work = tail;
  for (let round = 0; round < 6; round++) {
    const next = work.replace(/[(（【﹝〈[]([^()（）【】﹝﹞〈〉[\]]*)[)）】﹞〉\]]/g, (m, inner: string) => {
      if (/鄰/.test(inner) || ALL_WORDS.test(inner) || NOTE_WORDS.test(inner) || !COND_WORDS.test(inner)) return m;
      condTexts.push(inner.trim());
      return `§${condTexts.length - 1}§`;
    });
    if (next === work) break;
    work = next;
  }
  // 2) 「1鄰：復興路三段384巷…」冒號後面到括號結束都是條件
  work = work.replace(/(\d+鄰)\s*[：:﹕]\s*([^()（）【】﹝﹞〈〉[\]]+)/g, (m, lin: string, rest: string) => {
    condTexts.push(rest.trim());
    return `${lin}§${condTexts.length - 1}§`;
  });
  // 2b) 「(7、8鄰為自由學區)」「(24鄰與竹林國小共同學區)」是備註，裡面的鄰不是這個里的納入範圍；
  //     「(第24-31鄰，與中教大實小共同學區)」只丟掉備註那一截
  work = work.replace(/[(（【﹝〈[]([^()（）【】﹝﹞〈〉[\]]*)[)）】﹞〉\]]/g, (m, inner: string) => {
    if (!NOTE_WORDS.test(inner)) return m;
    const kept = inner
      .split(/[，,；;]/)
      .filter((clause) => !NOTE_WORDS.test(clause))
      .join("，")
      .trim();
    return kept ? `(${kept})` : " ";
  });

  // 3) 除外
  const excluded: number[] = [];
  const takeExcluded = (clause: string) => {
    for (const m of clause.matchAll(new RegExp(`(${LIST_CORE})[)）\\]】]?\\s*鄰?`, "g"))) {
      for (const item of m[1].split(/§\d+§|[、,，.．\s及與和]+/)) expandRange(item, excluded);
    }
  };
  work = work.replace(/([^，,；;(（【﹝〈[]*?)\s*除外/g, (m, clause: string) => {
    takeExcluded(clause);
    return " ";
  });
  work = work.replace(/不含\s*((?:\d+(?:-\d+)?[、,，.．\s及與和]*)+鄰?)/g, (m, clause: string) => {
    takeExcluded(clause);
    return " ";
  });
  work = work.replace(/除\s*((?:\d+(?:-\d+)?\s*鄰?[、,，.．\s及與和]*)+)外/g, (m, clause: string) => {
    takeExcluded(clause);
    return " ";
  });

  // 4) 納入的鄰
  const lins: number[] = [];
  const condLins: number[] = [];
  const conds: string[] = [];
  const listRe = new RegExp(`(${LIST_CORE})[)）\\]】]?\\s*鄰((?:§\\d+§)*)`, "g");
  const matches = [...work.matchAll(listRe)];
  const hasLinWord = /鄰/.test(work);

  /** 巢狀括號換成的 §n§ 還原回文字，並把換行留下的空白收掉 */
  const expand = (t: string): string => t.replace(/§(\d+)§/g, (_, i: string) => expand(condTexts[Number(i)] ?? ""));
  const tidy = (t: string): string =>
    expand(t)
      .replace(/\s+/g, " ")
      .replace(/([一-鿿、，,；;：:]) (?=[一-鿿、，,；;：:])/g, "$1")
      .trim();
  const condLabel = (nums: number[], text: string) => {
    const body = tidy(text);
    if (!body) return;
    const label = nums.length > 0 ? `第${uniqSorted(nums).join("、")}鄰：${body}` : body;
    if (!conds.includes(label)) conds.push(label);
  };

  matches.forEach((m, idx) => {
    const listNums: number[] = [];
    const itemCond: Array<{ nums: number[]; text: string }> = [];
    for (const piece of m[1].split(/([、,，.．\s及與和]+)/)) {
      const item = piece.trim();
      if (!item || /^[、,，.．\s及與和]+$/.test(item)) continue;
      const parts = item.split(/(§\d+§)/).filter(Boolean);
      const nums: number[] = [];
      expandRange(parts[0], nums);
      const markers = parts.slice(1).filter((p) => /^§\d+§$/.test(p));
      if (markers.length > 0) {
        for (const mk of markers) itemCond.push({ nums, text: condTexts[Number(mk.slice(1, -1))] });
      }
      listNums.push(...nums);
    }
    const listMarkers = (m[2].match(/§\d+§/g) ?? []).map((mk) => condTexts[Number(mk.slice(1, -1))]);
    const start = m.index + m[0].length;
    const stop = idx + 1 < matches.length ? matches[idx + 1].index : work.length;
    // 鄰後面到下一組數字之前的字；遇到括號就停（「進德路以東）為臺中國小…共同學區」只要前半）
    const following = work
      .slice(start, stop)
      .replace(/§\d+§/g, "")
      .split(/[()（）【】﹝﹞〈〉[\]]/)[0]
      .replace(/[、,，.．;；及與和\s]+$/g, "")
      .trim();
    const followingIsCond =
      following.length > 0 && COND_WORDS.test(following) && !NOTE_WORDS.test(following) && !/\d+鄰/.test(following);

    if (listMarkers.length > 0 || followingIsCond) {
      const text = [...listMarkers, ...(followingIsCond ? [following] : [])].join("；");
      condLabel(listNums, text);
      condLins.push(...listNums);
    } else {
      lins.push(...listNums);
    }
    for (const ic of itemCond) {
      condLabel(ic.nums, ic.text);
      condLins.push(...ic.nums);
      for (const n of ic.nums) {
        const k = lins.indexOf(n);
        if (k >= 0) lins.splice(k, 1);
      }
    }
  });

  // 5) 清水區那種括號裡只寫數字、連「鄰」字都沒有的
  if (!hasLinWord) {
    for (const m of work.matchAll(/[(（【]\s*((?:\d+(?:-\d+)?[、,，.．\s]*)+)\s*[)）】]/g)) {
      for (const item of m[1].split(/[、,，.．\s]+/)) expandRange(item, lins);
    }
  }

  // 6) 整個尾巴沒有任何鄰、只寫了條件（「中山路以東」「龍安地區」「中央路107號以前是大秀國小」）
  //    有鄰的話條件都掛在鄰上了（第 4 步），剩下的零碎字不再猜
  const leftover = matches.length > 0 ? "" : work
    .replace(/[(（【﹝〈[]\s*(?:\d+(?:-\d+)?[、,，.．\s]*)+\s*[)）】]/g, " ")
    .replace(/§(\d+)§/g, (_, i: string) => ` ${condTexts[Number(i)]} `);
  if (COND_WORDS.test(leftover) && !ALL_WORDS.test(leftover)) {
    const pieces = leftover
      .split(/[、,，;；]/)
      .map((p) => tidy(p.replace(/[()（）【】﹝﹞〈〉[\]]+/g, " ")))
      .filter((p) => COND_WORDS.test(p) && !NOTE_WORDS.test(p));
    for (const p of pieces) if (!conds.includes(p)) conds.push(p);
  }

  // 「2-10鄰，第5鄰甲后路以東」：5 同時在 2-10 裡，明講有條件的那個算數
  const finalCond = uniqSorted(condLins.filter((n) => !excluded.includes(n)));
  const finalLins = uniqSorted(lins.filter((n) => !excluded.includes(n) && !finalCond.includes(n)));
  const finalExcl = uniqSorted(excluded);

  let mode: ZoneMode;
  if (ALL_WORDS.test(tail)) mode = finalExcl.length > 0 ? "allExcept" : "all";
  else if (finalLins.length > 0 || finalCond.length > 0) mode = "part";
  else if (finalExcl.length > 0) mode = "allExcept";
  else if (conds.length > 0) mode = "cond";
  else mode = "all";

  return {
    mode,
    lins: mode === "all" || mode === "allExcept" ? [] : finalLins,
    condLins: mode === "all" || mode === "allExcept" ? [] : finalCond,
    excluded: finalExcl,
    conds,
    shared,
    free,
  };
}

/* ───────────────────────── 一所學校 ───────────────────────── */

export interface RawRow {
  district: string;
  name: string;
  level: SchoolLevel | "both";
  text: string;
}

function isPlainTail(tail: string): boolean {
  return /^[\s、,，.．;；及與和•‧:：]*$/.test(tail);
}

/** 里的原文：去掉尾巴的分隔符，還有因為切句留下、對不到開頭的右括號 */
function tidyRaw(text: string): string {
  let s = text.replace(/[\s、,，.．;；及與和•‧]+$/g, "").trim();
  const pairs: Record<string, string> = { "）": "（", ")": "(", "】": "【", "﹞": "﹝", "〉": "〈", "]": "[" };
  for (;;) {
    const last = s.slice(-1);
    const open = pairs[last];
    if (!open) break;
    const opens = s.split(open).length - 1;
    const closes = s.split(last).length - 1;
    if (closes <= opens) break;
    s = s.slice(0, -1).replace(/[\s、,，.．;；及與和•‧]+$/g, "");
  }
  return s;
}

function parseText(
  text: string,
  schoolDistrict: string,
  villages: VillageIndex,
  warnings: string[],
): Zone[] {
  const zones: Zone[] = [];
  const dict = buildDict(villages);
  /** 行政區是「往下都算這一區、直到換下一個標題」，所以要跨句記住 */
  let ctx = schoolDistrict;
  /** 上一個里最後歸到哪一區：同名里在好幾個區時，優先跟著前一個 */
  let lastResolved = schoolDistrict;
  /** 這所學校已經出現過的區：中正國小的「中正里」在北區／新社區／霧峰區都有，它前面已經有北區的淡溝里 */
  const usedDistricts = new Set<string>([schoolDistrict]);

  for (const sentence of toSentences(normalizeText(text))) {
    if (isNoise(sentence)) continue;

    // 新社高中：「除福興里及中和里龍安地區外，各里均為…」
    const complement = /除(.+?)外[，,]?\s*各里均/.exec(sentence);
    if (complement) {
      const listed = new Map<string, string>();
      for (const part of complement[1].split(/及|與|、|,|，/)) {
        const m = /^\s*([一-鿿]{1,3})里(.*)$/.exec(part);
        if (m) listed.set(normalizeLi(`${m[1]}里`), m[2].trim());
      }
      for (const li of villages[schoolDistrict] ?? []) {
        const qualifier = listed.get(li);
        if (qualifier === undefined) {
          zones.push({ district: schoolDistrict, li, mode: "all", lins: [], condLins: [], excluded: [], conds: [], shared: false, free: false, raw: `${li}（${sentence}）` });
        } else if (qualifier.length > 0) {
          zones.push({ district: schoolDistrict, li, mode: "cond", lins: [], condLins: [], excluded: [], conds: [`${qualifier}除外`], shared: false, free: false, raw: `${li}${qualifier}除外（${sentence}）` });
        }
      }
      continue;
    }

    const districtToks = findDistrictTokens(sentence);
    const sentenceCtx = ctx;
    if (districtToks.length > 0) ctx = districtToks[districtToks.length - 1].name;
    const liToks = findLiTokens(sentence, districtToks, sentenceCtx, dict);
    if (liToks.length === 0) continue;
    const toks = [...districtToks, ...liToks].sort((a, b) => a.pos - b.pos);

    // 句首的「【與永安國小共同學區】林厝里…」套到整句
    const leading = sentence.slice(0, toks[0].pos);
    const leadShared = /共同學區/.test(leading);
    const leadFree = /自由學區|可選擇/.test(leading);

    interface Seg {
      li: string;
      district: string;
      tail: string;
    }
    const segs: Seg[] = [];
    toks.forEach((t, i) => {
      if (t.kind !== "li") return;
      const stop = i + 1 < toks.length ? toks[i + 1].pos : sentence.length;
      segs.push({ li: t.name, district: districtAt(t.pos, districtToks, sentenceCtx), tail: sentence.slice(t.end, stop) });
    });

    // 「潭陽里、福仁里、栗林里、潭秀里中山路以東」「…南簡里(以上全部)」：條件掛在最後一個，套到整串。
    // 但「新東里.新庄里.…東海里(為四箴國中與福科國中共同學區)」這種備註只屬於最後那個里
    let runStart = -1;
    segs.forEach((seg, i) => {
      if (isPlainTail(seg.tail)) {
        if (runStart < 0) runStart = i;
        return;
      }
      const t = seg.tail;
      const spreads = !/\d/.test(t) && (ALL_WORDS.test(t) || (COND_WORDS.test(t) && !NOTE_WORDS.test(t)));
      if (runStart >= 0 && spreads) for (let k = runStart; k < i; k++) segs[k].tail = t;
      runStart = -1;
    });

    for (const seg of segs) {
      let district = seg.district;
      let official = dict.byDistrict.get(district)?.get(seg.li);
      if (official === undefined) {
        const others = dict.byNorm.get(seg.li) ?? [];
        const follow = others.find((o) => o.district === lastResolved);
        const used = others.filter((o) => usedDistricts.has(o.district));
        const pick = follow ?? (used.length === 1 ? used[0] : others.length === 1 ? others[0] : undefined);
        if (pick) {
          warnings.push(`${seg.li}：不在${district}，改歸${pick.district}`);
          district = pick.district;
          official = pick.official;
        } else {
          warnings.push(`${seg.li}：${district}的官方村里界找不到（${seg.tail.trim().slice(0, 30)}）`);
        }
      }
      lastResolved = district;
      usedDistricts.add(district);
      const parsed = parseTail(seg.tail);
      const raw = tidyRaw(`${seg.li}${seg.tail}`);
      zones.push({
        district,
        li: official ?? seg.li,
        ...parsed,
        shared: parsed.shared || leadShared,
        free: parsed.free || leadFree,
        raw,
      });
    }
  }
  return mergeDuplicateZones(zones);
}

/** 龍井國中把福田里寫了兩次（一次全里、一次註明共同學區）：範圍一樣就併成一筆，旗標取聯集 */
function mergeDuplicateZones(zones: Zone[]): Zone[] {
  const sameNums = (a: number[], b: number[]) => a.length === b.length && a.every((n, i) => n === b[i]);
  const out: Zone[] = [];
  for (const z of zones) {
    const dup = out.find(
      (m) =>
        m.district === z.district &&
        m.li === z.li &&
        m.mode === z.mode &&
        sameNums(m.lins, z.lins) &&
        sameNums(m.condLins, z.condLins) &&
        sameNums(m.excluded, z.excluded),
    );
    if (!dup) {
      out.push(z);
      continue;
    }
    dup.shared = dup.shared || z.shared;
    dup.free = dup.free || z.free;
    for (const c of z.conds) if (!dup.conds.includes(c)) dup.conds.push(c);
    if (!dup.raw.includes(z.raw)) dup.raw = `${dup.raw}／${z.raw}`;
  }
  return out;
}

export function parseSchoolRow(row: RawRow, villages: VillageIndex): School[] {
  const shortName = shortSchoolName(row.name);
  const make = (level: SchoolLevel, text: string): School => {
    const warnings: string[] = [];
    const zones = parseText(text, row.district, villages, warnings);
    if (zones.length === 0) warnings.push("解析不出任何里");
    return {
      id: `${level}:${row.district}:${row.name}`,
      name: row.name,
      shortName,
      district: row.district,
      level,
      raw: text.trim(),
      zones,
      warnings,
    };
  };
  if (row.level !== "both") return [make(row.level, row.text)];

  // 中小學：「國小：…」「國中部：…」各自一段
  const parts = row.text.split(/(國小部?|國中部?)\s*[：:]/);
  const out: School[] = [];
  for (let i = 1; i + 1 < parts.length; i += 2) {
    const level: SchoolLevel = parts[i].startsWith("國小") ? "elementary" : "junior";
    out.push(make(level, parts[i + 1]));
  }
  if (out.length === 0) out.push(make("elementary", row.text), make("junior", row.text));
  return out;
}

/* ───────────────────────── 查詢 ───────────────────────── */

export type LinStatus = "in" | "cond" | "excluded" | "out" | "unknown";

/** 這個鄰在這個里的學區範圍裡嗎？ */
export function linStatus(zone: Zone, lin: number | null): LinStatus {
  if (lin == null) return "unknown";
  if (zone.excluded.includes(lin)) return "excluded";
  if (zone.mode === "all" || zone.mode === "allExcept") return "in";
  if (zone.condLins.includes(lin)) return "cond";
  if (zone.lins.includes(lin)) return "in";
  if (zone.mode === "cond") return "cond";
  return "out";
}

export interface SchoolMatch {
  school: School;
  zones: Zone[];
}

/** 某區某里（可再加鄰）對到的學校，分國小／國中 */
export function schoolsForLi(
  schools: School[],
  district: string,
  li: string,
  lin: number | null = null,
): { elementary: SchoolMatch[]; junior: SchoolMatch[] } {
  const target = normalizeLi(li);
  const pick = (level: SchoolLevel): SchoolMatch[] =>
    schools
      .filter((s) => s.level === level)
      .map((s) => ({ school: s, zones: s.zones.filter((z) => z.district === district && z.li === target) }))
      .filter((m) => m.zones.length > 0)
      .filter((m) => lin == null || m.zones.some((z) => linStatus(z, lin) !== "out" && linStatus(z, lin) !== "excluded"))
      .sort((a, b) => rank(a, lin) - rank(b, lin) || a.school.shortName.localeCompare(b.school.shortName, "zh-Hant"));
  return { elementary: pick("elementary"), junior: pick("junior") };
}

/** 排序：整里的排前面，只有幾個鄰的排後面，共同學區再後面 */
function rank(m: SchoolMatch, lin: number | null): number {
  const best = Math.min(
    ...m.zones.map((z) => {
      if (lin != null) {
        const st = linStatus(z, lin);
        if (st === "in") return z.shared ? 1 : 0;
        if (st === "cond") return 2;
        return 4;
      }
      if (z.mode === "all" || z.mode === "allExcept") return z.shared ? 1 : 0;
      if (z.mode === "part") return z.shared ? 3 : 2;
      return 3;
    }),
  );
  return best;
}

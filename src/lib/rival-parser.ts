/**
 * 591 貼上內容辨識器 —— 給 /admin/compare（競品分析）用。
 *
 * 輸入：使用者在 591 物件詳情頁按 Ctrl+A / Ctrl+C 複製下來的整頁文字，
 *       可以一次貼很多筆，用每頁都有的「當前房屋（S…）」自動切開。
 *
 * 🔴 **這裡不會、也不准去 591 抓資料。** 591 服務條款明文禁止網路爬蟲與自動下載
 *    程式，違反者每一個刊登物件以 3,000 元計費求償。資料一律由使用者自己在瀏覽器
 *    複製後貼進來 —— 那是正常瀏覽，不是抓取。要加「輸入網址自動抓」的功能之前，
 *    先回頭看這段。
 *
 * ⚠️ **設計原則：一律用關鍵字比對定位，不准用「值在第幾行」。**
 *    瀏覽器複製出來的換行方式跟網頁的 innerText 不一樣 —— 剪貼簿常把值和標籤黏成
 *    同一行（`2房2廳1衛格局1年屋齡39.03坪(含車位)權狀坪數樓層19F/24F`）。
 *    2026-08-31 就是靠行號定位，害建坪／樓層／房數整批抓不到，而用 regex 的欄位
 *    （編號／開價／瀏覽數）全中。看到「這種對比」就是行號定位又跑出來了。
 */

export type ParkingKind = "平面" | "機械" | "有" | "無";

/**
 * 591 社區頁自己算好的「各房型在售幾間、價格帶多少」。
 *
 * 這是使用者最想要的那個數字（「同房型到底有幾間在跟我搶」），而且**不用去抓** ——
 * 它就印在每一頁的「社區資訊」區塊裡，Ctrl+A 全選時會一起複製進來。
 *
 * ⚠️ **同一段裡的「坪數範圍」不要抓。** 591 那幾個數字在複製時順序會被打散
 *    （`5162坪` 其實是 `~51~62坪` 之類），抓了會給出錯的坪數。只有「間數」與
 *    「價格帶」是完整可信的。
 */
export interface RoomTypeStat {
  /** 房數，例如「二房」→ 2 */
  rooms: number;
  /** 原文標籤，例如「二房」 */
  label: string;
  /** 該房型在售幾間 */
  count: number;
  /** 價格帶下緣（萬） */
  low: number | null;
  /** 價格帶上緣（萬） */
  high: number | null;
}

export interface RivalRow {
  /** 原始貼上的那一段，診斷報告要用 */
  raw: string;
  /** 砍掉推薦物件雜訊後的前半段 */
  head: string;
  /** 591 物件編號，例如 S20795527 */
  id: string;
  title: string;
  community: string;
  price: number | null;
  /** 591 頁面自己顯示的單價，拿來跟我們算的對帳，不是拿來當答案 */
  unit591: number | null;
  area: number | null;
  areaInclParking: boolean;
  floor: number | null;
  totalFloor: number | null;
  layout: string;
  rooms: number | null;
  ageText: string;
  age: number | null;
  /** 電梯大樓／公寓／華廈／透天厝／別墅… */
  buildingType: string;
  parking: ParkingKind;
  /** 車位價已含在開價與建坪裡（決定單價能不能跟別戶直接比） */
  parkingInPrice: boolean;
  parkingRaw: string;
  views: number | null;
  agency: string;
  communityListings: number | null;
  communityNew: number | null;
  communityOwner: number | null;
  communityCuts: number | null;
  communityViews: number | null;
  /** 591 社區頁自己算好的各房型在售間數與價格帶 */
  roomTypes: RoomTypeStat[];

  /** 開價 ÷ 建坪，四捨五入到小數第一位 */
  unit: number | null;
  warn: string[];

  /* ---- 以下由畫面端填 ---- */
  isSelf: boolean;
  groupId: number;
  groupSize: number;
  isDupFollower: boolean;
  /** 開價一致 → 高信心是同一戶 */
  dupHighConf: boolean;
  dupPriceGap: number | null;
  /** 要不要併成同一戶（使用者可以改） */
  merge: boolean;
}

/* ---------------- 小工具 ---------------- */

const FULLWIDTH_DIGITS = "０１２３４５６７８９";

/** 全形數字轉半形、去掉千分位逗號，再抓出第一個數字。 */
export function toNum(s: unknown): number | null {
  if (s == null) return null;
  const norm = String(s)
    .replace(/[０-９．]/g, (c) => {
      const i = FULLWIDTH_DIGITS.indexOf(c);
      return i >= 0 ? String(i) : ".";
    })
    .replace(/,/g, "");
  const m = norm.match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

/**
 * 社區名稱正規化。
 * ⚠️ 591 同一個社區在不同欄位會用異體字（標題「聯悅臻」、欄位「聯悦臻」），
 *    不統一的話去重會整組失效。
 */
const VARIANT_MAP: Record<string, string> = {
  悦: "悅",
  峯: "峰",
  塲: "場",
  爲: "為",
  衆: "眾",
};
export function normCommunity(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/[\s　]/g, "")
    .replace(/[悦峯塲爲衆]/g, (c) => VARIANT_MAP[c] ?? c);
}

/** 把 591 那種「標籤 \n ： \n 值」壓成「標籤：值」。 */
function normalizeColons(text: string): string {
  return text.replace(/\n?[ \t]*[：:][ \t]*\n[ \t]*/g, "：");
}

function tryPatterns(text: string, patterns: RegExp[]): RegExpMatchArray | null {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m;
  }
  return null;
}
function firstNum(text: string, patterns: RegExp[]): number | null {
  const m = tryPatterns(text, patterns);
  return m ? toNum(m[1]) : null;
}
function firstStr(text: string, patterns: RegExp[]): string | null {
  const m = tryPatterns(text, patterns);
  return m ? String(m[1]).trim() : null;
}

/**
 * 砍掉「屋況特色」之後的推薦物件雜訊 —— 那些也有「◯◯萬」「◯◯坪」「◯◯萬/坪」，
 * 不砍一定會抓錯。
 * ⚠️ 砍點必須落在「開價」後面一段距離，否則會把格局／屋齡／坪數／樓層一起砍掉。
 */
const CUT_MARKERS = ["屋況特色", "買房知識", "相似物件", "搶手物件", "附近搶手物件"];
function cutHead(text: string): string {
  const pm = text.match(/[\d,]+(?:\.\d+)?\s*萬元/);
  const floor = pm && pm.index != null ? pm.index + 400 : 400;

  let cut = text.length;
  for (const marker of CUT_MARKERS) {
    const p = text.indexOf(marker);
    if (p > floor && p < cut) cut = p;
  }
  return text.slice(0, cut);
}

/**
 * 「社區資訊」那一小塊。
 * ⚠️ 一定要先切出區塊再抓，不能整頁搜 —— 頁面後段的「熱門社區推薦」有
 *    「近期有 375 人瀏覽」，整頁搜會抓到別的社區的數字。
 */
function communityBlock(full: string): string {
  let i = full.indexOf("熱賣物件");
  if (i < 0) i = full.indexOf("社區資訊");
  if (i < 0) return "";
  return full.slice(i, i + 400);
}

/**
 * 房型分佈那一段比上面那塊長（每個房型後面跟著被打散的坪數數字），
 * 所以另外切一塊，收到「實價登錄」為止 —— 再往後就是成交紀錄，
 * 那裡的「坪數：60.1坪／總價：1,553萬」會汙染價格帶。
 */
function roomTypeBlock(full: string): string {
  let i = full.indexOf("熱賣物件");
  if (i < 0) i = full.indexOf("社區資訊");
  if (i < 0) return "";
  let end = full.indexOf("實價登錄", i);
  if (end < 0 || end - i > 900) end = i + 900;
  return full.slice(i, end);
}

const CN_DIGITS: Record<string, number> = {
  一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};
function roomsToNum(s: string): number | null {
  if (/^[0-9]+$/.test(s)) return parseInt(s, 10);
  return CN_DIGITS[s] ?? null;
}

/**
 * 抓「二房(93間) … 780~1,198 萬」這種成對的資料。
 * 每個房型的價格帶只在「這個房型到下一個房型之間」找，不會跨段抓錯。
 */
export function parseRoomTypes(full: string): RoomTypeStat[] {
  const block = roomTypeBlock(full);
  if (!block) return [];

  const re = /([一二三四五六七八九十兩]|[0-9]{1,2})\s*房\s*[（(]\s*([\d,]+)\s*間\s*[)）]/g;
  const hits: { rooms: number; label: string; count: number; from: number; at: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const rooms = roomsToNum(m[1]);
    const count = toNum(m[2]);
    if (rooms == null || count == null) continue;
    hits.push({ rooms, label: `${m[1]}房`, count, at: m.index, from: m.index + m[0].length });
  }

  return hits.map((h, k) => {
    const end = k + 1 < hits.length ? hits[k + 1].at : block.length;
    const seg = block.slice(h.from, end);
    const range = seg.match(/([\d,]+)\s*[~～-]\s*([\d,]+)\s*萬/);
    const single = range ? null : seg.match(/([\d,]+)\s*萬\s*起?/);
    return {
      rooms: h.rooms,
      label: h.label,
      count: h.count,
      low: range ? toNum(range[1]) : single ? toNum(single[1]) : null,
      high: range ? toNum(range[2]) : null,
    };
  });
}

/**
 * 型態（電梯大樓／別墅／公寓…）。
 *
 * ⚠️ 不能只寫 `/型態：(.{2,8})/`。剪貼簿把整段黏成一行時是
 * `型態：電梯大樓車位：7.9坪`，那個 regex 會連下一個標籤一起吞成「電梯大樓車位」。
 * 591 的型態是固定下拉選單，所以先比白名單最準；比不到才退回「greedy + 往前看
 * 下一個標籤」，最後才是換行版。
 */
const BUILDING_TYPES = [
  "電梯大樓", "住宅大樓", "商業大樓", "透天厝", "別墅", "公寓", "華廈", "套房",
  "店面", "辦公", "廠房", "倉庫", "土地", "農舍", "車位", "其他",
];
function parseBuildingType(full: string): string {
  const white = new RegExp(`[型類]態[：:]\\s*(${BUILDING_TYPES.join("|")})`);
  return (
    firstStr(full, [
      white,
      // 黏成一行時：貪婪吃到底，再往前看「下一個標籤」把多吃的吐回來
      /[型類]態[：:]\s*([一-龥]{2,8})(?=[一-龥]{2,4}[：:])/,
      // 值自己一行時
      /[型類]態[：:]\s*([^\n：:]{2,8})/,
    ]) ?? ""
  );
}

/* ---------------- 單筆解析 ---------------- */

function parseOne(rawBlock: string): RivalRow {
  const full = normalizeColons(rawBlock);
  const head = cutHead(full);

  let id = firstStr(full, [/當前房屋[（(] *(S?[0-9]{5,}) *[)）]/]) ?? "";
  if (id && id[0] !== "S") id = "S" + id;

  const titleMatch = full.match(/當前房屋[（(] *S?[0-9]{5,} *[)）][ \t]*\n*([^\n]{2,60})/);

  const price = firstNum(head, [
    /([\d,]+(?:\.\d+)?)\s*萬元/,
    /總價[：:]?\s*([\d,]+(?:\.\d+)?)\s*萬/,
    /([\d,]+(?:\.\d+)?)\s*萬(?!\s*[/／])/,
  ]);

  const area = firstNum(head, [
    /權狀坪數[^0-9]{0,10}([\d.]+)\s*坪/,
    /([\d.]+)\s*坪[^0-9]{0,14}權狀坪數/,
    /([\d.]+)\s*坪\s*[（(]\s*含車位\s*[)）]/,
    /權狀\s*[：:]?\s*([\d.]+)\s*坪/,
  ]);

  // 樓層一定要有 F 或「樓」當標記，只認「數字/數字」會誤抓日期與單價
  const fm = tryPatterns(head, [
    /([0-9]{1,3})\s*[FfＦ]\s*[/／]\s*([0-9]{1,3})\s*[FfＦ]/,
    /([0-9]{1,3})\s*樓\s*[/／]\s*([0-9]{1,3})\s*樓/,
    /樓層[^0-9]{0,8}([0-9]{1,3})\s*[FfＦ樓]?\s*[/／]\s*([0-9]{1,3})/,
    /([0-9]{1,3})\s*[FfＦ樓]\s*[/／]\s*([0-9]{1,3})/,
  ]);

  // 房數一定要「房＋廳」成對，否則會抓到標題裡的行銷字（例如「可3房」）
  const lm = tryPatterns(head, [
    /([0-9]+\s*房\s*[0-9]+\s*廳\s*[0-9]+\s*衛[^\s\n]{0,6})/,
    /([0-9]+\s*房\s*[0-9]+\s*廳)/,
    /格局[^0-9]{0,6}([0-9]+\s*房[^\s\n]{0,10})/,
  ]);
  const layout = lm ? lm[1].trim() : "";

  const am = tryPatterns(head, [
    /([0-9.]+\s*年|[0-9]+\s*個月[內以內]{0,2}|新成屋|全新)\s*屋齡/,
    /屋齡[^0-9新全]{0,4}([0-9.]+\s*年|[0-9]+\s*個月[內以內]{0,2}|新成屋|全新)/,
    /屋齡[：:]?\s*([0-9.]+)/,
  ]);
  const ageText = am ? am[1].trim() : "";

  const parkingRaw =
    firstStr(full, [/車位[：:]\s*([^\n]{1,40})/, /車位[^：:\n]{0,4}\n\s*([^\n]{1,40})/]) ?? "";
  let parking: ParkingKind;
  if (/平面|坡道平面/.test(parkingRaw)) parking = "平面";
  else if (/機械|升降|昇降/.test(parkingRaw)) parking = "機械";
  else if (/坡道/.test(parkingRaw)) parking = "平面";
  else if (parkingRaw && !/無/.test(parkingRaw)) parking = "有";
  else parking = "無";

  const areaInclParking = /坪\s*[（(]\s*含車位\s*[)）]/.test(head);

  const cb = communityBlock(full);

  return {
    raw: rawBlock,
    head,
    id,
    title: titleMatch ? titleMatch[1].trim() : "",
    community:
      firstStr(full, [
        /本社區\s*[“"『「]([^”"』」\n]{1,30})[”"』」]/,
        /社區[：:]\s*([^\n：:]{1,30})/,
        /\n社區\n([^\n]{1,30})\n/,
      ]) ?? "",
    price,
    unit591: firstNum(head, [/([\d.]+)\s*萬\s*[/／]\s*坪/]),
    area,
    areaInclParking,
    floor: fm ? toNum(fm[1]) : null,
    totalFloor: fm ? toNum(fm[2]) : null,
    layout,
    rooms: toNum(layout.match(/([0-9]+)\s*房/)?.[1]) ?? firstNum(head, [/([0-9]+)\s*房\s*[0-9]+\s*廳/]),
    ageText,
    age: /個月|月內|新成屋|全新/.test(ageText) ? 0 : toNum(ageText),
    // ⚠️ 型態不是裝飾：同一個社區底下可能混著大樓與別墅，產品不同卻放在一起比單價、
    //    算瀏覽中位數，會把第三段與第四段的結論帶偏。
    buildingType: parseBuildingType(full),
    parking,
    parkingInPrice: /已含售金內|含車位|含於總價/.test(parkingRaw) || areaInclParking,
    parkingRaw,
    // ⚠️ 數字後面不准接「萬」。瀏覽人數空白時 \s* 會吃掉換行、抓到下一行的開價
    //    （698 萬元 → 瀏覽 698 → 判成「高於同社區」），整個判讀翻掉。
    //    ⚠️ 光寫 (?!\s*萬) 不夠：regex 會回溯，698 不行就退成 69（後面是 8 不是萬）。
    //    要再加 (?![\d,]) 逼它抓完整的數字。
    views: firstNum(full, [
      /瀏覽人數[：:]\s*([\d,]+)(?![\d,])(?!\s*萬)/,
      /瀏覽[人次數]{0,2}[：:]\s*([\d,]+)(?![\d,])(?!\s*萬)/,
      /瀏覽\s*([\d,]+)\s*次/,
    ]),
    // 同樣的黏成一行問題：先試「往前看下一個標籤」，再退回換行版
    agency:
      firstStr(full, [
        /所屬公司[：:]\s*(.{2,40}?)(?=[一-龥]{2,5}[：:]|\n|$)/,
        /經紀業名稱[：:]\s*(.{2,40}?)(?=[一-龥]{2,5}[：:]|\n|$)/,
        /經紀業[：:]\s*(.{2,40}?)(?=[一-龥]{2,5}[：:]|\n|$)/,
        /所屬公司[：:]\s*([^\n]{2,40})/,
        /經紀業名稱[：:]\s*([^\n]{2,40})/,
      ]) ?? "",
    communityListings: firstNum(cb, [/熱賣物件\s*\n?\s*([\d,]+)\s*\n?\s*間/, /熱賣物件[^0-9]{0,8}([\d,]+)/]),
    communityNew: firstNum(cb, [
      /近半個月上架\s*\n?\s*([\d,]+)\s*\n?\s*間/,
      /近半個月上架[^0-9]{0,8}([\d,]+)/,
      /半個月[^0-9]{0,8}([\d,]+)\s*間/,
    ]),
    communityOwner: firstNum(cb, [/屋主刊登\s*\n?\s*([\d,]+)\s*\n?\s*間/, /屋主刊登[^0-9]{0,8}([\d,]+)/]),
    communityCuts: firstNum(cb, [/降價\s*\n?\s*([\d,]+)\s*\n?\s*間/, /降價[^0-9]{0,8}([\d,]+)\s*間/]),
    communityViews: firstNum(cb, [/([\d,]+)\s*\n?\s*人瀏覽/]),
    roomTypes: parseRoomTypes(full),

    unit: null,
    warn: [],
    isSelf: false,
    groupId: 0,
    groupSize: 1,
    isDupFollower: false,
    dupHighConf: false,
    dupPriceGap: null,
    merge: false,
  };
}

/* ---------------- 多筆切割 ---------------- */

/**
 * 以含「當前房屋（S…）」的那一行為界切開；該行之前是 591 頁首導覽列，丟掉。
 * 同一個編號連續出現兩次時接回同一筆（頁面內重複出現過），不要拆成兩筆。
 */
function splitRecords(text: string): string[] {
  if (!text || !text.trim()) return [];
  const lines = text.split("\n");
  const re = /當前房屋[（(] *S?([0-9]{5,}) *[)）]/;
  const marks: { line: number; id: string }[] = [];
  lines.forEach((line, i) => {
    const m = line.match(re);
    if (m) marks.push({ line: i, id: m[1] });
  });
  if (marks.length === 0) return [text]; // 不是 591 整頁複製，整段當一筆

  const out: string[] = [];
  let lastId: string | null = null;
  marks.forEach((mark, k) => {
    const end = k + 1 < marks.length ? marks[k + 1].line : lines.length;
    const block = lines.slice(mark.line, end).join("\n");
    if (mark.id === lastId && out.length) out[out.length - 1] += "\n" + block;
    else {
      out.push(block);
      lastId = mark.id;
    }
  });
  return out;
}

export function parseMany(text: string): RivalRow[] {
  return splitRecords(text)
    .map(parseOne)
    .filter((r) => r.price != null || r.area != null);
}

/* ---------------- 單價與自我檢查 ---------------- */

/**
 * 單價 = 開價 ÷ 建坪，四捨五入到小數第一位。
 * 順便跟 591 頁面自己顯示的單價對帳 —— 對不上就代表開價或坪數抓錯了，
 * 這是唯一能在使用者按下按鈕前就攔住「靜默抓錯」的機制。
 */
export function computeUnit(r: RivalRow): RivalRow {
  if (r.price == null || !r.area) {
    r.unit = null;
    return r;
  }
  r.unit = Math.round((r.price / r.area) * 10) / 10;
  if (r.unit591 != null && Math.abs(r.unit - r.unit591) > 0.15) {
    r.warn.push(`我算的單價 ${r.unit} 跟 591 顯示的 ${r.unit591} 對不上，開價或坪數可能抓錯`);
  }
  return r;
}

/* ---------------- 組裝：本案 + 競品，先擋掉使用者手滑 ---------------- */

/**
 * 🔴 同一個 591 編號只能算一則。
 *   ① 本案不小心也貼進競品框 → 後面的去重會把自己跟自己合併，瀏覽數翻倍、變成「2 家刊登」
 *   ② 同一則在競品裡貼了兩次（不相鄰，splitRecords 接不回去）→ 一樣會被當成兩家在刊
 * 這兩種是手滑，不是市場資訊，直接丟掉並回報，讓畫面告訴使用者。
 * 放在這裡而不是畫面層，是為了讓 check:rival 測得到。
 */
export function assembleRows(mine: RivalRow[], rivals: RivalRow[]): { rows: RivalRow[]; dropped: string[] } {
  const self = mine.slice(0, 1);
  self.forEach((r) => (r.isSelf = true));

  const dropped: string[] = [];
  const seen = new Set(self.map((r) => r.id).filter(Boolean));
  const kept: RivalRow[] = [];
  for (const r of rivals) {
    r.isSelf = false;
    if (r.id && seen.has(r.id)) {
      dropped.push(
        self.some((s) => s.id === r.id)
          ? `${r.id} 跟「我的物件」是同一則刊登，已從競品裡拿掉（不然會自己跟自己比、瀏覽數翻倍）`
          : `${r.id} 在競品裡貼了兩次，只算一次`,
      );
      continue;
    }
    if (r.id) seen.add(r.id);
    kept.push(r);
  }
  const rows = self.concat(kept);
  detectDupes(rows);
  return { rows, dropped };
}

/* ---------------- 去重 ---------------- */

/**
 * 同社區 + 同樓層 + 建坪差 ≤ 0.5 坪 → 疑似同一戶。
 *
 * ⚠️ 條件成立**只代表疑似**，還要看開價：同一戶被多家刊登時開價通常一致；
 *    開價差很多，可能是其中一家降價了沒更新、車位拆賣，也可能根本是兩戶。
 *    所以開價一致才預設合併，不一致就標出來交給使用者判斷。
 */
const PRICE_TOL = 0.01; // 開價差 1% 以內視為一致
const AREA_TOL = 0.5; // 建坪差 0.5 坪以內視為同一戶

function samePrice(a: RivalRow, b: RivalRow): boolean {
  if (a.price == null || b.price == null) return false;
  const m = Math.max(a.price, b.price);
  return m > 0 && Math.abs(a.price - b.price) / m <= PRICE_TOL;
}

export function detectDupes(rows: RivalRow[]): RivalRow[] {
  const groups: RivalRow[][] = [];
  for (const r of rows) {
    let hit = -1;
    for (let g = 0; g < groups.length; g++) {
      const a = groups[g][0];
      if (
        normCommunity(a.community) &&
        normCommunity(a.community) === normCommunity(r.community) &&
        a.floor != null &&
        a.floor === r.floor &&
        a.area != null &&
        r.area != null &&
        Math.abs(a.area - r.area) <= AREA_TOL
      ) {
        hit = g;
        break;
      }
    }
    if (hit < 0) {
      groups.push([r]);
      r.groupId = groups.length - 1;
    } else {
      groups[hit].push(r);
      r.groupId = hit;
    }
  }
  for (const r of rows) {
    const lead = groups[r.groupId][0];
    r.groupSize = groups[r.groupId].length;
    r.isDupFollower = lead !== r;
    r.dupHighConf = r.isDupFollower ? samePrice(lead, r) : false;
    r.dupPriceGap =
      r.isDupFollower && r.price != null && lead.price != null ? Math.round(r.price - lead.price) : null;
    r.merge = r.isDupFollower && r.dupHighConf; // 開價對不上就不預設合併
  }
  return rows;
}

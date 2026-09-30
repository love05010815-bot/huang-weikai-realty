/**
 * 實價登錄開放資料的解析（純函式，不碰資料庫、不連網）。
 *
 * 資料來源：內政部「不動產交易實價查詢服務網」開放資料
 *   https://plvr.land.moi.gov.tw/DownloadOpenData
 *   - 本期 zip：  https://plvr.land.moi.gov.tw//Download?type=zip&fileName=lvr_landcsv.zip
 *   - 各季 zip：  https://plvr.land.moi.gov.tw//DownloadSeason?season=115S2&type=zip&fileName=lvr_landcsv.zip
 *   zip 裡每個縣市一組 CSV，臺中市的字首是 `b_`：
 *     b_lvr_land_a.csv 買賣、b_lvr_land_b.csv 預售屋、b_lvr_land_c.csv 租賃（租賃這站不用）。
 *   期程寫在 build_time.xml 的 <lvr_time>，例如
 *     「登記日期 115年9月1日至 115年9月10日之買賣案件，及…交易日期115年8月1日至 115年8月10日之預售屋案件」。
 *
 * ⚠️ 這份資料**每月 1、11、21 日**發布新一期，不是每天；每期是「登記日」十天一批，
 *    而成交到登記本身還有約一個月（登記後 30 日內申報）。所以畫面上寫「最新」指的是
 *    「內政部最新一期」，不要寫成「今天成交」。
 *
 * ⚠️ CSV 前兩行都是表頭（第 1 行中文、第 2 行英文），第一個字元有 BOM。
 * ⚠️ 日期是民國年 7 碼 `1150825`（民國 100 年以前是 6 碼），建築完成年月也是。
 * ⚠️ 「單價元平方公尺」官方已經扣掉車位（(總價－車位總價)／(建物面積－車位面積)），
 *    直接換成萬／坪即可，不要再自己扣一次。
 * ⚠️ 門牌用的是全形數字（２１號），要轉半形才好讀、好搜。
 *
 * zip 這裡自己拆（zlib.inflateRawSync），不另裝套件 —— 只需要讀兩個檔，
 * 中央目錄＋本地檔頭 60 行就夠，少一個相依就少一個 `npm ci` 之後的坑。
 */
import { inflateRawSync } from "node:zlib";

// ---------------------------------------------------------------- 常數

/** 服務範圍：台中海線四區。順序＝畫面分頁的順序。 */
export const LVR_DISTRICTS = ["梧棲區", "清水區", "沙鹿區", "龍井區"] as const;
export type LvrDistrict = (typeof LVR_DISTRICTS)[number];

export const LVR_CURRENT_ZIP_URL = "https://plvr.land.moi.gov.tw//Download?type=zip&fileName=lvr_landcsv.zip";
export function lvrSeasonZipUrl(season: string): string {
  if (!/^\d{3}S[1-4]$/.test(season)) throw new Error(`季別格式應為 115S2，收到：${season}`);
  return `https://plvr.land.moi.gov.tw//DownloadSeason?season=${season}&type=zip&fileName=lvr_landcsv.zip`;
}

/**
 * 「前期下載」清單（HTML 片段）：最近一季內每一旬的發布日與期程，
 * 每一旬用 `DownloadHistory?type=history&fileName=20260701` 下載（發布日當檔名；約 14MB）。
 * 本期同步靠它把漏掉的旬補回來 —— 例如上線那天季度 zip 還沒出、或某天同步沒跑成功。
 */
export const LVR_HISTORY_LIST_URL = "https://plvr.land.moi.gov.tw/DownloadHistory_ajax_list";
export function lvrHistoryZipUrl(publishDate: string): string {
  if (!/^\d{8}$/.test(publishDate)) throw new Error(`發布日格式應為 20260701，收到：${publishDate}`);
  return `https://plvr.land.moi.gov.tw//DownloadHistory?type=history&fileName=${publishDate}`;
}

export type LvrHistoryEntry = { publishDate: string; periodText: string };

/**
 * 解析「前期下載」清單。每一列長這樣：
 *   <span class="i_desc" desc="資料內容：登記日期 115年6月11日至 115年6月20日之買賣案件，…"> … downloadLast('20260701')
 * 回傳依發布日由舊到新排序；解析不到就回空陣列（呼叫端當「這次沒得補」，不是錯誤）。
 */
export function parseHistoryList(html: string): LvrHistoryEntry[] {
  const out: LvrHistoryEntry[] = [];
  const re = /desc="([^"]*)"[\s\S]*?downloadLast\('(\d{8})'\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html || ""))) {
    out.push({ publishDate: m[2], periodText: m[1].replace(/\s+/g, " ").replace(/^資料內容：/, "").trim() });
  }
  out.sort((a, b) => a.publishDate.localeCompare(b.publishDate));
  return out;
}

/** 臺中市在 zip 裡的檔名 */
export const TAICHUNG_FILES = {
  sale: "b_lvr_land_a.csv",
  presale: "b_lvr_land_b.csv",
  time: "build_time.xml",
} as const;

/** 1 平方公尺 = 0.3025 坪 */
export const PING_PER_M2 = 0.3025;

// ---------------------------------------------------------------- 型別

export type LvrKind = "sale" | "presale";

/** 一筆成交，欄位名對應資料表 lvr_deal（見 lvr.ts） */
export type LvrDeal = {
  /** 主鍵：編號（買賣若有移轉編號則接上 `-移轉編號`） */
  id: string;
  kind: LvrKind;
  district: string;
  /** 交易標的：房地(土地+建物)、房地(土地+建物)+車位、土地、車位、建物 */
  target: string;
  address: string;
  /** 交易日 ISO `YYYY-MM-DD` */
  dealDate: string;
  /** 移轉層次（原文，例：七層、全、一層，二層） */
  floor: string;
  /** 總樓層數（原文，例：十二層） */
  totalFloors: string;
  buildingType: string;
  mainUse: string;
  /** 建築完成年月 ISO `YYYY-MM`，沒有就 null（土地、預售） */
  builtYm: string | null;
  landAreaM2: number;
  buildingAreaM2: number;
  rooms: number;
  halls: number;
  baths: number;
  hasMgmt: boolean;
  hasElevator: boolean | null;
  totalPrice: number;
  /** 元／平方公尺（官方已扣車位），沒有就 null */
  unitPriceM2: number | null;
  parkingType: string;
  parkingAreaM2: number;
  parkingPrice: number;
  note: string;
  /** 預售屋才有 */
  projectName: string;
  unitNo: string;
  cancelled: string;
};

// ---------------------------------------------------------------- zip

const SIG_EOCD = 0x06054b50;
const SIG_CDIR = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

/**
 * 從 zip 取出指定檔名的內容。只支援一般 zip（deflate／stored），不支援 ZIP64、加密。
 * 找不到的檔名就不在回傳的 Map 裡，由呼叫端決定要不要當錯誤。
 */
export function unzipEntries(zip: Uint8Array, wanted: readonly string[]): Map<string, Uint8Array> {
  const buf = Buffer.from(zip.buffer, zip.byteOffset, zip.byteLength);
  // 從尾端往前找 End of Central Directory（zip 註解最長 65535）
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("不是 zip 檔（找不到中央目錄結尾）");
  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const want = new Set(wanted);
  const out = new Map<string, Uint8Array>();

  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(p) !== SIG_CDIR) throw new Error(`zip 中央目錄第 ${n} 筆簽章不對`);
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (!want.has(name)) continue;

    if (buf.readUInt32LE(localOffset) !== SIG_LOCAL) throw new Error(`zip 本地檔頭簽章不對：${name}`);
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compSize);
    if (method === 8) out.set(name, inflateRawSync(raw));
    else if (method === 0) out.set(name, Buffer.from(raw));
    else throw new Error(`zip 壓縮方式不支援（${method}）：${name}`);
  }
  return out;
}

// ---------------------------------------------------------------- CSV

/** 標準 CSV：逗號分隔、雙引號包住可含逗號與換行、`""` 是一個引號。回傳每列的欄位陣列。 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** 把 CSV 變成「中文欄名 → 值」的物件陣列。前兩行是中英文表頭。 */
export function csvRecords(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim());
  const out: Record<string, string>[] = [];
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    if (r.length <= 1 && (r[0] ?? "").trim() === "") continue;
    const rec: Record<string, string> = {};
    header.forEach((h, k) => (rec[h] = (r[k] ?? "").trim()));
    out.push(rec);
  }
  return out;
}

// ---------------------------------------------------------------- 欄位轉換

/** 民國年日期 `1150825`／`991231` → `2026-08-25`；空白或壞值回 null */
export function rocDateToIso(s: string): string | null {
  const d = (s || "").trim();
  if (!/^\d{6,7}$/.test(d)) return null;
  const year = Number(d.slice(0, d.length - 4)) + 1911;
  const mm = d.slice(-4, -2);
  const dd = d.slice(-2);
  const m = Number(mm);
  const day = Number(dd);
  if (m < 1 || m > 12 || day < 1 || day > 31) return null;
  return `${year}-${mm}-${dd}`;
}

/** 建築完成年月 `0740131` → `1985-01`（只留到月）；沒有就 null */
export function rocYmToIso(s: string): string | null {
  const iso = rocDateToIso(s);
  return iso ? iso.slice(0, 7) : null;
}

/** 全形數字／英文字母／常見符號 → 半形。門牌「２８８號七樓之２」→「288號七樓之2」 */
export function toHalfWidth(s: string): string {
  return (s || "")
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, " ")
    .replace(/－/g, "-")
    .replace(/，/g, ",")
    .trim();
}

function num(s: string | undefined): number {
  const n = Number((s || "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(s: string | undefined): number | null {
  const t = (s || "").replace(/,/g, "").trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function yesNo(s: string | undefined): boolean | null {
  if (s === "有") return true;
  if (s === "無") return false;
  return null;
}

/** 一列買賣／預售資料 → LvrDeal。不在四區、或連編號都沒有的列回 null。 */
export function recordToDeal(rec: Record<string, string>, kind: LvrKind): LvrDeal | null {
  const district = rec["鄉鎮市區"];
  if (!(LVR_DISTRICTS as readonly string[]).includes(district)) return null;
  const serial = (rec["編號"] || "").trim();
  if (!serial) return null;
  const dealDate = rocDateToIso(rec["交易年月日"]);
  if (!dealDate) return null;
  const transferNo = (rec["移轉編號"] || "").trim();
  return {
    id: kind === "sale" && transferNo ? `${serial}-${transferNo}` : serial,
    kind,
    district,
    target: rec["交易標的"] || "",
    address: toHalfWidth(rec["土地位置建物門牌"] || ""),
    dealDate,
    floor: rec["移轉層次"] || "",
    totalFloors: rec["總樓層數"] || "",
    buildingType: rec["建物型態"] || "",
    mainUse: rec["主要用途"] || "",
    builtYm: rocYmToIso(rec["建築完成年月"] || ""),
    landAreaM2: num(rec["土地移轉總面積平方公尺"]),
    buildingAreaM2: num(rec["建物移轉總面積平方公尺"]),
    rooms: num(rec["建物現況格局-房"]),
    halls: num(rec["建物現況格局-廳"]),
    baths: num(rec["建物現況格局-衛"]),
    hasMgmt: rec["有無管理組織"] === "有",
    hasElevator: yesNo(rec["電梯"]),
    totalPrice: num(rec["總價元"]),
    unitPriceM2: numOrNull(rec["單價元平方公尺"]),
    parkingType: rec["車位類別"] || "",
    parkingAreaM2: num(rec["車位移轉總面積平方公尺"]),
    parkingPrice: num(rec["車位總價元"]),
    note: (rec["備註"] || "").trim(),
    projectName: toHalfWidth(rec["建案名稱"] || ""),
    unitNo: toHalfWidth(rec["棟及號"] || ""),
    cancelled: (rec["解約情形"] || "").trim(),
  };
}

/** 整份 CSV 文字 → 四區的成交（其他 25 區直接丟掉） */
export function parseDeals(csvText: string, kind: LvrKind): LvrDeal[] {
  const out: LvrDeal[] = [];
  for (const rec of csvRecords(csvText)) {
    const d = recordToDeal(rec, kind);
    if (d) out.push(d);
  }
  return out;
}

/** build_time.xml 裡的期程文字（拿掉標籤與多餘空白） */
export function parsePeriodText(xml: string): string {
  const m = /<lvr_time>([\s\S]*?)<\/lvr_time>/.exec(xml || "");
  return (m ? m[1] : "").replace(/\s+/g, " ").replace(/^資料內容：/, "").trim();
}

/**
 * 從期程文字挑出「買賣案件」那段的登記日期範圍，方便畫面上簡短顯示。
 * 例：「登記日期 115年9月1日至 115年9月10日之買賣案件」→ { from: "115年9月1日", to: "115年9月10日" }
 */
export function salePeriodRange(periodText: string): { from: string; to: string } | null {
  const m = /登記日期\s*(\d+年\d+月\d+日)\s*至\s*(\d+年\d+月\d+日)之買賣案件/.exec(periodText || "");
  return m ? { from: m[1], to: m[2] } : null;
}

/** zip 內容 → 四區買賣＋預售，以及期程文字。缺臺中買賣檔就丟錯（那代表資料源格式變了）。 */
export function parseLvrZip(zip: Uint8Array): { deals: LvrDeal[]; periodText: string } {
  const files = unzipEntries(zip, [TAICHUNG_FILES.sale, TAICHUNG_FILES.presale, TAICHUNG_FILES.time]);
  const sale = files.get(TAICHUNG_FILES.sale);
  if (!sale) throw new Error(`zip 裡沒有 ${TAICHUNG_FILES.sale}（資料源格式可能變了）`);
  const dec = new TextDecoder("utf-8");
  const deals = parseDeals(dec.decode(sale), "sale");
  const presale = files.get(TAICHUNG_FILES.presale);
  if (presale) deals.push(...parseDeals(dec.decode(presale), "presale"));
  const time = files.get(TAICHUNG_FILES.time);
  return { deals, periodText: time ? parsePeriodText(dec.decode(time)) : "" };
}

// ---------------------------------------------------------------- 畫面用的換算（純函式，前後端共用）

/** 平方公尺 → 坪，四捨五入到小數 2 位 */
export function m2ToPing(m2: number): number {
  return Math.round(m2 * PING_PER_M2 * 100) / 100;
}

/** 元／平方公尺 → 萬／坪，四捨五入到小數 1 位 */
export function unitPriceToWanPerPing(unitPriceM2: number | null): number | null {
  if (!unitPriceM2) return null;
  return Math.round((unitPriceM2 / PING_PER_M2 / 10_000) * 10) / 10;
}

/** 元 → 萬（整數；不到 100 萬保留 1 位小數） */
export function yuanToWan(yuan: number): number {
  const w = yuan / 10_000;
  return Math.abs(w) >= 100 ? Math.round(w) : Math.round(w * 10) / 10;
}

/** ISO 日期 → 民國 `115/08/25` */
export function isoToRoc(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return iso || "";
  return `${Number(m[1]) - 1911}/${m[2]}/${m[3]}`;
}

/** 屋齡（年，四捨五入到 1 位）。沒有完成年月回 null。 */
export function buildingAge(builtYm: string | null, on: Date = new Date()): number | null {
  if (!builtYm) return null;
  const [y, m] = builtYm.split("-").map(Number);
  if (!y || !m) return null;
  const months = (on.getFullYear() - y) * 12 + (on.getMonth() + 1 - m);
  if (months < 0) return 0;
  return Math.round((months / 12) * 10) / 10;
}

/** 中文層次 → 阿拉伯數字（七層 → 7；全／地下層／一層，二層 這種原樣回）。 */
export function floorLabel(s: string): string {
  const t = (s || "").trim();
  if (!t) return "";
  const map: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const toNum = (cn: string): number | null => {
    if (!cn) return null;
    if (cn === "十") return 10;
    let n = 0;
    const idx = cn.indexOf("十");
    if (idx >= 0) {
      const tens = idx === 0 ? 1 : map[cn[idx - 1]] ?? null;
      const ones = cn.length > idx + 1 ? map[cn[idx + 1]] ?? null : 0;
      if (tens == null || ones == null) return null;
      n = tens * 10 + ones;
    } else {
      if (cn.length !== 1 || map[cn] == null) return null;
      n = map[cn];
    }
    return n;
  };
  const single = /^([一二三四五六七八九十]+)層$/.exec(t);
  if (single) {
    const n = toNum(single[1]);
    return n == null ? t : `${n}F`;
  }
  // 預售屋的總樓層數是阿拉伯數字（14），買賣是中文（十四層）；統一成 14F
  if (/^\d{1,3}$/.test(t)) return `${Number(t)}F`;
  return t;
}

/**
 * 期程文字給客戶看的精簡版：拿掉租賃那一段（這站不放租賃），
 * 「登記日期 115年9月1日至 115年9月10日之買賣案件，及訂約日期…之租賃案件，及交易日期115年8月1日至 115年8月10日之預售屋案件」
 * → 「登記日期 115年9月1日至115年9月10日之買賣案件；交易日期 115年8月1日至115年8月10日之預售屋案件」
 */
export function periodTextForDisplay(periodText: string): string {
  const parts = (periodText || "")
    .split(/，及|,及|及/)
    .map((s) => s.replace(/\s+/g, "").trim())
    .filter((s) => s && !/租賃/.test(s));
  return parts.map((s) => s.replace(/^(登記日期|交易日期|訂約日期)/, "$1 ")).join("；");
}

/**
 * 備註裡會影響「這個價格能不能拿來當行情」的字眼 → 短標籤。
 * 官方備註是自由文字，這裡只挑最常見、意思明確的幾種；沒對到的備註照樣顯示原文。
 */
export const NOTE_FLAG_RULES: readonly { re: RegExp; label: string }[] = [
  { re: /親友|特殊關係|員工|共有人/, label: "親友／特殊關係" },
  { re: /急買|急賣|急售/, label: "急買急賣" },
  { re: /債權|債務/, label: "債權債務" },
  { re: /法拍|拍賣|標售|標購/, label: "法拍／標售" },
  { re: /毛胚/, label: "毛胚" },
  { re: /增建|加蓋|夾層/, label: "含增建" },
  { re: /瑕疵|凶宅|非自然/, label: "有瑕疵註記" },
  { re: /預售屋|紅單|換約/, label: "預售轉售" },
  { re: /裝潢|傢俱|家具|家電/, label: "含裝潢／家具" },
  { re: /政府|公部門|機關|國宅|社會住宅|合宜住宅/, label: "公部門／政策住宅" },
  { re: /整批|批次|合併/, label: "整批交易" },
  { re: /持分|部分/, label: "持分交易" },
];

export function noteFlags(note: string): string[] {
  const out: string[] = [];
  for (const rule of NOTE_FLAG_RULES) if (rule.re.test(note || "")) out.push(rule.label);
  return out;
}

/**
 * 畫面上的型態分類。四區實際出現的建物型態：住宅大樓(11層含以上有電梯)、華廈(10層含以下有電梯)、
 * 公寓(5樓含以下無電梯)、套房(1房1廳1衛)、透天厝、店面(店鋪)、辦公商業大樓、廠辦、倉庫、工廠、其他。
 */
export type LvrCategory = "apt" | "house" | "presale" | "shop" | "land" | "other";

export const LVR_CATEGORY_LABEL: Record<LvrCategory, string> = {
  apt: "大樓／華廈／公寓",
  house: "透天",
  presale: "預售屋",
  shop: "店面／辦公／廠辦",
  land: "土地",
  other: "其他",
};

export function categorize(d: Pick<LvrDeal, "kind" | "target" | "buildingType">): LvrCategory {
  if (d.kind === "presale") return "presale";
  if (d.target === "土地") return "land";
  const t = d.buildingType || "";
  if (/透天/.test(t)) return "house";
  if (/住宅大樓|華廈|公寓|套房/.test(t)) return "apt";
  if (/店面|店鋪|辦公|廠辦|倉庫|工廠/.test(t)) return "shop";
  return "other";
}

/** 建物型態的短名（畫面用） */
export function buildingTypeShort(t: string): string {
  const s = t || "";
  if (/住宅大樓/.test(s)) return "住宅大樓";
  if (/華廈/.test(s)) return "華廈";
  if (/公寓/.test(s)) return "公寓";
  if (/套房/.test(s)) return "套房";
  if (/透天/.test(s)) return "透天";
  if (/店面|店鋪/.test(s)) return "店面";
  if (/辦公/.test(s)) return "辦公";
  return s.replace(/\(.*?\)/g, "") || "其他";
}

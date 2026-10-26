/**
 * 🏠 海線房屋行情試算（前台 /estimate）—— 純函式的比對引擎
 *
 * 2026-10-26 系統擁有者：「客戶輸入行政區、建物型態、權狀坪數、屋齡，就能知道他的房子
 * 區域行情大概落在哪：最低成交、中價位、最高成交。」資料就是 /lvr 那套內政部實價登錄（lvr_deal）。
 *
 * 這個檔**不碰資料庫**：lvr.ts 的 `getEstimatePool()` 撈出同區、同型態、近 36 個月的成交交給這裡，
 * 這裡只負責「挑出像的那幾筆、算三個數字」。改條件跑 `npm run check:estimate`。
 *
 * ## 怎麼挑「像的」
 *
 * 從最嚴的條件開始找，樣本不到 MIN_SAMPLES 就放寬一階，直到夠或放到底（見 TIERS）。
 * 用了哪一階會原樣顯示給客戶（期間／坪數範圍／屋齡範圍），不假裝每次都是「近一年同坪同齡」。
 *
 *   - 坪數比的是**不含車位**的建物坪數（建物移轉總面積 − 車位面積）—— 官方單價也是扣掉車位算的，
 *     所以客戶要填「不含車位的權狀坪數」，推算總價也是不含車位。
 *   - 屋齡比的是**成交當時**的屋齡（完成年月 → 交易日），不是到今天的屋齡；
 *     交易日早於完成年月（預售簽約、完工後才登記）當 0 年。
 *   - 住宅大樓與華廈到第四階才合併算 —— 兩者產品接近，但前面幾階先各算各的。
 *
 * ## 哪些成交不拿來當行情（EXCLUDE_FLAGS）
 *
 * 親友／特殊關係、急買急賣、債權債務、法拍／標售、有瑕疵註記、公部門／政策住宅、整批交易、持分交易、毛胚。
 * ⚠️ **「預售轉售」與「含增建」「含裝潢」刻意不排除**：2026-10-26 查正式庫，近 3 年成屋 4,125 筆裡
 *    1,914 筆備註「預售屋、或土地及建物分件登記案件」—— 那是新成屋交屋登記的正常寫法，排掉等於把
 *    新建案整批丟掉；透天 1,130 筆裡 502 筆有「陽台外推／頂樓加蓋」，也是海線透天的常態。
 *    這跟 /lvr 四區摘要卡「所有標籤都排除」的做法不同，是刻意的，不要對齊回去。
 *
 * 單價單位：官方「單價元／平方公尺」（已扣車位）÷ 0.3025 ÷ 10,000 → 萬／坪，跟 /lvr 同一個換算。
 */
import { PING_PER_M2, noteFlags } from "@/lib/lvr-parse";

// ---------------------------------------------------------------- 型態

export type EstimateType = "apt" | "mid" | "walkup" | "house";

export type EstimateTypeDef = {
  key: EstimateType;
  /** 給客戶看的名字 */
  label: string;
  /** 下拉裡的補充說明 */
  hint: string;
  /** 對 lvr_deal.building_type 的判斷 */
  re: RegExp;
  /** SQL LIKE 用的關鍵字（跟 re 要對得上） */
  like: string;
};

/**
 * 四區成屋實際出現的四種住宅型態（2026-10-26 查正式庫：住宅大樓 1,985、透天厝 1,130、華廈 917、公寓 93，近 3 年）。
 * 店面、辦公、廠辦在四區成屋裡沒有出現過，所以不給選 —— 選了也只會查出 0 筆。
 */
export const ESTIMATE_TYPES: readonly EstimateTypeDef[] = [
  { key: "apt", label: "住宅大樓", hint: "11 層以上、有電梯", re: /住宅大樓/, like: "%住宅大樓%" },
  { key: "mid", label: "華廈", hint: "10 層以下、有電梯", re: /華廈/, like: "%華廈%" },
  { key: "walkup", label: "公寓", hint: "5 樓以下、無電梯", re: /公寓/, like: "%公寓%" },
  { key: "house", label: "透天", hint: "透天厝，單價含土地", re: /透天/, like: "%透天%" },
];

/** 行政區 → 型態 → 近 N 個月的成屋成交筆數（表單下拉提示用）。型別放這裡是因為客戶端元件要用，資料端在 lvr-estimate-data.ts */
export type EstimateTypeCounts = Record<string, Record<EstimateType, number>>;

export function estimateTypeDef(key: EstimateType): EstimateTypeDef {
  return ESTIMATE_TYPES.find((t) => t.key === key)!;
}

export function isEstimateType(v: string): v is EstimateType {
  return ESTIMATE_TYPES.some((t) => t.key === v);
}

/** 住宅大樓 ↔ 華廈 放寬到最後會合併算；其他型態沒有夥伴 */
export function mergePartner(key: EstimateType): EstimateType | null {
  if (key === "apt") return "mid";
  if (key === "mid") return "apt";
  return null;
}

/** 這一筆成交的 building_type 屬於哪個型態；都不是回 null（店面、其他） */
export function typeOfBuilding(buildingType: string): EstimateType | null {
  for (const t of ESTIMATE_TYPES) if (t.re.test(buildingType || "")) return t.key;
  return null;
}

// ---------------------------------------------------------------- 輸入

export type EstimateInput = {
  district: string;
  type: EstimateType;
  /** 權狀坪數（不含車位） */
  ping: number;
  /** 屋齡（年）；新成屋填 0 */
  age: number;
};

export const PING_MIN = 5;
export const PING_MAX = 300;
export const AGE_MIN = 0;
export const AGE_MAX = 70;

export type EstimateInputError = { field: "district" | "type" | "ping" | "age"; message: string };

/**
 * 從網址參數讀輸入。四個欄位全空 → null（還沒查）；有填但不合法 → errors。
 * 數字接受全形與逗號（手機輸入法常跑出來）。
 */
export function parseEstimateInput(
  raw: { district?: string; type?: string; ping?: string; age?: string },
  districts: readonly string[],
): { input: EstimateInput | null; errors: EstimateInputError[]; touched: boolean } {
  const district = (raw.district || "").trim();
  const type = (raw.type || "").trim();
  const pingText = normalizeNumberText(raw.ping || "");
  const ageText = normalizeNumberText(raw.age || "");
  const touched = Boolean(district || type || pingText || ageText);
  if (!touched) return { input: null, errors: [], touched: false };

  const errors: EstimateInputError[] = [];
  if (!districts.includes(district)) errors.push({ field: "district", message: "請選行政區" });
  if (!isEstimateType(type)) errors.push({ field: "type", message: "請選建物型態" });
  const ping = Number(pingText);
  if (!pingText || !Number.isFinite(ping)) errors.push({ field: "ping", message: "請填權狀坪數（數字）" });
  else if (ping < PING_MIN || ping > PING_MAX) errors.push({ field: "ping", message: `坪數請填 ${PING_MIN}～${PING_MAX} 之間` });
  const age = Number(ageText);
  if (!ageText || !Number.isFinite(age)) errors.push({ field: "age", message: "請填屋齡（年），新成屋填 0" });
  else if (age < AGE_MIN || age > AGE_MAX) errors.push({ field: "age", message: `屋齡請填 ${AGE_MIN}～${AGE_MAX} 年` });

  if (errors.length) return { input: null, errors, touched };
  return {
    input: { district, type: type as EstimateType, ping: Math.round(ping * 100) / 100, age: Math.round(age * 10) / 10 },
    errors: [],
    touched,
  };
}

function normalizeNumberText(s: string): string {
  return s
    .replace(/[０-９．]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[,，\s]/g, "")
    .trim();
}

// ---------------------------------------------------------------- 樣本

/** lvr.ts getEstimatePool() 撈出來的一列（只有這裡用得到的欄位） */
export type EstimatePoolRow = {
  id: string;
  address: string;
  /** ISO YYYY-MM-DD */
  dealDate: string;
  /** ISO YYYY-MM；沒有就 null */
  builtYm: string | null;
  floor: string;
  totalFloors: string;
  buildingType: string;
  buildingAreaM2: number;
  parkingAreaM2: number;
  rooms: number;
  halls: number;
  baths: number;
  /** 元（含車位） */
  totalPrice: number;
  /** 元／平方公尺（官方已扣車位）；null 就不能當行情 */
  unitPriceM2: number | null;
  parkingType: string;
  parkingPrice: number;
  note: string;
};

/** 備註有這些字眼的成交不當行情（為什麼不是全部標籤，見檔頭） */
export const EXCLUDE_FLAGS: readonly string[] = [
  "親友／特殊關係",
  "急買急賣",
  "債權債務",
  "法拍／標售",
  "有瑕疵註記",
  "公部門／政策住宅",
  "整批交易",
  "持分交易",
  "毛胚",
];

/** 一筆成交算好的比對用數字 */
export type EstimateComp = {
  id: string;
  address: string;
  dealDate: string;
  /** 不含車位的建物坪數（小數 2 位） */
  ping: number;
  /** 成交當時的屋齡（年，小數 1 位）；沒有完成年月 null */
  ageAtDeal: number | null;
  floor: string;
  totalFloors: string;
  type: EstimateType | null;
  rooms: number;
  halls: number;
  baths: number;
  /** 萬／坪（小數 1 位） */
  unitWan: number;
  /** 總價 萬（含車位，官方總價） */
  totalWan: number;
  parkingType: string;
  /** 車位總價 萬 */
  parkingWan: number;
  /** 備註標籤（含沒被排除的，例如「預售轉售」「含增建」，表格要標出來） */
  flags: string[];
  /** 官方備註原文（2026-10-26 系統擁有者：成交細項直接列出、不要收起來，表格印在門牌底下） */
  note: string;
};

/** 成交當時屋齡：完成年月到交易日的年數。交易早於完工（預售簽約）當 0。 */
export function ageAtDeal(builtYm: string | null, dealDate: string): number | null {
  if (!builtYm) return null;
  const [by, bm] = builtYm.split("-").map(Number);
  const [dy, dm] = dealDate.split("-").map(Number);
  if (!by || !bm || !dy || !dm) return null;
  const months = (dy - by) * 12 + (dm - bm);
  if (months <= 0) return 0;
  return Math.round((months / 12) * 10) / 10;
}

export function unitWanPerPing(unitPriceM2: number): number {
  return Math.round((unitPriceM2 / PING_PER_M2 / 10_000) * 10) / 10;
}

/**
 * 原始列 → 比對用的一筆；不能當行情的回 null（沒單價、備註有排除字眼、面積算不出來）。
 * `excluded` 計數器讓畫面能老實說「另有 N 筆因親友／法拍等註記不列入」。
 */
export function toComp(row: EstimatePoolRow): { comp: EstimateComp | null; excludedBy: string | null } {
  if (!row.unitPriceM2 || row.unitPriceM2 <= 0) return { comp: null, excludedBy: null };
  const flags = noteFlags(row.note || "");
  const hit = flags.find((f) => EXCLUDE_FLAGS.includes(f));
  if (hit) return { comp: null, excludedBy: hit };
  const areaM2 = row.buildingAreaM2 - row.parkingAreaM2;
  if (!(areaM2 > 0)) return { comp: null, excludedBy: null };
  return {
    comp: {
      id: row.id,
      address: row.address,
      dealDate: row.dealDate,
      ping: Math.round(areaM2 * PING_PER_M2 * 100) / 100,
      ageAtDeal: ageAtDeal(row.builtYm, row.dealDate),
      floor: row.floor,
      totalFloors: row.totalFloors,
      type: typeOfBuilding(row.buildingType),
      rooms: row.rooms,
      halls: row.halls,
      baths: row.baths,
      unitWan: unitWanPerPing(row.unitPriceM2),
      totalWan: Math.round(row.totalPrice / 10_000),
      parkingType: row.parkingType,
      parkingWan: Math.round(row.parkingPrice / 10_000),
      flags,
      note: (row.note || "").trim(),
    },
    excludedBy: null,
  };
}

// ---------------------------------------------------------------- 分階放寬

export type EstimateTier = {
  /** 只看近幾個月的成交 */
  months: number;
  /** 坪數上下容許比例（0.2 ＝ ±20%） */
  areaPct: number;
  /** 屋齡上下容許年數；null ＝ 不限屋齡 */
  ageYears: number | null;
  /** 住宅大樓與華廈合併算 */
  mergeApt: boolean;
};

/**
 * 從嚴到寬。數字是 2026-10-26 看正式庫調的：沙鹿住宅大樓近 24 個月 171 筆、八成是 0–4 年新屋，
 * 坪數集中在 20–40 坪；公寓四區近 24 個月合計不到 100 筆，所以最後一階要放到不限屋齡才有東西。
 * 改這張表記得跑 `npm run check:estimate`。
 */
export const TIERS: readonly EstimateTier[] = [
  { months: 12, areaPct: 0.2, ageYears: 5, mergeApt: false },
  { months: 12, areaPct: 0.3, ageYears: 8, mergeApt: false },
  { months: 24, areaPct: 0.3, ageYears: 10, mergeApt: false },
  { months: 24, areaPct: 0.4, ageYears: 15, mergeApt: true },
  { months: 36, areaPct: 0.5, ageYears: null, mergeApt: true },
];

/** 樣本夠多就停在這一階 */
export const MIN_SAMPLES = 8;
/** 放到底還不到這個數就不給數字（只列出有的那幾筆） */
export const MIN_SHOW = 3;
/** 資料池最遠回看幾個月（lvr.ts 撈資料用，要 ≥ TIERS 最大的 months） */
export const POOL_MONTHS = Math.max(...TIERS.map((t) => t.months));
/**
 * 表格最多列幾筆。2026-10-26 系統擁有者：「拿出來比較的成交細項不用點開就直接列出」——
 * 原本只列最新 30 筆、其餘要點去 /lvr，現在**拿來算的全部列出**；這個上限只是最後一階（近 3 年、±50% 坪）
 * 在梧棲大樓那種幾百筆的區保護頁面長度，一般第一階 8～60 筆根本碰不到。
 */
export const MAX_COMPS_SHOWN = 200;

export function monthsBefore(todayIso: string, months: number): string {
  const d = new Date(Date.parse(`${todayIso}T00:00:00Z`));
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

/** 這一筆成交符合這一階的條件嗎 */
export function matchesTier(c: EstimateComp, input: EstimateInput, tier: EstimateTier, since: string): boolean {
  if (c.dealDate < since) return false;
  if (c.type !== input.type) {
    if (!tier.mergeApt) return false;
    if (c.type !== mergePartner(input.type)) return false;
  }
  const lo = input.ping * (1 - tier.areaPct);
  const hi = input.ping * (1 + tier.areaPct);
  if (c.ping < lo || c.ping > hi) return false;
  if (tier.ageYears !== null) {
    // 沒有完成年月的（極少數）不能確認屋齡，有屋齡限制的階段不收
    if (c.ageAtDeal === null) return false;
    if (Math.abs(c.ageAtDeal - input.age) > tier.ageYears) return false;
  }
  return true;
}

// ---------------------------------------------------------------- 結果

export type PricePoint = {
  /** 萬／坪 */
  unitWan: number;
  /** 哪一筆：讓最低／最高可以追到門牌，不是憑空一個數字 */
  comp: EstimateComp;
};

export type EstimateStats = {
  sample: number;
  /** 最低、中位、最高 單價（萬／坪）；最低與最高帶那一筆 */
  low: PricePoint;
  median: number;
  high: PricePoint;
  /** 四分位：常見區間 */
  p25: number;
  p75: number;
  /** 把單價乘上客戶坪數 → 推算總價（萬，不含車位），整數 */
  totalLow: number;
  totalMedian: number;
  totalHigh: number;
  /** 這些成交實際的總價（萬，官方總價含車位）最低／中位／最高 */
  dealTotalLow: number;
  dealTotalMedian: number;
  dealTotalHigh: number;
};

export type EstimateResult =
  | {
      ok: true;
      input: EstimateInput;
      tier: EstimateTier;
      /** 第幾階（1 起算） */
      tierIndex: number;
      /** 這一階的起算日 ISO */
      since: string;
      stats: EstimateStats;
      /** 表格用：依成交日新到舊，最多 MAX_COMPS_SHOWN 筆 */
      comps: EstimateComp[];
      /** 符合這一階條件、但因備註被排除的筆數（按排除原因） */
      excluded: Record<string, number>;
      /** 整個資料池（同區同型態近 POOL_MONTHS 個月）有幾筆，讓客戶知道有沒有資料 */
      poolSize: number;
    }
  | {
      ok: false;
      input: EstimateInput;
      /** 放到最後一階也只有這幾筆 */
      sample: number;
      tier: EstimateTier;
      since: string;
      comps: EstimateComp[];
      poolSize: number;
    };

function sortedMedian(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** 第 q 分位（0–1），線性插值 */
function quantile(values: number[], q: number): number {
  const s = [...values].sort((a, b) => a - b);
  if (s.length === 1) return s[0];
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function computeStats(comps: EstimateComp[], ping: number): EstimateStats {
  const byUnit = [...comps].sort((a, b) => a.unitWan - b.unitWan);
  const units = byUnit.map((c) => c.unitWan);
  const median = round1(sortedMedian(units));
  const p25 = round1(quantile(units, 0.25));
  const p75 = round1(quantile(units, 0.75));
  const totals = comps.map((c) => c.totalWan);
  const low = byUnit[0];
  const high = byUnit[byUnit.length - 1];
  return {
    sample: comps.length,
    low: { unitWan: low.unitWan, comp: low },
    median,
    high: { unitWan: high.unitWan, comp: high },
    p25,
    p75,
    totalLow: Math.round(low.unitWan * ping),
    totalMedian: Math.round(median * ping),
    totalHigh: Math.round(high.unitWan * ping),
    dealTotalLow: Math.min(...totals),
    dealTotalMedian: Math.round(sortedMedian(totals)),
    dealTotalHigh: Math.max(...totals),
  };
}

/**
 * 主流程：資料池 → 逐階找像的 → 算數字。
 * `today` 可以傳進來是為了測試固定日期；正式呼叫用 taipeiDay()。
 */
export function estimate(input: EstimateInput, pool: EstimatePoolRow[], today: string): EstimateResult {
  // 先把整池轉成比對用的，順便記下每一筆被排除的原因（排除與否不看階，只看備註）
  const comps: EstimateComp[] = [];
  const excludedRows: { row: EstimatePoolRow; by: string }[] = [];
  for (const row of pool) {
    const { comp, excludedBy } = toComp(row);
    if (comp) comps.push(comp);
    else if (excludedBy) excludedRows.push({ row, by: excludedBy });
  }

  let last: { tier: EstimateTier; since: string; hits: EstimateComp[] } | null = null;
  for (let i = 0; i < TIERS.length; i++) {
    const tier = TIERS[i];
    const since = monthsBefore(today, tier.months);
    const hits = comps.filter((c) => matchesTier(c, input, tier, since));
    last = { tier, since, hits };
    if (hits.length >= MIN_SAMPLES || i === TIERS.length - 1) {
      if (hits.length < MIN_SHOW) break;
      // 被排除的那幾筆如果也符合這一階的條件，算進「另有 N 筆不列入」讓客戶知道
      const excluded: Record<string, number> = {};
      for (const { row, by } of excludedRows) {
        const fake = toCompIgnoringFlags(row);
        if (fake && matchesTier(fake, input, tier, since)) excluded[by] = (excluded[by] || 0) + 1;
      }
      const shown = [...hits].sort((a, b) => b.dealDate.localeCompare(a.dealDate)).slice(0, MAX_COMPS_SHOWN);
      return {
        ok: true,
        input,
        tier,
        tierIndex: i + 1,
        since,
        stats: computeStats(hits, input.ping),
        comps: shown,
        excluded,
        poolSize: pool.length,
      };
    }
  }
  const l = last!;
  return {
    ok: false,
    input,
    sample: l.hits.length,
    tier: l.tier,
    since: l.since,
    comps: [...l.hits].sort((a, b) => b.dealDate.localeCompare(a.dealDate)),
    poolSize: pool.length,
  };
}

/** 排除計數用：把備註先當沒事，看它條件上像不像 */
function toCompIgnoringFlags(row: EstimatePoolRow): EstimateComp | null {
  return toComp({ ...row, note: "" }).comp;
}

// ---------------------------------------------------------------- 給畫面的文字

export function tierLabel(tier: EstimateTier, input: EstimateInput): { period: string; area: string; age: string; type: string } {
  const def = estimateTypeDef(input.type);
  const partner = tier.mergeApt ? mergePartner(input.type) : null;
  const lo = Math.round(input.ping * (1 - tier.areaPct));
  const hi = Math.round(input.ping * (1 + tier.areaPct));
  const ageLo = tier.ageYears === null ? null : Math.max(0, Math.round(input.age - tier.ageYears));
  const ageHi = tier.ageYears === null ? null : Math.round(input.age + tier.ageYears);
  return {
    period: tier.months % 12 === 0 ? `近 ${tier.months / 12} 年` : `近 ${tier.months} 個月`,
    area: `${lo}～${hi} 坪`,
    age: tier.ageYears === null ? "不限屋齡" : `屋齡 ${ageLo}～${ageHi} 年`,
    type: partner ? `${def.label}／${estimateTypeDef(partner).label}` : def.label,
  };
}

/** 萬／坪 → 「18.5」；總價 萬 → 「1,250」 */
export function fmtWan(n: number): string {
  return Math.round(n).toLocaleString("zh-TW");
}

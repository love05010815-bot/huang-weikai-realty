/**
 * 地籍面積單位換算 —— 純計算，不碰畫面。
 *
 * 2026-10-01 系統擁有者：前台免費工具加一項「地籍面積單位換算」，
 * 平方公尺、坪、公畝、公頃、平方公里、甲、分全部互通，輸入任何一格其他格自動跟著出來。
 *
 * 每個單位只記「等於幾平方公尺」，所有換算都先進平方公尺再出去，
 * 所以單位之間不會有 7×7 張對照表要維護，加一個單位只要加一行。
 *
 * 數字的來源（都是定義值，不會過期）：
 *   1 台尺 ＝ 10/33 公尺（日治時期度量衡法沿用至今），1 坪 ＝ 6 台尺 × 6 台尺 ＝ 400/121 平方公尺 ≈ 3.3058
 *   1 甲 ＝ 2,934 坪（台灣地籍沿用的清代單位，地政機關登記換算就用這個數）
 *   1 分 ＝ 1/10 甲 ＝ 293.4 坪
 *   1 公畝 ＝ 100 平方公尺；1 公頃 ＝ 10,000 平方公尺；1 平方公里 ＝ 100 公頃
 * 所以 1 公頃 ＝ 10,000 × 121/400 ＝ 3,025 坪（剛好整數），1 甲 ≈ 0.96992 公頃。
 *
 * ⚠️ 坪、甲、分用分數算（400/121），不要寫成 3.3058 這種截斷值 ——
 *    截斷值算一甲會差到幾平方公尺，客戶拿去跟地政事務所的數字對會對不上。
 */

export type AreaUnit = "sqm" | "ping" | "are" | "hectare" | "sqkm" | "jia" | "fen";

export type AreaUnitDef = {
  key: AreaUnit;
  /** 畫面上的單位名稱 */
  label: string;
  /** 「公制」或「台灣慣用」，畫面分兩組 */
  group: "metric" | "taiwan";
  /** 1 這個單位 ＝ 幾平方公尺 */
  toSqm: number;
  /** 欄位下方的提示：這個單位跟平方公尺或坪的關係 */
  hint: string;
};

/** 1 坪 ＝ 400/121 平方公尺 */
const PING_SQM = 400 / 121;

/** 順序就是畫面順序：客戶最常用的平方公尺、坪放最前面 */
export const AREA_UNITS: readonly AreaUnitDef[] = [
  { key: "sqm", label: "平方公尺", group: "metric", toSqm: 1, hint: "謄本、權狀上登記的單位" },
  { key: "ping", label: "坪", group: "taiwan", toSqm: PING_SQM, hint: "1 坪 ＝ 3.3058 平方公尺" },
  { key: "are", label: "公畝", group: "metric", toSqm: 100, hint: "1 公畝 ＝ 100 平方公尺 ＝ 30.25 坪" },
  { key: "hectare", label: "公頃", group: "metric", toSqm: 10_000, hint: "1 公頃 ＝ 10,000 平方公尺 ＝ 3,025 坪" },
  { key: "sqkm", label: "平方公里", group: "metric", toSqm: 1_000_000, hint: "1 平方公里 ＝ 100 公頃" },
  { key: "jia", label: "甲", group: "taiwan", toSqm: 2934 * PING_SQM, hint: "1 甲 ＝ 2,934 坪 ＝ 0.96992 公頃" },
  { key: "fen", label: "分", group: "taiwan", toSqm: 293.4 * PING_SQM, hint: "1 分 ＝ 1/10 甲 ＝ 293.4 坪" },
];

const BY_KEY: Record<AreaUnit, AreaUnitDef> = Object.fromEntries(AREA_UNITS.map((u) => [u.key, u])) as Record<
  AreaUnit,
  AreaUnitDef
>;

export function areaUnit(key: AreaUnit): AreaUnitDef {
  return BY_KEY[key];
}

/** 把一個數字從某個單位換成全部單位。負數、NaN 一律丟錯，畫面自己決定怎麼提示。 */
export function convertArea(value: number, from: AreaUnit): Record<AreaUnit, number> {
  if (!Number.isFinite(value) || value < 0) throw new Error("請輸入 0 以上的數字");
  const sqm = value * BY_KEY[from].toSqm;
  const out = {} as Record<AreaUnit, number>;
  for (const u of AREA_UNITS) out[u.key] = u.key === from ? value : sqm / u.toSqm;
  return out;
}

/**
 * 把使用者打的字變成數字。允許千分位逗號、全形數字與空白；
 * 空字串回 null（代表「還沒輸入」，不是錯誤）；打了字但不是數字回 NaN。
 */
export function parseAreaInput(raw: string): number | null {
  const text = raw
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30))
    .replace(/[，,\s]/g, "")
    .replace(/．/g, ".");
  if (text === "") return null;
  if (!/^\d*\.?\d*$/.test(text) || text === ".") return NaN;
  return Number(text);
}

/**
 * 顯示用的數字格式：
 *   ≥ 1 的最多 4 位小數、加千分位（15.125 坪、3,025 坪）；
 *   < 1 的保留 4 位有效數字、不用科學記號（50 平方公尺 ＝ 0.00005 平方公里，不能印成 5e-5）。
 * 尾巴的 0 都剪掉，0 就印 0。
 */
export function formatArea(n: number): string {
  if (!Number.isFinite(n)) return "";
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1) {
    return n.toLocaleString("zh-TW", { maximumFractionDigits: 4 });
  }
  const decimals = Math.min(12, 3 - Math.floor(Math.log10(abs)));
  return n.toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "");
}

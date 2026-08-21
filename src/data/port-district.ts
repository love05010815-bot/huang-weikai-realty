/**
 * 🗺️ 台中港特定區（中正段南段／梧棲段）土地分佈圖 —— 資料層
 *
 * ⚠️ 先讀這段再改東西 ⚠️
 *
 * 1. 這張圖的幾何是「從一張截圖重建的示意圖」，不是地籍測量成果。
 *    街廓相對位置、面積比例大致對，但界線一定有誤差。
 *    → 只能拿來讓客戶「看懂大致格局」，不可以當界址、產權或投資依據。
 *
 * 2. 每一塊地的 `verified` 欄位：
 *      false = 還沒有人工核對過（預設值，畫面上會標「待確認」）
 *      true  = 你已經用建照執照／標售公告／實價登錄核對過了
 *    ⚠️ 沒核對過的建商名不要對外當定論講。土地權屬不是開放資料，
 *       這類圖的建商名都是從公開資訊反推的，本來就會有誤差和時間差。
 *
 * 3. 面積一律存「平方公尺」(areaM2)，畫面會自動換算成坪（× 0.3025）。
 *    原圖上那些 4 位小數的數字就是平方公尺，不要當成坪填進來。
 *
 * 4. 要新增一塊地：複製任何一行 p(...)，改 rect 座標和內容即可。
 *    rect 是 [x, y, 寬, 高]，座標系見下方 CANVAS。
 */

/* ─────────────── 座標系 ─────────────── */

/** SVG 畫布尺寸。左上為原點，x 往東、y 往南。 */
export const CANVAS = { w: 1300, h: 950 } as const;

/** [x, y, 寬, 高] */
export type Rect = [number, number, number, number];

/** 平方公尺 → 坪 */
export const M2_TO_PING = 0.3025;

/* ─────────────── 分區 ─────────────── */

export type ZoneKey =
  | "commercial"
  | "residential"
  | "mixed"
  | "industrial"
  | "public"
  | "park"
  | "utility"
  | "reserved";

export const ZONES: Record<ZoneKey, { label: string; fill: string; ink: string }> = {
  commercial:  { label: "商業區",     fill: "#F3A9BF", ink: "#5E1F33" },
  mixed:       { label: "商業(特)",   fill: "#F6C9AC", ink: "#68391A" },
  residential: { label: "住宅區",     fill: "#A9D6A5", ink: "#1F4A22" },
  industrial:  { label: "產業／倉儲", fill: "#C3ADE0", ink: "#3B2560" },
  public:      { label: "機關用地",   fill: "#F2DA92", ink: "#5C4610" },
  park:        { label: "公園綠地",   fill: "#7FC79B", ink: "#14442A" },
  utility:     { label: "加油站等",   fill: "#9FC7E8", ink: "#123A5C" },
  reserved:    { label: "待確認",     fill: "#DFE5EA", ink: "#42525E" },
};

/* ─────────────── 開發狀態 ─────────────── */

export type StatusKey = "unknown" | "planned" | "building" | "done" | "public";

export const STATUS: Record<StatusKey, { label: string; fill: string; ink: string }> = {
  unknown:  { label: "待確認",   fill: "#DFE5EA", ink: "#42525E" },
  planned:  { label: "待開發",   fill: "#F2DA92", ink: "#5C4610" },
  building: { label: "興建中",   fill: "#F3A9BF", ink: "#5E1F33" },
  done:     { label: "已完工",   fill: "#A9D6A5", ink: "#1F4A22" },
  public:   { label: "公共設施", fill: "#9FC7E8", ink: "#123A5C" },
};

/* ─────────────── 地塊 ─────────────── */

export type Parcel = {
  id: string;
  rect: Rect;
  /** 建商／地主／用途名稱。留空 = 圖上不寫字 */
  name?: string;
  /** 土地面積，平方公尺 */
  areaM2?: number;
  zone: ZoneKey;
  status: StatusKey;
  /** 建蔽率／容積率，例：「80/600」 */
  bulk?: string;
  /** 你自己的備註，會顯示在詳情面板 */
  note?: string;
  /** 是否已人工核對過。預設 false */
  verified?: boolean;
};

/* ─────────────── 街廓切割工具 ─────────────── */

/** 把街廓沿垂直線切成幾直行（spans 是相對寬度權重） */
export function cols(r: Rect, spans: number[], gap = 3): Rect[] {
  const [x, y, w, h] = r;
  const total = spans.reduce((a, b) => a + b, 0);
  const usable = w - gap * (spans.length - 1);
  let cursor = x;
  return spans.map((s) => {
    const cw = (usable * s) / total;
    const out: Rect = [cursor, y, cw, h];
    cursor += cw + gap;
    return out;
  });
}

/** 把街廓沿水平線切成幾橫列（spans 是相對高度權重） */
export function rows(r: Rect, spans: number[], gap = 3): Rect[] {
  const [x, y, w, h] = r;
  const total = spans.reduce((a, b) => a + b, 0);
  const usable = h - gap * (spans.length - 1);
  let cursor = y;
  return spans.map((s) => {
    const ch = (usable * s) / total;
    const out: Rect = [x, cursor, w, ch];
    cursor += ch + gap;
    return out;
  });
}

/* ─────────────── 道路 ─────────────── */

export type Road = { name: string; width: string; rect: Rect; dir: "h" | "v" };

export const ROADS: Road[] = [
  { name: "民族路",   width: "30M", rect: [92, 44, 1124, 26], dir: "h" },
  { name: "大勇路",   width: "30M", rect: [92, 376, 1124, 26], dir: "h" },
  { name: "大智路",   width: "30M", rect: [92, 900, 1124, 26], dir: "h" },
  { name: "港新二路", width: "30M", rect: [978, 566, 218, 26], dir: "h" },
  { name: "港新一路", width: "20M", rect: [978, 664, 218, 18], dir: "h" },
  { name: "八德路",   width: "30M", rect: [350, 70, 26, 306], dir: "v" },
  { name: "四維路",   width: "30M", rect: [952, 70, 26, 830], dir: "v" },
  { name: "港埠路",   width: "50M", rect: [1152, 70, 36, 830], dir: "v" },
  { name: "",         width: "15M", rect: [606, 70, 14, 306], dir: "v" },
  { name: "",         width: "15M", rect: [772, 70, 14, 306], dir: "v" },
];

/* ─────────────── 周邊地標（提供方位感，非本區地塊） ─────────────── */

export type Landmark = { label: string; rect: Rect; dir: "h" | "v"; tone: "port" | "expressway" };

export const LANDMARKS: Landmark[] = [
  { label: "台中港・自由貿易港區", rect: [16, 44, 60, 882], dir: "v", tone: "port" },
  { label: "台61線西濱快速道路",   rect: [1196, 44, 88, 882], dir: "v", tone: "expressway" },
];

/* ─────────────── 地塊 ─────────────── */

const P = (id: string, rect: Rect, zone: ZoneKey, extra: Partial<Parcel> = {}): Parcel => ({
  id,
  rect,
  zone,
  status: "unknown",
  verified: false,
  ...extra,
});

/* 上帶 —— 民族路以南、大勇路以北（中貿專區） */
const [A1L, A1R] = cols([92, 70, 258, 306], [1, 1]);
const A1La = rows(A1L, [1.1, 1, 1.3]);
const A1Ra = rows(A1R, [1, 1.2, 1]);

const A2 = rows([376, 70, 230, 306], [1, 1.1, 1]);
const A2a = cols(A2[0], [1, 1]);
const A2b = cols(A2[1], [1.3, 1]);
const A2c = cols(A2[2], [1, 1, 1]);

const A3 = rows([620, 70, 152, 306], [1, 1, 1.2]);
const A4 = rows([786, 70, 166, 306], [1.2, 1, 1]);
const A4a = cols(A4[0], [1, 1]);
const A5 = rows([978, 70, 174, 306], [1, 1.1, 1]);
const A5a = cols(A5[1], [1, 1]);

/* 中帶 —— 大勇路以南 */
const B1 = rows([92, 402, 258, 164], [1.4, 1]);
const B1a = cols(B1[1], [1, 1]);
const B2 = rows([376, 402, 230, 164], [1.6, 1]);
const B3 = cols([620, 402, 332, 164], [1, 1.1]);
const B3a = rows(B3[0], [1, 1]);
const B4 = rows([978, 402, 174, 164], [1, 1]);
const B4a = cols(B4[1], [1, 1]);

/* 下帶 —— 梧棲段／中正段南段 */
const C1 = rows([92, 570, 258, 330], [1, 1, 1.2]);
const C1a = cols(C1[0], [1, 1]);
const C1b = cols(C1[2], [1, 1]);
const C2 = rows([376, 570, 230, 330], [1.2, 1, 1]);
const C2a = cols(C2[1], [1, 1]);
const C3 = cols([620, 570, 332, 330], [1, 1]);
const C3a = rows(C3[0], [1, 1, 1]);
const C3b = rows(C3[1], [1.4, 1]);
const C3b1 = cols(C3b[1], [1, 1]);

const D1 = cols([978, 596, 174, 64], [1, 1]);
const D2 = rows([978, 686, 174, 214], [1, 1, 1]);
const D2a = cols(D2[0], [1, 1]);
const D2b = cols(D2[2], [1, 1, 1]);

/**
 * 全區地塊。
 * name 有填的是我從原圖讀得出來的字，一律 verified: false，你核對過再改 true。
 * name 留空的代表原圖上那格字太小讀不出來 —— 不要猜，等你補。
 */
export const PARCELS: Parcel[] = [
  /* ── A1 西側街廓 ── */
  P("a1-1", A1La[0], "utility", { name: "台灣中油", note: "台中港區加油站", status: "public" }),
  P("a1-2", A1La[1], "residential", { name: "益陽建設", areaM2: 1026.0908 }),
  P("a1-3", A1La[2], "commercial", { name: "聖賢建設", note: "中港雲頂", areaM2: 1736.87 }),
  P("a1-4", A1Ra[0], "residential"),
  P("a1-5", A1Ra[1], "commercial"),
  P("a1-6", A1Ra[2], "residential"),

  /* ── A2 八德路以東 ── */
  P("a2-1", A2a[0], "commercial", { name: "新光鋼", areaM2: 1148.28 }),
  P("a2-2", A2a[1], "commercial"),
  P("a2-3", A2b[0], "residential", { name: "遠雄建設", note: "遠雄之星系列街廓" }),
  P("a2-4", A2b[1], "residential"),
  P("a2-5", A2c[0], "mixed"),
  P("a2-6", A2c[1], "residential"),
  P("a2-7", A2c[2], "mixed"),

  /* ── A3 中央街廓 ── */
  P("a3-1", A3[0], "commercial"),
  P("a3-2", A3[1], "residential", { name: "遠雄建設", areaM2: 2138.06 }),
  P("a3-3", A3[2], "commercial", { name: "遠雄建設", note: "商業服務中心" }),

  /* ── A4 四維路以西 ── */
  P("a4-1", A4a[0], "residential"),
  P("a4-2", A4a[1], "residential"),
  P("a4-3", A4[1], "commercial", { name: "華友聯建設" }),
  P("a4-4", A4[2], "residential"),

  /* ── A5 四維路以東 ── */
  P("a5-1", A5[0], "commercial", { name: "勝美建設", areaM2: 3036.7808 }),
  P("a5-2", A5a[0], "residential", { name: "遠達建設", areaM2: 1431.5288 }),
  P("a5-3", A5a[1], "residential"),
  P("a5-4", A5[2], "mixed"),

  /* ── B1 大勇路南・西側 ── */
  P("b1-1", B1[0], "commercial", { name: "勤美集團", areaM2: 5619.0 }),
  P("b1-2", B1a[0], "industrial"),
  P("b1-3", B1a[1], "industrial"),

  /* ── B2 潤泰街廓 ── */
  P("b2-1", B2[0], "commercial", { name: "潤泰全球", areaM2: 6407.5488 }),
  P("b2-2", B2[1], "residential"),

  /* ── B3 政府機關用地與遠雄 ── */
  P("b3-1", B3a[0], "commercial", { name: "潤泰全球", areaM2: 8464.7298 }),
  P("b3-2", B3a[1], "residential", { name: "遠雄建設", areaM2: 4782.29 }),
  P("b3-3", B3[1], "public", { name: "政府機關用地", status: "public", verified: true }),

  /* ── B4 四維路以東 ── */
  P("b4-1", B4[0], "residential", { name: "聯悅建設", areaM2: 3347.3688 }),
  P("b4-2", B4a[0], "residential", { name: "聯悅建設", areaM2: 279.527 }),
  P("b4-3", B4a[1], "commercial"),

  /* ── C1 下帶西側 ── */
  P("c1-1", C1a[0], "industrial", { name: "中悅建設" }),
  P("c1-2", C1a[1], "industrial"),
  P("c1-3", C1[1], "commercial", { name: "續成實業", areaM2: 3536.0 }),
  P("c1-4", C1b[0], "residential"),
  P("c1-5", C1b[1], "residential"),

  /* ── C2 下帶中西 ── */
  P("c2-1", C2[0], "industrial", { name: "續成實業", areaM2: 17631.0 }),
  P("c2-2", C2a[0], "residential"),
  P("c2-3", C2a[1], "residential"),
  P("c2-4", C2[2], "commercial", { name: "麗寶集團", areaM2: 3123.5 }),

  /* ── C3 下帶中東 ── */
  P("c3-1", C3a[0], "public", { name: "梧棲消防隊", status: "public", verified: true }),
  P("c3-2", C3a[1], "park", { name: "公園綠地", status: "public", verified: true }),
  P("c3-3", C3a[2], "residential", { name: "續成實業", areaM2: 9563.09 }),
  P("c3-4", C3b[0], "commercial"),
  P("c3-5", C3b1[0], "residential"),
  P("c3-6", C3b1[1], "residential"),

  /* ── D 港新一、二路之間 ── */
  P("d1-1", D1[0], "commercial", { name: "勝美建設" }),
  P("d1-2", D1[1], "residential"),
  P("d2-1", D2a[0], "residential"),
  P("d2-2", D2a[1], "residential"),
  P("d2-3", D2[1], "commercial"),
  P("d2-4", D2b[0], "residential"),
  P("d2-5", D2b[1], "residential"),
  P("d2-6", D2b[2], "residential"),
];

/** 圖上標的容積率註記（原圖右側 80/600、80/500 那種） */
export const BULK_NOTES: Array<{ text: string; x: number; y: number }> = [
  { text: "80/600", x: 1170, y: 300 },
  { text: "80/500", x: 1170, y: 740 },
];

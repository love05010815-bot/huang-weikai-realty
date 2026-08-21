/**
 * 🏢 台中港市鎮中心市地重劃區 —— 建案總覽資料層
 *
 * 這一支是 `/map` 的「建案」圖層資料。土地地塊資料在 `port-district.ts`，兩者分開。
 *
 * ⚠️ 先讀這段再改東西 ⚠️
 *
 * 1. 這裡放的是「建案」不是「地塊」。建案名、總戶數、預售／成屋狀態
 *    都是可查證的公開資訊（預售屋依法要申報實價登錄），跟土地權屬不同等級。
 *
 * 2. 每筆的 `sources` 一定要填，`verified` 預設 false。
 *    `verified: true` 的意思是「你本人核對過」，不是「我查到過」。
 *
 * 3. `builder` 沒把握就留空，不要用建案名去猜。
 *    踩過的例子：「聯虹鉑玥」看起來像聯悅，實際是**聯虹建設**，是不同公司。
 *    只從名字推定的，一律填 `builderGuess: true`，畫面會標「建商推定」。
 *
 * 4. **不放價格**（拍板決定）。開價寫在自己網站上等於發布廣告，會過期、要一直維護，
 *    還有不實廣告風險。客戶想知道行情就讓他預約。
 *
 * 5. `block` 是街廓位置，填了才會在地圖上標點。**沒把握就留空** ——
 *    標錯位置比不標更糟，那是 `/map` 上次被雪藏的原因。
 */

/** 重劃區基本資料。數字來自臺中市政府地政局與房感的整理，四至為官方公告文字。 */
export const DISTRICT = {
  name: "臺中港特定區（市鎮中心）市地重劃區",
  alias: "台中港市鎮中心",
  nickname: "梧棲市政重劃區",
  areaHa: 114.79,
  completedYear: "民國 98 年底",
  /** 官方公告四至，原文照錄 */
  bounds: "北以民族路三段為界、東以港埠路三段為界、南以大仁路二段銜接八德路一段及大智路二段為界、西則以臨港路五段為界",
  districts: ["臺中市梧棲區", "臺中市清水區"],
  note: "「市政重劃區」是在地俗稱，來自梧棲區公所、戶政所、衛生所將遷入本區。正式名稱為上方所列。",
} as const;

/* ─────────────── 型別 ─────────────── */

export type ProjectStatus = "presale" | "completed";

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  presale: "預售中",
  completed: "成屋",
};

export type Project = {
  id: string;
  /** 建案名。原文照錄，不要改字 */
  name: string;
  /** 別名／舊名，例如「遠雄之星9」 */
  alias?: string;
  /** 建商。沒把握留空 */
  builder?: string;
  /** true = 建商是從建案名推定的，尚未查證 */
  builderGuess?: boolean;
  /** 總戶數 */
  units?: number;
  status: ProjectStatus;
  /** 坐落路段。查得到才填 */
  streets?: string;
  /** 房型與坪數 */
  layout?: string;
  /** 樓層規劃 */
  floors?: string;
  /** 基地面積（坪） */
  siteAreaPing?: number;
  /** 街廓位置代號，對應 BLOCKS。填了才會標在地圖上 */
  block?: string;
  /** 資料出處，對應 SOURCES 的 key */
  sources: string[];
  /** 你本人核對過了嗎。預設 false */
  verified?: boolean;
  /** 自己的備註，會顯示在詳情 */
  note?: string;
};

/** 資料出處。畫面會把這些列成參考來源 */
export const SOURCES: Record<string, { label: string; url: string }> = {
  housefeel: {
    label: "HouseFeel 房感｜台中港市鎮中心買房指南",
    url: "https://www.housefeel.com.tw/article/台中港市鎮中心-台中港市鎮重劃區-台中港/",
  },
  mrjoewang: {
    label: "喬王的投資理財筆記｜台中港市鎮重劃區懶人包",
    url: "https://mrjoewang.com/taichung-port-consolidation-area/",
  },
  farglory: {
    label: "遠雄房地產｜建案熱區巡禮：台中港市鎮重劃區",
    url: "https://www.farglory-realty.com.tw/life-proposal/area-txg-port_function_20240103/",
  },
  leju: { label: "樂居", url: "https://www.leju.com.tw/" },
  h591: { label: "591 新建案", url: "https://newhouse.591.com.tw/" },
  knowhouse: { label: "Knowhouse 預售屋", url: "https://knowhouse.tw/" },
  land: {
    label: "臺中市政府地政局｜臺中港特定區(市鎮中心)市地重劃",
    url: "https://www.land.taichung.gov.tw/",
  },
};

/* ─────────────── 建案 ─────────────── */

/**
 * 目前收錄 23 案（成屋 16、預售 7），戶數來自 HouseFeel 的整理。
 *
 * ⚠️ 全部 `verified: false` —— 這是「我查到的」，不是「你核對過的」。
 *    你對這一區比任何網站都熟，掃一遍把錯的改掉、缺的補上，再把 verified 改 true。
 *
 * ⚠️ `block` 幾乎都是空的，所以地圖上還標不出點。原因寫在檔頭第 5 點。
 */
export const PROJECTS: Project[] = [
  /* ───── 預售中 ───── */
  {
    id: "lianyue-xin",
    name: "聯悅馨",
    builder: "聯悅建設",
    units: 765,
    status: "presale",
    streets: "梧棲區八德路一段、大仁路二段",
    note: "位於重劃區雙主幹道，三面臨路。",
    sources: ["housefeel", "mrjoewang", "leju"],
  },
  {
    id: "farglory-xingcheng",
    name: "遠雄星呈",
    builder: "遠雄建設",
    units: 663,
    status: "presale",
    sources: ["housefeel", "farglory"],
  },
  {
    id: "lianhong-boyue",
    name: "聯虹鉑玥",
    builder: "聯虹建設",
    units: 521,
    status: "presale",
    streets: "梧棲區四維東路",
    note: "聯虹建設與聯悅建設是不同公司，別混。",
    sources: ["housefeel", "knowhouse", "leju"],
  },
  {
    id: "jiatai-zhuoyue",
    name: "佳泰琢閱",
    builder: "佳泰建設",
    builderGuess: true,
    units: 467,
    status: "presale",
    sources: ["housefeel"],
  },
  {
    id: "xiesheng-gangxin",
    name: "協勝港心",
    builder: "協勝建設",
    builderGuess: true,
    units: 231,
    status: "presale",
    sources: ["housefeel"],
  },
  {
    id: "chunhong-mingri",
    name: "春虹明日享享",
    alias: "明日享享",
    builder: "春虹建設",
    units: 225,
    status: "presale",
    sources: ["housefeel", "mrjoewang"],
  },
  {
    id: "yixiang-youyishi",
    name: "益翔有藝仕",
    builder: "益翔建設",
    units: 157,
    status: "presale",
    sources: ["housefeel", "mrjoewang"],
  },

  /* ───── 成屋 ───── */
  {
    id: "farglory-xingfucheng",
    name: "遠雄幸福成",
    alias: "遠雄之星9",
    builder: "遠雄建設",
    units: 2495,
    status: "completed",
    streets: "梧棲區八德一路 × 八德東路 × 八德二路",
    layout: "2～4 房，約 23～45 坪",
    floors: "地上 28 層／地下 3 層",
    siteAreaPing: 6783,
    note: "本區規模最大的建案。住家約 2,454 戶、店面約 41 戶，平面車位約 2,130 個。",
    sources: ["housefeel", "leju", "h591", "farglory"],
  },
  {
    id: "farglory-star8",
    name: "遠雄之星8",
    builder: "遠雄建設",
    units: 721,
    status: "completed",
    sources: ["housefeel"],
  },
  {
    id: "changhong-tianqing",
    name: "長虹天擎",
    builder: "長虹建設",
    units: 607,
    status: "completed",
    sources: ["housefeel", "mrjoewang"],
  },
  {
    id: "shengxing-fengjing",
    name: "勝興豐境",
    builder: "勝興建設",
    builderGuess: true,
    units: 459,
    status: "completed",
    sources: ["housefeel"],
  },
  {
    id: "lianyue-ju",
    name: "聯悅聚",
    builder: "聯悅建設",
    builderGuess: true,
    units: 389,
    status: "completed",
    sources: ["housefeel"],
  },
  {
    id: "hezhu-haohaowo",
    name: "和築好好窩",
    builder: "和築建設",
    units: 375,
    status: "completed",
    sources: ["housefeel", "mrjoewang"],
  },
  {
    id: "changhong-tianyun",
    name: "長虹天韻",
    builder: "長虹建設",
    units: 370,
    status: "completed",
    sources: ["housefeel", "mrjoewang"],
  },
  {
    id: "farglory-star7",
    name: "遠雄之星7",
    builder: "遠雄建設",
    units: 344,
    status: "completed",
    sources: ["housefeel"],
  },
  {
    id: "zhonggang-yunding3",
    name: "中港雲頂3",
    builder: "聖賢建設",
    builderGuess: true,
    units: 315,
    status: "completed",
    note: "地塊圖上「聖賢建設・中港雲頂」那塊可能就是這案，但兩邊都還沒核實，先別當定論。",
    sources: ["housefeel"],
  },
  {
    id: "farglory-star",
    name: "遠雄之星",
    builder: "遠雄建設",
    units: 292,
    status: "completed",
    sources: ["housefeel"],
  },
  {
    id: "yixiang-youleshi",
    name: "益翔有樂仕",
    builder: "益翔建設",
    units: 288,
    status: "completed",
    sources: ["housefeel", "mrjoewang"],
  },
  {
    id: "xiehe-fengfu",
    name: "協和豐馥",
    builder: "協和建設",
    builderGuess: true,
    units: 246,
    status: "completed",
    sources: ["housefeel"],
  },
  {
    id: "shengmei-xinhengbin",
    name: "勝美新橫濱",
    builder: "勝美建設",
    builderGuess: true,
    units: 228,
    status: "completed",
    sources: ["housefeel"],
  },
  {
    id: "hezhu-jingtianxia",
    name: "和築鯨天下",
    builder: "和築建設",
    builderGuess: true,
    units: 193,
    status: "completed",
    sources: ["housefeel"],
  },
  {
    id: "farglory-star5",
    name: "遠雄之星5",
    builder: "遠雄建設",
    units: 184,
    status: "completed",
    sources: ["housefeel"],
  },
  {
    id: "zhonggang-yunding1",
    name: "中港雲頂1",
    builder: "聖賢建設",
    builderGuess: true,
    units: 114,
    status: "completed",
    sources: ["housefeel"],
  },
];

/* ─────────────── 統計 ─────────────── */

export function projectStats() {
  const presale = PROJECTS.filter((p) => p.status === "presale");
  const completed = PROJECTS.filter((p) => p.status === "completed");
  const units = PROJECTS.reduce((sum, p) => sum + (p.units ?? 0), 0);
  const builders = new Set(PROJECTS.map((p) => p.builder).filter(Boolean) as string[]);
  return {
    total: PROJECTS.length,
    presale: presale.length,
    completed: completed.length,
    units,
    builders: builders.size,
    verified: PROJECTS.filter((p) => p.verified).length,
    located: PROJECTS.filter((p) => p.block).length,
  };
}

/** 依建商分組，戶數多的排前面 */
export function byBuilder() {
  const map = new Map<string, Project[]>();
  for (const p of PROJECTS) {
    const key = p.builder ?? "未確認建商";
    const list = map.get(key);
    if (list) list.push(p);
    else map.set(key, [p]);
  }
  return [...map.entries()]
    .map(([builder, list]) => ({
      builder,
      list,
      units: list.reduce((s, p) => s + (p.units ?? 0), 0),
    }))
    .sort((a, b) => b.units - a.units);
}

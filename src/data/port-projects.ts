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
 *    踩過的例子：
 *      ・「聯虹鉑玥」看起來像聯悅，實際是**聯虹建設**，是不同公司。
 *      ・「中港雲頂」我從截圖誤讀成「聖賢建設」，正確是**聖璽建設**（2026-08-21 由本人更正）。
 *    只從名字推定的，一律填 `builderGuess: true`，畫面會標「建商推定」。
 *
 *    兩層確認分開看：
 *      拿掉 `builderGuess`  = 建商已確認
 *      `verified: true`     = 整筆（含戶數、狀態）都確認過
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
  /** 官方段別。重劃是一個案子橫跨兩個行政區，不是兩個重劃區 */
  sections: {
    梧棲區: ["梧棲段", "頂寮段", "下寮段"],
    清水區: ["槺榔段"],
  },
  note:
    "「市政重劃區」是在地俗稱，來自梧棲區公所、戶政所、衛生所將遷入本區。" +
    "在地也常把它拆成「梧棲重劃區」與「清水重劃區」兩半來講，但那是同一個重劃案跨兩個行政區，不是兩個重劃區。",
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
  /** 別名／舊名，例如「遠雄之星9」。會顯示在卡片上 */
  alias?: string;
  /**
   * 其他寫法，只用來比對物件、不顯示。
   * 例：「聯悅聚」在各處也被寫成「聯悦聚」（悅／悦異體字）。
   */
  aliases?: string[];
  /** 建商。沒把握留空 */
  builder?: string;
  /** true = 建商是從建案名推定的，尚未查證 */
  builderGuess?: boolean;
  /**
   * 行政區。重劃區橫跨梧棲與清水，清水客戶會想只看清水的案子。
   * ⚠️ 只在有直接證據時才填（房產網站的分類、官方地址）。
   *    不要從路名推 —— 「港都路」在清水，但同一條路系的「港都二路」是哪一區我沒有證據。
   */
  district?: "梧棲" | "清水";
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
  owner: {
    label: "黃瑋凱（在地實務確認）",
    url: "https://weikaihouse.com/",
  },
};

/* ─────────────── 建案 ─────────────── */

/**
 * 建案清單。戶數多數來自 HouseFeel 的整理，建商已由系統擁有者逐筆確認。
 *
 * ⚠️ 清單「完整性」還沒過關。2026-08-21 系統擁有者指出遠雄在本區是**遠1～遠9 系列**，
 *    我原本只收到 1、5、7、8、9 —— 已補上 2、3、6。
 *    **遠雄之星4 查不到任何資料**：台灣建案跳過「4」很常見，但也可能只是我沒查到，待確認。
 *    這件事的教訓：外部整理的清單會漏，別把「查到幾筆」當成「總共幾筆」。
 *
 * ⚠️ 全部 `verified: false` —— 建商確認過了，但戶數與預售／成屋狀態還沒。
 *
 * ⚠️ `block` 全是空的，所以地圖上還標不出點。原因寫在檔頭第 5 點。
 */
export const PROJECTS: Project[] = [
  /* ───── 預售中 ───── */
  {
    id: "lianyue-xin",
    name: "聯悅馨",
    builder: "聯悅建設",
    units: 765,
    status: "presale",
    district: "梧棲",
    streets: "八德路一段、大仁路二段",
    note: "位於重劃區雙主幹道，三面臨路。",
    sources: ["housefeel", "mrjoewang", "leju"],
  },
  {
    id: "farglory-xingcheng",
    name: "遠雄星呈",
    builder: "遠雄建設",
    units: 663,
    district: "清水",
    status: "presale",
    sources: ["housefeel", "farglory"],
  },
  {
    id: "lianhong-boyue",
    name: "聯虹鉑玥",
    builder: "聯虹建設",
    units: 521,
    status: "presale",
    district: "梧棲",
    streets: "四維東路",
    note: "聯虹建設與聯悅建設是不同公司，別混。",
    sources: ["housefeel", "knowhouse", "leju"],
  },
  {
    id: "jiatai-zhuoyue",
    name: "佳泰琢閱",
    builder: "佳泰建設",
    units: 467,
    status: "presale",
    sources: ["housefeel"],
  },
  {
    id: "xiesheng-gangxin",
    name: "協勝港心",
    builder: "協勝建設",
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
    district: "梧棲",
    streets: "八德一路 × 八德東路 × 八德二路",
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
    district: "清水",
    streets: "大勇路",
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
    units: 459,
    status: "completed",
    sources: ["housefeel"],
  },
  {
    id: "lianyue-ju",
    name: "聯悅聚",
    /** 房產網站與系統擁有者的物件都寫「聯悦聚」（異體字），比對物件時要一起認 */
    aliases: ["聯悦聚"],
    builder: "聯悅建設",
    units: 389,
    district: "清水",
    status: "completed",
    note: "行政區依系統擁有者在售物件「清水區・聯悦聚」確認。",
    sources: ["housefeel", "owner"],
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
    district: "清水",
    status: "completed",
    note: "行政區依系統擁有者在售物件「清水區・長虹天韻」確認。",
    sources: ["housefeel", "mrjoewang", "owner"],
  },
  {
    id: "jiahong-xinyi",
    name: "佳鋐新邑",
    builder: "佳鋐建設",
    units: 243,
    district: "梧棲",
    status: "completed",
    streets: "大仁路二段 291 巷 50 號",
    layout: "2～4 房，約 27～45 坪",
    floors: "地上 15 層／地下 4 層",
    siteAreaPing: 979,
    note: "佳鋐建設屬寶佳機構。公設比約 32.6%，坡道平面車位 248 個。這案原本不在我查到的清單裡，是從系統擁有者的在售物件反查出來的。",
    sources: ["owner", "leju"],
  },
  {
    id: "sakura-shizhenzhiying",
    name: "櫻花市鎮之櫻",
    alias: "市鎮之櫻",
    builder: "櫻花建設",
    district: "清水",
    status: "completed",
    streets: "港新三路、港埠路三段",
    layout: "2～4 房，約 25～49 坪",
    note: "⚠️ 總戶數尚未查到。這案原本不在我查到的清單裡，是從系統擁有者的在售物件反查出來的。",
    sources: ["owner", "leju", "h591"],
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
    builder: "聖璽建設",
    units: 315,
    status: "completed",
    note: "建商由系統擁有者確認。先前誤植為「聖賢建設」——那是從原始截圖誤讀的，地塊圖那邊已一併更正。",
    sources: ["housefeel", "owner"],
  },
  {
    id: "farglory-star1",
    name: "遠雄之星1",
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
    units: 246,
    status: "completed",
    sources: ["housefeel"],
  },
  {
    id: "shengmei-xinhengbin",
    name: "勝美新橫濱",
    builder: "勝美建設",
    units: 228,
    status: "completed",
    sources: ["housefeel"],
  },
  {
    id: "hezhu-jingtianxia",
    name: "和築鯨天下",
    builder: "和築建設",
    units: 193,
    status: "completed",
    sources: ["housefeel"],
  },
  {
    id: "farglory-star3",
    name: "遠雄之星3",
    builder: "遠雄建設",
    units: 276,
    status: "completed",
    streets: "港新三路 × 四維東路",
    layout: "2～4 房，約 29～51 坪",
    floors: "地上 15 層／地下 3 層",
    siteAreaPing: 1468,
    note: "另有 10 間店面。民國 107 年 9 月完工。系統擁有者指出遠雄在本區為遠1～遠9 系列，本案是補上的缺口。",
    sources: ["owner", "h591"],
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
    id: "farglory-star2",
    name: "遠雄之星2",
    builder: "遠雄建設",
    units: 140,
    status: "completed",
    streets: "港新五路 × 港都二路",
    layout: "2～4 房，約 28～44 坪",
    floors: "地上 15 層／地下 3 層",
    siteAreaPing: 677,
    note: "民國 106 年 10 月完工。系統擁有者指出遠雄在本區為遠1～遠9 系列，本案是補上的缺口。",
    sources: ["owner", "h591"],
  },
  {
    id: "farglory-star6",
    name: "遠雄之星6",
    builder: "遠雄建設",
    status: "completed",
    district: "清水",
    streets: "港都路 151 號",
    note: "⚠️ 總戶數尚未查到，待補。系統擁有者指出遠雄在本區為遠1～遠9 系列，本案是補上的缺口。",
    sources: ["owner", "leju"],
  },
  {
    id: "zhonggang-yunding1",
    name: "中港雲頂1",
    builder: "聖璽建設",
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
    wuqi: PROJECTS.filter((p) => p.district === "梧棲").length,
    qingshui: PROJECTS.filter((p) => p.district === "清水").length,
    /** 還沒查到在哪一區的。重劃區橫跨兩區，這欄空著客戶就篩不到 */
    districtUnknown: PROJECTS.filter((p) => !p.district).length,
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

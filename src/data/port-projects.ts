/**
 * 🏢 台中港市鎮中心市地重劃區 —— 建案總覽資料層
 *
 * 這一支是 `/map` 的「建案」圖層資料。土地地塊資料在 `port-district.ts`，兩者分開。
 *
 * ⚠️ 先讀這段再改東西 ⚠️
 *
 * 1. **建商、區域、完工年、狀態這四欄，全部來自系統擁有者提供的建案總表**
 *    （2026-08-21）。他是在地房仲，這份比任何房產網站都完整——我自己查只查到 28 案，
 *    他的表有 39 案，多出 11 案是我完全沒查到的。
 *    **這四欄要改，先問他，不要用網路資料覆蓋。**
 *
 * 2. 戶數、坪數、樓層、基地面積、坐落路段來自公開資料（見 `sources`），
 *    他沒有逐筆確認過，可能有誤差。
 *
 * 3. `builder` 沒把握就留空，不要用建案名去猜。踩過的例子：
 *      ・「聯虹鉑玥」看起來像聯悅，實際是**聯虹建設**，是不同公司。
 *      ・「中港雲頂」我從截圖誤讀成「聖賢建設」，正確是**聖璽建設**。
 *
 * 4. **不放價格**（拍板決定）。開價寫在自己網站上等於發布廣告，會過期、要一直維護，
 *    還有不實廣告風險。客戶想知道行情就讓他預約。
 *
 * 5. `street` 是主要坐落道路，地圖靠它定位。**沒把握就留空** ——
 *    標錯位置比不標更糟，那是 `/map` 上次被雪藏的原因。
 *
 * 6. 異體字：各處對「聯悅／聯悦」「豐／丰」寫法不一。顯示用標準字，
 *    `aliases` 只用在建案自己的別名（例：遠雄之星9＝遠雄幸福成）。
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

/**
 * 銷售階段。系統擁有者的表裡還有「成屋／新成屋」「預售／交屋期」這種跨階段寫法，
 * 那些原文放在 `statusNote`，這裡只取主要階段供篩選用。
 */
export type ProjectStatus = "presale" | "newly" | "completed";

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  presale: "預售中",
  newly: "新成屋",
  completed: "成屋",
};

/**
 * 位置。原本只有重劃區那三個值，2026-08-27 系統擁有者要把 `/map` 的篩選改成
 * 「整個海線生活圈」，所以把沙鹿那四個商圈也加進來。
 *
 * ⚠️ 商圈那四個目前**一個建案都沒有**（39 案全在重劃區內）。這是刻意留的空位 ——
 *    系統擁有者說之後會補商圈的建案。要補的時候把該案的 `area` 設成對應的值即可。
 *
 * 原本有個「市鎮中心」值，2026-08-27 系統擁有者拍板不要這一塊，掛著它的 3 案
 * （佳泰琢閱、協勝港心、長虹天籟）**由他指定全部歸梧棲**，該值已整個拿掉。
 */
export type ProjectArea =
  | "梧棲"
  | "清水"
  | "梧棲市區"
  | "清水市區"
  | "鹿寮萬家福"
  | "沙鹿車站"
  | "新光田";

/** 建案詳情面板「位置」那一列用的字。跟篩選臉的字**刻意分開**（見 AREA_FILTER_LABEL） */
export const AREA_LABEL: Record<ProjectArea, string> = {
  梧棲: "梧棲區",
  清水: "清水區",
  梧棲市區: "梧棲市區",
  清水市區: "清水市區",
  鹿寮萬家福: "鹿寮萬家福商圈",
  沙鹿車站: "沙鹿車站商圈",
  新光田: "新光田特區",
};

/**
 * `/map` 篩選臉上的字與順序。**這裡列到的才會變成一顆臉**，
 * 所以「市鎮中心」不在裡面 —— 它還是合法的 area 值，只是不給篩。
 *
 * 名字跟 `port-zones.ts` 的色塊對齊（梧棲清水市鎮重劃區拆成梧棲／清水兩半來篩，
 * 因為那是同一個重劃案跨兩個行政區，客戶習慣拆開講）。
 */
export const AREA_FILTERS: ReadonlyArray<{ value: ProjectArea; label: string }> = [
  // 重劃區兩半（同一個重劃案跨兩個行政區，客戶習慣拆開講）
  { value: "梧棲", label: "梧棲重劃區" },
  { value: "清水", label: "清水重劃區" },
  // 兩個舊市區
  { value: "梧棲市區", label: "梧棲市區" },
  { value: "清水市區", label: "清水市區" },
  // 沙鹿那三個。「鹿寮萬家福」是 2026-08-27 系統擁有者把原本分開的
  // 鹿寮商圈與萬家福商圈併成一塊（兩塊上下相鄰、寬度幾乎一樣）
  { value: "鹿寮萬家福", label: "鹿寮萬家福商圈" },
  { value: "沙鹿車站", label: "沙鹿車站商圈" },
  { value: "新光田", label: "新光田特區" },
];

export type Project = {
  id: string;
  /** 建案名。原文照錄，不要改字 */
  name: string;
  /** 別名／舊名，例如「遠雄之星9」。會顯示在卡片上 */
  alias?: string;
  /** 其他寫法，只用來比對物件、不顯示 */
  aliases?: string[];
  /** 建商。來自系統擁有者的總表 */
  builder: string;
  /** 位置。來自系統擁有者的總表 */
  area: ProjectArea;
  /** 銷售階段。來自系統擁有者的總表 */
  status: ProjectStatus;
  /** 總表上的原始狀態文字，跨階段時保留（例：「預售／交屋期」） */
  statusNote?: string;
  /** 完工年。來自系統擁有者的總表，可能是「2023」「約2025」「興建中」 */
  completion: string;
  /** 總戶數。來自公開資料，未經逐筆確認 */
  units?: number;
  /** 主要坐落道路。地圖靠它定位，沒把握留空 */
  street?: string;
  /** 完整坐落描述 */
  streets?: string;
  /** 房型與坪數 */
  layout?: string;
  /** 樓層規劃 */
  floors?: string;
  /** 基地面積（坪） */
  siteAreaPing?: number;
  /**
   * 公設比，原文照建商公開資料寫，例如「約 32%」「31～34%」。
   *
   * ⚠️ **沒有確切數字就留空，不要抓一個大概填進去。** 公設比是客戶拿來算
   *    實際使用坪數的依據，寫錯就是廣告不實。同一個建案不同戶型也會有落差，
   *    所以用字串存區間，不是單一數字。
   */
  publicRatio?: string;
  /** 資料出處，對應 SOURCES 的 key */
  sources: string[];
  /** 自己的備註，會顯示在詳情 */
  note?: string;
};

/** 資料出處。畫面會把這些列成參考來源 */
/* ─────────────── 周邊生活機能 ─────────────── */

/**
 * 周邊生活機能。**整個重劃區共用一份，不是每案一份** ——
 * 39 個建案全部落在同一個 114 公頃的重劃區內（約 1 公里見方），
 * 走路或三分鐘車程到的超市、醫療、公園幾乎是同一批。做成每案一份的話，
 * 會變成 39 份九成相同的清單，改一間店要改 39 個地方，一定會漏。
 *
 * 真的有某案特別近或特別遠，寫在那一案的 `note` 裡，不要為此拆成每案一份。
 *
 * ⚠️ **沒有實際查證過的不要寫。** 這是給客戶看的生活機能：寫到已經收掉的店、
 *    或把距離講得比實際近，都是廣告不實。系統擁有者是海線在地房仲，
 *    這份以他提供的為準，不要拿網路搜尋結果填進來。
 *
 * `items` 是空陣列的分類，畫面上整個不顯示（不會出現「醫療：」後面空白）。
 */
export type AmenityGroup = {
  /** 分類標題，例如「超市賣場」 */
  label: string;
  /** 這一類有哪些。留空 = 還沒填，畫面不顯示這一類 */
  items: string[];
};

export const DISTRICT_AMENITIES: AmenityGroup[] = [
  { label: "超市賣場", items: ["全聯清水四維東店", "三井outlet", "清水第二市場"] },
  { label: "醫療", items: ["梧棲童綜合醫院"] },
  { label: "公園藝文", items: ["頂漁寮公園"] },
  // 瑋凱 2026-08-27 給資料時這一類沒提，先留空（留空整類不顯示）
  { label: "熱門商圈", items: [] },
];

/** 有填東西的分類才回傳 —— 四類全空時回空陣列，畫面就整段不顯示 */
export function filledAmenities(): AmenityGroup[] {
  return DISTRICT_AMENITIES.filter((g) => g.items.length > 0);
}

/* ─────────────── 屋齡 ─────────────── */

/**
 * 從 `completion` 算屋齡。**不另外存屋齡欄位** —— 存了每年就要全部改一次，
 * 一定會有人忘記，然後網站上就掛著去年的屋齡。改成每次顯示時現算。
 *
 * `completion` 的寫法很雜（39 案實際出現過的）：
 *   「2017」單一年、「約 2025」概數、「約 2016～17」區間、「興建中」沒有年份。
 *
 * 區間的處理：兩個年份都算，回傳「約 9～10 年」。**刻意不取比較晚的那年**，
 * 取晚的會讓屋齡看起來比較新，那是往對自己有利的方向取巧。
 */
export function houseAge(completion: string, now = new Date()): string | null {
  const thisYear = now.getFullYear();

  // 「2016～17」的 17 要補成 2017，直接當 17 年會變成西元 17 年
  const m = completion.match(/(\d{4})\s*[～~\-–]\s*(\d{2,4})/);
  const years: number[] = [];
  if (m) {
    const from = Number(m[1]);
    const rawTo = m[2];
    const to = rawTo.length === 4 ? Number(rawTo) : Math.floor(from / 100) * 100 + Number(rawTo);
    years.push(from, to);
  } else {
    const one = completion.match(/(\d{4})/);
    if (one) years.push(Number(one[1]));
  }

  // 「興建中」這種沒有年份的，不要硬算
  if (years.length === 0) return null;

  const approx = completion.includes("約");
  const ages = years.map((y) => thisYear - y);

  // 完工年還沒到 —— 講「屋齡 -1 年」很怪，直接說還沒完工
  if (ages.every((a) => a < 0)) return null;

  const lo = Math.min(...ages);
  const hi = Math.max(...ages);
  const prefix = approx ? "約 " : "";

  // 今年才完工的算 0 年，寫「屋齡 0 年」不像話
  // 「未滿」本身就是概數了，前面再加「約」會變成「約未滿 1 年」，不通順
  if (hi === 0) return "未滿 1 年";
  if (lo === hi) return `${prefix}${hi} 年`;
  // 區間但低標是 0（例：約 2026～27，今年 2026）
  if (lo <= 0) return `未滿 ${hi + 1} 年`;
  return `${prefix}${lo}～${hi} 年`;
}

export const SOURCES: Record<string, { label: string; url: string }> = {
  owner: {
    label: "黃瑋凱｜台中海線在地建案總表",
    url: "https://weikaihouse.com/",
  },
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
 * 39 案。順序照系統擁有者的總表（依建商分組），畫面自己會排序，不用動這裡的順序。
 *
 * `sources` 一定含 `owner`——建商／區域／完工／狀態都是他給的。
 * 另外掛的來源（housefeel、leju…）是戶數與坪數樓層那些欄位的出處。
 */
export const PROJECTS: Project[] = [
  // ───── 安美建設 ─────
  { id: "anmei-xue", name: "安美學", builder: "安美建設", area: "梧棲", status: "completed", completion: "2023", units: 168, sources: ["owner"] },

  // ───── 佳泰建設 ─────
  {
    id: "jiatai-zhuoyue", name: "佳泰琢閱", builder: "佳泰建設", area: "梧棲",
    status: "presale", completion: "興建中", units: 467, sources: ["owner", "housefeel"],
  },

  // ───── 佳福建設 ─────
  { id: "jiafu-bosishi", name: "佳福柏斯市", builder: "佳福建設", area: "梧棲", status: "completed", completion: "2024", units: 301, sources: ["owner"] },

  // ───── 佳鋐建設（寶佳機構） ─────
  { id: "jiahong-lewan", name: "佳鋐樂灣", builder: "佳鋐建設", area: "梧棲", status: "completed", completion: "2018", units: 144, sources: ["owner"] },
  { id: "jiahong-qingwan", name: "佳鋐晴灣", builder: "佳鋐建設", area: "清水", status: "completed", completion: "2020", units: 194, sources: ["owner"] },
  { id: "jiahong-leyi", name: "佳鋐樂邑", builder: "佳鋐建設", area: "梧棲", status: "completed", completion: "2023", units: 115, sources: ["owner"] },
  {
    id: "jiahong-xinyi", name: "佳鋐新邑", builder: "佳鋐建設", area: "梧棲",
    status: "completed", completion: "2024", units: 243,
    street: "大仁路二段", streets: "大仁路二段 291 巷 50 號",
    layout: "2～4 房，約 27～45 坪", floors: "地上 15 層／地下 4 層", siteAreaPing: 979,
    note: "佳鋐建設屬寶佳機構。公設比約 32.6%，坡道平面車位 248 個。",
    sources: ["owner", "leju"],
  },

  // ───── 佳瓚建設 ─────
  { id: "jiazan-dahe", name: "佳瓚大賀", builder: "佳瓚建設", area: "梧棲", status: "completed", completion: "2024", units: 234, sources: ["owner"] },

  // ───── 協和建設 ─────
  { id: "xiehe-fengjing", name: "協和丰景", builder: "協和建設", area: "清水", status: "completed", completion: "2024", units: 230, sources: ["owner"] },
  {
    id: "xiehe-fengfu", name: "協和豐馥", builder: "協和建設", area: "清水",
    status: "completed", completion: "2024", units: 246, sources: ["owner", "housefeel"],
  },

  // ───── 協勝建設 ─────
  {
    id: "xiesheng-gangxin", name: "協勝港心", builder: "協勝建設", area: "梧棲",
    status: "presale", completion: "興建中", units: 231, sources: ["owner", "housefeel"],
  },

  // ───── 春虹建設 ─────
  {
    id: "chunhong-mingri", name: "明日享享", aliases: ["春虹明日享享"], builder: "春虹建設",
    area: "清水", status: "presale", statusNote: "預售／交屋期", completion: "約 2026",
    units: 225, sources: ["owner", "housefeel", "mrjoewang"],
  },

  // ───── 長虹建設 ─────
  {
    id: "changhong-tianqing", name: "長虹天擎", builder: "長虹建設", area: "梧棲",
    status: "completed", completion: "約 2023", units: 607, sources: ["owner", "housefeel", "mrjoewang"],
  },
  {
    id: "changhong-tianyun", name: "長虹天韻", builder: "長虹建設", area: "清水",
    status: "newly", statusNote: "成屋／新成屋", completion: "約 2024", units: 370,
    sources: ["owner", "housefeel", "mrjoewang"],
  },
  {
    id: "changhong-tianlai", name: "長虹天籟", builder: "長虹建設", area: "梧棲",
    status: "presale", completion: "興建中", units: 373, sources: ["owner", "mrjoewang"],
  },

  // ───── 益翔建設 ─────
  {
    id: "yixiang-youleshi", name: "益翔有樂仕", builder: "益翔建設", area: "梧棲",
    status: "completed", completion: "約 2024～25", units: 288, sources: ["owner", "housefeel", "mrjoewang"],
  },
  {
    id: "yixiang-youyishi", name: "益翔有藝仕", builder: "益翔建設", area: "梧棲",
    status: "presale", statusNote: "預售／新成屋", completion: "約 2026", units: 157,
    sources: ["owner", "housefeel", "mrjoewang"],
  },

  // ───── 勝美建設 ─────
  {
    id: "shengmei-xinhengbin", name: "勝美新橫濱", builder: "勝美建設", area: "清水",
    status: "completed", completion: "2018", units: 228,
    // 瑋凱 2026-08-27：這種「某一案特別近」的機能寫在各案 note，
    // 不要往整區共用的 DISTRICT_AMENITIES 加 —— 加了等於對 39 案都宣稱樓下有全家
    note: "大樓下方就有全家超商",
    sources: ["owner", "housefeel"],
  },

  // ───── 勝興建設 ─────
  {
    id: "shengxing-fengjing", name: "勝興豐境", builder: "勝興建設", area: "梧棲",
    status: "completed", completion: "約 2025", units: 459, sources: ["owner", "housefeel"],
  },

  // ───── 和築建設 ─────
  {
    id: "hezhu-jingtianxia", name: "和築鯨天下", builder: "和築建設", area: "清水",
    status: "completed", completion: "2020", units: 193, sources: ["owner", "housefeel"],
  },
  {
    id: "hezhu-haohaowo", name: "和築好好窩", builder: "和築建設", area: "梧棲",
    status: "completed", completion: "2023", units: 375, sources: ["owner", "housefeel", "mrjoewang"],
  },

  // ───── 聚佳建設 ─────
  { id: "jujia-xinshidai", name: "聚佳欣世代", builder: "聚佳建設", area: "梧棲", status: "completed", completion: "2023", units: 173, sources: ["owner"] },

  // ───── 聖璽建設 ─────
  {
    id: "zhonggang-yunding1", name: "中港雲頂1", builder: "聖璽建設", area: "梧棲",
    status: "completed", completion: "約 2016～17", units: 114, sources: ["owner", "housefeel"],
  },
  {
    id: "zhonggang-yunding3", name: "中港雲頂3", builder: "聖璽建設", area: "梧棲",
    status: "completed", completion: "2022", units: 315, sources: ["owner", "housefeel"],
  },

  // ───── 聯虹建設 ─────
  {
    id: "lianhong-boyue", name: "聯虹鉑玥", builder: "聯虹建設", area: "梧棲",
    status: "presale", completion: "興建中", units: 521,
    street: "四維東路", streets: "四維東路",
    note: "聯虹建設與聯悅建設是不同公司，別混。",
    sources: ["owner", "housefeel", "knowhouse", "leju"],
  },

  // ───── 聯悅建設 ─────
  {
    id: "lianyue-ju", name: "聯悅聚", aliases: ["聯悦聚"], builder: "聯悅建設", area: "清水",
    status: "completed", completion: "2021", units: 389, sources: ["owner", "housefeel"],
  },
  { id: "lianyue-fu", name: "聯悅馥", aliases: ["聯悦馥"], builder: "聯悅建設", area: "梧棲", status: "completed", completion: "2024", units: 494, sources: ["owner"] },
  { id: "lianyue-zhen", name: "聯悅臻", aliases: ["聯悦臻"], builder: "聯悅建設", area: "梧棲", status: "newly", completion: "約 2025", units: 883, sources: ["owner"] },
  {
    id: "lianyue-xin", name: "聯悅馨", aliases: ["聯悦馨"], builder: "聯悅建設", area: "梧棲",
    status: "presale", completion: "約 2026～27", units: 765,
    street: "八德路一段", streets: "八德路一段、大仁路二段",
    note: "位於重劃區雙主幹道，三面臨路。",
    sources: ["owner", "housefeel", "mrjoewang", "leju"],
  },

  // ───── 櫻花建設 ─────
  {
    id: "sakura-shizhenzhiying", name: "櫻花市鎮之櫻", alias: "市鎮之櫻", builder: "櫻花建設",
    area: "清水", status: "newly", statusNote: "成屋／新成屋", completion: "約 2025", units: 461,
    street: "港新三路", streets: "港新三路、港埠路三段",
    layout: "2～4 房，約 25～49 坪",
    sources: ["owner", "leju", "h591"],
  },

  // ───── 遠雄建設 ─────
  {
    id: "farglory-star1", name: "遠雄之星1", builder: "遠雄建設", area: "清水",
    status: "completed", completion: "2017", units: 292, sources: ["owner", "housefeel"],
  },
  {
    id: "farglory-star2", name: "遠雄之星2", builder: "遠雄建設", area: "清水",
    status: "completed", completion: "2017", units: 140,
    street: "港新五路", streets: "港新五路 × 港都二路",
    layout: "2～4 房，約 28～44 坪", floors: "地上 15 層／地下 3 層", siteAreaPing: 677,
    sources: ["owner", "h591"],
  },
  {
    id: "farglory-star3", name: "遠雄之星3", builder: "遠雄建設", area: "清水",
    status: "completed", completion: "2018", units: 276,
    street: "港新三路", streets: "港新三路 × 四維東路",
    layout: "2～4 房，約 29～51 坪", floors: "地上 15 層／地下 3 層", siteAreaPing: 1468,
    note: "另有 10 間店面。",
    sources: ["owner", "h591"],
  },
  {
    id: "farglory-star5", name: "遠雄之星5", builder: "遠雄建設", area: "清水",
    status: "completed", completion: "2019", units: 184, sources: ["owner", "housefeel"],
  },
  {
    id: "farglory-star6", name: "遠雄之星6", builder: "遠雄建設", area: "清水",
    status: "completed", completion: "2020", units: 642,
    street: "港都路", streets: "港都路 151 號",
    sources: ["owner", "leju"],
  },
  {
    id: "farglory-star7", name: "遠雄之星7", builder: "遠雄建設", area: "清水",
    status: "completed", completion: "2022", units: 344, sources: ["owner", "housefeel"],
  },
  {
    id: "farglory-star8", name: "遠雄之星8", builder: "遠雄建設", area: "清水",
    status: "completed", completion: "2023", units: 721,
    street: "大勇路", streets: "大勇路",
    sources: ["owner", "housefeel"],
  },
  {
    id: "farglory-xingfucheng", name: "遠雄幸福成", alias: "遠雄之星9", builder: "遠雄建設",
    area: "梧棲", status: "newly", completion: "約 2025", units: 2495,
    street: "八德一路", streets: "八德一路 × 八德東路 × 八德二路",
    layout: "2～4 房，約 23～45 坪", floors: "地上 28 層／地下 3 層", siteAreaPing: 6783,
    note: "本區規模最大的建案。住家約 2,454 戶、店面約 41 戶，平面車位約 2,130 個。",
    sources: ["owner", "housefeel", "leju", "h591", "farglory"],
  },
  {
    id: "farglory-xingcheng", name: "遠雄星呈", builder: "遠雄建設", area: "清水",
    status: "presale", completion: "約 2027", units: 663, sources: ["owner", "housefeel", "farglory"],
  },
];

/* ─────────────── 座標 ─────────────── */

/**
 * 建案在地圖上的位置。
 *
 * 刻意跟建案資料分開放：位置是「會被修正」的東西，改這裡不用碰上面那一大包。
 *
 * `precision` 是誠實標記，畫面上會反映：
 *   "exact"  —— 有門牌或巷弄，位置可信（巷很短，誤差通常在一個街廓內）
 *   "street" —— 只知道在哪條路，座標取那條路的中點，**可能差到一兩個街廓**
 *
 * 座標來源：OpenStreetMap 的路網資料（Overpass API 查 24.254–24.276N, 120.529–120.550E）。
 * OSM 在台灣**沒有門牌級資料**，所以沒辦法用地址直接轉座標，只能用路段／巷弄定位。
 *
 * ⚠️ 要校正：打開 `/map?fix=1`，在地圖上點正確位置，畫面會給你一行可以貼回這裡的程式碼。
 *    你比任何資料庫都清楚這些樓在哪，點一遍就是最準的版本。
 */
export type Coord = { lat: number; lng: number; precision: "exact" | "street" };

export const COORDS: Record<string, Coord> = {
  /* ── 系統擁有者本人用 /map?fix=1 在地圖上點的（2026-08-23）──
     這是最可信的一批。他是在地房仲，每一棟都親眼看過。
     覆蓋掉我先前用路網推的位置時，落差最大到 270 公尺（遠雄之星2），
     印證了「只查到路名」那種座標真的會差一兩個街廓。 */
  "farglory-star2": { lat: 24.26866, lng: 120.53918, precision: "exact" },
  "lianyue-ju": { lat: 24.26959, lng: 120.53942, precision: "exact" },
  "xiehe-fengjing": { lat: 24.26852, lng: 120.54107, precision: "exact" },
  "xiehe-fengfu": { lat: 24.26867, lng: 120.54062, precision: "exact" },
  "lianyue-fu": { lat: 24.26704, lng: 120.5411, precision: "exact" },
  "shengmei-xinhengbin": { lat: 24.26725, lng: 120.54305, precision: "exact" },
  "hezhu-jingtianxia": { lat: 24.26861, lng: 120.54179, precision: "exact" },
  "sakura-shizhenzhiying": { lat: 24.26604, lng: 120.5425, precision: "exact" },
  "farglory-star7": { lat: 24.26633, lng: 120.54178, precision: "exact" },
  "jiatai-zhuoyue": { lat: 24.26265, lng: 120.54106, precision: "exact" },
  "lianhong-boyue": { lat: 24.26209, lng: 120.54037, precision: "exact" },
  "shengxing-fengjing": { lat: 24.2626, lng: 120.53901, precision: "exact" },
  "jiafu-bosishi": { lat: 24.26045, lng: 120.53844, precision: "exact" },
  "jujia-xinshidai": { lat: 24.2622, lng: 120.5327, precision: "exact" },
  "hezhu-haohaowo": { lat: 24.26239, lng: 120.53193, precision: "exact" },
  "jiahong-leyi": { lat: 24.26141, lng: 120.53354, precision: "exact" },
  "jiahong-lewan": { lat: 24.26144, lng: 120.53477, precision: "exact" },
  "jiahong-xinyi": { lat: 24.26192, lng: 120.53543, precision: "exact" },
  "anmei-xue": { lat: 24.26222, lng: 120.53502, precision: "exact" },

  // 第二批（同樣是本人親手標的）
  "lianyue-xin": { lat: 24.26474, lng: 120.53231, precision: "exact" },
  "lianyue-zhen": { lat: 24.26573, lng: 120.53065, precision: "exact" },
  "farglory-xingfucheng": { lat: 24.26539, lng: 120.53495, precision: "exact" },
  "farglory-star1": { lat: 24.26896, lng: 120.53832, precision: "exact" },
  "farglory-star5": { lat: 24.26947, lng: 120.53694, precision: "exact" },
  "farglory-star6": { lat: 24.2685, lng: 120.53685, precision: "exact" },
  "farglory-star8": { lat: 24.2676, lng: 120.53645, precision: "exact" },
  "farglory-xingcheng": { lat: 24.26665, lng: 120.53866, precision: "exact" },
  "chunhong-mingri": { lat: 24.27019, lng: 120.53734, precision: "exact" },
  "jiazan-dahe": { lat: 24.26073, lng: 120.53529, precision: "exact" },
  "yixiang-youleshi": { lat: 24.2702, lng: 120.53329, precision: "exact" },
  "yixiang-youyishi": { lat: 24.2699, lng: 120.53225, precision: "exact" },
  "zhonggang-yunding3": { lat: 24.26878, lng: 120.53261, precision: "exact" },
  "changhong-tianlai": { lat: 24.26843, lng: 120.53348, precision: "exact" },
  "changhong-tianyun": { lat: 24.26907, lng: 120.53449, precision: "exact" },
  "changhong-tianqing": { lat: 24.26539, lng: 120.53136, precision: "exact" },
  "xiesheng-gangxin": { lat: 24.26319, lng: 120.53227, precision: "exact" },
  "jiahong-qingwan": { lat: 24.26902, lng: 120.53392, precision: "exact" },
  "zhonggang-yunding1": { lat: 24.26408, lng: 120.53372, precision: "exact" },
  "farglory-star3": { lat: 24.26696, lng: 120.54219, precision: "exact" },

  /* ✅ 2026-08-23：39 案全部標完，而且全部是本人親手點的。
     我用 OSM 路網推的那批已經全數被覆蓋掉 —— 實測落差 180～270 公尺，
     留著只會誤導客戶。以後新增建案，座標一律走 /map?fix=1 由本人標。 */
};

/** 重劃區大致中心，地圖初始視角用 */
export const MAP_CENTER = { lat: 24.2655, lng: 120.5375 } as const;

/* ─────────────── 統計 ─────────────── */

export function projectStats() {
  const units = PROJECTS.reduce((sum, p) => sum + (p.units ?? 0), 0);
  const builders = new Set(PROJECTS.map((p) => p.builder));
  return {
    total: PROJECTS.length,
    presale: PROJECTS.filter((p) => p.status === "presale").length,
    newly: PROJECTS.filter((p) => p.status === "newly").length,
    completed: PROJECTS.filter((p) => p.status === "completed").length,
    units,
    /** 有登錄戶數的案數。總戶數是這些案加起來的，不是全部 39 案 */
    withUnits: PROJECTS.filter((p) => p.units != null).length,
    builders: builders.size,
    wuqi: PROJECTS.filter((p) => p.area === "梧棲").length,
    qingshui: PROJECTS.filter((p) => p.area === "清水").length,
    /** 地圖上標得出位置的案數 */
    located: PROJECTS.filter((p) => COORDS[p.id]).length,
    /** 其中位置可信（有巷弄門牌）的案數 */
    locatedExact: PROJECTS.filter((p) => COORDS[p.id]?.precision === "exact").length,
  };
}

/** 依建商分組，案數多的排前面 */
export function byBuilder() {
  const map = new Map<string, Project[]>();
  for (const p of PROJECTS) {
    const list = map.get(p.builder);
    if (list) list.push(p);
    else map.set(p.builder, [p]);
  }
  return [...map.entries()]
    .map(([builder, list]) => ({
      builder,
      list,
      units: list.reduce((s, p) => s + (p.units ?? 0), 0),
    }))
    .sort((a, b) => b.list.length - a.list.length || b.units - a.units);
}

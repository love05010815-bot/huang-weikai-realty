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
 * 2026-08-27 陸續補進商圈的建案：沙鹿車站 28 案、鹿寮萬家福 64 案，全部由系統擁有者整理。
 * 2026-09-01 再補北勢靜宜 80 案（同樣是他整理的）。
 * **梧棲市區、清水市區、新光田目前仍是 0 案**，那是刻意留的空位；
 * 要補的時候把該案的 `area` 設成對應的值即可，篩選臉與統計都會自己跟上。
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
  | "北勢靜宜"
  | "新光田";

/** 建案詳情面板「位置」那一列用的字。跟篩選臉的字**刻意分開**（見 AREA_FILTER_LABEL） */
export const AREA_LABEL: Record<ProjectArea, string> = {
  梧棲: "梧棲區",
  清水: "清水區",
  梧棲市區: "梧棲市區",
  清水市區: "清水市區",
  鹿寮萬家福: "鹿寮萬家福商圈",
  沙鹿車站: "沙鹿車站商圈",
  北勢靜宜: "北勢靜宜商圈",
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
  // 沙鹿那四個。「鹿寮萬家福」是 2026-08-27 系統擁有者把原本分開的
  // 鹿寮商圈與萬家福商圈併成一塊（兩塊上下相鄰、寬度幾乎一樣）。
  //
  // 「北勢靜宜」的篩選臉是 2026-08-27 補的（它在 port-zones.ts 早就有色塊，
  //    卻一直沒有篩選臉，是五塊色塊裡唯一篩不到的）。**2026-09-01 系統擁有者給了 80 案，
  //    不再是 0 案** —— 但那 80 案還沒有座標，點下去有清單、地圖上沒有圖釘。
  { value: "鹿寮萬家福", label: "鹿寮萬家福商圈" },
  { value: "沙鹿車站", label: "沙鹿車站商圈" },
  { value: "北勢靜宜", label: "北勢靜宜商圈" },
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
 * 周邊生活機能。**一個區共用一份，不是每案一份** ——
 * 同一區的建案彼此走路或三分鐘車程可到的超市、醫療、公園幾乎是同一批。
 * 做成每案一份的話，會變成幾十份九成相同的清單，改一間店要改幾十個地方，一定會漏。
 *
 * 真的有某案特別近或特別遠，寫在那一案的 `note` 裡，不要為此拆成每案一份。
 *
 * ⚠️ **2026-08-27 起這份改成「依 area 查表」，不再是全站共用一份。**
 *    原因：那份清單（清水第二市場、頂漁寮公園、梧棲童綜合醫院）是重劃區的機能，
 *    沙鹿車站商圈那 28 案離那裡好幾公里。全站共用的話，等於對每一個沙鹿建案
 *    宣稱它的生活圈是清水的市場與公園 —— 就是下面那條「廣告不實」自己在講的事，
 *    而且**不會報錯、畫面看起來還很正常**。
 *
 * ⚠️ **沒有實際查證過的不要寫。** 這是給客戶看的生活機能：寫到已經收掉的店、
 *    或把距離講得比實際近，都是廣告不實。系統擁有者是海線在地房仲，
 *    這份以他提供的為準，不要拿網路搜尋結果填進來。
 *    **沒有資料的區就讓它空著** —— 空的整段不顯示，比填錯好。
 *
 * `items` 是空陣列的分類，畫面上整個不顯示（不會出現「醫療：」後面空白）。
 */
export type AmenityGroup = {
  /** 分類標題，例如「超市賣場」 */
  label: string;
  /** 這一類有哪些。留空 = 還沒填，畫面不顯示這一類 */
  items: string[];
};

/** 重劃區（梧棲＋清水兩半）的機能。瑋凱 2026-08-27 提供 */
export const DISTRICT_AMENITIES: AmenityGroup[] = [
  { label: "超市賣場", items: ["全聯清水四維東店", "三井outlet", "清水第二市場"] },
  { label: "醫療", items: ["梧棲童綜合醫院"] },
  { label: "公園藝文", items: ["頂漁寮公園"] },
  // 瑋凱 2026-08-27 給資料時這一類沒提，先留空（留空整類不顯示）
  { label: "熱門商圈", items: [] },
];

/**
 * 鹿寮萬家福商圈的機能。瑋凱 2026-08-27 提供。
 *
 * ⚠️ **醫療是「童綜合醫院沙鹿院區」，不是重劃區那份的「梧棲童綜合醫院」** ——
 *    同一家醫院的不同院區，差好幾公里。這就是機能要分區存、不能全站共用一份的原因。
 *
 * ⚠️ 他給的分類名是「生活機能」，這裡歸到既有的「超市賣場」（內容都是量販／超市／市場），
 *    分類標題維持全站一致。**熱門商圈他沒提，留空**（留空整類不顯示）。
 */
export const LULIAO_AMENITIES: AmenityGroup[] = [
  {
    label: "超市賣場",
    items: [
      "萬家福量販沙鹿店",
      "全聯沙鹿中山店",
      "楓康超市沙鹿店",
      "DAISO 大創沙鹿店",
      "沙鹿公有零售市場",
    ],
  },
  { label: "醫療", items: ["童綜合醫院沙鹿院區"] },
  { label: "公園藝文", items: ["鹿鳴公園"] },
  { label: "熱門商圈", items: [] },
];

/**
 * 沙鹿火車站商圈的機能。瑋凱 2026-08-27 提供。
 *
 * ⚠️ **他給這份時沒說是哪一區**，是量出來的：他寫的醫療是「光田綜合醫院沙鹿院區」，
 *    而本檔頭記錄的光田沙鹿總院座標 24.23551,120.55807 **落在沙鹿車站商圈色塊內、
 *    不在鹿寮萬家福色塊內**（沙鹿車站 24.23713,120.55737 也一樣）。
 *    對照鹿寮那份：醫療是「童綜合醫院沙鹿院區」、超市有「萬家福量販沙鹿店」，
 *    而家樂福沙鹿店（在地稱萬家福）24.24261,120.56562 落在鹿寮色塊內。兩份分得很乾淨。
 *
 * ⚠️ **兩份都有的店（全聯沙鹿中山店、楓康、大創、沙鹿公有零售市場）不是重複填錯** ——
 *    兩塊商圈相鄰，這幾家就在交界一帶，兩邊走得到是合理的。
 *    差別在各自的代表性設施：鹿寮是萬家福量販＋童綜合沙鹿院區＋鹿鳴公園，
 *    沙鹿車站是光田沙鹿院區＋沙鹿公園＋深波圖書館。
 */
export const SHALU_STATION_AMENITIES: AmenityGroup[] = [
  {
    label: "超市賣場",
    items: [
      "全聯沙鹿中山店",
      "楓康超市沙鹿店",
      "DAISO 大創沙鹿店",
      "沙鹿公有零售市場",
    ],
  },
  { label: "醫療", items: ["光田綜合醫院沙鹿院區"] },
  { label: "公園藝文", items: ["沙鹿公園", "沙鹿圖書館深波分館"] },
];

/**
 * 北勢靜宜商圈的機能。瑋凱 2026-09-02 提供。
 *
 * ⚠️ **他給這份時標題寫的是「新光田區」，這裡卻掛在北勢靜宜 —— 是量出來的，不是打錯。**
 *    他列的 11 項拿去跟 `port-zones.ts` 的色塊做點在多邊形內測試：
 *    靜宜大學 24.22720/120.58067、弘光科技大學 24.21730/120.58262、六福公園 24.21602/120.57921、
 *    青山公園 24.22545/120.56734、南勢溪公園 24.21638/120.56348、兩家全聯 24.21761/120.57079
 *    與 24.22462/120.57701 —— **10 項都落在北勢靜宜色塊內**；
 *    **只有光田向上院區 24.20649/120.56289 落在新光田色塊內**。
 *    加上新光田目前 0 案（掛過去等於沒有任何畫面看得到），所以整份歸北勢靜宜。
 *    ⚠️ **他若說本意就是新光田，整份搬過去、北勢靜宜改回空的** —— 不要兩邊都掛。
 *
 * ⚠️ **醫療只有一項，而且那一項不在本色塊內**（向上院區在南邊的新光田色塊）。
 *    保留是因為那是他指定的、也是這一帶最近的新院區；**沙鹿院區在更北的沙鹿車站色塊，
 *    不要自作主張補進來** —— 兩個院區差好幾公里，這正是機能要分區存的原因。
 *    🔴 **OSM 上向上院區還標成 `construction`（施工中）** —— 若尚未開幕，
 *    寫成醫療機能對客戶是誤導，已請他確認。
 *
 * ⚠️ 分類名維持全站一致：他的「生活機能」歸「超市賣場」（跟鹿寮那份同樣處理），
 *    他的「公園與藝文」歸「公園藝文」。**「靜宜夜市」他放在生活機能，這裡移到「熱門商圈」**
 *    —— 夜市不是超市，而且熱門商圈這一類全站空到現在，這是第一筆。
 *
 * ⚠️ 「弘光大學」寫成官方全名「弘光科技大學」（OSM 實測到的名稱也是這個）。
 */
export const BEISHI_PROVIDENCE_AMENITIES: AmenityGroup[] = [
  {
    label: "超市賣場",
    items: [
      "全聯沙鹿北勢店",
      "全聯沙鹿屏西店",
      "小北百貨北勢東店",
      "瑞友生鮮百貨沙鹿店",
    ],
  },
  { label: "醫療", items: ["光田綜合醫院向上院區"] },
  {
    label: "公園藝文",
    items: ["六福公園", "青山公園", "南勢溪公園", "靜宜大學", "弘光科技大學"],
  },
  { label: "熱門商圈", items: ["靜宜夜市"] },
];

/**
 * area → 那一區的機能。**沒列到的區＝還沒有資料，整段不顯示。**
 *
 * ⚠️ **新光田與兩個市區的機能刻意空著。**
 *    ⚠️ 2026-09-02 起**北勢靜宜有機能了**（`BEISHI_PROVIDENCE_AMENITIES`，他親自給的）。
 *    **不要拿別區的借過去湊**：
 *     *    `DISTRICT_AMENITIES` 是重劃區的（清水第二市場、頂漁寮公園、梧棲童綜合醫院），
 *    `LULIAO_AMENITIES` 是鹿寮的（沙鹿的量販與沙鹿院區）—— 兩份差好幾公里。
 *
 *    ⚠️ **沙鹿車站商圈跟鹿寮萬家福都在沙鹿區，但機能是兩份、內容刻意不同 —— 不要合併。**
 *    2026-08-27 系統擁有者分兩次給，代表性設施完全不一樣：
 *    鹿寮＝萬家福量販＋**童**綜合醫院沙鹿院區＋鹿鳴公園；
 *    沙鹿車站＝**光田**綜合醫院沙鹿院區＋沙鹿公園＋深波圖書館。
 *    （兩份都有全聯沙鹿中山店等幾家，那是交界一帶的店，不是填重複。）
 */
const AMENITIES_BY_AREA: Partial<Record<ProjectArea, AmenityGroup[]>> = {
  梧棲: DISTRICT_AMENITIES,
  清水: DISTRICT_AMENITIES,
  鹿寮萬家福: LULIAO_AMENITIES,
  沙鹿車站: SHALU_STATION_AMENITIES,
  北勢靜宜: BEISHI_PROVIDENCE_AMENITIES,
};

/** 那一區有填東西的分類才回傳 —— 全空（或整個區沒資料）就回空陣列，畫面整段不顯示 */
export function filledAmenities(area: ProjectArea): AmenityGroup[] {
  return (AMENITIES_BY_AREA[area] ?? []).filter((g) => g.items.length > 0);
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
 * 順序照系統擁有者的總表（依建商分組再依他給的批次往下接），畫面自己會排序，
 * 不用動這裡的順序。**案數不要寫死在這裡** —— 用 `projectStats().total`。
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

  /* ═══════════════════════════════════════════════════════════════════════
     沙鹿車站商圈 28 案（2026-08-27 系統擁有者提供的整理）

     ⚠️ **這批一筆座標都沒有。** 圖釘要等系統擁有者用 `/map?fix=1` 逐案點。
        在那之前它們只出現在建案清單與篩選臉，地圖上沒有圖釘 ——
        `COORDS` 查不到就不畫，不會報錯，所以不要以為是壞了。

     ⚠️ 其中 8 案的坐落地點是**梧棲區**（佳瑞京湛、精銳錦、佳格聚晴山、富宇富嶼、
        德光一築、德光二城、悠助意境、沅臻城市），但 2026-08-27 系統擁有者指定
        「全部算沙鹿車站商圈」，所以 area 一律 `沙鹿車站`。
        ⚠️ 這裡原本寫「日後標上座標時，這 8 顆圖釘會落在沙鹿色塊外面，那是預期畫面」——
        **2026-08-27 這 8 案全部標完，8 個全部落在沙鹿色塊裡面，那個預測整個不成立**
        （沙鹿色塊當天由系統擁有者重畫成 41 點，範圍跟舊的 4 點方框差很多）。
        所以**不要再拿「行政區寫梧棲＝會落在沙鹿色塊外」去判斷任何事**。

     ⚠️ 屋齡是把系統擁有者給的「約 N 年」換算成 completion 年份寫進來的
        （`houseAge()` 會再算回去，2026 年時兩邊對得上）。
        **明年屋齡自己 +1 是正常的，不要回頭改這裡的年份。**

     ⚠️ 三個很容易打錯的建商（**案名有「德光」不代表建商是德光建設**，本檔已中兩次）：
        ・**佳鏵建設（佳鏵大心）不是佳鋐建設**（本檔已有佳鋐樂邑／樂灣／新邑／晴灣／科藝）
        ・**德光會的建商是德邑建設**，不是德光建設
        ・**德光星綻的建商是凱俊建設**，不是德光建設（2026-08-27 新增）
        真的是德光建設的只有：德光聚、德光一築、德光二城、德光耀。
     ═══════════════════════════════════════════════════════════════════════ */

  // ───── 富宇建設 ─────
  {
    id: "fuyu-guangyu", name: "富宇光嶼", builder: "富宇建設", area: "沙鹿車站",
    status: "presale", completion: "2028", units: 146,
    street: "新站一路", streets: "沙鹿區 新站一路 × 新站二路",
    layout: "2 房，約 22～28 坪", floors: "地上 15 層", siteAreaPing: 829,
    sources: ["owner"],
  },
  {
    id: "fuyu-zhencang", name: "富宇臻藏", builder: "富宇建設", area: "沙鹿車站",
    status: "presale", completion: "2027", units: 98,
    street: "和平街", streets: "沙鹿區 和平街／居仁段",
    layout: "2 房 23～28 坪、3 房 34～35 坪", floors: "地上 12 層／地下 4 層", siteAreaPing: 688,
    sources: ["owner"],
  },
  {
    id: "fuyu-fuyu", name: "富宇富嶼", builder: "富宇建設", area: "沙鹿車站",
    status: "presale", completion: "2029", units: 180,
    street: "興農路", streets: "梧棲區 興農路／興農段",
    layout: "3 房約 37～38 坪、3+1 房／4 房約 42 坪", floors: "地上 19 層／地下 4 層", siteAreaPing: 1023,
    sources: ["owner"],
  },

  // ───── 合總建設 ─────
  // 系列案「小時代」1、2、3、5 —— **沒有 4**，跟遠雄之星沒有遠4 一樣，不是漏了。
  {
    id: "hezong-xiaoshidai1", name: "合總小時代1", builder: "合總建設", area: "沙鹿車站",
    status: "completed", completion: "約 2020～21", units: 82,
    street: "斗潭路", streets: "沙鹿區 斗潭路 155 巷",
    layout: "2 房 25／28 坪、3 房 35 坪", floors: "地上 12 層／地下 2 層", siteAreaPing: 751,
    sources: ["owner"],
  },
  {
    id: "hezong-xiaoshidai2", name: "合總小時代2", builder: "合總建設", area: "沙鹿車站",
    status: "completed", completion: "約 2022", units: 126,
    street: "斗潭路", streets: "沙鹿區 斗潭路／文光國小一帶",
    layout: "2 房約 22.7～26.8 坪、3 房約 36.9～37.1 坪", floors: "地上 11 層／地下 2 層", siteAreaPing: 1296,
    sources: ["owner"],
  },
  {
    id: "hezong-xiaoshidai3", name: "合總小時代3", builder: "合總建設", area: "沙鹿車站",
    status: "completed", completion: "約 2023", units: 129,
    street: "斗潭路", streets: "沙鹿區 斗潭路 211 巷一帶",
    layout: "2 房 23～26 坪、3 房約 36 坪", floors: "地上 14 層／地下 2 層", siteAreaPing: 1369,
    sources: ["owner"],
  },
  {
    id: "hezong-xiaoshidai5", name: "合總小時代5", builder: "合總建設", area: "沙鹿車站",
    status: "completed", completion: "約 2023～24", units: 56,
    street: "斗潭路", streets: "沙鹿區 斗潭路 275 巷一帶",
    layout: "2～3 房為主", floors: "地上 12 層／地下 2 層", siteAreaPing: 552,
    sources: ["owner"],
  },

  // ───── 德光建設 ─────
  {
    id: "deguang-ju", name: "德光聚", builder: "德光建設", area: "沙鹿車站",
    status: "newly", statusNote: "新成屋／2026 年交屋", completion: "2026", units: 136,
    street: "永寧路", streets: "沙鹿區 永寧路／新站區",
    layout: "2 房約 26 坪、3 房 32～34 坪", floors: "地上 15 層／地下 2 層", siteAreaPing: 893,
    sources: ["owner"],
  },
  {
    id: "deguang-yizhu", name: "德光一築", builder: "德光建設", area: "沙鹿車站",
    status: "completed", completion: "約 2023", units: 66,
    street: "中華路一段", streets: "梧棲區 中華路一段 826 巷",
    layout: "2 房約 24～26 坪、3 房約 33.8 坪", floors: "地上 12 層／地下 2 層", siteAreaPing: 493,
    sources: ["owner"],
  },
  {
    id: "deguang-ercheng", name: "德光二城", builder: "德光建設", area: "沙鹿車站",
    status: "completed", completion: "約 2024", units: 122,
    street: "中華路一段", streets: "梧棲區 中華路一段 828 號",
    layout: "2 房約 25 坪、3 房約 31～35 坪", floors: "約地上 15 層", siteAreaPing: 861,
    sources: ["owner"],
  },

  // ───── 德邑建設 ─────
  // ⚠️ 案名有「德光」，建商卻是**德邑建設**，不是上面那家德光建設。
  {
    id: "deguang-hui", name: "德光會", builder: "德邑建設", area: "沙鹿車站",
    status: "completed", completion: "約 2025", units: 78,
    street: "永寧路", streets: "沙鹿區 永寧路一帶",
    layout: "2～3 房，約 26 坪起", floors: "地上 14 層／地下 2 層", siteAreaPing: 638,
    sources: ["owner"],
  },

  // ───── 勝麗建設 ─────
  {
    id: "shengli-jiaoxiangqu", name: "勝麗交響曲", builder: "勝麗建設", area: "沙鹿車站",
    status: "completed", completion: "約 2025", units: 366,
    street: "新站一路", streets: "沙鹿區 新站一路／永寧路一段",
    layout: "2 房 25～29 坪、3 房 31～40 坪、4 房約 45 坪",
    floors: "地上 14～15 層／地下 3 層", siteAreaPing: 2028,
    sources: ["owner"],
  },

  // ───── 勝興建設 ─────
  {
    id: "shengxing-xingzhan", name: "勝興興站", builder: "勝興建設", area: "沙鹿車站",
    status: "completed", completion: "約 2025", units: 230,
    street: "永寧路一段", streets: "沙鹿區 永寧路一段",
    layout: "2 房 27～28 坪、3 房 36～40 坪、4 房約 48 坪",
    floors: "地上 15 層／地下 4 層", siteAreaPing: 1174,
    sources: ["owner"],
  },

  // ───── 大華建設 ─────
  {
    id: "dahua-luming", name: "大華鹿鳴", builder: "大華建設", area: "沙鹿車站",
    status: "completed", completion: "約 2025", units: 86,
    street: "新站三路", streets: "沙鹿區 新站三路",
    layout: "3 房約 38 坪、4 房約 44～45 坪", floors: "地上 15 層／地下 3 層", siteAreaPing: 606,
    sources: ["owner"],
  },

  // ───── 佳瑞建設 ─────
  {
    id: "jiarui-jingzhan", name: "佳瑞京湛", builder: "佳瑞建設", area: "沙鹿車站",
    status: "completed", completion: "約 2024～25", units: 129,
    street: "青年路", streets: "梧棲區 青年路／沙鹿西站重劃區",
    layout: "2 房 24～28 坪、3 房 36～37 坪", floors: "地上 15 層", siteAreaPing: 829,
    sources: ["owner"],
  },

  // ───── 和築建設 ─────
  {
    id: "hezhu-t1", name: "和築T1", builder: "和築建設", area: "沙鹿車站",
    status: "completed", completion: "約 2024", units: 178,
    street: "興安路", streets: "沙鹿區 興安路 60 巷一帶",
    layout: "2 房 23～25 坪、3 房 32～36 坪", floors: "地上 13 層／地下 2 層", siteAreaPing: 1382,
    sources: ["owner"],
  },

  // ───── 世朋建設 ─────
  {
    id: "kaiyue-w", name: "凱悅W", builder: "世朋建設", area: "沙鹿車站",
    status: "completed", completion: "約 2024", units: 68,
    street: "中正街", streets: "沙鹿區 中正街／沙鹿站前",
    layout: "1+1 房約 17.6 坪、2 房約 19～22 坪", floors: "地上 11 層／地下 1 層", siteAreaPing: 193,
    sources: ["owner"],
  },

  // ───── 長霖建設 ─────
  {
    id: "zhanqian-qingshidai", name: "站前青世代", builder: "長霖建設", area: "沙鹿車站",
    status: "completed", completion: "約 2020", units: 26,
    street: "興益路", streets: "沙鹿區 興益路 61 巷",
    layout: "2 房約 31 坪、3 房約 35 坪", floors: "地上 7 層／地下 1 層", siteAreaPing: 289,
    // 總表原本寫「待確認」，2026-08-27 系統擁有者查到並指定為長霖建設。
    sources: ["owner"],
  },

  // ───── 鴻豫建設 ─────
  {
    id: "hongyu-jing", name: "鴻豫境", builder: "鴻豫建設", area: "沙鹿車站",
    status: "presale", statusNote: "預售／興建中", completion: "興建中", units: 132,
    street: "天仁北街", streets: "沙鹿區 天仁北街近沙田路",
    layout: "2 房約 25 坪、3 房約 35 坪", floors: "地上 12 層／地下 2 層", siteAreaPing: 979,
    sources: ["owner"],
  },

  // ───── 佳鏵建設 ─────
  // ⚠️ **佳鏵不是佳鋐。** 本檔另有佳鋐建設（樂邑／樂灣／新邑／晴灣／科藝），兩家不同。
  {
    id: "jiahua-daxin", name: "佳鏵大心", builder: "佳鏵建設", area: "沙鹿車站",
    status: "completed", completion: "約 2023～24", units: 122,
    street: "斗潭路", streets: "沙鹿區 斗潭路 341 巷",
    layout: "2 房約 27 坪、3 房約 37 坪", floors: "地上 10 層／地下 2 層", siteAreaPing: 1047,
    sources: ["owner"],
  },

  // ───── 佳鋐建設（沙鹿）─────
  {
    id: "jiahong-keyi", name: "佳鋐科藝", builder: "佳鋐建設", area: "沙鹿車站",
    status: "completed", completion: "約 2021～22", units: 176,
    street: "中山路", streets: "沙鹿區 中山路 119 號一帶",
    layout: "2～3 房為主", floors: "地上 7 層／地下 2 層", siteAreaPing: 1757,
    note: "總戶數為概數（總表寫「約 176 戶」）。",
    sources: ["owner"],
  },

  // ───── 侑峰體系 ─────
  {
    id: "youfeng-xinshenghuo", name: "侑峰鑫生活", builder: "侑峰體系", area: "沙鹿車站",
    status: "completed", completion: "約 2025", units: 59,
    street: "台灣大道七段", streets: "沙鹿區 台灣大道七段 737 號",
    layout: "2 房約 24 坪、2+1 房約 29 坪、3 房 34～44 坪",
    floors: "地上 11 層／地下 3 層", siteAreaPing: 359,
    sources: ["owner"],
  },

  // ───── 開普建設 ─────
  {
    id: "qingchunxueyuan-shalu", name: "青春學苑－沙鹿分館", builder: "開普建設", area: "沙鹿車站",
    status: "completed", completion: "約 2020～21", units: 191,
    street: "興安路", streets: "沙鹿區 興安路 64-3 號",
    layout: "1 房／套房，約 4 坪起", floors: "地上 5 層／地下 1 層", siteAreaPing: 297,
    sources: ["owner"],
  },

  // ───── 久築建設 ─────
  {
    id: "kuailetiane-huasha", name: "快樂天鵝華廈區", builder: "久築建設", area: "沙鹿車站",
    status: "completed", completion: "約 2021", units: 156,
    street: "中山路", streets: "沙鹿區 中山路 76 巷一帶",
    layout: "2 房 22／23 坪、3 房 32／33 坪", floors: "華廈，地上 7 層／地下 1 層", siteAreaPing: 1594,
    note: "總戶數為概數（總表寫「約 156 戶」）。",
    sources: ["owner"],
  },

  // ───── 悅築建設 ─────
  {
    id: "jingrui-jin", name: "精銳錦", builder: "悅築建設", area: "沙鹿車站",
    status: "completed", completion: "約 2024～25", units: 141,
    street: "文明街", streets: "梧棲區 文明街一帶",
    layout: "3 房約 37～38 坪", floors: "地上 13 層／地下 2 層", siteAreaPing: 1378,
    sources: ["owner"],
  },

  // ───── 詠唐建設 ─────
  {
    id: "jiage-juqingshan", name: "佳格聚晴山", builder: "詠唐建設", area: "沙鹿車站",
    status: "completed", completion: "約 2022", units: 75,
    street: "永寧路", streets: "梧棲區 永寧路 67 巷一帶",
    layout: "2 房約 20.7～26 坪、3 房約 31 坪", floors: "地上 7 層／地下 1 層", siteAreaPing: 590,
    sources: ["owner"],
  },

  // ───── 悠助建設 ─────
  {
    id: "youzhu-yijing", name: "悠助意境", builder: "悠助建設", area: "沙鹿車站",
    status: "newly", statusNote: "新成屋／2026 年", completion: "2026", units: 7,
    street: "興農路", streets: "梧棲區 興農路 165 巷",
    layout: "透天，建坪約 64.7～65.9 坪、地坪約 22.5～25.3 坪", floors: "透天 4 層", siteAreaPing: 172,
    note: "這一案是透天，不是大樓 —— 目前全站唯一一案，坪數欄講的是建坪與地坪。",
    sources: ["owner"],
  },

  // ───── 百騏建設 ─────
  {
    id: "yuanzhen-chengshi", name: "沅臻城市", builder: "百騏建設", area: "沙鹿車站",
    status: "completed", completion: "約 2023", units: 54,
    street: "興農路", streets: "梧棲區 興農路 285 巷",
    layout: "2 房 27 坪、3 房 39 坪", floors: "地上 14 層／地下 2 層", siteAreaPing: 520,
    sources: ["owner"],
  },

  /* ═══════════════════════════════════════════════════════════════════════
     鹿寮萬家福商圈 —— 2026-08-27 系統擁有者提供的整理（他稱「鹿寮家樂福生活圈」）。
     64 案，全部 sources: ["owner"]，跟沙鹿車站那 28 案同一個來源。

     ⚠️ 他的表上很多欄位寫「待確認」，這裡的處理原則是**寧可留空也不填大概**：
       ・**建商 2026-09-01 全部補齊了**（系統擁有者一次給完 18 案）。原本寫「待確認」的
         那 18 案現在都有真的建商名，`builder` 這欄全站已無「待確認」。
         ⚠️ 其中「心海苑／漾世代」他寫「富旺國際」，**這裡統一成檔案裡既有的
         「富旺國際開發」**（同一家，兩種寫法會讓清單把它拆成兩組建商）。
       ・戶數／樓高／基地面積待確認的，整個欄位省略，不要填 0 或猜。
       ・**公設比一律沒有**（他的表沒給），不要為了畫面好看去補。

     ⚠️ `completion` 存的是**完工年**，不是屋齡 —— 他表上寫「約 3 年」「約 31～32 年」
        那種，這裡換算成年份（2026 － N）再存，例如「約 2023」「約 1994～95」。
        屋齡是 `houseAge()` 每次渲染時現算的，所以明年不會變成舊資料。
        沒有年份可推的（成屋／新成屋／興建中）就存那個狀態字，屋齡那列不顯示。

     ⚠️ 這批**一筆座標都沒有**，地圖上不會有圖釘，清單裡會標「未標位置」。
        要標請系統擁有者用 /map?fix=1 逐案點。
     ═══════════════════════════════════════════════════════════════════════ */
  {
    id: "kaiyue-jingxi", name: "凱悅京璽", builder: "凱悅建設體系", area: "鹿寮萬家福",
    status: "completed", completion: "成屋", units: 46,
    street: "中華路二段", streets: "沙鹿區 中華路二段 428 號／432 巷一帶",
    layout: "大樓＋透天產品", floors: "地上 4 層／地下 1 層", siteAreaPing: 690,
    sources: ["owner"],
  },
  {
    id: "yupin-yuan-2", name: "御品院2", builder: "沂昌建設", area: "鹿寮萬家福",
    status: "completed", completion: "成屋", units: 12,
    street: "民族路", streets: "沙鹿區 民族路 20 巷一帶",
    layout: "地坪 28～35 坪／建坪 60～67 坪", floors: "地上 4 層", siteAreaPing: 134,
    sources: ["owner"],
  },
  {
    id: "fuwang-xinhaicheng", name: "富旺心海城", builder: "富旺國際開發", area: "鹿寮萬家福",
    status: "completed", completion: "約 2023", units: 179,
    street: "民族路", streets: "沙鹿區 民族路 50 號一帶",
    layout: "2～3 房為主", floors: "地上 10 層／地下 2 層", siteAreaPing: 1015,
    sources: ["owner"],
  },
  {
    id: "jiahong-dajing", name: "佳鋐大境", builder: "佳鋐建設", area: "鹿寮萬家福",
    status: "newly", completion: "新成屋",
    street: "中華路二段", streets: "沙鹿區 中華路二段 210 號一帶",
    layout: "2～3 房為主",
    note: "鹿寮延伸生活圈",
    sources: ["owner"],
  },
  {
    id: "zhifu-haole", name: "致富好樂", builder: "德光建設", area: "鹿寮萬家福",
    status: "completed", completion: "成屋",
    streets: "沙鹿區 鹿寮家樂福生活圈",
    sources: ["owner"],
  },
  {
    id: "taiju-yaomei-2", name: "太聚曜美2", builder: "太聚建設", area: "鹿寮萬家福",
    status: "newly", completion: "新成屋",
    statusNote: "成屋／新案", streets: "沙鹿區 鹿寮家樂福生活圈",
    sources: ["owner"],
  },
  {
    id: "deguang-yao", name: "德光耀", builder: "德光建設", area: "鹿寮萬家福",
    status: "completed", completion: "成屋",
    statusNote: "近年建案", street: "光明街", streets: "沙鹿區 光明街 220 號一帶",
    sources: ["owner"],
  },
  {
    id: "yangguang-city", name: "暘光City", builder: "德光建設", area: "鹿寮萬家福",
    status: "completed", completion: "成屋",
    streets: "沙鹿區 鹿寮家樂福生活圈",
    sources: ["owner"],
  },
  {
    id: "ancheng-zhumei", name: "安城築美", builder: "安城建設體系", area: "鹿寮萬家福",
    status: "completed", completion: "成屋",
    streets: "沙鹿區 鹿寮家樂福生活圈",
    sources: ["owner"],
  },
  {
    id: "jiage-xinyue", name: "佳格心悅", builder: "佳格建設體系", area: "鹿寮萬家福",
    status: "completed", completion: "成屋",
    streets: "沙鹿區 鹿寮家樂福生活圈",
    sources: ["owner"],
  },
  {
    id: "fude-xingyao", name: "富德星耀", builder: "富德建設", area: "鹿寮萬家福",
    status: "presale", completion: "興建中",
    statusNote: "預售／興建", street: "星輝路", streets: "沙鹿區 星輝路 30 巷一帶",
    sources: ["owner"],
  },
  {
    id: "dibao-32", name: "帝堡32", builder: "帝堡建設體系", area: "鹿寮萬家福",
    status: "presale", completion: "2026", units: 84,
    statusNote: "預售／興建", street: "民族路", streets: "沙鹿區 民族路一帶",
    floors: "地上 9 層", siteAreaPing: 263,
    sources: ["owner"],
  },
  {
    id: "yongyifa-mimi", name: "永益發覓蜜", builder: "永益發建設體系", area: "鹿寮萬家福",
    status: "completed", completion: "成屋",
    streets: "沙鹿區 鹿寮家樂福生活圈",
    sources: ["owner"],
  },
  {
    id: "yihong-yile", name: "逸竑逸樂", builder: "逸竑建設體系", area: "鹿寮萬家福",
    status: "completed", completion: "成屋",
    streets: "沙鹿區 鹿寮家樂福生活圈",
    sources: ["owner"],
  },
  {
    id: "ancheng-shi", name: "安城市", builder: "安城建設體系", area: "鹿寮萬家福",
    status: "completed", completion: "成屋",
    streets: "沙鹿區 鹿寮家樂福生活圈",
    sources: ["owner"],
  },
  {
    id: "zhaodeng-ying", name: "兆登櫻", builder: "兆登建設體系", area: "鹿寮萬家福",
    status: "presale", completion: "2026",
    statusNote: "預售，預計 2026 年下半年", street: "星輝路", streets: "沙鹿區 星輝路 110 巷一帶",
    sources: ["owner"],
  },
  {
    id: "dibao-15", name: "帝堡15", builder: "帝堡建設體系", area: "鹿寮萬家福",
    status: "completed", completion: "成屋", units: 57,
    street: "中山路", streets: "沙鹿區 中山路 669 巷 15 號",
    floors: "地上 12 層", siteAreaPing: 518,
    sources: ["owner"],
  },
  {
    id: "fuyu-haide-gongyuan", name: "富宇海德公園", builder: "富宇建設", area: "鹿寮萬家福",
    status: "completed", completion: "成屋", units: 152,
    street: "中山路", streets: "沙鹿區 中山路 665 號之 1 一帶",
    floors: "地上 14 層", siteAreaPing: 1036,
    sources: ["owner"],
  },
  {
    id: "fuyu-fanersai", name: "富宇凡爾賽", builder: "富宇建設", area: "鹿寮萬家福",
    status: "completed", completion: "成屋",
    streets: "沙鹿區 鹿寮家樂福生活圈",
    sources: ["owner"],
  },
  {
    id: "fuyu-fenghui", name: "富宇豐卉", builder: "富宇建設", area: "鹿寮萬家福",
    status: "completed", completion: "成屋", units: 38,
    street: "中山路", streets: "沙鹿區 中山路 651 巷一帶",
    floors: "地上 10 層", siteAreaPing: 371,
    sources: ["owner"],
  },
  {
    id: "dibao-18", name: "帝堡18", builder: "帝堡建設體系", area: "鹿寮萬家福",
    status: "completed", completion: "成屋", units: 80,
    street: "星海路", streets: "沙鹿區 星海路 15 巷 39 號一帶",
    floors: "地上 12 層", siteAreaPing: 514,
    sources: ["owner"],
  },
  {
    id: "qingkong-shu", name: "晴空墅", builder: "德邑建設", area: "鹿寮萬家福",
    status: "completed", completion: "成屋",
    statusNote: "透天成屋", streets: "沙鹿區 鹿寮家樂福生活圈",
    layout: "透天產品",
    sources: ["owner"],
  },
  {
    id: "xing-qingkong", name: "星晴空", builder: "德邑建設", area: "鹿寮萬家福",
    status: "completed", completion: "成屋",
    streets: "沙鹿區 鹿寮家樂福生活圈",
    sources: ["owner"],
  },
  {
    id: "shengyang-qingkong-3", name: "聖揚晴空3", builder: "聖揚建設體系", area: "鹿寮萬家福",
    status: "completed", completion: "成屋",
    streets: "沙鹿區 鹿寮家樂福生活圈",
    sources: ["owner"],
  },
  {
    id: "fuli-5", name: "馥麗5", builder: "逸鑫建設", area: "鹿寮萬家福",
    status: "completed", completion: "成屋",
    streets: "沙鹿區 鹿寮家樂福生活圈",
    sources: ["owner"],
  },
  {
    id: "kunlianfu-zhifu", name: "坤聯富智富+", builder: "坤聯富建設", area: "鹿寮萬家福",
    status: "presale", completion: "2030",
    statusNote: "預售，預計 2030 年", street: "星河路", streets: "沙鹿區 星河路一帶",
    sources: ["owner"],
  },
  {
    id: "kaiyue-moma", name: "凱悅MOMA透天／華廈區", builder: "凱悅建設體系", area: "鹿寮萬家福",
    status: "completed", completion: "成屋",
    street: "星河路", streets: "沙鹿區 星河路一帶",
    layout: "華廈＋透天產品",
    sources: ["owner"],
  },
  {
    id: "dazhuang-qianyinyuan", name: "大樁謙隱園", builder: "大樁建設體系", area: "鹿寮萬家福",
    status: "completed", completion: "成屋",
    streets: "沙鹿區 鹿寮家樂福生活圈",
    sources: ["owner"],
  },
  {
    id: "fuyu-zhongshanhui", name: "富宇中山匯", builder: "富宇建設", area: "鹿寮萬家福",
    status: "presale", completion: "2028",
    statusNote: "預售，預計 2028 年", street: "中山路", streets: "沙鹿區 中山路／長春路一帶",
    sources: ["owner"],
  },
  {
    id: "kaiyue-jingzhan", name: "凱悅京綻－大樓區", builder: "凱悅建設體系", area: "鹿寮萬家福",
    status: "completed", completion: "成屋",
    streets: "沙鹿區 鹿寮家樂福生活圈",
    sources: ["owner"],
  },
  {
    id: "kaiyue-aimyshi", name: "凱悅愛My市", builder: "凱悅建設體系", area: "鹿寮萬家福",
    status: "newly", completion: "新成屋",
    street: "星河路", streets: "沙鹿區 星河路 59 號一帶",
    sources: ["owner"],
  },
  {
    id: "fuyu-shidai-huayuan", name: "富宇時代花園", builder: "富宇建設", area: "鹿寮萬家福",
    status: "presale", completion: "2026", units: 202,
    statusNote: "預售／興建", street: "星河路", streets: "沙鹿區 星河路／福德路 186 巷",
    layout: "2～3 房為主",
    sources: ["owner"],
  },
  {
    id: "fuyu-shidai-zhiqiu", name: "富宇時代之丘", builder: "富宇建設", area: "鹿寮萬家福",
    status: "presale", completion: "2027", units: 111,
    statusNote: "預售，預計 2027 年", street: "福德路", streets: "沙鹿區 福德路 186 巷／松蔭巷",
    layout: "2～3 房為主",
    sources: ["owner"],
  },
  {
    id: "fuyu-shidai-yusuo", name: "富宇時代御所", builder: "富宇建設", area: "鹿寮萬家福",
    status: "presale", completion: "2027", units: 59,
    statusNote: "預售，預計 2027 年", street: "福德路", streets: "沙鹿區 福德路 186 巷一帶",
    layout: "2～3 房為主",
    sources: ["owner"],
  },
  {
    id: "dadaocheng-liyu", name: "大稻埕禮御", builder: "大稻埕建設體系", area: "鹿寮萬家福",
    status: "presale", completion: "2027",
    statusNote: "預售，預計 2027 年", streets: "沙鹿區 成衣段／鹿寮核心",
    sources: ["owner"],
  },
  {
    id: "lintai-qinshan", name: "林泰親善", builder: "林泰建設體系", area: "鹿寮萬家福",
    status: "completed", completion: "成屋",
    streets: "沙鹿區 鹿寮家樂福生活圈",
    sources: ["owner"],
  },
  {
    id: "cunmao-langjing", name: "村懋朗境", builder: "村懋建設體系", area: "鹿寮萬家福",
    status: "newly", completion: "新成屋",
    statusNote: "成屋／新案", streets: "沙鹿區 鹿寮家樂福生活圈",
    sources: ["owner"],
  },
  {
    id: "fuwang-xinhaizhan", name: "富旺心海綻", builder: "富旺國際開發", area: "鹿寮萬家福",
    status: "presale", completion: "2028",
    statusNote: "預售，預計 2028 年", street: "民族路", streets: "沙鹿區 星美二街／民族路一帶",
    layout: "2～3 房為主",
    sources: ["owner"],
  },
  {
    id: "cunmao-puyue", name: "村懋璞悅", builder: "村懋建設體系", area: "鹿寮萬家福",
    status: "newly", completion: "新成屋",
    statusNote: "成屋／新案", streets: "沙鹿區 鹿寮家樂福生活圈",
    sources: ["owner"],
  },
  {
    id: "jiazan-dazan", name: "佳瓚大讚", builder: "佳瓚建設", area: "鹿寮萬家福",
    status: "presale", completion: "2027",
    statusNote: "預售，預計 2027 年", street: "中山路", streets: "沙鹿區 中山路 495 巷一帶",
    sources: ["owner"],
  },
  {
    id: "danlian-a", name: "丹聯大樓／丹聯A區", builder: "丹龍建設", area: "鹿寮萬家福",
    status: "completed", completion: "約 1994～95", units: 126,
    street: "中山路", streets: "沙鹿區 中山路 533 號一帶",
    floors: "地上 16 層",
    sources: ["owner"],
  },
  {
    id: "huawei-zhijian", name: "華偉知見", builder: "華偉建設體系", area: "鹿寮萬家福",
    status: "presale", completion: "2028",
    statusNote: "預售，預計 2028 年", street: "中山路", streets: "沙鹿區 中山路永安巷一帶",
    sources: ["owner"],
  },
  {
    id: "shiji-fuyuguo", name: "世紀富裕國", builder: "裕國冷凍冷藏企業", area: "鹿寮萬家福",
    status: "completed", completion: "約 2007", units: 75,
    street: "福鹿街", streets: "沙鹿區 福鹿街 56 號一帶",
    sources: ["owner"],
  },
  {
    id: "shiji-fuyuguo-2", name: "世紀富裕國2", builder: "裕國冷凍冷藏企業", area: "鹿寮萬家福",
    status: "completed", completion: "約 2008", units: 70,
    street: "光榮街", streets: "沙鹿區 光榮街 79 號一帶",
    sources: ["owner"],
  },
  {
    id: "fuyueju-3", name: "富躍居3", builder: "躍鴻建設", area: "鹿寮萬家福",
    status: "completed", completion: "成屋",
    streets: "沙鹿區 鹿寮家樂福生活圈",
    sources: ["owner"],
  },
  {
    id: "huangjia-zuoan", name: "皇家左岸", builder: "皇家建設體系", area: "鹿寮萬家福",
    status: "completed", completion: "成屋",
    streets: "沙鹿區 鹿寮家樂福生活圈",
    sources: ["owner"],
  },
  {
    id: "huangjia-jiguang", name: "皇家極光", builder: "皇家建設體系", area: "鹿寮萬家福",
    status: "newly", completion: "新成屋",
    street: "光華路", streets: "沙鹿區 光華路 391 巷 55 號一帶",
    sources: ["owner"],
  },
  {
    id: "kaiyue-shishang", name: "凱悅時尚", builder: "凱悅建設體系", area: "鹿寮萬家福",
    status: "completed", completion: "約 2014", units: 17,
    street: "福田北街", streets: "沙鹿區 福田北街 400 號一帶",
    floors: "地上 5 層",
    sources: ["owner"],
  },
  {
    id: "huangjia-huangpin-2", name: "皇家皇品2", builder: "皇家建設體系", area: "鹿寮萬家福",
    status: "completed", completion: "成屋", units: 13,
    street: "福田北街", streets: "沙鹿區 福田北街 487 號一帶",
    layout: "透天住宅", siteAreaPing: 765,
    sources: ["owner"],
  },
  {
    id: "jiali-lijing", name: "嘉麗儷景", builder: "嘉麗建設", area: "鹿寮萬家福",
    status: "newly", completion: "新成屋",
    street: "光華路", streets: "沙鹿區 光華路 536 號一帶",
    sources: ["owner"],
  },
  {
    id: "luming-yusuo", name: "鹿鳴寓所", builder: "佳唐建設", area: "鹿寮萬家福",
    status: "newly", completion: "新成屋",
    street: "賢孝街", streets: "沙鹿區 賢孝街 28 號一帶",
    sources: ["owner"],
  },
  {
    id: "jiutang-huayang-tiane", name: "久樘花漾天鵝", builder: "久樘開發", area: "鹿寮萬家福",
    status: "newly", completion: "新成屋",
    street: "三民路", streets: "沙鹿區 三民路 107 號一帶",
    layout: "2～3 房為主",
    note: "鹿寮延伸生活圈",
    sources: ["owner"],
  },
  {
    id: "fuyu-yunji", name: "富宇云集", builder: "富宇建設", area: "鹿寮萬家福",
    status: "completed", completion: "成屋",
    streets: "沙鹿區 鹿寮延伸生活圈",
    note: "鹿寮延伸生活圈",
    sources: ["owner"],
  },
  {
    id: "maoyang-tianyue", name: "茂洋天玥", builder: "茂洋建設體系", area: "鹿寮萬家福",
    status: "completed", completion: "約 2024",
    street: "台灣大道七段", streets: "沙鹿區 台灣大道七段 822 號一帶",
    layout: "2～3 房為主",
    note: "鹿寮延伸生活圈",
    sources: ["owner"],
  },
  {
    id: "taiju-yaomei", name: "太聚曜美", builder: "太聚建設", area: "鹿寮萬家福",
    status: "completed", completion: "成屋",
    streets: "沙鹿區 鹿寮家樂福生活圈",
    sources: ["owner"],
  },
  {
    id: "yuanqian-newyang", name: "元謙NEW漾", builder: "元謙建設體系", area: "鹿寮萬家福",
    status: "completed", completion: "成屋", units: 49,
    street: "長春路", streets: "沙鹿區 長春路 202 巷一帶",
    siteAreaPing: 1486,
    note: "鹿寮／北勢交界",
    sources: ["owner"],
  },
  {
    id: "weixiao-zhumei", name: "微笑築美", builder: "國泉建設", area: "鹿寮萬家福",
    status: "completed", completion: "約 2024",
    statusNote: "透天", street: "長春路", streets: "沙鹿區 長春路 202 巷一帶",
    layout: "透天產品",
    note: "鹿寮延伸生活圈",
    sources: ["owner"],
  },
  {
    id: "qingpu-yuan", name: "青樸院", builder: "新富筑建設", area: "鹿寮萬家福",
    status: "completed", completion: "成屋",
    streets: "沙鹿區 鹿寮延伸生活圈",
    note: "鹿寮延伸生活圈",
    sources: ["owner"],
  },
  {
    id: "weixiao-daweilai-3", name: "微笑大未來3", builder: "豐耀建設", area: "鹿寮萬家福",
    status: "completed", completion: "成屋", units: 37,
    street: "民族路一段", streets: "沙鹿區 民族路一段 2 巷 102 號",
    sources: ["owner"],
  },
  {
    id: "xinhaiyuan-yangshidai", name: "心海苑／漾世代", builder: "富旺國際開發", area: "鹿寮萬家福",
    status: "completed", completion: "約 2020", units: 43,
    street: "中山路", streets: "沙鹿區 中山路中峰巷 145 號一帶",
    sources: ["owner"],
  },
  {
    id: "lufeng-jing", name: "鹿峰靜", builder: "麗豐建設", area: "鹿寮萬家福",
    status: "completed", completion: "成屋",
    streets: "沙鹿區 鹿寮家樂福生活圈",
    sources: ["owner"],
  },
  {
    id: "dibao-31", name: "帝堡31", builder: "帝堡建設體系", area: "鹿寮萬家福",
    status: "newly", completion: "新成屋",
    street: "中山路", streets: "沙鹿區 中山路 626 號一帶",
    sources: ["owner"],
  },
  {
    id: "luze-liyu", name: "鹿澤禮寓", builder: "鹿澤國際開發", area: "鹿寮萬家福",
    status: "newly", completion: "新成屋",
    street: "福田北街", streets: "沙鹿區 福田北街 120 號一帶",
    note: "鹿寮延伸生活圈",
    sources: ["owner"],
  },
  {
    id: "fuguiyuan-huasha", name: "富貴園華廈區", builder: "鼎雅建設", area: "鹿寮萬家福",
    status: "completed", completion: "成屋",
    streets: "沙鹿區 鹿寮家樂福生活圈",
    layout: "華廈產品",
    sources: ["owner"],
  },

  /* ── 鹿寮萬家福補件（2026-08-27 系統擁有者另外給的兩案）──

     ⚠️ 他同一則還說要補「帝堡18」，但**那案早就在上面那批 64 案裡**（成屋、80 戶、
        星海路 15 巷 39 號、地上 12 層、約 514 坪，座標也標了），所以沒有重複建。

     ⚠️ 「小時代6」**照他寫的原文命名**，沒有補成「合總小時代6」。
        本檔已有的合總小時代 1／2／3／5 都叫「合總小時代N」而且 area 是**沙鹿車站**。
        **2026-08-27 系統擁有者拍板：那四案維持沙鹿車站，不跟著小時代6 搬到鹿寮。**
        所以同一個系列會跨兩個商圈，這是他指定的，不要「順手統一」。
        另外掛了 aliases「合總小時代6」，搜尋兩種寫法都找得到（aliases 不顯示）。 */
  {
    id: "hezong-xiaoshidai6", name: "小時代6", builder: "合總建設", area: "鹿寮萬家福",
    aliases: ["合總小時代6"],
    status: "completed", completion: "成屋", units: 67,
    street: "錦華街", streets: "沙鹿區 錦華街 81 巷 6 號",
    layout: "大樓", floors: "地上 10 層／地下 2 層", siteAreaPing: 774,
    sources: ["owner"],
  },
  {
    id: "kaijun-deguangxingzhan", name: "德光星綻", builder: "凱俊建設", area: "鹿寮萬家福",
    status: "presale", statusNote: "預售，預計 2028 年 1 月完工", completion: "2028", units: 66,
    street: "中山路", streets: "沙鹿區 中山路金星 2 巷／福鹿街",
    layout: "大樓", floors: "地上 12 層／地下 2 層", siteAreaPing: 452,
    sources: ["owner"],
  },
  /* ─────────── 北勢靜宜商圈 80 案（2026-09-01 系統擁有者提供）───────────
     這一區在 `port-zones.ts` 早就有色塊、在 AREA_FILTERS 早就有篩選臉，
     但從 2026-08-27 起一直是 0 案 —— 點下去有色塊沒建案。這批補進來之後不再是了。

     ⚠️ **這 80 案目前全部沒有座標**（`port-coords.ts` 裡一筆都沒有），
        所以地圖上不會出現圖釘，清單裡會標「未標位置」。要標位置得等他逐案給門牌。

     ⚠️ **建商寫法對齊了既有寫法，不是照他原文抄** —— 上次「富旺國際 vs 富旺國際開發」
        的教訓：同一家兩種寫法會讓建案清單把它拆成兩組建商（清單照 `builder` 字串分組）。
        這次對齊了四家：安城建設→**安城建設體系**、麗豐建設體系→**麗豐建設**、
        永益發建設→**永益發建設體系**、德邑建設體系→**德邑建設**。
        另外他自己那份裡「宏亞建設(#07)」與「宏亞建設體系(#78)」打架，**統一用宏亞建設**。

     ⚠️ `completion: "預售中"` 是這批新增的狀態字，給「預售／新案」用 ——
        跟「興建中」刻意分開：**興建＝他明講在蓋了，新案＝只知道在賣、有沒有動工不知道**。
        畫面對非年份的值原本就會直接顯示，不用改元件。

     ⚠️ 建商「待確認」29 案是**他自己標的**，不是我漏填。 */
  {
    id: "ancheng-zhimei", name: "安城至美", builder: "安城建設體系", area: "北勢靜宜",
    status: "completed", completion: "成屋", units: 20,
    street: "福至路", streets: "沙鹿區 福至路 80 巷 86 號",
    layout: "透天，建坪約 55 坪、地坪約 23.1～29.6 坪", floors: "地上 3～4 層", siteAreaPing: 540,
    sources: ["owner"],
  },
  {
    id: "zhengli-puyue-dunfeng", name: "璞悅敦峰", builder: "鉦立建設", area: "北勢靜宜",
    status: "completed", completion: "成屋", units: 25,
    street: "福至路", streets: "沙鹿區 福至路 258 號",
    layout: "透天", floors: "地上 4 層", siteAreaPing: 686,
    sources: ["owner"],
  },
  {
    id: "fuyu-yang", name: "富宇漾", builder: "富宇建設", area: "北勢靜宜",
    status: "presale", statusNote: "預售／興建中", completion: "興建中", units: 258,
    street: "福成路", streets: "沙鹿區 福成路／鎮南路永福巷一帶",
    layout: "2 房約 22／25 坪、3 房約 34 坪", floors: "地上 7 層／地下 2 層", siteAreaPing: 2534,
    sources: ["owner"],
  },
  {
    id: "haohao-yuanguan", name: "好好園館", builder: "有本", area: "北勢靜宜",
    status: "completed", completion: "成屋", units: 73,
    street: "福成路", streets: "沙鹿區 福成路 255 巷 8 號",
    floors: "地上 6 層", siteAreaPing: 744,
    sources: ["owner"],
  },
  {
    id: "yongren-fuzhi-2", name: "永仁福至2", builder: "永仁建設體系", area: "北勢靜宜",
    status: "completed", completion: "成屋", units: 11,
    street: "福至路", streets: "沙鹿區 福至路 86 號一帶",
    layout: "連棟透天", floors: "地上 3 層", siteAreaPing: 335,
    sources: ["owner"],
  },
  {
    id: "viva-xibanya", name: "VIVA西班牙", builder: "佳唐建設", area: "北勢靜宜",
    status: "completed", completion: "成屋", units: 41,
    street: "福至路", streets: "沙鹿區 福至路 150 巷一帶",
    layout: "透天", siteAreaPing: 1600,
    sources: ["owner"],
  },
  {
    id: "hongya-zhencheng", name: "昇揚臻澄華廈", builder: "宏亞建設", area: "北勢靜宜",
    status: "newly", statusNote: "新成屋／3 年屋", completion: "約 2023", units: 37,
    street: "福成路", streets: "沙鹿區 福成路 130 巷 46 弄 10 號",
    floors: "地上 8 層／地下 1 層", siteAreaPing: 591,
    sources: ["owner"],
  },
  {
    id: "honggu-limei", name: "宏固里美", builder: "宏固建設體系", area: "北勢靜宜",
    status: "completed", completion: "成屋", units: 26,
    street: "南斗路", streets: "沙鹿區 南斗路、南斗路 379 巷",
    layout: "連棟透天", floors: "地上 3 層", siteAreaPing: 554,
    sources: ["owner"],
  },
  {
    id: "qinghong-xinyuan", name: "清浤芯園", builder: "清浤建設體系", area: "北勢靜宜",
    status: "completed", completion: "成屋", units: 14,
    street: "自由路", streets: "沙鹿區 自由路 210 號",
    layout: "透天", floors: "地上 3／4 層", siteAreaPing: 484,
    sources: ["owner"],
  },
  {
    id: "ancheng-wangyue", name: "安城望玥", builder: "安城建設體系", area: "北勢靜宜",
    status: "newly", statusNote: "新成屋／1 年", completion: "約 2025", units: 5,
    street: "南斗路", streets: "沙鹿區 南斗路 70 巷 59 號",
    layout: "連棟透天", floors: "地上 4 層", siteAreaPing: 149,
    sources: ["owner"],
  },
  {
    id: "jiaji-ziyou-shidai", name: "傢基自由時代華廈", builder: "傢基建設體系", area: "北勢靜宜",
    status: "completed", completion: "成屋", units: 12,
    street: "自由路", streets: "沙鹿區 自由路 146 巷一帶",
    floors: "地上 5 層", siteAreaPing: 256,
    sources: ["owner"],
  },
  {
    id: "huiguo-lujing", name: "惠國麓境", builder: "惠國建設體系", area: "北勢靜宜",
    status: "presale", statusNote: "預售／新案", completion: "預售中",
    sources: ["owner"],
  },
  {
    id: "rian-cheng-2", name: "日安埕2", builder: "待確認", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    sources: ["owner"],
  },
  {
    id: "jiachuan-yushu-5", name: "家川御墅5", builder: "家川建設體系", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    layout: "透天",
    sources: ["owner"],
  },
  {
    id: "fusheng-meide", name: "富盛美德", builder: "富盛建設體系", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    sources: ["owner"],
  },
  {
    id: "zhuyin-chuncui", name: "住寅純萃", builder: "住寅建設體系", area: "北勢靜宜",
    status: "presale", statusNote: "預售／新案", completion: "預售中",
    sources: ["owner"],
  },
  {
    id: "dingyi-fuzhu", name: "鼎一賦築", builder: "鼎一建設體系", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    street: "平等七街", streets: "沙鹿區 平等七街一帶",
    sources: ["owner"],
  },
  {
    id: "guoyang-ju", name: "過洋居", builder: "待確認", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    layout: "透天",
    sources: ["owner"],
  },
  {
    id: "facai-shu", name: "發財墅", builder: "待確認", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    layout: "透天",
    sources: ["owner"],
  },
  {
    id: "lifeng-yipin", name: "麗豐藝品", builder: "麗豐建設", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    sources: ["owner"],
  },
  {
    id: "yongyifa-chujian", name: "永益發初見", builder: "永益發建設體系", area: "北勢靜宜",
    status: "newly", statusNote: "新成屋／近年案", completion: "新成屋",
    street: "六路十四街", streets: "沙鹿區 六路十四街一帶",
    sources: ["owner"],
  },
  {
    id: "jingyi-chunjing", name: "敬益淳境", builder: "敬益建設體系", area: "北勢靜宜",
    status: "presale", statusNote: "預售／新案", completion: "預售中",
    sources: ["owner"],
  },
  {
    id: "hezhen-di", name: "和臻邸", builder: "待確認", area: "北勢靜宜",
    status: "presale", statusNote: "預售／新案", completion: "預售中",
    sources: ["owner"],
  },
  {
    id: "fulin-bw", name: "富霖B&W", builder: "富霖建設體系", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    sources: ["owner"],
  },
  {
    id: "lubaoshi", name: "綠寶石", builder: "待確認", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    sources: ["owner"],
  },
  {
    id: "yourui-xishu", name: "佑睿囍墅", builder: "佑睿建設體系", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    layout: "透天",
    sources: ["owner"],
  },
  {
    id: "yongjin-qinghe", name: "永晉青禾", alias: "好樣來來", builder: "永晉建設", area: "北勢靜宜",
    status: "newly", completion: "約 2024", units: 20,
    street: "六路一街", streets: "沙鹿區 六路一街 9 號一帶",
    sources: ["owner"],
  },
  {
    id: "zhongke-yusifang", name: "中科豫四方", builder: "待確認", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    sources: ["owner"],
  },
  {
    id: "shuheyuan-2c", name: "樹合院2期C", builder: "待確認", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    layout: "透天",
    sources: ["owner"],
  },
  {
    id: "jizhen-huangxi", name: "吉鎮皇璽", builder: "吉鎮建設體系", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    sources: ["owner"],
  },
  {
    id: "xinsheng-ruobai", name: "昕晟若白", builder: "昕晟建設體系", area: "北勢靜宜",
    status: "completed", statusNote: "成屋／近年案", completion: "成屋",
    sources: ["owner"],
  },
  {
    id: "yang-tiane", name: "漾天鵝", builder: "待確認", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    sources: ["owner"],
  },
  {
    id: "shanshui-fengjin", name: "山水豐晉", builder: "待確認", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    sources: ["owner"],
  },
  {
    id: "renwen-yangzhen", name: "人文養真", builder: "待確認", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    sources: ["owner"],
  },
  {
    id: "wushi-yizhang", name: "悟實壹章", builder: "待確認", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    sources: ["owner"],
  },
  {
    id: "wushi-erzhang", name: "悟實貳章", builder: "待確認", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    sources: ["owner"],
  },
  {
    id: "baoyu-liyue", name: "寶宇麗悅", builder: "寶宇建設", area: "北勢靜宜",
    status: "completed", statusNote: "成屋／近年案", completion: "成屋",
    sources: ["owner"],
  },
  {
    id: "fuyu-yazhu", name: "富宇雅築", builder: "富宇建設", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    sources: ["owner"],
  },
  {
    id: "fubao-zhifu-lianmeng", name: "福寶致富聯盟", builder: "福寶建設體系", area: "北勢靜宜",
    status: "presale", statusNote: "預售／新案", completion: "預售中",
    sources: ["owner"],
  },
  {
    id: "zhifu-dadao", name: "致富大道", builder: "待確認", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    sources: ["owner"],
  },
  {
    id: "fuyu-dijing", name: "富宇帝景", builder: "富宇建設", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    street: "北勢東路", streets: "沙鹿區 北勢東路 281 號一帶",
    sources: ["owner"],
  },
  {
    id: "fuyu-jing", name: "富宇境", builder: "富宇建設", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    street: "平等路", streets: "沙鹿區 平等路 152 巷一帶",
    sources: ["owner"],
  },
  {
    id: "futeng-youtianju", name: "富騰有田居", builder: "富騰建設體系", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    sources: ["owner"],
  },
  {
    id: "panyu-yunju", name: "磐鈺雲居", builder: "磐鈺建設", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    street: "北中五街", streets: "沙鹿區 北中五街一帶",
    sources: ["owner"],
  },
  {
    id: "baoyu-lishe", name: "寶宇麗舍", builder: "寶宇建設", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    sources: ["owner"],
  },
  {
    id: "wulu-yingshan", name: "吾廬映山", builder: "待確認", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    sources: ["owner"],
  },
  {
    id: "dasheng-sendi", name: "大昇森邸", builder: "大昇建設體系", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    sources: ["owner"],
  },
  {
    id: "fuyu-heyue", name: "富宇禾悅", builder: "富宇建設", area: "北勢靜宜",
    status: "newly", statusNote: "新成屋／近年案", completion: "新成屋", units: 123,
    street: "平等六街", streets: "沙鹿區 平等六街一帶",
    siteAreaPing: 1102,
    sources: ["owner"],
  },
  {
    id: "fuyu-hemu", name: "富宇禾沐", builder: "富宇建設", area: "北勢靜宜",
    status: "newly", statusNote: "新成屋／近年案", completion: "新成屋", units: 61,
    street: "平等六街", streets: "沙鹿區 平等六街一帶",
    siteAreaPing: 602,
    sources: ["owner"],
  },
  {
    id: "shiliu-juri", name: "十六鉅日", builder: "待確認", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    sources: ["owner"],
  },
  {
    id: "yue-shanqiu", name: "樾山丘", builder: "待確認", area: "北勢靜宜",
    status: "presale", statusNote: "預售／新案", completion: "預售中",
    sources: ["owner"],
  },
  {
    id: "mu-shanlin", name: "沐山林", builder: "待確認", area: "北勢靜宜",
    status: "presale", statusNote: "預售／新案", completion: "預售中",
    sources: ["owner"],
  },
  {
    id: "chengfeng-cangfeng", name: "澄峰藏峰", builder: "待確認", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    sources: ["owner"],
  },
  {
    id: "bochang-zhenpin", name: "博昌臻品", builder: "博昌建設體系", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    sources: ["owner"],
  },
  {
    id: "rimu-jingran", name: "日沐井然", builder: "待確認", area: "北勢靜宜",
    status: "completed", statusNote: "成屋／近年案", completion: "成屋",
    sources: ["owner"],
  },
  {
    id: "caiying-xinyuan", name: "采縈昕苑", builder: "采縈開發建設", area: "北勢靜宜",
    status: "presale", statusNote: "預售／預計 2026 年下半年完工", completion: "約 2026", units: 16,
    street: "福至路", streets: "沙鹿區 福至路 30 巷一帶",
    layout: "2 房約 26 坪、3 房約 31 坪", floors: "地上 5 層", siteAreaPing: 206,
    sources: ["owner"],
  },
  {
    id: "ruquan-ruyi", name: "如泉如意", builder: "待確認", area: "北勢靜宜",
    status: "presale", statusNote: "預售／新案", completion: "預售中",
    sources: ["owner"],
  },
  {
    id: "dazhuang-shiliuyun-2", name: "大樁十六韻2", builder: "大樁建設體系", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    sources: ["owner"],
  },
  {
    id: "caixiang-fuyu", name: "采翔富鈺", builder: "采翔建設體系", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    sources: ["owner"],
  },
  {
    id: "yage-zhijing", name: "亞哥織境", builder: "亞哥建設體系", area: "北勢靜宜",
    status: "presale", statusNote: "預售／新案", completion: "預售中",
    sources: ["owner"],
  },
  {
    id: "huaipu-yangzhen", name: "懷璞養真", builder: "待確認", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    sources: ["owner"],
  },
  {
    id: "zhifu-yihaozan", name: "致富一號讚", builder: "待確認", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    sources: ["owner"],
  },
  {
    id: "zheyu-win-plus", name: "哲宇W·IN+", builder: "哲宇建設體系", area: "北勢靜宜",
    status: "completed", statusNote: "成屋／近年案", completion: "成屋",
    sources: ["owner"],
  },
  {
    id: "zheyu-casa-plus", name: "哲宇CASA+", builder: "哲宇建設體系", area: "北勢靜宜",
    status: "completed", statusNote: "成屋／近年案", completion: "成屋",
    sources: ["owner"],
  },
  {
    id: "deyi-zhifu-2", name: "德邑致富2－必勝特區", builder: "德邑建設", area: "北勢靜宜",
    status: "presale", statusNote: "預售／新案", completion: "預售中",
    sources: ["owner"],
  },
  {
    id: "guoxiong-beiou-senlin", name: "國雄北歐莊園－森林區", builder: "國雄建設", area: "北勢靜宜",
    status: "completed", statusNote: "成屋／近年案", completion: "成屋",
    street: "中山路", streets: "沙鹿區 中山路紅竹巷一帶",
    sources: ["owner"],
  },
  {
    id: "zhifu-shishang", name: "致富時上", builder: "待確認", area: "北勢靜宜",
    status: "presale", statusNote: "預售／新案", completion: "預售中",
    sources: ["owner"],
  },
  {
    id: "wanji-qingshan", name: "萬基青山", builder: "萬基建設體系", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    sources: ["owner"],
  },
  {
    id: "xuyu-xiang", name: "敘宇翔", builder: "待確認", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    sources: ["owner"],
  },
  {
    id: "yuqing-youlin", name: "餘慶有鄰", builder: "待確認", area: "北勢靜宜",
    status: "presale", statusNote: "預售／新案", completion: "預售中",
    street: "鎮南路二段", streets: "沙鹿區 鎮南路二段／東晉十一街",
    sources: ["owner"],
  },
  {
    id: "zhucuo-bieshu", name: "築厝別墅", builder: "待確認", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    layout: "透天",
    sources: ["owner"],
  },
  {
    id: "qinghong-xinyuan-2", name: "清浤芯園2", builder: "清浤建設體系", area: "北勢靜宜",
    status: "completed", statusNote: "成屋／近年案", completion: "成屋",
    sources: ["owner"],
  },
  {
    id: "qingchuan-quan", name: "青川泉", builder: "待確認", area: "北勢靜宜",
    status: "completed", completion: "成屋", units: 4,
    street: "南昌路", streets: "沙鹿區 南昌路 61 巷一帶",
    layout: "透天", siteAreaPing: 124,
    sources: ["owner"],
  },
  {
    id: "haiming-kuanyu", name: "海銘寬玉", builder: "海銘建設體系", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    sources: ["owner"],
  },
  {
    id: "xingfu-meishu", name: "幸福美墅", builder: "待確認", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    layout: "透天",
    sources: ["owner"],
  },
  {
    id: "changli-pinyue-2", name: "昶立品悅2", builder: "昶立建設體系", area: "北勢靜宜",
    status: "completed", completion: "成屋",
    sources: ["owner"],
  },
  {
    id: "xinsheng-xincheng", name: "昕晟心城", builder: "昕晟建設體系", area: "北勢靜宜",
    status: "completed", statusNote: "成屋／近年案", completion: "成屋",
    sources: ["owner"],
  },
  {
    id: "hongya-lixiangguo", name: "宏亞里想國－大樓區", builder: "宏亞建設", area: "北勢靜宜",
    status: "presale", statusNote: "預售／預計 2027 年 5 月完工", completion: "2027", units: 77,
    street: "中山路", streets: "沙鹿區 中山路紅竹巷一帶",
    sources: ["owner"],
  },
  {
    id: "jiutang-jingyang-tiane", name: "久樘晶漾天鵝", builder: "久樘開發", area: "北勢靜宜",
    status: "newly", statusNote: "成屋／約 1 年", completion: "約 2025", units: 124,
    street: "北中七街", streets: "沙鹿區 北中七街 75 號一帶",
    sources: ["owner"],
  },
  {
    id: "liudajia", name: "六大家", builder: "待確認", area: "北勢靜宜",
    status: "completed", completion: "約 2012", units: 6,
    street: "六路十九街", streets: "沙鹿區 六路十九街 17 號",
    layout: "透天住宅", floors: "地上 4 層", siteAreaPing: 383,
    sources: ["owner"],
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

  /* ── 沙鹿車站商圈（系統擁有者本人用 /map?fix=1 點的，2026-08-27）──
     28 案先標了這 11 案，其餘 17 案還沒標，那些在地圖上不會有圖釘。

     ⚠️ 逐筆用「點在多邊形內」驗過，**11 筆全部落在沙鹿火車站商圈色塊裡面**，
        包含總表上行政區寫梧棲區的沅臻城市與佳瑞京湛。
        （先前預期梧棲那幾案會落在色塊外，實測不成立，不要照那個假設去判斷。） */
  "yuanzhen-chengshi": { lat: 24.23706, lng: 120.55065, precision: "exact" },
  "jiarui-jingzhan": { lat: 24.2385, lng: 120.55116, precision: "exact" },
  "shengli-jiaoxiangqu": { lat: 24.23631, lng: 120.55488, precision: "exact" },
  "shengxing-xingzhan": { lat: 24.23556, lng: 120.55388, precision: "exact" },
  "deguang-hui": { lat: 24.23327, lng: 120.55199, precision: "exact" },
  "deguang-ju": { lat: 24.23289, lng: 120.55268, precision: "exact" },
  "fuyu-guangyu": { lat: 24.23607, lng: 120.55571, precision: "exact" },
  "dahua-luming": { lat: 24.23734, lng: 120.55585, precision: "exact" },
  "hezong-xiaoshidai5": { lat: 24.22795, lng: 120.55402, precision: "exact" },
  "hezong-xiaoshidai3": { lat: 24.22728, lng: 120.55398, precision: "exact" },
  "hezhu-t1": { lat: 24.23302, lng: 120.55478, precision: "exact" },

  /* ── 沙鹿第二批（系統擁有者本人標的，2026-08-27）──
     ⚠️ 這批 16 筆也全部落在沙鹿火車站商圈色塊裡面，含總表寫梧棲區的
        精銳錦、佳格聚晴山、德光一築、德光二城、悠助意境。
        **8 個梧棲區的案子已標 7 個，7 個全在色塊內** ——
        「行政區寫梧棲＝會落在沙鹿色塊外」這個假設已被實測徹底推翻，不要再用。

     剩富宇富嶼一案沒座標（預售，2029 完工）。 */
  "kaiyue-w": { lat: 24.23613, lng: 120.56005, precision: "exact" },
  "zhanqian-qingshidai": { lat: 24.23135, lng: 120.55153, precision: "exact" },
  "fuyu-zhencang": { lat: 24.23962, lng: 120.56133, precision: "exact" },
  "hongyu-jing": { lat: 24.22415, lng: 120.5552, precision: "exact" },
  "jiahua-daxin": { lat: 24.22964, lng: 120.55525, precision: "exact" },
  "hezong-xiaoshidai1": { lat: 24.22489, lng: 120.55253, precision: "exact" },
  "hezong-xiaoshidai2": { lat: 24.2272, lng: 120.55367, precision: "exact" },
  "jiahong-keyi": { lat: 24.23767, lng: 120.57097, precision: "exact" },
  "youfeng-xinshenghuo": { lat: 24.23606, lng: 120.56967, precision: "exact" },
  "qingchunxueyuan-shalu": { lat: 24.23147, lng: 120.55418, precision: "exact" },
  "kuailetiane-huasha": { lat: 24.23914, lng: 120.57196, precision: "exact" },
  "jingrui-jin": { lat: 24.24069, lng: 120.55364, precision: "exact" },
  "jiage-juqingshan": { lat: 24.23092, lng: 120.54852, precision: "exact" },
  "deguang-yizhu": { lat: 24.23478, lng: 120.54914, precision: "exact" },
  "deguang-ercheng": { lat: 24.2348, lng: 120.54848, precision: "exact" },
  "youzhu-yijing": { lat: 24.23337, lng: 120.54881, precision: "exact" },

  /* ✅ 2026-08-23：39 案全部標完，而且全部是本人親手點的。
     我用 OSM 路網推的那批已經全數被覆蓋掉 —— 實測落差 180～270 公尺，
     留著只會誤導客戶。以後新增建案，座標一律走 /map?fix=1 由本人標。 */

  /* ── 鹿寮萬家福商圈，第一批 39 案（2026-08-27，系統擁有者用 /map?fix=1 親手點的）──
     逐筆核對過：id 都在建案表裡、案名對得上、area 都是鹿寮萬家福、沒有重複、
     沒有覆蓋到既有座標，**39 筆全部落在鹿寮萬家福色塊裡面**。

     兩組落點很近的都查過原因，不是點錯：
       ・富宇時代御所 ↔ 之丘 37 公尺 —— 兩案都在福德路 186 巷（他的總表就這樣寫）
       ・富宇凡爾賽 ↔ 富宇豐卉 59 公尺 —— 都在中山路 651 巷一帶（凡爾賽總表沒給門牌，
         位置是他憑在地認知點的）

     ⚠️ 鹿寮萬家福還有 25 案沒座標，清單裡會標「未標位置」。 */
  "jiutang-huayang-tiane": { lat: 24.24175, lng: 120.57064, precision: "exact" }, // 久樘花漾天鵝
  "dazhuang-qianyinyuan": { lat: 24.25551, lng: 120.571, precision: "exact" }, // 大樁謙隱園
  "dadaocheng-liyu": { lat: 24.25098, lng: 120.56364, precision: "exact" }, // 大稻埕禮御
  "jiazan-dazan": { lat: 24.24841, lng: 120.56338, precision: "exact" }, // 佳瓚大讚
  "fuyu-haide-gongyuan": { lat: 24.25637, lng: 120.56891, precision: "exact" }, // 富宇海德公園
  "fuyu-fanersai": { lat: 24.25512, lng: 120.56823, precision: "exact" }, // 富宇凡爾賽
  "maoyang-tianyue": { lat: 24.23882, lng: 120.56768, precision: "exact" }, // 茂洋天玥
  "danlian-a": { lat: 24.24443, lng: 120.55562, precision: "exact" }, // 丹聯大樓／丹聯A區
  "jiahong-dajing": { lat: 24.24848, lng: 120.55507, precision: "exact" }, // 佳鋐大境
  "fuwang-xinhaicheng": { lat: 24.25002, lng: 120.55751, precision: "exact" }, // 富旺心海城
  "yuanqian-newyang": { lat: 24.25569, lng: 120.56382, precision: "exact" }, // 元謙NEW漾
  "yongyifa-mimi": { lat: 24.25646, lng: 120.56214, precision: "exact" }, // 永益發覓蜜
  "fuyu-fenghui": { lat: 24.25557, lng: 120.56791, precision: "exact" }, // 富宇豐卉
  "dibao-18": { lat: 24.25526, lng: 120.5669, precision: "exact" }, // 帝堡18
  "xinhaiyuan-yangshidai": { lat: 24.25624, lng: 120.56613, precision: "exact" }, // 心海苑／漾世代
  "zhaodeng-ying": { lat: 24.2526, lng: 120.56307, precision: "exact" }, // 兆登櫻
  "shiji-fuyuguo": { lat: 24.24382, lng: 120.56471, precision: "exact" }, // 世紀富裕國
  "ancheng-shi": { lat: 24.25454, lng: 120.56353, precision: "exact" }, // 安城市
  "taiju-yaomei": { lat: 24.2562, lng: 120.56032, precision: "exact" }, // 太聚曜美
  "ancheng-zhumei": { lat: 24.24757, lng: 120.56087, precision: "exact" }, // 安城築美
  "yangguang-city": { lat: 24.24578, lng: 120.55926, precision: "exact" }, // 暘光City
  "cunmao-langjing": { lat: 24.2518, lng: 120.56215, precision: "exact" }, // 村懋朗境
  "jiage-xinyue": { lat: 24.24811, lng: 120.56147, precision: "exact" }, // 佳格心悅
  "shiji-fuyuguo-2": { lat: 24.24299, lng: 120.56441, precision: "exact" }, // 世紀富裕國2
  "fuyu-zhongshanhui": { lat: 24.25252, lng: 120.56973, precision: "exact" }, // 富宇中山匯
  "fuyu-shidai-huayuan": { lat: 24.25128, lng: 120.56874, precision: "exact" }, // 富宇時代花園
  "fuyu-shidai-yusuo": { lat: 24.25036, lng: 120.56877, precision: "exact" }, // 富宇時代御所
  "fuyu-shidai-zhiqiu": { lat: 24.25055, lng: 120.56847, precision: "exact" }, // 富宇時代之丘
  "deguang-yao": { lat: 24.24601, lng: 120.55794, precision: "exact" }, // 德光耀
  "huangjia-jiguang": { lat: 24.24584, lng: 120.56877, precision: "exact" }, // 皇家極光
  "kaiyue-shishang": { lat: 24.24544, lng: 120.5695, precision: "exact" }, // 凱悅時尚
  "huangjia-huangpin-2": { lat: 24.24512, lng: 120.57038, precision: "exact" }, // 皇家皇品2
  "luze-liyu": { lat: 24.24618, lng: 120.57129, precision: "exact" }, // 鹿澤禮寓
  "jiali-lijing": { lat: 24.24316, lng: 120.57048, precision: "exact" }, // 嘉麗儷景
  "luming-yusuo": { lat: 24.24216, lng: 120.56944, precision: "exact" }, // 鹿鳴寓所
  "fuyu-yunji": { lat: 24.24016, lng: 120.56727, precision: "exact" }, // 富宇云集
  "huangjia-zuoan": { lat: 24.24453, lng: 120.55831, precision: "exact" }, // 皇家左岸
  "zhifu-haole": { lat: 24.2469, lng: 120.55382, precision: "exact" }, // 致富好樂
  "taiju-yaomei-2": { lat: 24.24537, lng: 120.55426, precision: "exact" }, // 太聚曜美2

  /* ── 鹿寮萬家福第二批 24 案 ＋ 沙鹿車站最後 1 案（2026-08-27，同樣是他用 /map?fix=1 點的）──
     核對過：id、案名、無重複、無覆蓋，**25 筆全部落在自己那一區的色塊內**。

     ⚠️ 其中 **富宇富嶼**（area 沙鹿車站、坐落卻是梧棲區興農路）**落在沙鹿色塊裡面**。
        本檔上面那段舊註解預測「那 8 案標了會落在色塊外」——那 8 案現在全部標完，
        **8 個全在色塊內，預測整個不成立**（沙鹿色塊 8/27 已由他重畫成 41 點）。

     ⚠️ 三組落點在 60 公尺內的，共同點是**沒有門牌的那一案**（總表寫「鹿寮家樂福生活圈」），
        位置是他憑在地認知點的，旁邊那案才有門牌：
          ・晴空墅（透天，無門牌）↔ 心海苑／漾世代（中山路中峰巷 145 號）28 公尺
          ・富貴園華廈區（無門牌）↔ 皇家極光（光華路 391 巷 55 號）53 公尺
          ・富貴園華廈區（無門牌）↔ 凱悅時尚（福田北街 400 號）39 公尺
        **這三筆沒有門牌可以交叉查證**，跟前一批那兩組（總表寫同一條巷）不一樣。
        已回報請他確認，他沒說要改就是對的，不要自己挪。 */
  "kaiyue-jingxi": { lat: 24.25277, lng: 120.55704, precision: "exact" }, // 凱悅京璽
  "fuwang-xinhaizhan": { lat: 24.25095, lng: 120.5593, precision: "exact" }, // 富旺心海綻
  "dibao-32": { lat: 24.25024, lng: 120.55975, precision: "exact" }, // 帝堡32
  "fude-xingyao": { lat: 24.25011, lng: 120.56057, precision: "exact" }, // 富德星耀
  "lintai-qinshan": { lat: 24.25111, lng: 120.56277, precision: "exact" }, // 林泰親善
  "dibao-15": { lat: 24.2573, lng: 120.56818, precision: "exact" }, // 帝堡15
  "xing-qingkong": { lat: 24.25696, lng: 120.56727, precision: "exact" }, // 星晴空
  "lufeng-jing": { lat: 24.25752, lng: 120.57156, precision: "exact" }, // 鹿峰靜
  "shengyang-qingkong-3": { lat: 24.25748, lng: 120.57316, precision: "exact" }, // 聖揚晴空3
  "fuli-5": { lat: 24.25569, lng: 120.57184, precision: "exact" }, // 馥麗5
  "kunlianfu-zhifu": { lat: 24.25461, lng: 120.5697, precision: "exact" }, // 坤聯富智富+
  "kaiyue-moma": { lat: 24.25467, lng: 120.57128, precision: "exact" }, // 凱悅MOMA透天／華廈區
  "dibao-31": { lat: 24.2552, lng: 120.56894, precision: "exact" }, // 帝堡31
  "qingkong-shu": { lat: 24.25619, lng: 120.5664, precision: "exact" }, // 晴空墅
  "kaiyue-jingzhan": { lat: 24.25192, lng: 120.56867, precision: "exact" }, // 凱悅京綻－大樓區
  "kaiyue-aimyshi": { lat: 24.25176, lng: 120.56927, precision: "exact" }, // 凱悅愛My市
  "fuyueju-3": { lat: 24.24698, lng: 120.56648, precision: "exact" }, // 富躍居3
  "huawei-zhijian": { lat: 24.24633, lng: 120.56423, precision: "exact" }, // 華偉知見
  "weixiao-zhumei": { lat: 24.25639, lng: 120.56521, precision: "exact" }, // 微笑築美
  "weixiao-daweilai-3": { lat: 24.25798, lng: 120.56589, precision: "exact" }, // 微笑大未來3
  "qingpu-yuan": { lat: 24.25767, lng: 120.56171, precision: "exact" }, // 青樸院
  "yihong-yile": { lat: 24.25681, lng: 120.56132, precision: "exact" }, // 逸竑逸樂
  "yupin-yuan-2": { lat: 24.2502, lng: 120.55654, precision: "exact" }, // 御品院2
  "fuguiyuan-huasha": { lat: 24.24573, lng: 120.56928, precision: "exact" }, // 富貴園華廈區
  "fuyu-fuyu": { lat: 24.23535, lng: 120.55138, precision: "exact" }, // 富宇富嶼（2026-08-27 系統擁有者重新標一次，較前一筆 24.23537/120.55165 位移約 27 公尺，採後給的）

  /* ── 最後 3 案（2026-08-27）── 標完這批，**133 案全部有座標，清單裡不再有「未標位置」**。
     核對過：id、案名、區域、無重複、無孤兒，3 筆都在鹿寮萬家福色塊內，
     跟既有 130 筆比對 80 公尺內沒有鄰居。 */
  "cunmao-puyue": { lat: 24.2484, lng: 120.56052, precision: "exact" }, // 村懋璞悅
  "hezong-xiaoshidai6": { lat: 24.25052, lng: 120.56428, precision: "exact" }, // 小時代6
  "kaijun-deguangxingzhan": { lat: 24.24885, lng: 120.56724, precision: "exact" }, // 德光星綻
};

/** 重劃區大致中心，地圖初始視角用 */
export const MAP_CENTER = { lat: 24.2655, lng: 120.5375 } as const;

/* ─────────────── 統計 ─────────────── */

export function projectStats() {
  const units = PROJECTS.reduce((sum, p) => sum + (p.units ?? 0), 0);
  const builders = new Set(PROJECTS.map((p) => p.builder));
  /**
   * 重劃區那半邊（梧棲＋清水）。**凡是句子裡有「重劃區」三個字，數量就要用這個，
   * 不能用 `total`** —— 2026-08-27 補進沙鹿車站商圈 28 案之後 `total` 是全站案數，
   * 拿去接在「重劃區」後面就變成對客戶宣稱重劃區有 67 案。
   */
  const district = PROJECTS.filter((p) => p.area === "梧棲" || p.area === "清水");
  return {
    total: PROJECTS.length,
    /** 重劃區（梧棲＋清水兩半）的案數 */
    district: district.length,
    /** 各區案數。新增 area 時這裡自己會多一個 key，不用回來改 */
    byArea: PROJECTS.reduce((acc, p) => {
      acc[p.area] = (acc[p.area] ?? 0) + 1;
      return acc;
    }, {} as Partial<Record<ProjectArea, number>>),
    /** 重劃區那半邊的總戶數 */
    districtUnits: district.reduce((sum, p) => sum + (p.units ?? 0), 0),
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

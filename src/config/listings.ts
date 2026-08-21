/**
 * 🏠 精選好案 —— 初始種子資料（❗不是真相來源）
 *
 * 🔴 2026-08-20 起物件改存資料庫，**要改物件請到後台 /admin/listings**。
 *    改這個檔沒有用 —— 下面的內容只在資料庫第一次建表時灌進去一次，
 *    之後就再也不會被讀（唯一例外：資料庫連不上時，對外頁面拿這裡的資料當備援，
 *    寧可顯示舊物件也不要讓官網開天窗）。
 *
 *    種子只灌一次這件事是刻意的：不然你在後台刪掉的物件，下次部署又自己長回來。
 *    旗標存在 appointment_config 的 `listings_seeded_v1`。
 *
 * 下面這些規矩在後台一樣成立，後台的說明文字也是照這個寫的：
 *
 * ⚠️ 成交或下架的物件，狀態改成「已成交／下架」就會從網站上消失。
 *    **賣掉的物件還掛在網站上就是廣告不實**，這一步不能省。
 *    （不是整筆刪掉 —— 留著改狀態，之後要回頭查曾經賣過什麼比較方便。）
 *
 * ⚠️ 坪數、格局、屋況、價格這些寫上去就要真實可查。行銷詞可以寫，但要說得出根據。
 *    後台會在你打字時標出有法律風險的字眼（規則在 src/lib/listing-copy-risk.ts）。
 *
 * ⚠️ link 指到外部（FB 影片、591）。外部頁面下架之後連結就變死的，
 *    **每次要改物件時順手點一遍**。已知 591 物件頁下架後會被導回首頁，不會給 404 畫面。
 *
 * 📷 照片放 public/listings/，檔名用英數（中文檔名進網址會被編碼，容易出事）。
 *    **每個物件可以放多張**（建議 3 張），寫在 photos 陣列裡，第一張是封面。
 *    例：photos: ["shalu-langjing.jpg", "shalu-langjing-2.jpg", "shalu-langjing-3.jpg"]
 *    建議 3:2，卡片是照這個比例切的，比例不合會被裁掉上下或左右。
 *    **照片是唯一還需要部署的東西** —— 後台只能從這個資料夾現有的檔案挑，不能上傳。
 */

export type Listing = {
  /** 網址與圖檔用的識別字，只用小寫英數與連字號 */
  slug: string;
  /** 標題。照你在 LINE 好案的寫法，一句話講完最大賣點 */
  title: string;
  /** 賣點條列。畫面上每一條前面會自動加 ✨，這裡不用自己打 */
  points: string[];
  /** 行政區＋社區名。顯示在卡片上，也是在地搜尋的關鍵字 */
  area: string;
  /**
   * 照片檔名，放在 public/listings/ 底下，這裡只填檔名。
   *
   * **第一張是封面**，卡片預設顯示它。
   * 放第二張以上，卡片會自動變成可以左右滑的相簿（右上角出現「1/3」、下方出現圓點）。
   * 建議每個物件 3 張：客廳 → 主臥 → 視野或外觀，順序就是這裡的順序。
   * 還沒有照片就填空陣列 []，畫面顯示佔位色塊，版面不會歪。
   */
  photos: string[];
  /**
   * 外部連結（FB 影片賞析、591 物件頁）。沒有就填 null。
   * label 就是按鈕上的字，會自動加「↗」表示會開新分頁。
   */
  link: { label: string; href: string } | null;
  /** active = 顯示在網站上；sold = 已成交／已下架，不顯示 */
  status: "active" | "sold";
};

export const LISTINGS: Listing[] = [
  // ── 有照片的排前面，首頁只取前 3 筆 ──
  {
    slug: "qingshui-lianyueju",
    title: "中高樓無限視野兩房平車",
    points: [
      "無限棟距｜視野開闊",
      "主＋附 20 坪大兩房，配 B2 柱邊平車位",
    ],
    area: "清水區・聯悦聚",
    photos: ["qingshui-lianyueju.jpg"],
    link: null,
    status: "active",
  },
  {
    slug: "shalu-deguangju",
    title: "後站商圈三房平車",
    points: [
      "客餐廳面寬 3米2，空間大舒適",
      "全新交屋、雙衛浴開窗，配 B1 平車位",
    ],
    area: "沙鹿區・德光聚",
    photos: ["shalu-deguangju.jpg"],
    link: null,
    status: "active",
  },
  {
    slug: "xinhaicheng-2f2b",
    title: "超美視野加裝潢加稀有兩衛浴",
    points: [
      "心海城，串連清水 X 沙鹿 X 梧棲三大區域。",
      "稀有兩房兩衛、無限視野戶。",
      "全室輕裝潢，一卡皮箱即可入住。",
    ],
    area: "清水・沙鹿・梧棲交界",
    photos: ["xinhaicheng-2f2b.jpg"],
    link: {
      label: "物件資訊",
      href: "https://sale.591.com.tw/home/house/detail/2/20691547.html",
    },
    status: "active",
  },

  // ── 以下為 2026-08-19 補齊的六筆 ──
  {
    slug: "longjing-shengjiajingyi",
    title: "近東海精科｜免七佰全新視野兩房車位",
    points: [
      "昇佳景邑，總戶數 73 戶，小型社區，一層六戶配兩梯。",
      "此戶頂樓兩房配一機械車位，空間好規劃，衛浴開窗不潮溼。",
    ],
    area: "龍井區・昇佳景邑",
    photos: ["longjing-shengjiajingyi.jpg"],
    link: {
      label: "影片賞析",
      href: "https://www.facebook.com/reel/2068271100757837",
    },
    status: "active",
  },
  {
    // ⚠️ 這筆原始資料沒有給標題，下面這句是從你自己的賣點文字組出來的，
    //    只有事實沒有行銷語氣。想換成正式標題直接改這一行。
    slug: "qingshui-changhong-tianyun",
    title: "長虹建設新市鎮二期兩房平車",
    points: [
      "品牌知名建商，長虹建設新市鎮第二期，品質速材優良。",
      "兩房 B3 平車，大工作陽台，泡澡浴缸，洗碗機，電動曬衣桿全部有。",
    ],
    area: "清水區・長虹天韻",
    photos: ["qingshui-changhong-tianyun.jpg"],
    link: {
      label: "影片賞析",
      href: "https://www.facebook.com/reel/4591925977796313",
    },
    status: "active",
  },
  {
    slug: "shalu-yueshanqiu",
    title: "七期建築團隊美學｜北勢靜宜雙商圈",
    points: [
      "沙鹿樾山丘，總戶數 39 戶單純，社區唯一釋出三房，三面採光，前後陽台，雙衛浴皆有開窗。",
      "近未來藍線捷運 B6 站、特三特五號。",
    ],
    area: "沙鹿區・樾山丘",
    photos: ["shalu-yueshanqiu.jpg"],
    link: {
      label: "影片賞析",
      href: "https://www.facebook.com/reel/1018190994158967",
    },
    status: "active",
  },
  {
    slug: "wuqi-jiahong-xinyi",
    title: "送四台大金冷氣｜全新輕裝樹梢三房平車",
    points: [
      "佳鋐新邑樹梢戶，三房平車，送四台全新大金冷氣，管線也包好直接入住。",
      "一層五戶雙電梯，單純小型社區，不複雜好安心。",
    ],
    area: "梧棲區・佳鋐新邑",
    photos: ["wuqi-jiahong-xinyi.jpg"],
    link: {
      label: "影片賞析",
      href: "https://www.facebook.com/reel/1556328146079414",
    },
    status: "active",
  },
  {
    // ⚠️ 原本給的 591 連結（20039584）已經失效 —— 591 把它導回首頁，
    //    代表那個物件頁已下架。先拿掉，有新連結再補。
    slug: "shalu-langjing",
    title: "鹿寮商圈｜六米八大面寬｜全新雙車電梯別墅",
    points: [
      "沙鹿朗境，臨十米路，社區角間別墅，六米八大面寬。",
      "四房間間套房，配有電梯，可停雙車，車庫旁有側空地，地坪大好利用。",
    ],
    area: "沙鹿區・朗境",
    photos: ["shalu-langjing.jpg"],
    link: null,
    status: "active",
  },
  {
    slug: "qingshui-shizhenzhiying",
    title: "輕裝潢視野戶｜賠售兩房平車",
    points: [
      "社區總戶數 461 戶，一層七戶三電梯！",
      "兩房輕裝潢，空間好規劃，防火獨立廚房，油煙不混雜，首購成家好選擇！",
    ],
    area: "清水區・市鎮之櫻",
    photos: ["qingshui-shizhenzhiying.jpg"],
    link: {
      label: "影片賞析",
      href: "https://www.facebook.com/reel/1406526767983537",
    },
    status: "active",
  },
];

/** 網站上要顯示的物件（自動濾掉已成交的） */
export const ACTIVE_LISTINGS = LISTINGS.filter((l) => l.status === "active");

/** 首頁「精選好案」最多放幾張。放太多會把首頁拉得太長，看不到下面的預約入口 */
export const HOME_FEATURED_COUNT = 3;

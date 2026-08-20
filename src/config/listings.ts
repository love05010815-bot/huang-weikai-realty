/**
 * 🏠 精選好案 —— 要改物件，只改這個檔
 *
 * 首頁的「精選好案」區塊與 /listings 好案總覽，內容都從這裡來。
 *
 * ⚠️ 成交或下架的物件，把 status 改成 "sold" 就會從網站上消失。
 *    **賣掉的物件還掛在網站上就是廣告不實**，這一步不能省。
 *    （不是把整筆刪掉 —— 留著改狀態，之後要回頭查曾經賣過什麼比較方便。）
 *
 * ⚠️ 坪數、格局、屋況、價格這些寫上去就要真實可查。行銷詞可以寫，但要說得出根據。
 *
 * 📷 照片放 public/listings/，檔名用英數（中文檔名進網址會被編碼，容易出事）。
 *    建議 4:3，卡片是照這個比例切的，非 4:3 會被裁掉上下或左右。
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
   * 還沒有照片就填 null，畫面會顯示佔位色塊，版面不會歪。
   */
  photo: string | null;
  /** active = 顯示在網站上；sold = 已成交／已下架，不顯示 */
  status: "active" | "sold";
};

export const LISTINGS: Listing[] = [
  {
    slug: "qingshui-lianyueju",
    title: "中高樓無限視野兩房平車",
    points: [
      "開價低於實登｜無限棟距｜視野開闊",
      "主＋附 20 坪大兩房，配 B2 柱邊平車位",
    ],
    area: "清水區・聯悦聚",
    photo: "qingshui-lianyueju.jpg",
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
    photo: "shalu-deguangju.jpg",
    status: "active",
  },
  {
    // 這筆的照片還沒到位，畫面上會顯示「照片準備中」的佔位塊
    slug: "xinhaicheng-2f2b",
    title: "超美視野加裝潢加稀有兩衛浴",
    points: [
      "心海城，串連清水 X 沙鹿 X 梧棲三大區域。",
      "稀有兩房兩衛、無限視野戶。",
      "全室輕裝潢，一卡皮箱即可入住。",
    ],
    area: "清水・沙鹿・梧棲交界",
    photo: null,
    status: "active",
  },
];

/** 網站上要顯示的物件（自動濾掉已成交的） */
export const ACTIVE_LISTINGS = LISTINGS.filter((l) => l.status === "active");

/** 首頁「精選好案」最多放幾張。放太多會把首頁拉得太長，看不到下面的預約入口 */
export const HOME_FEATURED_COUNT = 3;

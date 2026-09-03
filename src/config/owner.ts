/**
 * 👤 這個系統是誰的 —— 從這裡改，只改這一個檔
 *
 * 名片頁、預約表單、通知信、日曆邀請 全都讀這裡。
 * 把下面換成你自己的資料，整套系統就是你的了。
 *
 * ⚠️ 這個檔會進 Git。手機與 Email 填進去等於公開在網路上
 *    （名片本來就是要給人看的，但你如果不想被爬蟲收割，
 *      可以改成讀環境變數：process.env.OWNER_PHONE 之類）。
 */

export const OWNER = {
  /** 你的名字（正式全名，出現在通知信署名與日曆邀請） */
  name: "黃瑋凱",
  /** 慣用稱呼（客戶怎麼叫你，出現在文案裡：「瑋凱會與您聯繫」） */
  alias: "瑋凱",
  /**
   * 頭銜。前台六個地方共用：首頁 hero 與頁尾、名片頁、地圖頁頁尾、LINE bot 的自我介紹。
   * 改這一個值就會全部一起變。
   */
  title: "太平洋房屋 梧棲新市鎮旗艦店 副店長",
  /**
   * 太平洋房屋的 logo（首頁 hero 的頭銜前面會顯示）。
   *
   * 填「檔名放在 public/ 底下的路徑」才會顯示，例如 "/pacific-mark.png"；
   * 留空字串就只顯示文字，不會破圖。
   *
   * ⚠️ 這是太平洋房屋的註冊商標，**一定要用公司給的正式檔**，
   *    不要拿網路上搜到的圖或自己重畫 —— 比例與色值跑掉就是把加盟品牌用錯。
   *    建議去背 PNG 或 SVG，正方形附近的比例最好排。
   */
  companyLogo: "/pacific-mark.png",
  /** 手機（顯示用，含分隔線） */
  phone: "0909-787-865",
  /** 手機（純數字，撥號連結與 LINE 加好友用） */
  phoneRaw: "0909787865",
  /** 聯絡信箱（客戶回信會到這裡） */
  email: "love05010815@gmail.com",
  /** 公司地址（「公司面談」這個選項會顯示它） */
  address: "台中市梧棲區四維中路338號（太平洋房屋梧棲新市鎮旗艦店）",
  /** 公司／品牌名 */
  company: "太平洋房屋",
  /**
   * 大頭照放 public/card/ 底下。名片頁 /card 用 150px 的圓形顯示，也是那頁的分享預覽圖（OG）。
   * 2026-09-03 換成新的坐姿照裁的頭肩正方形（800×800）。
   * ⚠️ 換照片要用**新檔名**：LINE／FB 的連結預覽照網址快取，同名蓋檔會繼續顯示舊照片好幾天。
   *    舊檔名 owner.jpg 同時覆蓋成新照片，外面若有人連舊網址不會破圖。
   */
  photoUrl: "/card/owner-2026-09.jpg",
  /**
   * 一句話介紹自己。名片頁 /card 會直接顯示這一句。
   * 服務項目改名時記得回來看一眼 —— 完整五項在首頁 page.tsx 的 SERVICES。
   */
  slogan: "台中海線房產專家．買賣租賃／稅費諮詢／市場分析一次到位。112、113、114年連續三年千萬經紀人。",
} as const;

/**
 * 社群連結 —— **用不到的留空字串，那顆 icon 就整個不畫**（不會留下一個點了沒反應的死連結）。
 *
 * 讀這裡的有三個地方，改這一個檔三邊一起變：
 *   1. 首頁「預約諮詢」區塊底部的「追蹤瑋凱」那一排（`src/app/_ui/SocialLinks.tsx`）
 *   2. 名片頁 /card 的社群列
 *   3. 首頁 JSON-LD 的 `sameAs` —— 等於告訴 Google「這些帳號跟官網是同一個人」，
 *      社群累積的權重才併得回官網。填網址不只是多一顆按鈕，也是 SEO。
 *
 * ⚠️ 一定要填**完整網址、`https://` 開頭**。只填帳號（例如 `@weikai`）會被瀏覽器當成
 *    本站的相對路徑，點下去跳到 weikaihouse.com/@weikai 然後 404 ——
 *    **TypeScript 過、build 過、部署也成功**，只有客戶點下去才會發現。
 *
 *      fb      https://www.facebook.com/你的粉專
 *      ig      https://www.instagram.com/你的帳號
 *      yt      https://www.youtube.com/@你的頻道
 *      tiktok  https://www.tiktok.com/@你的帳號
 */
export const SOCIAL = {
  line: "https://line.me/R/ti/p/@a8865",
  fb: "https://www.facebook.com/108472157721504",
  yt: "https://www.youtube.com/@swujnuty0325",
  ig: "https://www.instagram.com/swujnuty0325/",
  tiktok: "https://www.tiktok.com/@show_787865",
} as const;

/** LINE 加好友 QR 圖（放 public/card/ 底下）。null = 不顯示 QR 區 */
export const LINE_QR: string | null = null;

/** 網站網址（通知信裡的連結、Open Graph 用） */
export const SITE_URL = process.env.APPOINTMENT_BASE_URL || "http://localhost:3000";

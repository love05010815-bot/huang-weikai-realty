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
  /** 頭銜 */
  title: "太平洋房屋 資深不動產經紀人",
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
  /** 大頭照放 public/card/ 底下 */
  photoUrl: "/card/owner.jpg",
  /** 一句話介紹自己 */
  slogan: "台中海線房產專家．資產配置／稅務諮詢／簡易裝潢一次到位。112、113、114年連續三年千萬經紀人。",
} as const;

/** 社群連結 —— 用不到的留空字串，畫面會自動不顯示 */
export const SOCIAL = {
  line: "https://line.me/R/ti/p/@a8865",
  fb: "",
  yt: "",
  ig: "",
} as const;

/** LINE 加好友 QR 圖（放 public/card/ 底下）。null = 不顯示 QR 區 */
export const LINE_QR: string | null = null;

/** 網站網址（通知信裡的連結、Open Graph 用） */
export const SITE_URL = process.env.APPOINTMENT_BASE_URL || "http://localhost:3000";

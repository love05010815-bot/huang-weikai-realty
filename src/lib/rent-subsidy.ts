/**
 * 300 億元中央擴大租金補貼試算 —— 純計算，不碰畫面，方便單獨驗算。
 *
 * ⚠️ 這裡的分級表與計算公式，是直接從內政部官方試算工具的原始碼逐字核對來的，
 *    不是憑印象寫的：
 *
 *   規則說明（申請資格、分級、加碼身分）
 *     內政部不動產資訊平台「300億元中央擴大租金補貼資格檢視及金額試算」
 *     https://pip.moi.gov.tw/V3/B/SCRB0104.aspx
 *
 *   逐縣市分級表與計算公式（本檔的 CITY_TOWN_TABLE 與 calcRentSubsidy 核心邏輯）
 *     內政部官方試算工具的原始 JS：
 *     https://pip.moi.gov.tw/script/js/info_b1021_115.js（115 年度）
 *     這支檔案是政府網站的公開靜態資源，內容就是瀏覽器實際執行的計算邏輯，
 *     115 這個數字是民國年（2026 年），**每年會換新檔名**，改分級表或公式前
 *     先去上面那個網址看檔名有沒有變成 116。
 *
 * 這個補貼制度跟房地合一稅不一樣的地方：
 *   ・分級表逐縣市不同，部分縣市內又分兩組行政區（例：台中海線的龍井、沙鹿
 *     是一組，梧棲、清水是另一組，金額不一樣）
 *   ・「超過辦理戶數會用評點制排序」——算出來的金額是「如果核准會拿到多少」，
 *     不是「保證核准」。這件事官方試算工具自己也在結果頁註明：
 *     「以上試算結果僅供參考，最後結果將由審查單位認定」
 *
 * 刻意不做的部分（官方前台試算工具本身也沒有做，做了會給錯答案）：
 *   動產與不動產的精確金額限制 —— 那要比對稅務與財產登記資料，一般人自己
 *   算不出來，官方也是申請後由審查單位查核，不是使用者自己填數字就能算的。
 *   未成年特殊身份（安置機構結束安置、外國籍人士監護）的年齡例外規則，
 *   這裡統一當成「不適用試算」，請洽詢。
 */

/** 分級表最後核對日。改分級表或公式前先確認官方 JS 檔名有沒有變 */
export const RULES_CHECKED_AT_YEAR = "115 年度（2026 年）";

/** 家庭成員人數輸入 */
export type FamilyInput = {
  /** 申請人本人及配偶 */
  self: number;
  /** 申請人或配偶之未成年子女 */
  children: number;
  /** 申請人本人或配偶孕有之胎兒 */
  unborn: number;
  /** 其他受監護之人 */
  wards: number;
};

export type EconomicStatus = "low" | "middle" | "none";

export type MarriageStatus = "single" | "newlywed" | "married";

export type RentSubsidyInput = {
  /** 是中華民國國民且在國內設有戶籍 */
  isCitizen: boolean;
  /** 已成年（本試算不處理未成年特殊身份的例外情形） */
  isAdult: boolean;
  age: number;
  family: FamilyInput;
  /** 租賃房屋所在縣市，必須是 CITY_TOWN_TABLE 裡的其中一個 */
  city: string;
  /** 租賃房屋所在行政區。縣市只有一組標準時傳 null */
  district: string | null;
  /** 家庭成員是否單獨持有房屋、或持有共有房屋且持份合計為全部 */
  ownsHome: boolean;
  /** 每人每月平均所得是否低於當地門檻（門檻依縣市不同，見分級表） */
  incomeBelowLimit: boolean;
  /** 家庭成員是否已享有其他住宅相關補貼（自購貸款利息補貼等） */
  hasOtherSubsidy: boolean;
  marriage: MarriageStatus;
  economicStatus: EconomicStatus;
  /** 是否具備社會弱勢身分（特殊境遇家庭、65 歲以上、身心障礙者等任一項） */
  isSociallyDisadvantaged: boolean;
};

export type Ineligible = { eligible: false; reason: string };

export type RentSubsidyResult = {
  eligible: true;
  city: string;
  district: string;
  /** 分級：第一級金額最高、第三級最低 */
  level: 1 | 2 | 3;
  /** 分級對應的基礎補貼金額（月） */
  baseAmount: number;
  /** 實際套用的加碼倍率（多項條件符合時取最高的那個，不是疊加） */
  scale: number;
  /** 套用了哪些加碼身分，每項附倍率 */
  scaleReasons: Array<{ label: string; scale: number }>;
  /** 最終試算金額（月）＝ baseAmount × scale，無條件捨去到整數元 */
  monthlyAmount: number;
  notes: string[];
};

/**
 * 官方分級表。[縣市, 組別, 行政區清單(逗號分隔，空字串代表全縣市單一標準),
 *              每人每月所得上限, 第一級金額, 第二級金額, 第三級金額]
 *
 * ⚠️ 逐字從 info_b1021_115.js 的 cityTownArray 抄出來，不要手改數字 ——
 *    改了就跟官方對不上。要更新請整段替換，並在上面的年度註記同步更新。
 */
const CITY_TOWN_TABLE: ReadonlyArray<
  readonly [string, string, string, number, number, number, number]
> = [
  ["臺北市", "1", "", 61137, 8000, 5000, 3000],
  [
    "新北市",
    "1",
    "三重區、土城區、中和區、永和區、汐止區、板橋區、新店區、新莊區、蘆洲區、八里區、三峽區、五股區、林口區、泰山區、淡水區、深坑區、樹林區、鶯歌區",
    50700,
    5000,
    4000,
    2400,
  ],
  [
    "新北市",
    "2",
    "三芝區、平溪區、石門區、石碇區、坪林區、金山區、烏來區、貢寮區、瑞芳區、萬里區、雙溪區",
    50700,
    3600,
    3200,
    2000,
  ],
  ["新竹縣", "1", "", 46545, 5000, 4000, 2400],
  ["新竹市", "1", "", 46545, 5000, 4000, 2400],
  ["桃園市", "1", "", 50304, 5000, 4000, 2400],
  [
    "臺中市",
    "1",
    "中區、北區、北屯區、西區、西屯區、東區、南區、南屯區、大里區、大雅區、潭子區、龍井區、豐原區、大甲區、太平區、沙鹿區、烏日區",
    48231,
    5000,
    4000,
    2400,
  ],
  [
    "臺中市",
    "2",
    "東勢區、神岡區、大安區、大肚區、外埔區、石岡區、后里區、和平區、梧棲區、清水區、新社區、霧峰區",
    48231,
    3600,
    3200,
    2000,
  ],
  [
    "臺南市",
    "1",
    "中西區、北區、安平區、東區、南區、永康區、善化區、新市區、安南區、仁德區、安定區、西港區、佳里區、柳營區、麻豆區、新化區、新營區、歸仁區、鹽水區",
    46545,
    4000,
    3600,
    2200,
  ],
  [
    "臺南市",
    "2",
    "下營區、將軍區、學甲區、關廟區、七股區、大內區、山上區、六甲區、北門區、左鎮區、玉井區、白河區、官田區、東山區、南化區、後壁區、楠西區、龍崎區",
    46545,
    3600,
    3200,
    2000,
  ],
  [
    "高雄市",
    "1",
    "小港區、旗津區、大社區、大寮區、大樹區、仁武區、岡山區、林園區、梓官區、鳥松區、茄萣區、湖內區、路竹區、旗山區、鳳山區、橋頭區、燕巢區、三民區、左營區、前金區、前鎮區、苓雅區、新興區、楠梓區、鼓山區、鹽埕區、永安區、阿蓮區、美濃區、彌陀區",
    48120,
    4000,
    3600,
    2200,
  ],
  ["高雄市", "2", "內門區、六龜區、田寮區、甲仙區、杉林區、那瑪夏區、茂林區、桃源區", 48120, 3600, 3200, 2000],
  ["宜蘭縣", "1", "", 46545, 3600, 3200, 2000],
  ["嘉義市", "1", "", 46545, 3600, 3200, 2000],
  ["基隆市", "1", "", 46545, 3600, 3200, 2000],
  ["臺東縣", "1", "", 46545, 3600, 3200, 2000],
  ["花蓮縣", "1", "", 46545, 3600, 3200, 2000],
  ["金門縣", "1", "", 43023, 3600, 3200, 2000],
  ["澎湖縣", "1", "", 46545, 3600, 3200, 2000],
  ["苗栗縣", "1", "", 46545, 3600, 3200, 2000],
  ["彰化縣", "1", "", 46545, 3600, 3200, 2000],
  ["雲林縣", "1", "", 46545, 3600, 3200, 2000],
  ["南投縣", "1", "", 46545, 3600, 3200, 2000],
  ["嘉義縣", "1", "", 46545, 3600, 3200, 2000],
  ["屏東縣", "1", "", 46545, 3600, 3200, 2000],
  ["連江縣", "1", "", 43023, 3600, 3200, 2000],
];

export type CityOption = { city: string; districts: string[] | null; incomeLimit: number };

/** 給畫面的下拉選單用：每個縣市有哪些選項、有沒有要選行政區 */
export function listCities(): CityOption[] {
  const byCity = new Map<string, typeof CITY_TOWN_TABLE[number][]>();
  for (const row of CITY_TOWN_TABLE) {
    const arr = byCity.get(row[0]) ?? [];
    arr.push(row);
    byCity.set(row[0], arr);
  }
  const out: CityOption[] = [];
  for (const [city, rows] of byCity) {
    if (rows.length === 1) {
      out.push({ city, districts: null, incomeLimit: rows[0][3] });
    } else {
      out.push({
        city,
        districts: rows.map((r) => r[2]),
        incomeLimit: rows[0][3],
      });
    }
  }
  return out;
}

/** 社會弱勢身分清單，給畫面顯示用（複選，選其中任一項就算符合） */
export const SOCIAL_DISADVANTAGE_ITEMS = [
  "特殊境遇家庭",
  "於安置教養機構或寄養家庭結束安置無法返家，未滿 25 歲",
  "65 歲以上",
  "受家庭暴力或性侵害之受害者及其子女",
  "身心障礙者",
  "感染人類免疫缺乏病毒者或罹患後天免疫缺乏症候群者（AIDS）",
  "原住民",
  "災民",
  "遊民",
  "因懷孕或生育而遭遇困境之未成年人",
] as const;

function findCityRow(city: string, district: string | null) {
  const rows = CITY_TOWN_TABLE.filter((r) => r[0] === city);
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0];
  const row = rows.find((r) => r[2] === district);
  return row ?? null;
}

export function calcRentSubsidy(input: RentSubsidyInput): RentSubsidyResult | Ineligible {
  // ── 八道資格關卡，比照官方試算工具的 step1，任一項不符就直接擋下 ──
  if (!input.isCitizen) {
    return { eligible: false, reason: "申請人須為中華民國國民且在國內設有戶籍。" };
  }
  if (!input.isAdult) {
    return {
      eligible: false,
      reason: "申請人須年滿 18 歲。未成年但符合安置機構結束安置、或由外國人士監護等特殊身分者，請直接洽詢，這個試算沒有涵蓋。",
    };
  }
  const family = input.family.self + input.family.children + input.family.unborn + input.family.wards;
  if (family <= 0) {
    return { eligible: false, reason: "家庭成員人數要至少 1 人（申請人本人）。" };
  }
  const row = findCityRow(input.city, input.district);
  if (!row) {
    return { eligible: false, reason: "找不到這個縣市／行政區的分級資料，請確認選擇是否正確。" };
  }
  if (input.ownsHome) {
    return { eligible: false, reason: "家庭成員名下不能單獨持有房屋、或持有共有房屋且持份合計為全部。" };
  }
  if (!input.incomeBelowLimit) {
    return {
      eligible: false,
      reason: `每人每月平均所得要低於 ${row[3].toLocaleString("zh-TW")} 元（${input.city}的門檻）才符合資格。`,
    };
  }
  if (input.hasOtherSubsidy) {
    return {
      eligible: false,
      reason: "家庭成員不能同時享有其他住宅相關補貼（例如自購或修繕住宅貸款利息補貼、承租社會住宅）。",
    };
  }

  // ── 分級：依家庭人數與經濟弱勢身分決定拿第幾級的基礎金額 ──
  const [, , district, , lv1, lv2, lv3] = row;
  const familyChilds = input.family.children + input.family.unborn;

  let level: 1 | 2 | 3;
  let baseAmount: number;
  if (
    (family >= 2 && input.economicStatus === "low") ||
    (family >= 3 && (input.economicStatus === "low" || input.economicStatus === "middle"))
  ) {
    level = 1;
    baseAmount = lv1;
  } else if (family === 1 && input.age < 40 && input.economicStatus === "none" && !input.isSociallyDisadvantaged) {
    level = 3;
    baseAmount = lv3;
  } else {
    level = 2;
    baseAmount = lv2;
  }

  // ── 加碼倍率：符合多項時「擇高」，不是疊加。這是官方結果頁自己寫的規則 ──
  let scale = 1.0;
  const scaleReasons: Array<{ label: string; scale: number }> = [];

  if (input.marriage === "single" && input.age < 40) {
    scaleReasons.push({ label: "單身青年（未滿 40 歲）", scale: 1.2 });
  }
  if (input.marriage === "newlywed") {
    scaleReasons.push({ label: "新婚家庭（申請日前二年內結婚）", scale: 1.3 });
  }
  if (input.economicStatus === "low" || input.economicStatus === "middle") {
    scaleReasons.push({ label: input.economicStatus === "low" ? "低收入戶" : "中低收入戶", scale: 1.4 });
  }
  if (input.isSociallyDisadvantaged) {
    scaleReasons.push({ label: "社會弱勢身分", scale: 1.2 });
  }
  if (familyChilds > 0) {
    scaleReasons.push({
      label: `育有未成年子女（含胎兒），共 ${familyChilds} 人`,
      scale: Math.round((1.2 + 0.2 * familyChilds) * 10) / 10,
    });
  }
  for (const r of scaleReasons) if (r.scale > scale) scale = r.scale;

  const monthlyAmount = Math.floor(baseAmount * scale);

  const notes: string[] = [
    "以上試算結果僅供參考，最後結果將由審查單位認定 —— 這是官方試算工具自己寫的話。",
    "超過各直轄市、縣（市）當年度辦理戶數時，會依評點制排序核給，試算出來的金額是「如果核准會拿到多少」，不是保證核准。",
    "動產（存款等）與不動產的精確財產限額沒有列入這裡的試算 —— 那要比對稅務與財產登記資料，官方前台工具本身也沒有做，是申請後由審查單位查核。",
  ];

  return {
    eligible: true,
    city: input.city,
    district: district || input.city,
    level,
    baseAmount,
    scale,
    scaleReasons,
    monthlyAmount,
    notes,
  };
}

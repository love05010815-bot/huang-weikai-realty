/**
 * 樂屋網（member.rakuya.com.tw）刊登表單的對應 —— 2026-09-10 實測 /sell/post/add 與 /rent/post/add。
 *
 * 樂屋是一頁式表單、原生 <select>／<input>，欄位名稱固定（selectPropertyUsecode／usecode／typecode／city／zipcode／
 * addr_road／floors／surfloors／bedrooms…／findate／direction／lifts／parkings／parkings_kind／totalsize／mainsize／
 * listprice／manage／securityfee／周圍環境 elementary/market/park…／聯絡 contact_name／tel2／service_fee；
 * 出租多 rental／rental_include[]／deposit_m／property_right／short_rent／cook／pet／sex／ridentity／landlord／equipment[]…）。
 *
 * 這裡只做「591 的資料包 → 樂屋要選哪個字」的翻譯，實際填表在 tools/post591-extension/rakuya.js。
 * 他 2026-09-10 的預設（沒回就照這樣）：聯絡人自行填寫「黃瑋凱」、委託到期日留空、有管理費 → 管理方式「管理員(警衛)」、
 * 物件名稱超過 25 字自動截、出租：押金 2 個月租金／短期租賃不可／性別不限／身分不限／不與房東同住／產權登記有／隔間留空。
 */

import type { Listing } from "@/lib/post591-parser";
import type { Derived, Post591Payload } from "@/lib/post591-map";

export const RAKUYA_TITLE_MAX = 25;

/**
 * 樂屋文案在這一行之前停（2026-09-10 他說的）：版型尾段的「貼心提醒」講的是 591 的問答訊息與【我的店舖】，
 * 樂屋沒有這些東西，所以整段不要。只看行首，他在後台文案格改過幾個字也照樣認。
 */
export const RAKUYA_DESC_STOP = /^貼心提醒/;

/** 樂屋版文案：從「貼心提醒」那一行起整段拿掉、尾巴的空行修掉；沒有那一行就原樣回傳（同事版尾段是空的）。 */
export function rakuyaDesc(desc: string): string {
  const lines = desc.split("\n");
  const stop = lines.findIndex((l) => RAKUYA_DESC_STOP.test(l.trim()));
  return (stop < 0 ? desc : lines.slice(0, stop).join("\n")).trimEnd();
}

export interface RakuyaExtra {
  /** 法定用途（樂屋清單跟 591 幾乎同名；591 的「一般事務所」樂屋沒有 → 住家用） */
  legal: string;
  /** 現況型式：出售「住宅」；出租「整層住家／獨立套房…」 */
  usecode: string;
  /** 現況類型：電梯大廈／華廈／透天厝／公寓／別墅／套房／樓中樓 */
  typecode: string;
  /** 房屋分類：中古屋／新屋（1-3 年） */
  ageType: string;
  isCommunity: boolean;
  floorsType: "單層" | "多層";
  floorsMax: number | null;
  /** 屋齡（整數年），樂屋「約 N 年」那格；不知道就 null → 勾「不揭露屋齡」 */
  ageYears: number | null;
  manage: string;
  manageFee: number | null;
  /** 車位：無車位／有車位（出租：自有） */
  parkStatus: string;
  /** 車位類型（出售點「有車位」才出現）：坡道平面式／坡道機械式／昇降平面式／昇降機械式／平面式車位／機械式車位… */
  parkKind: string;
  env: { elementary: string; market: string; park: string; transport: string; mrt: string; vital_function: string };
  /** 樂屋物件名稱上限 25 字，超過就截 */
  title25: string;
  titleTruncated: boolean;
  contactName: string;
  /** 沒給就沿用樂屋個人檔案帶出來的手機（外掛會先記下再填回）；同事版從「我的資料」帶 */
  contactPhone?: string;
  rent?: {
    depositSel: string;
    includes: string[];
    shortRent: string;
    sex: string;
    identity: string;
    landlord: string;
    propertyRight: string;
    cook: string;
    pet: string;
    anytime: boolean;
  };
}

/** 型錄「坡道/平面」「升降/機械」→ 樂屋車位類型的單選字 */
export function rakuyaParkKind(parkType: string): string {
  const p = (parkType || "").replace(/[\s/／]/g, "");
  if (/坡道.*平面|平面.*坡道/.test(p)) return "坡道平面式";
  if (/坡道.*機械|機械.*坡道/.test(p)) return "坡道機械式";
  if (/(升降|昇降).*平面|平面.*(升降|昇降)/.test(p)) return "昇降平面式";
  if (/(升降|昇降).*機械|機械.*(升降|昇降)/.test(p)) return "昇降機械式";
  if (/循環/.test(p)) return "機械循環式";
  if (/庭院/.test(p)) return "庭院式";
  if (/車庫/.test(p)) return "獨立車庫";
  if (/電腦選號/.test(p)) return "電腦選號";
  if (/機械/.test(p)) return "機械式車位";
  return "平面式車位";
}

const LEGAL_OK = ["住家用", "住商用", "住工用", "集合住宅", "國民住宅", "工商用", "商業用", "工業用", "農業用", "店鋪", "廠房"];

export function buildRakuya(d: Listing, o: Derived, p: Post591Payload, nowYear: number = new Date().getFullYear()): RakuyaExtra {
  const rent = d.deal === "rent";
  const t = o.type;
  const typecode = /電梯大樓/.test(t) ? "電梯大廈" : /華廈/.test(t) ? "華廈" : /透天/.test(t) ? "透天厝" : /公寓/.test(t) ? "公寓" : /別墅/.test(t) ? "別墅" : /樓中樓/.test(t) ? "樓中樓" : "電梯大廈";
  // 資料包的 done.y 是民國年（591 要的），算屋齡要先換回西元；型錄有西元竣工年就直接用
  const doneAd = d.y != null ? d.y : p.done.y != null ? p.done.y + 1911 : null;
  const ageYears = doneAd != null ? Math.max(0, nowYear - doneAd) : d.ageYears != null ? Math.floor(d.ageYears) : null;
  const chars = [...(p.title || "")];
  const title25 = chars.slice(0, RAKUYA_TITLE_MAX).join("");
  const includes591 = (p.rent && p.rent.includes) || [];
  const includesRakuya = includes591.map((x) => (x === "網路" ? "網路費" : x)).filter((x) => /水費|電費|第四台|網路費|瓦斯費|管理費|停車費|清潔費/.test(x));
  if (rent && d.rentCond.parkIncluded && !includesRakuya.includes("停車費")) includesRakuya.push("停車費");
  const dep = (p.rent && p.rent.deposit) || "2個月";
  const depositSel = /免押/.test(dep) ? "其他押金" : /面議/.test(dep) ? "面議" : /^1個月/.test(dep) ? "1個月租金" : /^2個月/.test(dep) ? "2個月租金" : "其他押金";

  return {
    legal: LEGAL_OK.includes(o.legal) ? o.legal : "住家用",
    usecode: rent ? o.status : /套房/.test(o.status) ? "住宅" : "住宅",
    typecode: !rent && /套房/.test(o.status) ? "套房" : typecode,
    ageType: ageYears != null && ageYears <= 3 ? "新屋" : "中古屋",
    isCommunity: !!p.community,
    floorsType: p.floor.sell === 0 ? "多層" : "單層",
    floorsMax: p.floor.sell === 0 ? p.floor.total : null,
    ageYears,
    manage: p.fee.amount != null || p.fee.has === true ? "管理員(警衛)" : "無",
    manageFee: p.fee.amount,
    parkStatus: p.area.inclPark || (p.rent && p.rent.park) ? (rent ? "自有" : "有車位") : "無車位",
    parkKind: rakuyaParkKind(d.parkType),
    env: { elementary: d.school || "", market: d.market || "", park: d.park || "", transport: "", mrt: "", vital_function: "" },
    title25,
    titleTruncated: chars.length > RAKUYA_TITLE_MAX,
    contactName: p.contact.name || "黃瑋凱",
    rent: rent
      ? {
          depositSel,
          includes: includesRakuya,
          shortRent: "不可",
          sex: "不限",
          identity: "不限",
          landlord: "不與房東同住",
          propertyRight: /未辦/.test((p.rent && p.rent.ownership) || "") ? "無" : "有",
          cook: (p.rent && p.rent.cook) || "可",
          pet: (p.rent && p.rent.pets) || "不可",
          anytime: true,
        }
      : undefined,
  };
}

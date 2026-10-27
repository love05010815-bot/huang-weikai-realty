/**
 * 同事相關的純函式（不碰資料庫，scripts/check-match.mjs 測得到；資料庫那半在 colleagues.ts）。
 */
import { BRANCH_SITE, SITE_URL } from "@/config/owner";
import { normalizePreference } from "./matcher";

/** 給客人看的那一面（配對頁、預約完成頁）：只有名字、電話、LINE 連結，金鑰絕對不能跟著出去 */
export type ColleagueContact = { name: string; phone: string; lineUrl: string };

/**
 * 同事填的 LINE：可以是 LINE ID（abc123、@abc123）或他從 LINE「加入好友 → 分享連結」複製來的網址，
 * 整理成客人點了就能開的網址。不像樣的一律回空字串（畫面就不畫那顆按鈕，不留死連結）。
 *
 * line.me/ti/p/~ID 是「用 ID 加好友」；同事的 LINE 若關了「允許利用 ID 加入好友」，客人點了會找不到人 ——
 * 那就請他改貼自己的加好友連結（LINE 裡「加入好友 → 邀請 → 分享連結」那一條）。
 */
export function lineUrlFromInput(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return /line\.me\//i.test(s) ? s.slice(0, 200) : "";
  const id = s.replace(/^@/, "").replace(/\s+/g, "");
  if (!/^[A-Za-z0-9._-]{1,40}$/.test(id)) return "";
  return `https://line.me/ti/p/~${id}`;
}

/** 同事的快速建檔連結（跟本人的同一個頁面，金鑰不同） */
export function colleagueIntakeUrl(key: string): string {
  return `${SITE_URL}/intake?key=${encodeURIComponent(key)}`;
}

/**
 * 同事的客人從店官網勾完物件跳回來的預約頁（/match/book，店官網品牌、沒有凱心成家）。
 * 店官網會在後面接 &items=S編號,S編號。token = 這位客人的識別碼（認人、帶姓名電話、預約記到哪位業務名下）。
 * 2026-10-06 晚上他說「所有同事的代客建檔都不要再經過我的個人網站」—— 所以不再給 /match 那一頁。
 */
export function branchBookUrl(token: string): string {
  return `${SITE_URL}/match/book?k=${encodeURIComponent(token)}`;
}

/**
 * 店官網「好案配對找房」吃的篩選參數 —— 2026-10-06 兩個視窗談定的契約。全部選填、都是純值、沒有個資；
 * 客人到了店官網還可以自己改。坪數、樓層、其他需求、土地類別店官網沒有這幾個篩選，就不送。
 */
export type BranchFilters = {
  /**
   * 租客（2026-10-26 店官網定的）：帶 type=rent，店官網直接開租屋物件。
   * 租屋時 priceMax 是**元／月**、attribut 是出租型態（整層(棟)住家、店面商辦、獨立套房、出租土地、商用、其他、廠房；
   * 店官網的出租物件只認這組字，我們的型態用 RENT_ATTRIBUT 換算過去）、
   * 不送 ageMin/ageMax（出租物件多半沒屋齡，送了會被整批排除）。買客不帶（店官網預設買賣）。
   */
  type?: "rent";
  /** 梧棲區｜沙鹿區｜清水區｜龍井區（店官網只有這四區），多個用逗號隔開 */
  district?: string[];
  /** 太平洋官網的物件型態字（電梯大廈、華廈、公寓、透天厝、別墅、樓中樓、套房、土地），多個用逗號隔開；租屋是出租型態 */
  attribut?: string[];
  /** 1｜2｜3｜4（4 = 4 房以上），多個用逗號隔開 */
  room?: number[];
  /** 總價上限，萬（租屋：月租，元） */
  priceMax?: number;
  /** 屋齡區間，年，兩端都含 */
  ageMin?: number;
  ageMax?: number;
  /** 車位種類（店官網 2026-10-06 晚上加的；單值，別的字它會不理） */
  stall?: "平面" | "機械";
};

/** 店官網只認海線四區；其他區（大甲、大肚…）傳了也沒用，先濾掉 */
const BRANCH_DISTRICTS = ["梧棲區", "沙鹿區", "清水區", "龍井區"];

/**
 * 我們的六種類型 → 太平洋官網的物件型態字（店官網的「類型」就是官網的字，見 pacific-parse.ts 的 PACIFIC_TYPE_MAP 反過來）。
 * 一對多：我們把別墅、樓中樓併進透天厝、電梯大樓，所以要把它們都送過去，不然客人會少看到一半。
 */
const BRANCH_ATTRIBUT: Record<string, string[]> = {
  電梯大樓: ["電梯大廈", "樓中樓"],
  華廈: ["華廈"],
  公寓: ["公寓"],
  透天厝: ["透天厝", "別墅"],
  套房: ["套房"],
  土地: ["土地"],
};

/**
 * 租客：我們的型態 → 店官網出租物件的「出租型態」字。2026-10-27 他說「出租型態改跟買賣一樣」之後租屋也勾型態（電梯大樓／華廈…），
 * 但店官網的出租物件只認出租型態（它的 attribut 篩選是整個字相等），所以換算過去：住宅類都是整層(棟)住家、套房是獨立套房、土地是出租土地。
 * 店官網拿到後當預設篩選，客人到了那邊還能自己改。
 */
const RENT_ATTRIBUT: Record<string, string[]> = {
  電梯大樓: ["整層(棟)住家"],
  華廈: ["整層(棟)住家"],
  公寓: ["整層(棟)住家"],
  透天厝: ["整層(棟)住家"],
  套房: ["獨立套房"],
  土地: ["出租土地"],
};

/** 客人在我們這邊存的購屋條件 → 店官網的篩選參數（對不上的欄位就不送） */
export function branchFiltersFromPreference(input: unknown): BranchFilters {
  const p = normalizePreference(input);
  const f: BranchFilters = {};
  // 租客（2026-10-26）：type=rent；型態換成店官網出租物件認的出租型態字（RENT_ATTRIBUT）；租金就是 priceMax（元／月）；不送屋齡
  const rent = p.deal === "rent";
  if (rent) f.type = "rent";
  const district = p.districts.filter((d) => BRANCH_DISTRICTS.includes(d));
  if (district.length) f.district = district;
  const attribut = [...new Set(p.types.flatMap((t) => (rent ? RENT_ATTRIBUT : BRANCH_ATTRIBUT)[t] ?? []))];
  if (attribut.length) f.attribut = attribut;
  if (p.roomsList.length) f.room = p.roomsList;
  if (p.budgetMax > 0) f.priceMax = p.budgetMax;
  if (!rent && p.ageMin > 0) f.ageMin = p.ageMin;
  if (!rent && p.ageMax > 0) f.ageMax = p.ageMax;
  // 「其他需求」裡的車位種類 → stall。店官網只收一個值，兩種都勾（＝有車位就好）就不送，讓客人自己選
  const flat = p.features.includes("平面車位");
  const mech = p.features.includes("機械車位");
  if (flat !== mech) f.stall = flat ? "平面" : "機械";
  return f;
}

/**
 * 同事的**客人**收到的那條連結 —— 店頭官網的「好案配對找房」預約模式（2026-10-06 他在店官網那個視窗定的：
 * 「客人連結要打開已經依業務填的條件篩好的好案配對、可以勾物件一起預約、預約要送回業務的代客建檔讓他收到通知」）。
 *
 * 契約（兩個視窗談定）：?<條件>&book=<URL-encode 的預約連結>#match。
 * 店官網看到 book= 才開預約模式（物件卡多一個勾選框、下面「前往預約看屋」）；按了就跳到那條連結並加上
 * &items=S編號,S編號（只有 S 開頭、最多 10 間、不重複）。店官網本身不收姓名電話、不打我們任何 API。
 * 沒有 book= 的一般訪客看到的店官網完全不變。
 *
 * selfLink = 這位客人的預約連結（branchBookUrl，/match/book?k=…），呼叫端給 —— 這個函式不碰 SITE_URL。
 */
export function branchMatchUrl(selfLink: string, filters: BranchFilters = {}): string {
  const qs = new URLSearchParams();
  if (filters.type === "rent") qs.set("type", "rent");
  if (filters.district?.length) qs.set("district", filters.district.join(","));
  if (filters.attribut?.length) qs.set("attribut", filters.attribut.join(","));
  if (filters.room?.length) qs.set("room", filters.room.join(","));
  if (filters.priceMax) qs.set("priceMax", String(filters.priceMax));
  if (filters.ageMin) qs.set("ageMin", String(filters.ageMin));
  if (filters.ageMax) qs.set("ageMax", String(filters.ageMax));
  if (filters.stall) qs.set("stall", filters.stall);
  qs.set("book", selfLink);
  return `${BRANCH_SITE.url}/?${qs.toString()}#match`;
}

/**
 * 店官網跳回來的 ?items=S1,S2（或 LINE 卡片的 ?book=單一編號）→ 物件編號清單。
 * 去重、去空、只留像編號的字串，最多 10 間（一筆預約的上限，跟 /api/match/viewing 一樣）。
 */
export function parseItemIds(raw: string | null | undefined, max = 10): string[] {
  const ids = String(raw ?? "")
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z0-9_-]{1,64}$/.test(s));
  return [...new Set(ids)].slice(0, max);
}

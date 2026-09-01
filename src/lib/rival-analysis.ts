/**
 * 競品分析的計算核心 —— /admin/compare 的四段分析都從這裡出來。
 *
 * 🔴 **所有段落共用同一份數字（`analyze()` 的回傳），不准各段各算各的。**
 *    第三段的熱度判斷和第四段的判讀樹是同一個 `heatPass`，兩邊分開算遲早會不一致，
 *    而且那種不一致不會報錯，只會讓兩段話互相矛盾地送到屋主眼前。
 */

import { normCommunity, type ParkingKind, type RivalRow } from "@/lib/rival-parser";

/* ---------------- 型別 ---------------- */

/** 一「戶」= 同一間房子（可能被多家仲介重複刊登，已合併） */
export interface RivalUnit {
  community: string;
  price: number | null;
  area: number | null;
  floor: number | null;
  totalFloor: number | null;
  rooms: number | null;
  ageText: string;
  age: number | null;
  buildingType: string;
  parking: ParkingKind;
  parkingInPrice: boolean;
  unit: number | null;
  /** 該戶所有刊登的瀏覽數相加 */
  views: number | null;
  viewsKnown: boolean;
  /** 本案自己那一筆的瀏覽數（跟 views 的合計不同） */
  selfViews: number | null;
  listingCount: number;
  isSelf: boolean;
  members: RivalRow[];
  /** 同一戶但別家開了不同價（例如有一家降價了沒更新） */
  otherPrices: number[];
}

export type HeatLevel = "high" | "mid" | "low" | "unknown";
export type DiagnosisKey =
  | "nodata"
  | "needanswer"
  | "exposure"
  | "price"
  | "inquiry"
  | "product"
  | "negotiating";

export interface Answers {
  call: "yes" | "no" | null;
  view: "yes" | "no" | null;
  offer: "yes" | "no" | null;
}

/* ---------------- 門檻 ---------------- */

/** 原始規格的絕對門檻。⚠️ 台中海線實測整個社區最高才 285 次，見 `absMeaningless`。 */
export const VIEW_ABS = 500;
export const LISTING_ABS = 15;

/* ---------------- 刊登筆數 → 真實戶數 ---------------- */

function makeUnit(r: RivalRow): RivalUnit {
  return {
    community: r.community,
    price: r.price,
    area: r.area,
    floor: r.floor,
    totalFloor: r.totalFloor,
    rooms: r.rooms,
    ageText: r.ageText,
    age: r.age,
    buildingType: r.buildingType,
    parking: r.parking,
    parkingInPrice: r.parkingInPrice,
    unit: r.unit,
    views: r.views ?? 0,
    viewsKnown: r.views != null,
    selfViews: r.isSelf ? r.views : null,
    listingCount: 1,
    isSelf: r.isSelf,
    members: [r],
    otherPrices: [],
  };
}

/** 代表那一筆要整組換掉的欄位 —— 不能東拼西湊出一個市場上不存在的物件。 */
const REP_FIELDS = [
  "price", "area", "unit", "parking", "parkingInPrice",
  "floor", "totalFloor", "rooms", "ageText", "age", "community", "buildingType",
] as const;

/** 代表那筆缺的欄位，可以拿同一戶的其他筆來補（這些補了不會造出假物件）。 */
const FILL_FIELDS = ["community", "price", "area", "floor", "totalFloor", "rooms", "ageText", "unit"] as const;

function addToUnit(u: RivalUnit, r: RivalRow): void {
  u.listingCount++;
  u.members.push(r);
  if (r.views != null) {
    u.views = (u.views ?? 0) + r.views;
    u.viewsKnown = true;
  }
  if (r.isSelf) {
    u.isSelf = true;
    u.selfViews = r.views;
  }

  // ⚠️ 以「最低開價」那一筆為代表：買方在 591 上找得到便宜的那一則。
  //    拿第一筆（可能是還沒更新的舊價）當代表會低估屋主面對的價格壓力。
  if (r.price != null && (u.price == null || r.price < u.price)) {
    for (const k of REP_FIELDS) {
      const v = r[k];
      if (v != null && v !== "") Object.assign(u, { [k]: v });
    }
  }
  // 代表那筆缺的欄位，用同一戶的其他筆補起來
  for (const k of FILL_FIELDS) {
    const cur = u[k];
    const v = r[k];
    if ((cur == null || cur === "") && v != null && v !== "") Object.assign(u, { [k]: v });
  }
}

export function buildUnits(rows: RivalRow[]): RivalUnit[] {
  const units: RivalUnit[] = [];
  const leaderOf: Record<number, RivalUnit> = {};

  for (const r of rows) {
    if (!r.isDupFollower) {
      const u = makeUnit(r);
      leaderOf[r.groupId] = u;
      units.push(u);
    }
  }
  for (const r of rows) {
    if (!r.isDupFollower) continue;
    if (r.merge && leaderOf[r.groupId]) addToUnit(leaderOf[r.groupId], r);
    else units.push(makeUnit(r)); // 使用者說不是同一戶 → 獨立成一戶
  }
  for (const u of units) {
    if (!u.viewsKnown) u.views = null;
    u.otherPrices = u.members
      .map((m) => m.price)
      .filter((p): p is number => p != null && p !== u.price)
      .sort((a, b) => a - b);
  }
  return units;
}

/** 本案固定第一，其餘依單價由低到高，算不出單價的排最後。 */
export function sortUnits(units: RivalUnit[]): RivalUnit[] {
  const self = units.filter((u) => u.isSelf);
  const rest = units.filter((u) => !u.isSelf);
  rest.sort((a, b) => {
    if (a.unit == null && b.unit == null) return 0;
    if (a.unit == null) return 1;
    if (b.unit == null) return -1;
    return a.unit - b.unit;
  });
  return [...self, ...rest];
}

/* ---------------- 分析 ---------------- */

function median(arr: number[]): number | null {
  const a = arr.filter((x) => x != null).slice().sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : Math.round(((a[m - 1] + a[m]) * 10) / 2) / 10;
}

/**
 * 「條件像不像」的距離，數字越小越像。
 * ⚠️ **完全不看價格** —— 看了就會跟「單價最接近」變成同一個挑法，等於白做。
 * 坪數權重最重（買方是先用坪數決定要不要點進來的），屋齡除以 10 年再封頂，
 * 避免一戶老屋把整個分數吃掉。
 */
function similarity(u: RivalUnit, self: RivalUnit): number {
  let d = 0;
  if (u.area != null && self.area) d += (3 * Math.abs(u.area - self.area)) / self.area;
  if (u.floor != null && self.floor != null) {
    const tf = self.totalFloor || u.totalFloor || 12;
    d += Math.abs(u.floor - self.floor) / tf;
  }
  if (u.age != null && self.age != null) d += Math.min(Math.abs(u.age - self.age) / 10, 1);
  if (u.parking !== self.parking) d += 0.8;
  return d;
}

export interface Analysis {
  units: RivalUnit[];
  rows: RivalRow[];
  self: RivalUnit | null;
  others: RivalUnit[];

  types: string[];
  typeMixed: boolean;
  selfType: string;
  /** 型態跟本案不同的那幾戶 —— 它們會汙染中位數 */
  offType: RivalUnit[];

  /** 單價最接近的一戶 */
  rival: RivalUnit | null;
  /** 條件最像的一戶（跟價格無關） */
  twin: RivalUnit | null;
  twinSameAsRival: boolean;
  rivalIsOtherType: boolean;
  rivalIsOtherBuilding: boolean;
  sameTypeCount: number;

  communityListings: number | null;
  communityNew: number | null;
  communityOwner: number | null;
  communityCuts: number | null;
  communityViews: number | null;
  cutPct: number | null;
  newPct: number | null;
  ownerPct: number | null;
  pastedCount: number;
  realUnits: number;
  dupRate: number;
  selfListingCount: number | null;
  supplyFlood: boolean;
  selfOverListed: boolean;

  selfViews: number | null;
  othersMedian: number | null;
  maxViews: number;
  ratio: number | null;
  viewRank: number | null;
  viewRanked: number;
  heatAbsPass: boolean;
  /** 整個社區都沒人破 500 → 絕對門檻在這個市場沒有鑑別度 */
  absMeaningless: boolean;
  heatLevel: HeatLevel;
  heatPass: boolean;
}

export function analyze(units: RivalUnit[], rows: RivalRow[]): Analysis {
  const self = units.find((u) => u.isSelf) ?? null;
  const others = units.filter((u) => !u.isSelf);

  /* 型態 */
  const types: string[] = [];
  for (const u of units) if (u.buildingType && !types.includes(u.buildingType)) types.push(u.buildingType);
  const selfType = self?.buildingType ?? "";
  const offType = selfType ? units.filter((u) => !u.isSelf && u.buildingType && u.buildingType !== selfType) : [];

  /* 兩個對手 */
  let rival: RivalUnit | null = null;
  let twin: RivalUnit | null = null;
  let rivalIsOtherType = false;
  let rivalIsOtherBuilding = false;
  let sameTypeCount = 0;

  if (self && self.unit != null) {
    const all = others.filter((u) => u.unit != null);
    let pool = selfType ? all.filter((u) => !u.buildingType || u.buildingType === selfType) : all;
    if (!pool.length) {
      pool = all;
      rivalIsOtherBuilding = true;
    }
    const same = pool.filter((u) => u.rooms != null && u.rooms === self.rooms);
    const use = same.length ? same : pool;
    rivalIsOtherType = !same.length && pool.length > 0;
    sameTypeCount = same.length;

    let bestD = Infinity;
    let twinD = Infinity;
    for (const u of use) {
      const d = Math.abs(u.unit! - self.unit);
      if (d < bestD) { bestD = d; rival = u; }
      const s = similarity(u, self);
      if (s < twinD) { twinD = s; twin = u; }
    }
  }

  /* 供給面 */
  const pick = (k: "communityListings" | "communityNew" | "communityOwner" | "communityCuts" | "communityViews") => {
    let v: number | null = null;
    for (const r of rows) if (r[k] != null) v = r[k];
    return v;
  };
  const communityListings = pick("communityListings");
  const pct = (n: number | null) =>
    n != null && communityListings ? Math.round((n / communityListings) * 100) : null;
  const communityNew = pick("communityNew");
  const communityOwner = pick("communityOwner");
  const communityCuts = pick("communityCuts");

  const selfListingCount = self ? self.listingCount : null;

  /* 熱度面 */
  const selfViews = self ? self.views : null;
  const otherViews = others.map((u) => u.views).filter((v): v is number => v != null);
  const othersMedian = median(otherViews);
  const maxViews = Math.max(0, ...units.map((u) => u.views ?? 0));
  const ratio = selfViews != null && othersMedian ? selfViews / othersMedian : null;

  const ranked = units.filter((u) => u.views != null).slice().sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
  const viewRank = self && selfViews != null ? ranked.indexOf(self) + 1 : null;

  const heatAbsPass = selfViews != null && selfViews >= VIEW_ABS;
  const absMeaningless = maxViews > 0 && maxViews < VIEW_ABS;
  const heatLevel: HeatLevel =
    ratio == null ? "unknown" : ratio >= 1.2 ? "high" : ratio >= 0.8 ? "mid" : "low";

  return {
    units, rows, self, others,
    types, typeMixed: types.length > 1, selfType, offType,
    rival, twin, twinSameAsRival: twin != null && twin === rival,
    rivalIsOtherType, rivalIsOtherBuilding, sameTypeCount,
    communityListings, communityNew, communityOwner, communityCuts,
    communityViews: pick("communityViews"),
    cutPct: pct(communityCuts), newPct: pct(communityNew), ownerPct: pct(communityOwner),
    pastedCount: rows.length,
    realUnits: units.length,
    dupRate: rows.length ? Math.round((1 - units.length / rows.length) * 100) : 0,
    selfListingCount,
    supplyFlood: communityListings != null && communityListings >= LISTING_ABS,
    selfOverListed: selfListingCount != null && selfListingCount >= LISTING_ABS,
    selfViews, othersMedian, maxViews, ratio,
    viewRank, viewRanked: ranked.length,
    heatAbsPass, absMeaningless, heatLevel,
    heatPass: heatAbsPass || heatLevel === "high" || heatLevel === "mid",
  };
}

/* ---------------- 第四段：判讀 ---------------- */

export interface Diagnosis {
  key: DiagnosisKey;
  tone: "bad" | "ok" | "wait";
  title: string;
  why?: string;
  body: string;
  todo?: string[];
}

/**
 * 照規格的順序判斷，只給一個結論。
 * ⚠️ 第一關用的是「相對於同社區」的熱度（`heatPass`），不是硬性的 500 ——
 *    台中海線整個社區最高才 285 次，用絕對值會把每一戶都判成曝光問題。
 */
export function diagnose(A: Analysis, ans: Answers): Diagnosis {
  if (!A.self) {
    return { key: "nodata", tone: "wait", title: "還讀不到本案，無法判讀", body: "" };
  }
  if (!ans.call || !ans.view || !ans.offer) {
    return {
      key: "needanswer", tone: "wait", title: "還差三個只有你知道的答案",
      body: "請回到上面把「有沒有電話詢問／有沒有帶看／有沒有出價」三題點完。這三件事 591 查不到，但少了它們，第二關與第三關就無法判斷。",
    };
  }

  if (!A.heatPass) {
    const why = A.absMeaningless
      ? `本案 ${A.selfViews} 次，只有其他在售戶中位數（${A.othersMedian} 次）的 ${Math.round((A.ratio ?? 0) * 100)}%，在 ${A.viewRanked} 戶中排第 ${A.viewRank} 高`
      : `本案 ${A.selfViews} 次，未達 ${VIEW_ABS} 次`;
    return {
      key: "exposure", tone: "bad", title: "曝光問題", why,
      body: "先檢查照片、標題、曝光位置，還輪不到談價格。看的人都還不夠多，這時候降價只會白降 —— 因為根本沒有足夠的人看到這個價格。",
      todo: ["換主圖：第一張決定點不點進來", "改標題：把買方會搜的條件寫進去", "檢查曝光位置：是否需要置頂或加購廣告"],
    };
  }

  if (ans.view === "no") {
    if (ans.call === "yes") {
      return {
        key: "price", tone: "bad", title: "價格問題",
        why: "線上關注度過關，電話詢問也有，但約不到帶看",
        body: "買方對條件早有預期，退卻的點在聽到開價之後。會打電話代表物件本身有吸引力，掛掉電話代表價格與他心裡的數字對不上。",
        todo: ["把貼身對手那兩戶的條件與開價，攤開來跟屋主對照", "確認現在的開價是不是已經被同社區的其他戶擋在前面"],
      };
    }
    // ⚠️ 這個組合原始規格沒寫。按規格自己的定義，「價格問題」是「電話詢問也有、
    //    但約不到帶看」；連電話都沒有，退卻點發生得更早，不能算同一類。
    return {
      key: "inquiry", tone: "bad", title: "詢問轉換問題",
      why: "線上關注度過關，但沒有電話詢問，也沒有帶看",
      body: "有人看、卻沒有人問。通常是開價在列表頁就被刷掉，或是照片、標題把人吸進來以後，內頁的條件與價格跟他的預期落差太大。",
      todo: ["比對同社區的開價帶，看本案是不是排在買方的預算之外", "檢查內頁資訊是否完整（格局圖、坪數說明、管理費）"],
    };
  }

  if (ans.offer === "no") {
    return {
      key: "product", tone: "bad", title: "產品問題",
      why: "線上關注度過關，帶看也有，就是沒有出價",
      body: "看得到也約得到，人到了現場卻不出價。可能是格局、屋況或嫌惡設施，要現場找原因 —— 這一段用數字看不出來。",
      todo: ["整理最近幾組帶看的實際回饋，找共同的退卻點", "現場複查：採光、格局動線、鄰棟距離、周邊嫌惡設施"],
    };
  }

  return {
    key: "negotiating", tone: "ok", title: "已經有出價，不是卡住",
    why: "線上關注度過關，有帶看，也有人出價",
    body: "這一戶已經走到議價階段，不屬於「賣不掉」的狀況。接下來是價差怎麼收斂的問題，不是行銷或產品的問題。",
    todo: ["把出價與同社區成交行情並排，讓屋主自己看差距"],
  };
}

/* ---------------- 給屋主的結論 ---------------- */

export const TAIL = "瀏覽量代表線上關注，不等於詢問或成交，要搭配帶看回饋一起看。";
export const MAXCHARS = 200;

const VERDICT_LINE: Record<string, string> = {
  exposure: "目前的關鍵不在價格，而在被看到的機會還不夠。",
  price: "有人詢問但約不到帶看，退卻點多半發生在聽到開價之後。",
  inquiry: "有人看到，但還沒有人進一步詢問。",
  product: "看得到也約得到，但還沒有人出價，原因通常要到現場才找得到。",
  negotiating: "目前已經有人出價，走到的是議價階段。",
};

const chars = (s: string) => s.replace(/\s/g, "").length;

export interface Conclusion {
  body: string;
  tail: string;
  count: number;
}

/**
 * 200 字以內、語氣客觀、不逼降價，只講「市場已經用數字投票了」。
 * ⚠️ 超字時**先把可省段落換成短版，真的還不行才整段丟** —— 直接丟整段會為了省
 *    幾個字砍掉一大塊，剩下的字數白白浪費（實測會從 195 掉到 148）。
 */
export function buildConclusion(A: Analysis, dx: Diagnosis): Conclusion | null {
  const s = A.self;
  if (!s || s.unit == null || dx.key === "nodata" || dx.key === "needanswer") return null;
  const name = s.community || "這個社區";
  const segs: { t: string; short?: string; req: boolean }[] = [];

  let lead = `${name}目前有 ${A.communityListings != null ? A.communityListings + " 筆" : A.realUnits + " 戶"}在售`;
  if (A.communityCuts) lead += `，其中 ${A.communityCuts} 戶已經降價`;
  segs.push({ t: lead + "。", req: true });

  const priced = A.units.filter((u) => u.unit != null);
  const rank = priced.filter((u) => !u.isSelf && u.unit! < s.unit!).length + 1;
  segs.push({ t: `您這一戶單價 ${s.unit.toFixed(1)} 萬/坪，在 ${priced.length} 戶中排第 ${rank} 低。`, req: true });

  if (A.rival && A.rival.price != null && s.price != null && A.rival.unit != null) {
    const dp = Math.round(A.rival.price - s.price);
    const vs = dp === 0 ? "，總價相同" : `，比您${dp < 0 ? "低 " : "高 "}${Math.abs(dp).toLocaleString()} 萬`;
    segs.push({
      t: `最接近的一戶開價 ${A.rival.price.toLocaleString()} 萬（${A.rival.unit.toFixed(1)} 萬/坪）${vs}。`,
      short: `最接近的一戶開價 ${A.rival.price.toLocaleString()} 萬${vs}。`,
      req: false,
    });
  }

  if (A.othersMedian != null) {
    const base = `瀏覽方面您累積 ${A.selfViews} 次，其他在售戶的中位數是 ${A.othersMedian} 次`;
    segs.push({
      t: base + (A.absMeaningless ? `，全社區最高也只有 ${A.maxViews} 次，是整區關注度偏低，不是單一物件被冷落。` : "。"),
      short: base + "。",
      req: false,
    });
  }

  segs.push({ t: VERDICT_LINE[dx.key] ?? "", req: true });
  segs.push({ t: "市場已經用這些數字表達了它的看法。", req: true });

  const use = segs.map((x) => ({ ...x }));
  const text = () => use.map((x) => x.t).join("") + TAIL;
  for (let i = use.length - 1; i >= 0 && chars(text()) > MAXCHARS; i--) {
    if (!use[i].req && use[i].short) use[i].t = use[i].short!;
  }
  for (let j = use.length - 1; j >= 0 && chars(text()) > MAXCHARS; j--) {
    if (!use[j].req) use.splice(j, 1);
  }
  const body = use.map((x) => x.t).join("");
  return { body, tail: TAIL, count: chars(body + TAIL) };
}

/* ---------------- 顯示用小工具 ---------------- */

export const n1 = (x: number) => Math.round(x * 10) / 10;

export function fmtFloor(u: RivalUnit): string {
  if (u.floor == null) return "—";
  return u.floor + (u.totalFloor ? `／${u.totalFloor}F` : "F");
}
export function fmtPark(u: RivalUnit): string {
  return !u.parking || u.parking === "無" ? "無" : u.parking;
}

/**
 * 一句話說明差異。
 * ⚠️ 差距太小的（樓層差 1 層、坪數差不到 1 坪）不進句子 —— 表格裡看得到就好，
 *    句子只講會影響買方決定的。原本七件事一口氣講完，反而沒人看得完。
 */
export function diffSentence(rival: RivalUnit, self: RivalUnit): string {
  const out: string[] = [];

  const pr: string[] = [];
  if (rival.unit != null && self.unit != null) {
    const du = n1(rival.unit - self.unit);
    pr.push(
      du === 0
        ? `單價跟本案同為 ${self.unit.toFixed(1)} 萬/坪`
        : `單價 ${rival.unit.toFixed(1)} 萬/坪，比本案${du < 0 ? "低 " : "高 "}${Math.abs(du).toFixed(1)} 萬/坪`,
    );
  }
  if (rival.price != null && self.price != null) {
    const dp = Math.round(rival.price - self.price);
    pr.push(
      dp === 0
        ? "總價一樣"
        : `總價 ${rival.price.toLocaleString()} 萬，${dp < 0 ? "便宜 " : "貴 "}${Math.abs(dp).toLocaleString()} 萬`,
    );
  }
  if (pr.length) out.push(pr.join("、") + "。");

  const cond: string[] = [];
  if (rival.parking !== self.parking) {
    cond.push(
      rival.parking === "無"
        ? `他沒有車位、本案有${self.parking}`
        : self.parking === "無"
          ? `他有${rival.parking}車位、本案沒有`
          : `他的車位是${rival.parking}、本案是${self.parking}`,
    );
  }
  if (rival.floor != null && self.floor != null) {
    const df = rival.floor - self.floor;
    if (Math.abs(df) >= 2) cond.push(`樓層比本案${df < 0 ? "低 " : "高 "}${Math.abs(df)} 層`);
  }
  if (rival.age != null && self.age != null) {
    const dg = n1(rival.age - self.age);
    if (Math.abs(dg) >= 1) cond.push(`屋齡比本案${dg < 0 ? "新 " : "老 "}${Math.abs(dg)} 年`);
  }
  if (rival.area != null && self.area != null) {
    const da = n1(rival.area - self.area);
    if (Math.abs(da) >= 1) cond.push(`建坪比本案${da < 0 ? "小 " : "大 "}${Math.abs(da)} 坪`);
  }
  out.push(cond.length ? cond.slice(0, 3).join("、") + "。" : "條件與本案幾乎相同。");

  if (rival.views != null && self.views) {
    const k = rival.views / self.views;
    if (k >= 1.3) out.push(`他的瀏覽數 ${rival.views.toLocaleString()}，是本案的 ${n1(k)} 倍。`);
    else if (k <= 0.77) out.push(`他的瀏覽數 ${rival.views.toLocaleString()}，只有本案的 ${Math.round(k * 100)}%。`);
  }
  return out.join("");
}

/* ---------------- 純文字版（傳給屋主的那一份） ---------------- */

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 第一行：最重要的兩個數字。社區名只在跟本案不同時才印，否則七戶印七次很佔版面。 */
function unitHead(u: RivalUnit, baseCommunity: string): string {
  let t = u.price == null ? "—" : `${u.price.toLocaleString()} 萬`;
  t += `　${u.unit == null ? "—" : u.unit.toFixed(1) + " 萬/坪"}`;
  if (u.parkingInPrice && u.parking !== "無") t += "(含車位)";
  if (u.community && u.community !== baseCommunity) t += `　【${u.community}】`;
  return t;
}
function unitDetail(u: RivalUnit): string {
  const p: string[] = [];
  p.push(u.area == null ? "—" : `${u.area} 坪`);
  p.push(fmtFloor(u));
  if (u.buildingType) p.push(u.buildingType);
  p.push(`屋齡 ${u.ageText || "—"}`);
  p.push(fmtPark(u) === "無" ? "無車位" : `${fmtPark(u)}車位`);
  p.push(`瀏覽 ${u.views == null ? "—" : u.views.toLocaleString()}${u.listingCount > 1 ? `(${u.listingCount} 家合計)` : ""}`);
  return p.join("｜");
}

/** LINE 上排不出表格，所以一戶兩行，用「｜」分欄。 */
export function buildPlainText(A: Analysis, dx: Diagnosis, C: Conclusion | null): string {
  const s = A.self;
  const name = s?.community || "同社區";
  const L: string[] = [];

  L.push(`【同社區行情比對】${name}`);
  L.push(`資料來源：591 公開刊登，${today()} 整理`);
  L.push("");

  /* 第一段 */
  L.push("━━ 第一段：比較表 ━━");
  const ordered = sortUnits(A.units);
  const priced = ordered.filter((u) => u.unit != null);
  const rank = s?.unit != null ? priced.filter((u) => !u.isSelf && u.unit! < s.unit!).length + 1 : null;
  L.push(
    `同社區在售 ${A.units.length} 戶` +
      (A.pastedCount !== A.units.length ? `（${A.pastedCount} 筆刊登去重後）` : "") +
      (rank && s?.unit != null ? `。本案單價 ${s.unit.toFixed(1)} 萬/坪，在 ${priced.length} 戶中由低到高排第 ${rank}` : "") +
      "。",
  );
  L.push("");
  let n = 0;
  for (const u of ordered) {
    L.push((u.isSelf ? "▎【本案】" : `　${++n}）　　`) + unitHead(u, name));
    L.push("　　　　　" + unitDetail(u));
  }
  const wp = A.units.filter((u) => u.parkingInPrice).length;
  const np = A.units.filter((u) => !u.parking || u.parking === "無").length;
  if (wp && wp < A.units.length) {
    L.push("");
    L.push(`※ 表中有 ${wp} 戶的單價含車位、${A.units.length - wp} 戶不含，兩者不能直接比。`);
  }
  if (np && np < A.units.length) L.push(`※ 其中 ${np} 戶沒有車位，產品條件跟有車位的那幾戶不同。`);
  if (A.offType.length && A.selfType) {
    L.push(`※ 表中混了不同產品：本案是${A.selfType}，另有 ${A.offType.length} 戶是 ${A.offType.map((u) => u.buildingType).join("、")}，單價不能相提並論。`);
  }
  for (const u of A.units) {
    if (u.otherPrices.length && u.price != null) {
      L.push(`※ ${u.isSelf ? "本案" : u.floor + " 樓那一戶"}同時被刊在 ${u.price.toLocaleString()} 萬與 ${u.otherPrices.map((p) => p.toLocaleString() + " 萬").join("、")}，此表取最低者。`);
    }
  }
  L.push("");

  /* 第二段 */
  L.push("━━ 第二段：貼身對手 ━━");
  if (!A.rival || !s) L.push("競品中沒有可比較的物件。");
  else {
    const both = A.twin && !A.twinSameAsRival;
    L.push(
      A.rivalIsOtherType
        ? `※ 沒有同房型可比，以下這戶是 ${A.rival.rooms} 房、本案 ${s.rooms} 房，不是同一批買方。`
        : `從 ${A.sameTypeCount} 戶同房型的競品中挑出${both ? "兩戶：" : "一戶："}`,
    );
    L.push("");
    const cols: [string, RivalUnit][] = both
      ? [["【單價最接近】—— 行情就落在這裡", A.rival], ["【條件最像】—— 一模一樣的東西別人賣多少", A.twin!]]
      : [["【貼身對手】", A.rival]];
    for (const [label, u] of cols) {
      L.push(label);
      L.push("　　" + unitHead(u, name));
      L.push("　　" + unitDetail(u));
      L.push("　　" + diffSentence(u, s));
      L.push("");
    }
    L.push(`買方比價的時候就是拿這${both ? "兩" : "一"}戶來壓本案的價格。`);
  }
  L.push("");

  /* 第三段 */
  L.push("━━ 第三段：體質檢測 ━━");
  L.push(`［供給面］門檻：刊登家數 ≥ ${LISTING_ABS} 家`);
  if (A.communityListings != null) {
    L.push(`・社區在售筆數（含重複刊登）：${A.communityListings.toLocaleString()} 筆　${A.supplyFlood ? "→ 超過門檻，供給氾濫，這一區賣壓大" : "→ 未達門檻"}`);
  }
  if (A.communityCuts != null) {
    L.push(`・社區已降價戶數：${A.communityCuts.toLocaleString()} 間` + (A.communityCuts > 0 ? `　→ 已有 ${A.communityCuts} 戶開始降價${A.cutPct != null ? `，佔在售 ${A.cutPct}%` : ""}` : "　→ 目前沒有人降價"));
  }
  if (A.communityNew != null) {
    L.push(`・近半個月新上架：${A.communityNew.toLocaleString()} 間` + (A.newPct != null ? `　→ 佔在售 ${A.newPct}%，新供給進來的速度` : ""));
  }
  if (A.communityOwner != null) {
    L.push(`・屋主自售：${A.communityOwner.toLocaleString()} 間` + (A.ownerPct != null ? `（佔在售 ${A.ownerPct}%）` : ""));
  }
  L.push(`・比對後的真實在售戶數：${A.realUnits} 戶` + (A.dupRate > 0 ? `（${A.pastedCount} 筆去重，重複率 ${A.dupRate}%）` : ""));
  L.push(`・本案被幾家仲介刊登：${A.selfListingCount} 家　${A.selfOverListed ? "→ 超過門檻" : "→ 未達門檻"}`);
  L.push("");
  L.push(`［熱度面］門檻：累積瀏覽 ≥ ${VIEW_ABS} 次`);
  L.push(`・本案累積瀏覽：${A.selfViews == null ? "—" : A.selfViews.toLocaleString() + " 次"}　${A.heatAbsPass ? "→ 達到門檻" : `→ 未達 ${VIEW_ABS} 次的絕對門檻`}`);
  if (A.othersMedian != null && A.ratio != null) {
    L.push(`・其他在售戶的瀏覽中位數：${A.othersMedian} 次　→ 本案為中位數的 ${Math.round(A.ratio * 100)}%，${A.heatLevel === "high" ? "高於同社區水準" : A.heatLevel === "mid" ? "與同社區相當" : "低於同社區水準"}`);
  }
  if (A.viewRank) L.push(`・本案瀏覽名次：第 ${A.viewRank} 高（共 ${A.viewRanked} 戶）`);
  if (A.communityViews != null) {
    L.push(`・社區頁瀏覽人數：${A.communityViews.toLocaleString()} 人`);
    L.push("　（※ 這是社區頁本身的瀏覽人數，與各物件的瀏覽是不同的計數，不能拿來相比）");
  }
  if (A.absMeaningless) {
    L.push(`※ 這個社區沒有任何一戶達到 ${VIEW_ABS} 次（最高 ${A.maxViews} 次），${VIEW_ABS} 次在此沒有鑑別度，請以「相對於同社區」的比較為準。`);
  }
  L.push("");

  /* 第四段 */
  L.push("━━ 第四段：判讀卡在哪 ━━");
  if (dx.key === "needanswer" || dx.key === "nodata") L.push(dx.title);
  else {
    L.push(`結論：${dx.title}`);
    if (dx.why) L.push(`依據：${dx.why}`);
    L.push(dx.body);
  }
  L.push("");

  if (C) {
    L.push("━━ 給您的結論 ━━");
    L.push(C.body);
    L.push("");
    L.push(C.tail);
  }
  return L.join("\n");
}

/** 抓不到欄位時，把「我實際讀到什麼」整理成可以直接貼給 Claude 的報告。 */
export function buildDiagnostic(rows: RivalRow[]): string {
  const L: string[] = ["# 辨識器診斷報告", `共 ${rows.length} 筆。以下是每一筆「我抓到的值」與「原始文字前 700 字」。`];
  rows.forEach((r, i) => {
    L.push("");
    L.push(`---------- 第 ${i + 1} 列 ${r.id || "(無編號)"}${r.isSelf ? " [本案]" : ""} ----------`);
    L.push(
      `抓到：開價=${r.price} 建坪=${r.area} 樓層=${r.floor}/${r.totalFloor} 房數=${r.rooms} 型態=${r.buildingType} 屋齡=${r.ageText} 車位=${r.parking} 瀏覽=${r.views} 社區=${r.community} 591單價=${r.unit591}`,
    );
    L.push("原始文字（前 700 字）：");
    L.push(String(r.raw || "").slice(0, 700));
  });
  return L.join("\n");
}

/**
 * 🏠 單戶物件頁（/listings/<slug>）的「物件資料」—— **純函式**，把太平洋官網那一筆排成畫面要的格子
 *
 * 2026-10-20 系統擁有者：「精選好案裡面的物件，我不想要物件資訊導向外部網站。我想要直接點擊圖片
 * 就可以顯示這個物件的所有資訊，但你一樣是從太平洋房屋官網去抓取資訊」。
 * 抓的部分在 lib/listing-detail.ts；這裡只負責「有什麼就排什麼」：
 *
 * 🔴 官網沒給的欄位一律不出現，**不准用猜的填**（跟 lib/pacific-map.ts 同一條規矩）。
 *    所以每個群組的列數都不固定，整組空了就整組不畫。
 * 🔴 刻意不算「每坪單價」：總價含車位、坪數也含車位坪，不知道車位價就除不出正確的單價，
 *    算出來印在頁面上就是對客戶報錯數字。行情請客戶去 /lvr 看實價登錄。
 *
 * 回歸測試：npm run check:listing（scripts/check-listing-detail.mjs，不連網）
 */
import { pacificFloor } from "@/lib/match/pacific-parse";
import { parkingTypeFromTitle, splitFeatureText, type PacificDetail } from "@/lib/pacific-map";
import { primAgeYears, stripCity, type PrimShareItem } from "@/lib/prim-share";

export type FactRow = { label: string; value: string };
export type FactGroup = { title: string; rows: FactRow[] };

const fmt = (n: number, digits = 2): string => n.toLocaleString("zh-TW", { maximumFractionDigits: digits });

/** 30.129 → 「30.13 坪」；null → 空字串 */
export function pingText(n: number | null): string {
  return n === null ? "" : `${fmt(n)} 坪`;
}

/** 3／2／2 → 「3房2廳2衛」。沒有房數（土地、店面）就整個不寫，不寫成 0房 */
export function layoutText(rooms: number | null, halls: number | null, baths: number | null): string {
  if (rooms === null) return "";
  return `${rooms}房${halls ?? 0}廳${baths ?? 0}衛`;
}

/** 官網的樓層欄 → 「5 樓／共 15 樓」「1-3 樓／共 3 樓」「B1／共 14 樓」；沒資料 → 空字串 */
export function floorText(d: Pick<PacificDetail, "floor" | "totalFloor" | "maxFloor">): string {
  const raw = pacificFloor(d.floor, d.totalFloor, d.maxFloor || null);
  if (!raw) return "";
  const [level, total] = raw.split("/");
  const lv = /^B/i.test(level) ? level : `${level} 樓`;
  return total ? `${lv}／共 ${total} 樓` : lv;
}

/** 屋齡：官網算好的「7年7個月」優先；沒有就用數字（分享連結的完工日也算得出來）；都沒有 → 空字串 */
export function ageText(d: Pick<PacificDetail, "objectAge" | "ageYear">, share: PrimShareItem | null): string {
  if (d.objectAge) return d.objectAge;
  const y = d.ageYear ?? primAgeYears(share?.completeDate ?? null);
  if (y === null) return "";
  return y < 1 ? "未滿 1 年" : `約 ${fmt(y, 1)} 年`;
}

/** 車位：「有（平面），12.5 坪」「有」「無」；官網沒講 → 空字串 */
export function parkingText(d: Pick<PacificDetail, "hasStall" | "ownerStallArea" | "stallTypeName" | "title">): string {
  const has = d.hasStall === true || (d.ownerStallArea ?? 0) > 0;
  if (has) {
    const type = d.stallTypeName || parkingTypeFromTitle(d.title);
    const ping = d.ownerStallArea ? `，${pingText(d.ownerStallArea)}` : "";
    return `有${type ? `（${type}）` : ""}${ping}`;
  }
  return d.hasStall === false ? "無" : "";
}

/** 管理費：「2,500 元／月繳」；沒有 → 空字串 */
export function adminFeeText(d: Pick<PacificDetail, "adminFee" | "adminFeeCycle">): string {
  if (d.adminFee === null) return "";
  return `${fmt(d.adminFee, 0)} 元${d.adminFeeCycle ? `／${d.adminFeeCycle}` : ""}`;
}

/** 「2019-01-30」→「2019 年 1 月 30 日」；認不得 → 空字串 */
export function completeDateText(date: string | null | undefined): string {
  const m = String(date ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[1])} 年 ${Number(m[2])} 月 ${Number(m[3])} 日` : "";
}

/** 降過價才回：第一次刊登價 > 現價。diff 一位小數（萬） */
export function priceDrop(d: Pick<PacificDetail, "price" | "firstPrice">): { from: number; to: number; diff: number } | null {
  if (d.price === null || d.firstPrice === null || d.firstPrice <= d.price) return null;
  return { from: d.firstPrice, to: d.price, diff: Math.round((d.firstPrice - d.price) * 10) / 10 };
}

/** 標題下面那排一眼看的四格：建坪、格局、樓層、屋齡。沒資料的格不出現 */
export function keyStats(d: PacificDetail, share: PrimShareItem | null): FactRow[] {
  return [
    { label: "建坪", value: pingText(d.totalArea) },
    { label: "格局", value: layoutText(d.rooms, d.halls, d.baths) },
    { label: "樓層", value: floorText(d) },
    { label: "屋齡", value: ageText(d, share) },
  ].filter((r) => r.value);
}

/** 「物件資料」整區：三個群組，列與群組都是有值才出現 */
export function factGroups(d: PacificDetail, share: PrimShareItem | null): FactGroup[] {
  const groups: FactGroup[] = [
    {
      title: "基本資料",
      rows: [
        { label: "社區", value: d.community },
        { label: "型態", value: d.kind.trim() },
        { label: "地址", value: stripCity(d.addressRoad) },
        { label: "格局", value: layoutText(d.rooms, d.halls, d.baths) },
        { label: "樓層", value: floorText(d) },
        { label: "屋齡", value: ageText(d, share) },
        { label: "朝向", value: d.direction ? `朝${d.direction}` : "" },
        { label: "車位", value: parkingText(d) },
        { label: "現況", value: d.useStatus },
      ],
    },
    {
      title: "坪數明細",
      rows: [
        { label: "建坪（登記）", value: pingText(d.totalArea) },
        { label: "主建物", value: pingText(d.mainBuildArea) },
        { label: "附屬建物", value: pingText(d.outbuildingArea) },
        { label: "公共設施", value: pingText(d.pubFacilityArea) },
        { label: "車位坪數", value: pingText(d.ownerStallArea) },
        { label: "土地坪數", value: pingText(d.landArea) },
        { label: "公設比", value: d.pubFacilityRange !== null ? `${fmt(d.pubFacilityRange, 1)}%` : "" },
      ],
    },
    {
      title: "建物與管理",
      rows: [
        { label: "管理費", value: adminFeeText(d) },
        { label: "謄本用途", value: d.purpose },
        { label: "使用分區", value: d.useZoning },
        { label: "建物結構", value: d.structure },
        { label: "外牆建材", value: d.externalWall },
        { label: "完工日", value: completeDateText(share?.completeDate) },
      ],
    },
  ];
  return groups
    .map((g) => ({ title: g.title, rows: g.rows.filter((r) => r.value.trim() !== "") }))
    .filter((g) => g.rows.length > 0);
}

/** 生活機能的三顆標籤（學校、公園、市場），沒寫的不出現 */
export function lifeChips(d: Pick<PacificDetail, "school" | "park" | "market">): FactRow[] {
  return [
    { label: "學校", value: d.school },
    { label: "公園", value: d.park },
    { label: "市場", value: d.market },
  ].filter((r) => r.value.trim() !== "");
}

/** 官網的特色欄（①②③ 一整串）→ 一行一條 */
export function detailFeatures(d: Pick<PacificDetail, "feature">): string[] {
  return splitFeatureText(d.feature);
}

/** 有座標才給 Google 地圖連結 */
export function mapsUrl(lat: number | null, lng: number | null): string {
  if (lat === null || lng === null) return "";
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

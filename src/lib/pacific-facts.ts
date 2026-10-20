/**
 * 📋 太平洋官網單筆物件（PacificDetail）→ 比較表要的九個欄位（HouseolFacts）—— **純函式**
 *
 * 2026-10-20 建案地圖改成只列官網在售物件之後，「＋ 比較」勾的是 S 編號，比較頁的九項要從官網單筆 API 來
 * （抓的部分在 lib/listing-detail.ts，走同一份一小時 Data Cache）。這裡只負責對欄位：
 *   開價／社區／樓別樓高／登記坪／含車位坪／主建物／附屬／主＋附屬／格局／車位／公設比／完工日／屋齡／型態
 * 官網沒給的欄位一律 null（畫面顯示「型錄未載」），**不准用猜的補** —— 跟 lib/pacific-map.ts 同一條規矩。
 */
import type { HouseolFacts } from "@/lib/houseol-facts";
import { pacificFloor } from "@/lib/match/pacific-parse";
import { parkingTypeFromTitle, type PacificDetail } from "@/lib/pacific-map";

/** 「14/15」→ { level:"14", total:15 }；「1-3/3」「B1/14」照樣拆；拆不出總樓層 → null */
export function parseFloorRaw(raw: string): HouseolFacts["floor"] {
  const m = /^\s*([^/]+?)\s*\/\s*(\d+)\s*$/.exec(String(raw ?? ""));
  if (!m) return null;
  return { level: m[1], total: Number(m[2]) };
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

export function pacificFactsFrom(d: PacificDetail, completeDate: string | null = null): HouseolFacts {
  const floorRaw = pacificFloor(d.floor, d.totalFloor, d.maxFloor || null);
  const hasParking = d.hasStall === true || (d.ownerStallArea ?? 0) > 0;
  const parking: HouseolFacts["parking"] =
    d.hasStall === null && !hasParking ? null : { has: hasParking, type: hasParking ? d.stallTypeName || parkingTypeFromTitle(d.title) : "" };
  const mainAtt = d.mainBuildArea !== null || d.outbuildingArea !== null ? round1((d.mainBuildArea ?? 0) + (d.outbuildingArea ?? 0)) : null;
  const facts: HouseolFacts = {
    price: d.price,
    community: d.community.trim() || null,
    floorRaw: floorRaw || null,
    floor: parseFloorRaw(floorRaw),
    regPing: d.totalArea,
    parkPing: d.ownerStallArea,
    mainPing: d.mainBuildArea,
    attPing: d.outbuildingArea,
    mainAttPing: mainAtt,
    layout: d.rooms !== null ? { room: d.rooms, hall: d.halls ?? 0, bath: d.baths ?? 0 } : null,
    parking,
    publicRatio: d.pubFacilityRange !== null ? `${round1(d.pubFacilityRange)}%` : null,
    completion: completeDate ? completeDate.replace(/-/g, "/") : null,
    age: d.objectAge.trim() || (d.ageYear !== null ? `${round1(d.ageYear)} 年` : null),
    kind: d.kind.trim() || null,
    fieldCount: 0,
  };
  facts.fieldCount = [facts.price, facts.community, facts.floor, facts.regPing, facts.mainAttPing, facts.layout, facts.parking, facts.publicRatio, facts.age, facts.kind].filter(
    (v) => v !== null,
  ).length;
  return facts;
}

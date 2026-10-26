/**
 * 🏠 海線房屋行情試算（/estimate）—— 資料庫那一端
 *
 * 比對邏輯在 `lvr-estimate.ts`（純函式）；這裡只負責從 `lvr_deal` 撈「同區、同型態（含合併夥伴）、
 * 近 POOL_MONTHS 個月」的成屋成交當資料池，以及表單下拉要顯示的各區各型態筆數。
 *
 * 兩個查詢都包 `unstable_cache`（tag `lvr`、一小時）：這頁是客戶會一直按的工具，
 * Vercel 上連線池只有 3 條，不能每按一次就打一次資料庫；同步成功會 `revalidateTag("lvr")`，
 * 跟 /lvr 的摘要卡同一套失效機制。讀取失敗一律回空值，前台顯示「資料還沒進來」，不 500。
 *
 * ⚠️ 這裡有 Prisma，客戶端元件（EstimateForm.tsx）只能 import `lvr-estimate.ts`，不能 import 這個檔。
 */
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { monthsAgoIso, toNumber, withSchema } from "@/lib/lvr";
import { LVR_DISTRICTS } from "@/lib/lvr-parse";
import { taipeiDay } from "@/lib/site-visits";
import {
  ESTIMATE_TYPES,
  POOL_MONTHS,
  estimateTypeDef,
  mergePartner,
  typeOfBuilding,
  type EstimatePoolRow,
  type EstimateType,
  type EstimateTypeCounts,
} from "@/lib/lvr-estimate";

/** 表單下拉旁的「這區近 N 個月有幾筆」用幾個月算 */
export const COUNT_MONTHS = 24;

type PoolRow = Record<string, unknown>;

function s(r: PoolRow, k: string): string {
  return r[k] == null ? "" : String(r[k]);
}

/**
 * 同區、同型態（住宅大樓會連華廈一起撈、反之亦然，留給第四階合併用）、近 POOL_MONTHS 個月、
 * 有單價、沒解約、不是純土地／純車位的成屋成交。幾百筆，排除與分階都在 JS 做。
 */
export async function getEstimatePool(district: string, type: EstimateType): Promise<EstimatePoolRow[]> {
  if (!(LVR_DISTRICTS as readonly string[]).includes(district)) return [];
  const def = estimateTypeDef(type);
  const partner = mergePartner(type);
  const likes = [def.like, ...(partner ? [estimateTypeDef(partner).like] : [])];
  const since = monthsAgoIso(POOL_MONTHS, taipeiDay());
  try {
    const rows = await withSchema(() =>
      db.$queryRawUnsafe<PoolRow[]>(
        `SELECT id, address, deal_date, built_ym, floor, total_floors, building_type,
                building_area_m2, parking_area_m2, rooms, halls, baths,
                total_price, unit_price_m2, parking_type, parking_price, note
           FROM lvr_deal
          WHERE kind = 'sale' AND district = ? AND deal_date >= ?
            AND target <> '土地' AND target <> '車位' AND cancelled = ''
            AND unit_price_m2 IS NOT NULL
            AND (${likes.map(() => "building_type LIKE ?").join(" OR ")})
          ORDER BY deal_date DESC`,
        district,
        since,
        ...likes,
      ),
    );
    return rows.map((r) => ({
      id: s(r, "id"),
      address: s(r, "address"),
      dealDate: s(r, "deal_date"),
      builtYm: r.built_ym == null ? null : s(r, "built_ym"),
      floor: s(r, "floor"),
      totalFloors: s(r, "total_floors"),
      buildingType: s(r, "building_type"),
      buildingAreaM2: toNumber(r.building_area_m2),
      parkingAreaM2: toNumber(r.parking_area_m2),
      rooms: toNumber(r.rooms),
      halls: toNumber(r.halls),
      baths: toNumber(r.baths),
      totalPrice: toNumber(r.total_price),
      unitPriceM2: r.unit_price_m2 == null ? null : toNumber(r.unit_price_m2),
      parkingType: s(r, "parking_type"),
      parkingPrice: toNumber(r.parking_price),
      note: s(r, "note"),
    }));
  } catch (error) {
    console.error("[lvr-estimate] 資料池讀取失敗:", error);
    return [];
  }
}

export const getCachedEstimatePool = unstable_cache(
  async (district: string, type: EstimateType) => getEstimatePool(district, type),
  ["lvr-estimate-pool"],
  { revalidate: 3600, tags: ["lvr"] },
);

/** 行政區 → 型態 → 近 COUNT_MONTHS 個月的成屋成交筆數（表單下拉提示用；讀不到就全 0） */
function emptyCounts(): EstimateTypeCounts {
  const out: EstimateTypeCounts = {};
  for (const d of LVR_DISTRICTS) {
    const row = {} as Record<EstimateType, number>;
    for (const t of ESTIMATE_TYPES) row[t.key] = 0;
    out[d] = row;
  }
  return out;
}

export async function getEstimateTypeCounts(): Promise<EstimateTypeCounts> {
  const out = emptyCounts();
  const since = monthsAgoIso(COUNT_MONTHS, taipeiDay());
  try {
    const rows = await withSchema(() =>
      db.$queryRawUnsafe<{ district: string; building_type: string; n: unknown }[]>(
        `SELECT district, building_type, COUNT(*) AS n
           FROM lvr_deal
          WHERE kind = 'sale' AND deal_date >= ? AND target <> '土地' AND target <> '車位'
            AND cancelled = '' AND unit_price_m2 IS NOT NULL
          GROUP BY district, building_type`,
        since,
      ),
    );
    for (const r of rows) {
      const t = typeOfBuilding(String(r.building_type));
      const d = String(r.district);
      if (!t || !out[d]) continue;
      out[d][t] += toNumber(r.n);
    }
  } catch (error) {
    console.error("[lvr-estimate] 型態筆數讀取失敗:", error);
  }
  return out;
}

export const getCachedEstimateTypeCounts = unstable_cache(async () => getEstimateTypeCounts(), ["lvr-estimate-counts"], {
  revalidate: 3600,
  tags: ["lvr"],
});

/**
 * 客戶名單的篩選（2026-10-05 他要的：「透過他的預算（如 1000 萬以下、1500 萬以下…）或是區域（清水、沙鹿…）
 * 或是型態（透天、大樓…）快速找到客人」）。
 *
 * 純函式、不碰資料庫；畫面（/intake 的 IntakeApp）跟 scripts/check-match.mjs 都用這裡。
 * 規矩：
 *   - 三組之間是「而且」：預算挑了、區域也挑了，就要兩邊都符合。
 *   - 區域、型態一組裡面可以多選，是「或」：勾清水＋沙鹿，兩區任一有就算。
 *   - 預算一次只選一段：「1500 萬以下」＝ 預算上限 ≤ 1500；「3000 萬以上」＝ > 3000。
 *   - 🔴 那一項沒填的客人（預算 0、區域空、型態空）＝ 不限，**哪一段都會出現** ——
 *     他們本來就什麼都可以，找「可以推某間房的客人」時不該被漏掉；名單那一列的條件摘要看得出來是沒填。
 */
export type BudgetTier = number | "over";

/** 「N 萬以下」的幾段；最後一顆「3000 萬以上」是 "over" */
export const BUDGET_TIERS: readonly { value: BudgetTier; label: string }[] = [
  { value: 800, label: "800 萬以下" },
  { value: 1000, label: "1000 萬以下" },
  { value: 1200, label: "1200 萬以下" },
  { value: 1500, label: "1500 萬以下" },
  { value: 2000, label: "2000 萬以下" },
  { value: 3000, label: "3000 萬以下" },
  { value: "over", label: "3000 萬以上" },
];
const OVER_FROM = 3000;

/** 名單那一列篩選要看的三個欄位（IntakeRow 有） */
export type FilterableRow = { budgetMax: number; districts: string[]; types: string[] };

export type RowFilter = {
  /** "" = 不限 */
  budget: BudgetTier | "";
  districts: string[];
  types: string[];
};

export const EMPTY_FILTER: RowFilter = { budget: "", districts: [], types: [] };

export function matchesBudget(budgetMax: number, tier: BudgetTier | ""): boolean {
  if (tier === "") return true;
  if (!budgetMax) return true; // 沒填 = 不限
  return tier === "over" ? budgetMax > OVER_FROM : budgetMax <= tier;
}

/** 多選的一組：沒勾 = 不限；客人那一項沒填 = 不限；否則有任一個對上就算 */
function matchesAny(have: readonly string[], want: readonly string[]): boolean {
  if (!want.length || !have.length) return true;
  return have.some((x) => want.includes(x));
}

export function matchesFilter(row: FilterableRow, f: RowFilter): boolean {
  return matchesBudget(row.budgetMax, f.budget) && matchesAny(row.districts, f.districts) && matchesAny(row.types, f.types);
}

export function isFilterActive(f: RowFilter): boolean {
  return f.budget !== "" || f.districts.length > 0 || f.types.length > 0;
}

/** 名單裡出現過的區域／型態與各有幾位，多的在前（畫面那一排標籤只放真的有人選的；沒填的不算進去） */
export function distinctCounts(rows: readonly FilterableRow[], key: "districts" | "types"): { value: string; count: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) for (const v of r[key]) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
}

/** 每一段預算有幾位 —— 跟篩選同一套規則（沒填預算的每一段都算進去） */
export function budgetCounts(rows: readonly FilterableRow[]): Map<BudgetTier, number> {
  const m = new Map<BudgetTier, number>();
  for (const t of BUDGET_TIERS) m.set(t.value, rows.filter((r) => matchesBudget(r.budgetMax, t.value)).length);
  return m;
}

/** 多選切換：有就拿掉、沒有就加上 */
export function toggleIn(list: readonly string[], v: string): string[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

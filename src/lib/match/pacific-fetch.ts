/**
 * 從太平洋官網（www.pacific.com.tw）抓在售物件 —— 只負責「拿回來」，欄位對應在 pacific-parse.ts，不碰資料庫
 *
 * 官網的列表頁 /Object/ObjectList 是 Angular 前端，資料來自同一組 API：
 *   POST /api/ObjectAPI/SearchMapObject  地圖模式：**一個行政區一次回整份**（實測 539 筆、700 KB、1.4 秒）← 主要用這個
 *   POST /api/ObjectAPI/SearchObject2    列表模式：一頁 10 筆，翻頁要 250 次、要 40 秒 ← 地圖模式少給時才拿來補
 * 兩支回的欄位一模一樣。不用登入，但要帶 Authorization 標頭 —— 值寫在列表頁 HTML 的
 * <base id="baseAuthorization" href="…">，每個訪客拿到的都一樣。每次同步先去頁面讀一次（不寫死在程式裡），
 * 它哪天換了也不用改程式。
 *
 * 規矩（2026-10-02 實測）：
 *   - 一次只能查一個行政區：AreaID 給逗號多區會回 0 筆。
 *   - 回的池子裡混著信義房屋（數字店碼）跟全台的太平洋店，一定要用 storeID 過濾（PACIFIC_STORES）。
 *   - 中文要用 UTF-8 送（node 的 fetch 本來就是）；curl 在 Windows 送出去會變亂碼、回 0 筆，別拿它測。
 *
 * ⚠️ 有時間預算（budgetMs）：Vercel 函式最多 60 秒，到了就停、回 complete=false，
 *    呼叫端看 complete 決定要不要把「這次沒看到的物件」當成下架。
 */
import type { PacificItem } from "./pacific-parse";

const SITE = "https://www.pacific.com.tw";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
/** 列表模式一頁幾筆（固定，改不了） */
const PER_PAGE = 10;

/** 到官網列表頁讀 API 要帶的 Authorization 值 */
export async function getPacificAuth(): Promise<string> {
  const res = await fetch(`${SITE}/Object/ObjectList`, { headers: { "User-Agent": UA }, cache: "no-store" });
  if (!res.ok) throw new Error(`官網列表頁回應 ${res.status}`);
  const html = await res.text();
  const auth = html.match(/id="baseAuthorization"[^>]*href="([^"]+)"/)?.[1];
  if (!auth) throw new Error("官網列表頁找不到 baseAuthorization（官網改版了？）");
  return auth;
}

/** 跟官網前端送的一模一樣（從它的請求抄下來的）；Type 1 是售、2 是租 */
function searchBody(city: string, area: string, page: number) {
  return {
    Type: 1,
    CityID: city,
    AreaID: area,
    TotalPrice: "-|-",
    ObjectAttribut: "",
    Keyword: "",
    TotalPing: "-|-",
    Room: "",
    Age: "-|-",
    Floor: "-|-",
    Direction: "",
    Order: 99,
    Page: page,
  };
}

type SearchResponse = { totalCount?: number; lstData?: PacificItem[] | null };

async function post(auth: string, endpoint: string, body: unknown, label: string): Promise<{ total: number; items: PacificItem[] }> {
  const res = await fetch(`${SITE}/api/ObjectAPI/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
      Accept: "application/json, text/plain, */*",
      Authorization: auth,
      "User-Agent": UA,
      Referer: `${SITE}/Object/ObjectList`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`官網 ${label} 回應 ${res.status}`);
  const data = (await res.json()) as SearchResponse;
  return { total: Number(data.totalCount) || 0, items: Array.isArray(data.lstData) ? data.lstData : [] };
}

/** 地圖模式：一個行政區一次回整份 */
export async function fetchPacificDistrict(auth: string, city: string, area: string): Promise<{ total: number; items: PacificItem[] }> {
  return post(auth, "SearchMapObject", searchBody(city, area, 1), `${area} 地圖模式`);
}

/** 列表模式：一頁 10 筆 */
export async function fetchPacificPage(auth: string, city: string, area: string, page: number): Promise<{ total: number; items: PacificItem[] }> {
  return post(auth, "SearchObject2", searchBody(city, area, page), `${area} 第 ${page} 頁`);
}

export type PacificFetchResult = {
  /** 只留 storeCodes 裡那幾家店的 */
  items: PacificItem[];
  /** 各區加起來官網說有幾筆（含別家店） */
  total: number;
  /** 實際抓到幾筆（含別家店、去重後） */
  seen: number;
  /** 每一區都抓完整才算 true。false ＝ 時間到或某區沒抓齊，items 只是部分 */
  complete: boolean;
  requests: number;
  districts: Record<string, { total: number; got: number; complete: boolean }>;
};

/**
 * 逐區抓完（以 S 編號去重），再用店碼過濾。區與區之間並行；地圖模式沒回齊的區用列表模式翻頁補。
 *
 * @param budgetMs 時間預算（毫秒）。到了就停，回 complete=false。
 * @param concurrency 同時抓幾個區（地圖模式一區一個請求、700 KB 上下）。
 * @param pageConcurrency 備援翻頁時同一區同時抓幾頁。
 */
export async function fetchPacificListings({
  city,
  districts,
  storeCodes,
  budgetMs = 38_000,
  concurrency = 4,
  pageConcurrency = 12,
}: {
  city: string;
  districts: readonly string[];
  storeCodes: readonly string[];
  budgetMs?: number;
  concurrency?: number;
  pageConcurrency?: number;
}): Promise<PacificFetchResult> {
  const startedAt = Date.now();
  const overBudget = () => Date.now() - startedAt > budgetMs;
  const auth = await getPacificAuth();
  const seen = new Map<string, PacificItem>();
  const stats: PacificFetchResult["districts"] = {};
  let total = 0;
  let requests = 0;
  let complete = true;

  const areas = [...districts];
  for (let i = 0; i < areas.length; i += concurrency) {
    if (overBudget()) {
      for (const area of areas.slice(i)) stats[area] = { total: 0, got: 0, complete: false };
      complete = false;
      break;
    }
    const batch = areas.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (area) => {
        try {
          const r = await fetchPacificDistrict(auth, city, area);
          requests++;
          return { area, ...r, failed: false };
        } catch (e) {
          console.error(`[pacific] ${area} 地圖模式失敗，改用列表模式:`, e);
          return { area, total: 0, items: [] as PacificItem[], failed: true };
        }
      }),
    );

    for (const r of results) {
      const areaSeen = new Set<string>();
      const collect = (items: PacificItem[]) => {
        for (const it of items) {
          const id = String(it?.saleID ?? "").trim();
          if (!id) continue;
          areaSeen.add(id);
          if (!seen.has(id)) seen.set(id, it);
        }
      };
      collect(r.items);
      let areaTotal = r.total || r.items.length;
      let areaComplete = !r.failed && areaSeen.size >= areaTotal;

      // 地圖模式沒回齊（或壞了）→ 列表模式翻頁補
      if (!areaComplete && !overBudget()) {
        try {
          const first = await fetchPacificPage(auth, city, r.area, 1);
          requests++;
          collect(first.items);
          areaTotal = first.total || Math.max(areaTotal, first.items.length);
          const pages = Math.ceil(areaTotal / PER_PAGE);
          let ok = true;
          for (let page = 2; page <= pages; page += pageConcurrency) {
            if (overBudget()) {
              ok = false;
              break;
            }
            const pageBatch: Promise<{ total: number; items: PacificItem[] }>[] = [];
            for (let p = page; p < page + pageConcurrency && p <= pages; p++) pageBatch.push(fetchPacificPage(auth, city, r.area, p));
            const rs = await Promise.all(pageBatch);
            requests += rs.length;
            for (const x of rs) collect(x.items);
          }
          // 抓到的比總數少（中途有頁空了、或翻頁時順序跑掉）也算不完整，避免把沒抓到的當成下架
          areaComplete = ok && areaSeen.size >= Math.min(areaTotal, pages * PER_PAGE);
        } catch (e) {
          console.error(`[pacific] ${r.area} 列表模式也失敗:`, e);
          areaComplete = false;
        }
      }

      total += areaTotal;
      stats[r.area] = { total: areaTotal, got: areaSeen.size, complete: areaComplete };
      if (!areaComplete) complete = false;
    }
  }

  const want = new Set(storeCodes.map(String));
  const items = [...seen.values()].filter((it) => want.has(String(it.storeID ?? "").trim()));
  return { items, total, seen: seen.size, complete, requests, districts: stats };
}

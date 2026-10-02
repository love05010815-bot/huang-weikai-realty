/**
 * 📄 社區銷售報告書 —— 純規則（型別、ChatGPT 回覆的解析、跟建案總表的合併）
 *
 * 2026-10-02 系統擁有者拿另一家房仲的「社區銷售企劃書」當範本：客戶在 /map 點到建案，
 * 可以開一頁該社區的完整介紹。資料怎麼來：**他把後台產生的指令貼進自己的 ChatGPT，
 * 再把回覆（一個 JSON）貼回後台**，跟待產文案的「複製指令 → 貼回結果」同一條免費路線。
 *
 * 這支檔案刻意只放純函式、不碰資料庫與 node 模組 —— 後台的 client component 要在瀏覽器裡
 * 先解析預覽，server action 存檔前再解析一次（不信任瀏覽器送來的東西）。
 * 資料庫那層在 lib/project-reports.ts，指令的文字在 config/report-prompt.ts。
 *
 * ## 兩個資料來源，誰說了算
 * 建案總表（port-projects.ts）是他自己核過的 → **建商／位置／完工／戶數／樓層／房型／公設比以總表為準**，
 * ChatGPT 只補總表沒有的（建築團隊、車位、管理、結構）跟文字段落（定位、地段、特色、買方、賣點）。
 * 例外：ChatGPT 的值「包含」總表的值而且更長（例：「約 188 戶（含店面 6 戶）」vs「188 戶」）→ 用 ChatGPT 的，
 * 那是補充不是矛盾。見 mergeBasics()。
 *
 * ## 報告書裡刻意沒有的東西
 * 價格、單價、行情、成交數字。/map 那頁的「為什麼不標價格」講過：寫在網頁上很快過期。
 * 行情那一段只放一顆按鈕連到 /lvr（內政部實價登錄、每旬更新），數字永遠是活的。
 * 解析時若文字裡出現「N 萬」會提出警告，由他決定刪不刪。
 */

import { AREA_LABEL, PROJECTS, houseAge, type Project, type ProjectArea } from "@/data/port-projects";
import { findCopyRisks, type CopyRisk } from "@/lib/listing-copy-risk";

/** 對外的名稱。他說「大樓銷售報告書」、範本叫「社區銷售企劃書」；站內一律用這個，要改只改這裡。 */
export const REPORT_LABEL = "社區銷售報告書";

/** 報告書頁的網址（跟著 /map 走，客戶是從那裡點進來的） */
export function reportHref(projectId: string): string {
  return `/map/report/${projectId}`;
}

// ---------------------------------------------------------------- 型別

export type ReportBasics = {
  /** 建商（含登記名稱） */
  builder: string;
  /** 建築師／營造／設計 */
  team: string;
  /** 基地位置描述 */
  location: string;
  /** 基地規模（坪） */
  siteArea: string;
  /** 總戶數（含店面） */
  units: string;
  /** 樓層規劃 */
  floors: string;
  /** 完工時間／屋齡 */
  completion: string;
  /** 格局規劃（房型＋坪數帶） */
  layouts: string;
  publicRatio: string;
  /** 車位規劃 */
  parking: string;
  /** 管理費／管理方式 */
  management: string;
  /** 結構／外觀建材 */
  structure: string;
};

export const BASIC_FIELDS: ReadonlyArray<{ key: keyof ReportBasics; label: string; hint: string }> = [
  { key: "builder", label: "建商", hint: "建商品牌名；若登記名稱不同，括號補上登記名稱" },
  { key: "team", label: "建築團隊", hint: "建築師事務所／營造／室內設計，用「｜」隔開" },
  { key: "location", label: "基地位置", hint: "路段＋相對位置，例：梧棲區中華路二段，梧棲與沙鹿交界" },
  { key: "siteArea", label: "基地規模", hint: "約 N 坪" },
  { key: "units", label: "總戶數", hint: "約 N 戶（含店面 N 戶）" },
  { key: "floors", label: "樓層規劃", hint: "地上 N 樓、地下 N 樓" },
  { key: "completion", label: "完工時間", hint: "西元年月；預售寫預計完工時間" },
  { key: "layouts", label: "格局規劃", hint: "N 房 N～N 坪…，主打戶型" },
  { key: "publicRatio", label: "公設比", hint: "N%；不確定寫「待確認」，不要猜" },
  { key: "parking", label: "車位規劃", hint: "坡道平面／機械、約幾個車位、是否有產權" },
  { key: "management", label: "管理方式", hint: "管理費約 N 元／坪、管理公司或警衛制度" },
  { key: "structure", label: "結構與外觀", hint: "RC／SRC、外牆建材" },
];

export type ReportData = {
  /** 一句話定位（20 字內），放在標題底下 */
  tagline: string;
  basics: ReportBasics;
  positioning: { title: string; body: string };
  /** 四大地段價值：生活機能／商圈／學區／交通 */
  locationValues: Array<{ label: string; body: string }>;
  /** 社區特色 */
  highlights: string[];
  /** 周邊競品。name 對得上建案總表就會自動帶行政區／屋齡／建商 */
  competitors: Array<{ name: string; note: string }>;
  /** 買方輪廓 */
  buyers: string[];
  /** 主打賣點 */
  sellingPoints: Array<{ title: string; body: string }>;
  /** 資料來源 */
  sources: string[];
  /** ChatGPT 自己標的「沒把握」清單 */
  unverified: string[];
};

/** 地段價值固定的四個面向，順序就是畫面順序 */
export const LOCATION_LABELS = ["生活機能", "商圈", "學區", "交通"] as const;

export function emptyReport(): ReportData {
  return {
    tagline: "",
    basics: {
      builder: "",
      team: "",
      location: "",
      siteArea: "",
      units: "",
      floors: "",
      completion: "",
      layouts: "",
      publicRatio: "",
      parking: "",
      management: "",
      structure: "",
    },
    positioning: { title: "", body: "" },
    locationValues: [],
    highlights: [],
    competitors: [],
    buyers: [],
    sellingPoints: [],
    sources: [],
    unverified: [],
  };
}

// ---------------------------------------------------------------- 解析 ChatGPT 貼回來的文字

/**
 * 從貼回來的整段文字裡挖出 JSON：優先拿 ``` 圍起來的那一塊，沒有就從第一個 { 到最後一個 }。
 * ChatGPT 常在前後多講兩句「以下是…」「如需調整…」，這樣就不用叫他手動刪。
 */
export function extractJsonBlock(text: string): string | null {
  const t = text.replace(/^\uFEFF/, "");
  const slice = (body: string): string | null => {
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    return start >= 0 && end > start ? body.slice(start, end + 1) : null;
  };
  // 可能有好幾個 ``` 區塊（或句子裡提到 ```json 那三個字），拿第一個真的裝著 { } 的
  for (const m of t.matchAll(/```(?:json|JSON)?\s*([\s\S]*?)```/g)) {
    const inner = slice(m[1]);
    if (inner) return inner;
  }
  return slice(t);
}

/**
 * 寬鬆的 JSON.parse：先照標準解；失敗才修兩種最常見的手改痕跡（尾巴多逗號、全形引號）再試一次。
 * 修補只在第一次失敗後才做 —— 正常 JSON 內容裡的全形引號（例如「“雙面採光”」）不該被動到。
 */
export function parseJsonLoose(src: string): unknown {
  try {
    return JSON.parse(src);
  } catch {
    /* 下面修補再試 */
  }
  const fixed = src
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, "$1");
  try {
    return JSON.parse(fixed);
  } catch {
    return undefined;
  }
}

/** 「待確認」「未知」「N/A」這類佔位字一律當成空值，畫面上統一顯示成「待確認」標籤 */
const PLACEHOLDER = /^(?:待確認|待查|待補|未知|不詳|不明|無資料|查無|查無資料|n\/?a|none|null|—|－|-|無)$/i;

function str(v: unknown, max = 400): string {
  const raw = typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
  const t = raw.replace(/\s+/g, " ").trim().slice(0, max);
  return PLACEHOLDER.test(t) ? "" : t;
}

function strList(v: unknown, maxItems: number, max = 300): string[] {
  const arr = Array.isArray(v) ? v : typeof v === "string" ? v.split(/\n+/) : [];
  const out: string[] = [];
  for (const x of arr) {
    const t = str(x, max);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= maxItems) break;
  }
  return out;
}

function pairList<A extends string, B extends string>(
  v: unknown,
  a: A,
  b: B,
  maxItems: number,
  maxA = 60,
  maxB = 400,
): Array<Record<A | B, string>> {
  if (!Array.isArray(v)) return [];
  const out: Array<Record<A | B, string>> = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const first = str(rec[a], maxA);
    const second = str(rec[b], maxB);
    if (!first && !second) continue;
    out.push({ [a]: first, [b]: second } as Record<A | B, string>);
    if (out.length >= maxItems) break;
  }
  return out;
}

/** 把 ChatGPT 回的任意物件整理成固定形狀。缺的欄位就是空字串／空陣列，不丟錯。 */
export function normalizeReport(raw: unknown): ReportData {
  const d = emptyReport();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Record<string, unknown>;

  d.tagline = str(r.tagline, 60);

  const b = (r.basics && typeof r.basics === "object" ? r.basics : {}) as Record<string, unknown>;
  for (const f of BASIC_FIELDS) d.basics[f.key] = str(b[f.key], 200);

  const p = (r.positioning && typeof r.positioning === "object" ? r.positioning : {}) as Record<string, unknown>;
  d.positioning = { title: str(p.title, 60), body: str(p.body, 600) };

  d.locationValues = pairList(r.locationValues, "label", "body", 6, 20, 400).filter((x) => x.body);
  d.highlights = strList(r.highlights, 8, 160);
  d.competitors = pairList(r.competitors, "name", "note", 6, 60, 200).filter((x) => x.name);
  d.buyers = strList(r.buyers, 5, 160);
  d.sellingPoints = pairList(r.sellingPoints, "title", "body", 4, 30, 300).filter((x) => x.title || x.body);
  d.sources = strList(r.sources, 12, 300);
  d.unverified = strList(r.unverified, 12, 200);
  return d;
}

/** 所有文字接成一串，給風險字掃描與價格偵測用 */
export function reportTextBlob(d: ReportData): string {
  return [
    d.tagline,
    ...Object.values(d.basics),
    d.positioning.title,
    d.positioning.body,
    ...d.locationValues.flatMap((x) => [x.label, x.body]),
    ...d.highlights,
    ...d.competitors.flatMap((x) => [x.name, x.note]),
    ...d.buyers,
    ...d.sellingPoints.flatMap((x) => [x.title, x.body]),
  ]
    .filter(Boolean)
    .join("\n");
}

export type ParsedReport =
  | {
      ok: true;
      data: ReportData;
      /** 要給人看的提醒（缺段落、有待確認、競品對不上…），不擋存檔 */
      warnings: string[];
      /** 公平交易法上要小心的字（lib/listing-copy-risk.ts），不擋存檔 */
      risks: CopyRisk[];
    }
  | { ok: false; error: string };

/** 文字裡有沒有價格數字（「1,128 萬」「25 萬/坪」）。報告書刻意不放行情，有就提醒。 */
export function findPriceMentions(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?\s*萬(?:\s*\/\s*坪|元)?/g)) {
    const t = m[0].replace(/\s+/g, "");
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

/**
 * 貼回來的文字 → 報告書資料＋提醒。
 * 解不出 JSON 才算失敗；內容缺東少西都只是警告，由他看預覽決定要不要回 ChatGPT 補。
 */
export function parseReportPaste(text: string): ParsedReport {
  const block = extractJsonBlock(text ?? "");
  if (!block) return { ok: false, error: "貼回來的內容裡找不到 JSON（要有大括號 { } 包起來的那一段）。請整段複製 ChatGPT 的回覆再貼一次。" };
  const raw = parseJsonLoose(block);
  if (raw === undefined) {
    return { ok: false, error: "JSON 格式壞掉了（常見是少了引號或括號）。回 ChatGPT 說「請重新輸出完整的 JSON」再貼一次。" };
  }
  const data = normalizeReport(raw);

  const warnings: string[] = [];
  if (!data.tagline) warnings.push("沒有一句話定位（tagline），標題底下會是空的");
  if (!data.positioning.body) warnings.push("沒有「區域市場定位」那一段");
  if (data.locationValues.length < LOCATION_LABELS.length) {
    warnings.push(`地段價值只有 ${data.locationValues.length} 項（應有 ${LOCATION_LABELS.join("／")} 四項）`);
  }
  if (data.highlights.length === 0) warnings.push("沒有社區特色");
  if (data.competitors.length === 0) warnings.push("沒有周邊競品");
  if (data.buyers.length === 0) warnings.push("沒有買方輪廓");
  if (data.sellingPoints.length < 3) warnings.push(`主打賣點只有 ${data.sellingPoints.length} 個（應有 3 個）`);
  if (data.sources.length === 0) warnings.push("沒有資料來源，前台會少掉「資料來源」那一行");

  const emptyBasics = BASIC_FIELDS.filter((f) => !data.basics[f.key]).map((f) => f.label);
  if (emptyBasics.length > 0) warnings.push(`基本資料有 ${emptyBasics.length} 格是待確認：${emptyBasics.join("、")}（總表有的欄位前台會用總表的值）`);

  const unmatched = data.competitors.filter((c) => !matchProjectByName(c.name)).map((c) => c.name);
  if (unmatched.length > 0) warnings.push(`競品「${unmatched.join("」「")}」不在建案總表裡，前台只會顯示名字、沒有行政區與屋齡`);

  if (data.unverified.length > 0) warnings.push(`ChatGPT 標了 ${data.unverified.length} 項沒把握：${data.unverified.join("；")}`);

  const blob = reportTextBlob(data);
  const prices = findPriceMentions(blob);
  if (prices.length > 0) warnings.push(`文字裡有價格數字（${prices.slice(0, 4).join("、")}${prices.length > 4 ? "…" : ""}）。報告書不放行情，建議刪掉或改成「見實價登錄」`);

  return { ok: true, data, warnings, risks: findCopyRisks(blob) };
}

// ---------------------------------------------------------------- 跟建案總表合併

/**
 * 建案名正規化：去空白與間隔號、異體字統一、大小寫。跟 lib/project-listings.ts 當年那套一樣，
 * 「聯悦臻」「聯悅臻」「聯悅臻（本案）」都要對得上。
 */
export function normalizeProjectName(raw: string): string {
  return raw
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/[\s　]/g, "")
    .replace(/[・‧·．.｜|]/g, "")
    .replace(/悦/g, "悅")
    .replace(/臺/g, "台")
    .toLowerCase();
}

let nameIndex: Map<string, Project> | null = null;

/** 用名字（含別名）找建案總表那一筆。對不上回 null。 */
export function matchProjectByName(name: string): Project | null {
  if (!nameIndex) {
    nameIndex = new Map();
    for (const p of PROJECTS) {
      for (const n of [p.name, p.alias, ...(p.aliases ?? [])]) {
        if (n) nameIndex.set(normalizeProjectName(n), p);
      }
    }
  }
  const key = normalizeProjectName(name);
  return key ? (nameIndex.get(key) ?? null) : null;
}

export type BasicRow = {
  key: keyof ReportBasics;
  label: string;
  /** 空字串＝待確認 */
  value: string;
  /** 這格的值從哪來：總表（他核過的）／ChatGPT／都沒有 */
  from: "site" | "chat" | "none";
};

const fmtInt = (n: number) => n.toLocaleString("zh-TW");

/** 總表的值優先；ChatGPT 的值「包含」總表的值且更長時用 ChatGPT 的（是補充不是矛盾） */
function pick(site: string, chat: string): { value: string; from: BasicRow["from"] } {
  if (!site && !chat) return { value: "", from: "none" };
  if (!site) return { value: chat, from: "chat" };
  // 比對時忽略空白與千分位逗號：總表印「2,495 戶」、ChatGPT 多半寫「約 2495 戶（含店面）」
  const loose = (x: string) => x.replace(/[\s,，]/g, "");
  if (chat && chat.length > site.length && loose(chat).includes(loose(site))) {
    return { value: chat, from: "chat" };
  }
  return { value: site, from: "site" };
}

/** 基本資料十二格：總表＋ChatGPT 合併後的結果，照 BASIC_FIELDS 的順序 */
export function mergeBasics(project: Project, basics: ReportBasics, now = new Date()): BasicRow[] {
  const age = houseAge(project.completion, now);
  const completionSite = /\d{4}/.test(project.completion)
    ? `${project.completion} 完工${age ? `（屋齡${age.replace(/^約\s*/, "約 ")}）` : ""}`
    : project.completion;
  const site: Record<keyof ReportBasics, string> = {
    builder: project.builder,
    team: "",
    location: `${AREA_LABEL[project.area]}${project.streets ? `・${project.streets}` : project.street ? `・${project.street}` : ""}`,
    siteArea: project.siteAreaPing != null ? `約 ${fmtInt(project.siteAreaPing)} 坪` : "",
    units: project.units != null ? `${fmtInt(project.units)} 戶` : "",
    floors: project.floors ?? "",
    completion: completionSite,
    layouts: project.layout ?? "",
    publicRatio: project.publicRatio ?? "",
    parking: "",
    management: "",
    structure: "",
  };
  return BASIC_FIELDS.map((f) => {
    const { value, from } = pick(site[f.key], basics[f.key]);
    return { key: f.key, label: f.label, value, from };
  });
}

export type CompetitorRow = {
  name: string;
  note: string;
  /** 對上建案總表才有 */
  project: Project | null;
  /** 這一列是不是本案 */
  self: boolean;
};

/** 競品表：本案永遠第一列，其餘照 ChatGPT 給的順序；對得上總表的帶出建案資料 */
export function competitorRows(self: Project, data: ReportData): CompetitorRow[] {
  const rows: CompetitorRow[] = [{ name: self.name, note: "本案", project: self, self: true }];
  for (const c of data.competitors) {
    const p = matchProjectByName(c.name);
    if (p && p.id === self.id) continue; // ChatGPT 把本案也列進去了，跳過
    rows.push({ name: p?.name ?? c.name, note: c.note, project: p, self: false });
  }
  return rows;
}

// ---------------------------------------------------------------- 行情那一段：連到實價登錄

/**
 * 建案所在區 → /lvr 的 `area` 值。
 * 🔴 用 Record 不用 if/else：ProjectArea 新增一個值時 TypeScript 會在這裡報錯逼你補，
 *    不然新區的報告書會默默連到錯的行政區（跟 LeafletMap 的 PIN_GROUPS 當年漏掉是同一種坑）。
 *    值要跟 lib/lvr-parse.ts 的 LVR_DISTRICTS 一致（那支有 node:zlib，不能在這裡 import；check:report 會對）。
 */
export const LVR_DISTRICT_BY_AREA: Record<ProjectArea, "梧棲區" | "清水區" | "沙鹿區" | "龍井區"> = {
  梧棲: "梧棲區",
  清水: "清水區",
  梧棲市區: "梧棲區",
  清水市區: "清水區",
  鹿寮萬家福: "沙鹿區",
  沙鹿車站: "沙鹿區",
  北勢靜宜: "沙鹿區",
  新光田: "沙鹿區",
  龍井: "龍井區",
  龍井車站: "龍井區",
  龍井田中: "龍井區",
  龍井中央路: "龍井區",
};

/**
 * 這個建案的實價登錄查詢網址。關鍵字用主要坐落道路（成屋的門牌是「○○路○段」）；
 * 沒有道路就用建案名（預售屋那張表有建案名稱欄）。
 */
export function lvrHrefFor(project: Project): { href: string; district: string; keyword: string } {
  const district = LVR_DISTRICT_BY_AREA[project.area];
  const keyword = (project.street ?? "").trim() || project.name;
  const params = new URLSearchParams({ area: district, q: keyword.slice(0, 40) });
  if (project.status === "presale") params.set("kind", "presale");
  return { href: `/lvr?${params.toString()}`, district, keyword };
}

/** 「2026-10-02…」或 Date → 「2026 年 10 月」，放在報告書的落款 */
export function stampLabel(d: Date | string | null | undefined): string {
  const date = d instanceof Date ? d : d ? new Date(d) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  // 用台北時間的年月，Vercel 機器是 UTC，月底晚上會差一個月
  const tw = new Date(date.getTime() + 8 * 3600_000);
  return `${tw.getUTCFullYear()} 年 ${tw.getUTCMonth() + 1} 月`;
}

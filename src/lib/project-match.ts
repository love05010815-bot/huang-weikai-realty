/**
 * 🏢 把一筆愛屋物件配對到「哪一個建案」 —— 純函式，沒有 I/O
 *
 * 用在 `/admin/map-listings`：貼愛屋連結 → 讀出社區名／標題／地址 → 這支猜建案。
 *
 * 🔴 **猜錯比留白更糟**（2026-08-25 就寫在 MapListingsManager 檔頭）：物件掛到別的建案底下，
 *    客戶在地圖上點 A 建案卻看到 B 建案的房子，而且完全不會報錯。所以這支的規矩是：
 *
 *    ・**只有「社區名跟建案名一模一樣」才自動選起來**（`pickAuto`），其餘一律只給候選、
 *      等人點一下。寧可多一次點擊，也不要默默掛錯。
 *    ・地址（路名）**只當加分，永遠不能單獨成立** —— 同一條路上好幾個建案是常態。
 *    ・行政區對不上就重扣分（但不排除），因為建案的 `area` 是商圈名不是行政區，
 *      本來就對不準（例：「新光田」是沙鹿區）。
 *
 * ⚠️ 異體字是這個資料集的日常：聯悅／聯悦、豐／丰、臺／台。比對前一律正規化，
 *    不然「聯悦臻」會配不到「聯悅臻」。**但顯示一律用建案總表的原字**（拍板：原文照錄）。
 */

/** 配對只需要這幾個欄位；呼叫端從 PROJECTS 挑出來傳進來就好 */
export type ProjectForMatch = {
  id: string;
  name: string;
  /** 別名／舊名，例如「遠雄之星9」 */
  alias?: string;
  /** 其他寫法，只用來比對 */
  aliases?: string[];
  builder: string;
  /** 商圈名（梧棲市區／新光田…），不是行政區 */
  area: string;
  /** 主要坐落道路 */
  street?: string;
};

export type ProjectSuggestion = {
  id: string;
  name: string;
  builder: string;
  area: string;
  /** 0～100。100 ＝ 社區名與建案名完全一致 */
  score: number;
  /** 給人看的一句話：為什麼猜這個 */
  reason: string;
};

export type MatchInput = {
  /** 型錄的「社區」欄位。最可靠的線索 */
  community?: string | null;
  /** 物件標題，社區名常常藏在裡面 */
  title?: string | null;
  /** 地址，只拿來比對路名 */
  address?: string | null;
};

/** 建案總表的商圈名 → 行政區。用來擋「清水的物件配到沙鹿的建案」 */
const AREA_DISTRICT: Record<string, string> = {
  梧棲: "梧棲區",
  梧棲市區: "梧棲區",
  清水: "清水區",
  清水市區: "清水區",
  鹿寮萬家福: "沙鹿區",
  沙鹿車站: "沙鹿區",
  北勢靜宜: "沙鹿區",
  新光田: "沙鹿區",
};

/** 異體字：兩種寫法都收斂成同一個字。只放這個資料集真的出現過的 */
const VARIANTS: Record<string, string> = {
  悦: "悅",
  丰: "豐",
  臺: "台",
  邨: "村",
  甯: "寧",
};

/**
 * 比對用的正規化：全形轉半形、去空白與標點、異體字收斂、英文小寫。
 * **只用於比對**，顯示一律用原字。
 */
export function normalizeName(raw: string | null | undefined): string {
  let s = String(raw ?? "");
  // 全形英數與空白 → 半形
  s = s.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/　/g, " ");
  s = s.toLowerCase();
  // 去掉空白與常見標點（「聯悅臻 A 棟」「富宇．時代」要能對上）
  s = s.replace(/[\s·・．.\-－—–~～_/\\|｜、,，(（)）\[\]【】「」『』"']/g, "");
  return [...s].map((c) => VARIANTS[c] ?? c).join("");
}

/** 最長共同子字串長度。名字都很短（≤ 30 字），直接 DP 就夠快 */
function lcsLength(a: string, b: string): number {
  if (!a || !b) return 0;
  const prev = new Array<number>(b.length + 1).fill(0);
  let best = 0;
  for (let i = 1; i <= a.length; i++) {
    let diag = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      if (a[i - 1] === b[j - 1]) {
        prev[j] = diag + 1;
        if (prev[j] > best) best = prev[j];
      } else {
        prev[j] = 0;
      }
      diag = tmp;
    }
  }
  return best;
}

/** 0～1 的相似度：共同子字串佔兩邊長度的比例 */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  return (2 * lcsLength(a, b)) / (a.length + b.length);
}

/**
 * 從地址讀出行政區。「台中市梧棲區四維路」→「梧棲區」，型錄只給「梧棲區四維路」也要認得。
 *
 * ⚠️ 不要圖省事寫成 `[一-鿿]{1,3}[區鄉鎮]` —— 那個正則在「台中市沙鹿區」上會從「市」開始
 *    match 出「市沙鹿區」，跟建案那邊的「沙鹿區」永遠對不上，於是每一筆都被扣分。
 *    （2026-09-16 實測 115 筆全中，沒有一筆配得起來才發現。）
 */
export function districtOf(address: string | null | undefined): string {
  const s = String(address ?? "").trim();
  const withCity = s.match(/^.{2,3}?[市縣]([一-鿿]{1,3}?[區鄉鎮市])/);
  if (withCity) return withCity[1];
  const bare = s.match(/^([一-鿿]{1,3}?[區鄉鎮])/);
  return bare ? bare[1] : "";
}

/** 一個建案的所有寫法（建案名＋別名＋其他寫法） */
function namesOf(p: ProjectForMatch): string[] {
  return [p.name, p.alias, ...(p.aliases ?? [])].filter((s): s is string => !!s && s.length > 0);
}

/** 單一建案的分數。回 null 代表完全搭不上 */
function scoreOne(input: MatchInput, p: ProjectForMatch): { score: number; reason: string } | null {
  const community = normalizeName(input.community);
  const title = normalizeName(input.title);
  const address = normalizeName(input.address);

  let score = 0;
  let reason = "";

  for (const raw of namesOf(p)) {
    const name = normalizeName(raw);
    if (!name) continue;
    const viaAlias = raw !== p.name ? `（別名「${raw}」）` : "";

    if (community) {
      if (community === name) {
        // 完全一致 —— 唯一允許自動選起來的情況
        if (100 > score) {
          score = 100;
          reason = `社區名「${input.community}」＝建案名${viaAlias}`;
        }
        continue;
      }
      // 一邊包住另一邊（「聯悅臻A區」vs「聯悅臻」）。太短的不算，「富宇」會包到一堆
      const shorter = community.length < name.length ? community : name;
      if (shorter.length >= 3 && (community.includes(name) || name.includes(community))) {
        const penalty = Math.min(10, Math.abs(community.length - name.length) * 2);
        const s = 88 - penalty;
        if (s > score) {
          score = s;
          reason = `社區名「${input.community}」與建案名${viaAlias}高度重疊`;
        }
        continue;
      }
      const sim = similarity(community, name);
      if (sim >= 0.6) {
        const s = Math.round(sim * 84);
        if (s > score) {
          score = s;
          reason = `社區名「${input.community}」與建案名${viaAlias}相似`;
        }
      }
    }

    // 標題裡直接出現建案名（「新橫濱雙面採光大三房平車」對「勝美新橫濱」對不上，
    // 但「德光聚三房配B1平車」對「德光聚」就中）
    if (title && name.length >= 3 && title.includes(name)) {
      const s = 74;
      if (s > score) {
        score = s;
        reason = `標題裡有建案名${viaAlias}`;
      }
    }
  }

  if (score === 0) return null;

  // 路名只加分，不能單獨成立
  const street = normalizeName(p.street);
  if (street.length >= 3 && address.includes(street) && score < 100) {
    score = Math.min(99, score + 8);
    reason += `，地址也在「${p.street}」`;
  }

  // 行政區對不上就重扣（建案的 area 是商圈名，靠對照表換成行政區）
  const wantDistrict = districtOf(input.address);
  const projectDistrict = AREA_DISTRICT[p.area] ?? "";
  if (wantDistrict && projectDistrict && wantDistrict !== projectDistrict) {
    score -= 30;
    reason += `，但這個建案在${projectDistrict}、物件在${wantDistrict}`;
  }

  return score > 0 ? { score, reason } : null;
}

/** 回分數由高到低的候選（預設最多 5 個）。沒有任何線索就回空陣列 */
export function matchProjects(input: MatchInput, projects: ProjectForMatch[], limit = 5): ProjectSuggestion[] {
  if (!input.community && !input.title) return [];
  const out: ProjectSuggestion[] = [];
  for (const p of projects) {
    const hit = scoreOne(input, p);
    if (hit) out.push({ id: p.id, name: p.name, builder: p.builder, area: p.area, ...hit });
  }
  out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "zh-Hant"));
  return out.slice(0, limit);
}

/**
 * 可以「直接幫他選起來」的那一個，不夠確定就回 null（畫面上讓他點）。
 *
 * 🔴 門檻刻意訂得很嚴：要 100 分（社區名與建案名完全一致）、而且第二名要明顯落後。
 *    同名建案（例如同一個社區分兩期）會落在「兩個都 100 分」，那就不自動選。
 */
export function pickAuto(suggestions: ProjectSuggestion[]): string | null {
  const [first, second] = suggestions;
  if (!first || first.score < 100) return null;
  if (second && second.score >= first.score - 10) return null;
  return first.id;
}

"use client";

/**
 * 台中港市鎮中心 —— 建案地圖（總成）
 *
 * 2026-08-23 系統擁有者拍板：原本「地圖」與「建案總覽」是分開的兩層，
 * 現在合併成一個 —— **點地圖上的大樓圖示就顯示該建案資訊**，
 * 資訊下方接著列出瑋凱在該建案的在售物件。
 *
 * ## 版面為什麼長這樣
 *
 * 詳情放在地圖「下方」而不是右側欄：在售物件是完整的物件卡片
 * （照片相簿＋賣點條列＋兩顆按鈕），320px 的側欄塞不下，硬塞會變成
 * 一直換行的窄長條。地圖下方是全寬，卡片才排得開。
 *
 * ## 在售物件哪裡來
 *
 * **後台 `/admin/map-listings`（建案地圖物件）**，資料在 `map_listing` 表。
 * 這是跟「精選好案」**完全分開**的一套 —— 2026-08-23 系統擁有者拍板。
 *
 * 先前那版是拿精選好案的 `area` 欄做文字比對來掛（「清水區・聯悅聚」），已廢除：
 * 打錯字物件就默默消失，而且沒辦法「只上架到地圖、不上架到首頁」。
 *
 * ⚠️ 這裡的物件卡片**刻意不放「影片賞析」按鈕**（系統擁有者指定），
 *    只有「物件介紹」與「預約諮詢」兩顆。`/listings` 那邊仍然兩顆外連都放。
 */

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ZONES } from "@/data/port-zones";
import {
  AREA_LABEL,
  COORDS,
  PROJECTS,
  SOURCES,
  STATUS_LABEL,
  filledAmenities,
  AREA_FILTERS,
  houseAge,
  projectStats,
  type Project,
  type ProjectArea,
  type ProjectStatus,
} from "@/data/port-projects";
import LeafletMap from "./LeafletMap";
// ⚠️ PhotoCarousel 內部吃的是 listings.module.css（.gallery/.photo/.arrow…），
//    那份是跟 /listings 共用的。要調相簿外觀請改元件本身，不要在這裡硬蓋 ——
//    CSS Modules 的類名是雜湊的，從外面根本選不到。
import PhotoCarousel from "../listings/PhotoCarousel";
import styles from "./Map.module.css";

type AreaFilter = "all" | ProjectArea;

/**
 * 掛在建案底下的在售物件。
 *
 * ⚠️ 這批資料來自 **`map_listing` 表**（後台 `/admin/map-listings`），
 *    跟「精選好案」是兩套，不共用。2026-08-23 系統擁有者拍板。
 */
export type ProjectListing = {
  id: string;
  title: string;
  points: string[];
  /** 原始值，PhotoCarousel 自己會解析成網址 */
  photos: string[];
  /** 「物件資訊」按鈕的網址。null＝不顯示那顆按鈕 */
  linkHref: string | null;
};

const fmt = (n: number) => n.toLocaleString("zh-TW");

/** 中文數字對照。只用來認建案名稱結尾的序號，不是通用轉換器。 */
const CJK_NUM: Record<string, number> = {
  〇: 0, 零: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4,
  五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};

/** 中文數字轉阿拉伯數字，支援 1–99（十／十二／二十／二十三）。看不懂回 null。 */
function cjkNumber(text: string): number | null {
  const at = text.indexOf("十");
  if (at >= 0) {
    const tens = at === 0 ? 1 : CJK_NUM[text.slice(0, at)];
    const ones = at === text.length - 1 ? 0 : CJK_NUM[text.slice(at + 1)];
    if (tens === undefined || ones === undefined) return null;
    return tens * 10 + ones;
  }
  let n = 0;
  for (const ch of text) {
    const d = CJK_NUM[ch];
    if (d === undefined) return null;
    n = n * 10 + d;
  }
  return n;
}

/** 名稱結尾的序號：半形 1、全形１、中文一 都認。 */
const SEQ_TAIL = /^(.*?)([0-9０-９]+|[〇零一二三四五六七八九十]+)$/;

/**
 * 把建案名稱拆成「系列名 + 序號」。沒有序號的話 seq = -1。
 *
 * 為什麼要拆：同系列的案子要照 1、2、3 排（中港雲頂1→中港雲頂3、遠雄之星1…8），
 * 直接比字串會排成 1、10、2。
 *
 * ⚠️ **只認名稱結尾的數字**，中間的不算 —— 否則「三井」「五權」這種名字
 *    會被誤判成序號，整個系列的分組就跑掉了。
 */
function nameKey(name: string): { base: string; seq: number } {
  const m = SEQ_TAIL.exec(name);
  if (!m) return { base: name, seq: -1 };
  const ascii = m[2].replace(/[０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0)
  );
  const seq = /^[0-9]+$/.test(ascii) ? Number(ascii) : cjkNumber(m[2]);
  if (seq === null) return { base: name, seq: -1 };
  return { base: m[1], seq };
}

const TONE_SWATCH: Record<ProjectStatus, string> = {
  presale: "#D9466F",
  newly: "#1E6FA8",
  completed: "#2F7A34",
  // 待確認：中性灰，跟三個真階段的紅／藍／綠一眼分得開
  unknown: "#7A756E",
};

/** 明確對照，不要用 `badge${status}` 組字串 —— CSS Modules 的類名是雜湊過的，
    組錯了不會報錯，只是樣式默默不見。 */
const BADGE_CLASS: Record<ProjectStatus, string> = {
  presale: styles.badgePresale,
  newly: styles.badgeNewly,
  completed: styles.badgeDone,
  unknown: styles.badgeUnknown,
};

export default function ProjectExplorer({
  listings = {},
}: {
  listings?: Record<string, ProjectListing[]>;
}) {
  const [area, setArea] = useState<AreaFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const stats = useMemo(() => projectStats(), []);
  const mine = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [id, list] of Object.entries(listings)) out[id] = list.length;
    return out;
  }, [listings]);
  const mineTotal = useMemo(
    () => Object.values(listings).reduce((s, l) => s + l.length, 0),
    [listings]
  );

  /** 每個區域各有幾案。商圈現在都是 0 —— 照實顯示，不要藏 */
  const areaCounts = useMemo(() => {
    const m: Partial<Record<ProjectArea, number>> = {};
    for (const p of PROJECTS) m[p.area] = (m[p.area] ?? 0) + 1;
    return m;
  }, []);
  /**
   * 圖例要列哪幾個階段。**只列全站真的有建案的**，用 `TONE_SWATCH` 的順序（預售→新成屋→成屋→待確認）。
   *
   * 為什麼不直接列 `Object.keys(TONE_SWATCH)`：`unknown`（待確認）是 2026-09-02 為了
   * 「只有案名、沒有銷售階段」那批新增的，2026-09-05 系統擁有者把最後 18 案的階段補完之後
   * **全站 0 案是 unknown** —— 再照 keys 列，圖例上就會有一顆灰點對不到任何圖釘。
   *
   * ⚠️ 用全站算、不是用篩選後的 `rows` 算 —— 用 rows 的話換一顆篩選臉圖例就會少一格、跳動。
   * ⚠️ `unknown` 這個值**不要因為現在 0 案就刪掉**，下一批「只有案名」的資料進來就會再用到。
   */
  const legendStatuses = useMemo(() => {
    const has = new Set(PROJECTS.map((p) => p.status));
    return (Object.keys(TONE_SWATCH) as ProjectStatus[]).filter((k) => has.has(k));
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = PROJECTS.filter((p) => {
      if (area !== "all" && p.area !== area) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.alias?.toLowerCase().includes(q) ||
        p.builder.toLowerCase().includes(q)
      );
    });

    // 先數出每個「建商＋系列名」有幾個案子。**兩案以上才算系列**。
    //
    // 為什麼要這道門檻：名稱結尾帶數字不代表就是系列。只有一個案子的話，
    // 讓它憑一個數字就插隊到建商最前面太粗暴（例如未來有人取名「長虹天一」）。
    // 有同伴才成系列，這樣單獨一案永遠不會影響別人的位置。
    const seriesSize = new Map<string, number>();
    for (const p of list) {
      const k = nameKey(p.name);
      if (k.seq < 0) continue;
      const key = p.builder + "//" + k.base;
      seriesSize.set(key, (seriesSize.get(key) ?? 0) + 1);
    }
    const inSeries = (p: Project, k: { base: string; seq: number }) =>
      k.seq >= 0 && (seriesSize.get(p.builder + "//" + k.base) ?? 0) >= 2;

    return list.sort((a, b) => {
      // ① 依建商名稱排序（系統擁有者拍板，原本是戶數多到少）。
      // 中文要用 localeCompare 指定 zh-Hant，不能用原生字串比較 ——
      // 原生是照 Unicode 編碼排，跟人類直覺的順序對不上，同一家建商也不會排在一起。
      const byBuilder = a.builder.localeCompare(b.builder, "zh-Hant");
      if (byBuilder !== 0) return byBuilder;

      const ka = nameKey(a.name);
      const kb = nameKey(b.name);
      const sa = inSeries(a, ka);
      const sb = inSeries(b, kb);

      // ② 系列案整串排在同一家建商的最前面（2026-08-24 系統擁有者拍板）：
      //    遠雄 → 之星1…8、幸福成、星呈；聖璽 → 中港雲頂1、中港雲頂3。
      if (sa !== sb) return sa ? -1 : 1;

      // ③ 系列之間先比系列名，同一系列內部照序號小到大
      if (sa && sb) {
        const byBase = ka.base.localeCompare(kb.base, "zh-Hant");
        return byBase !== 0 ? byBase : ka.seq - kb.seq;
      }

      // ④ 非系列案維持戶數多到少；戶數一樣才比名字，讓順序固定不跳動
      const byUnits = (b.units ?? 0) - (a.units ?? 0);
      return byUnits !== 0 ? byUnits : a.name.localeCompare(b.name, "zh-Hant");
    });
  }, [area, query]);

  const selected = useMemo(
    () => PROJECTS.find((p) => p.id === selectedId) ?? null,
    [selectedId]
  );
  const selectedListings = selected ? listings[selected.id] ?? [] : [];

  const onSelect = useCallback((p: Project) => setSelectedId(p.id), []);

  /**
   * 左側清單依區域分組（2026-09-04 系統擁有者拿另一家的互動地圖當範本：
   * 左邊長條清單、右上地圖、右下物件資訊）。順序照 AREA_FILTERS，0 案的區不出現。
   * 組內順序就是 `rows` 的順序（建商→系列→戶數），編號只是視覺上的序號，不是 id。
   */
  const groups = useMemo(
    () =>
      AREA_FILTERS.map((f) => ({ ...f, items: rows.filter((p) => p.area === f.value) })).filter(
        (g) => g.items.length > 0
      ),
    [rows]
  );

  /**
   * 從清單點建案：手機上清單在最下面、詳情在地圖下面 —— 點了之後詳情在畫面外，
   * 看起來就像「按鈕沒反應」（這頁被回報過三次的老毛病）。≤900px 時捲到詳情。
   * 桌機兩欄並排，詳情就在右邊，不用捲。地圖自己會移到那根圖釘（見 LeafletMap 的換選取 effect）。
   */
  const detailRef = useRef<HTMLElement>(null);
  const pickFromList = useCallback((p: Project) => {
    setSelectedId(p.id);
    if (typeof window !== "undefined" && window.innerWidth <= 900) {
      // 等 React 把詳情畫出來再捲，不然捲到的是舊的空狀態
      window.setTimeout(() => detailRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 0);
    }
  }, []);

  return (
    <div className={styles.explorer}>
      {/* 概況統計列（39個建案／19家建商／…）2026-08-27 系統擁有者指定拿掉。
          `stats` 本身沒有刪 —— 下面的篩選膠囊還在用它顯示各階段案數。 */}

      {/* ── 左側工具：搜尋＋區域臉（桌機在左欄最上面、手機在最上面）──
          2026-09-04 版面重排：左側長條清單、右上地圖、右下詳情＋在售物件。
          `.explorer` 是格線，三個格子用 grid-area 擺位（tools／list／main），
          手機只是換一份 grid-template-areas，DOM 順序不動。 */}
      <div className={styles.tools}>
        <label className={styles.search}>
          <span className={styles.srOnly}>搜尋建案或建商</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋建案或建商，例如：遠雄、聯悅"
            className={styles.searchInput}
          />
        </label>

      {/* ── 篩選：一排，依區域（2026-08-27 系統擁有者指定，原本上面還有一排銷售階段）──

          ⚠️ 沙鹿那四個商圈目前案數都是 0（39 案全在重劃區內），這是刻意留的空位，
             系統擁有者說之後會補商圈的建案。**不要因為現在是 0 就把它們藏起來** ——
             藏了他補完資料會找不到臉在哪。案數照實顯示，點下去有專屬的空狀態文字。

          ⚠️ 「核心區」不在這排（系統擁有者：不需要核心區這塊）。還掛著那個值的 3 案
             目前只有「全部」看得到，詳見 port-projects.ts 的 ProjectArea 註解。 */}
      <div className={styles.chips} role="group" aria-label="依區域篩選">
        <button
          type="button"
          className={area === "all" ? styles.chipOn : styles.chip}
          onClick={() => setArea("all")}
          aria-pressed={area === "all"}
        >
          {`全部（${stats.total}）`}
        </button>
        {AREA_FILTERS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            className={area === value ? styles.chipOn : styles.chip}
            onClick={() => setArea(value)}
            aria-pressed={area === value}
          >
            {`${label}（${areaCounts[value] ?? 0}）`}
          </button>
        ))}
      </div>
      </div>

      {/* ── 左側建案清單（桌機在左欄、手機在最下面）──
          2026-08-26 曾拍板「不要一進來就攤開清單、收進 <details>」；2026-09-04 系統擁有者
          拿另一家的互動地圖當範本改成長條側欄，清單重新變成常駐可見。
          ⚠️ 這份清單也是這頁在 Google 上幾乎全部的關鍵字面（「梧棲重劃區建案」「遠雄之星」…），
             常駐可見比收合更好，**不要再收回 <details> 或改成點了才渲染**。 */}
      <aside className={styles.sideList} aria-label="建案清單">
        <div className={styles.sideHead}>
          <span>{`建案清單 ${rows.length}／${stats.total}`}</span>
          {mineTotal > 0 && <span className={styles.sideMine}>{`我有 ${mineTotal} 件在售`}</span>}
        </div>
        {rows.length === 0 ? (
          <p className={styles.empty}>沒有符合的建案。換個關鍵字或篩選試試。</p>
        ) : (
          groups.map((g) => (
            <section key={g.value} className={styles.sideGroup}>
              <h3 className={styles.sideGroupHead}>
                <span>{g.label}</span>
                <em>{g.items.length}</em>
              </h3>
              <ol className={styles.sideRows}>
                {g.items.map((p, i) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={p.id === selectedId ? styles.sideRowOn : styles.sideRow}
                      onClick={() => pickFromList(p)}
                      aria-pressed={p.id === selectedId}
                    >
                      <span className={styles.sideNum}>{String(i + 1).padStart(2, "0")}</span>
                      <span className={styles.sideText}>
                        <b>{p.name}</b>
                        <em>{p.builder}</em>
                      </span>
                      <span className={styles.sideMeta}>
                        {(mine[p.id] ?? 0) > 0 && <u>{`在售 ${mine[p.id]}`}</u>}
                        {!COORDS[p.id] && <s>未標位置</s>}
                        <i style={{ background: TONE_SWATCH[p.status] }} aria-hidden="true" />
                      </span>
                      <span className={styles.sideArrow} aria-hidden="true">→</span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          ))
        )}
      </aside>

      {/* ── 右欄：地圖在上、選中的建案＋在售物件在下 ──
          2026-08-26 曾拍板「地圖左、詳情右、點了才顯示」；2026-09-04 系統擁有者改成
          「地圖與物件資訊顯示可以大一點」的上下堆疊，詳情永遠在地圖正下方 —— 桌機手機都一樣，
          所以文案可以放心寫「下方」。 */}
      <div className={styles.mainCol}>
        <div className={styles.lmWrap}>
          <LeafletMap
            projects={rows}
            area={area}
            selectedId={selectedId}
            onSelect={onSelect}
            mine={mine}
          />
          <div className={styles.lmBar}>
            <div className={styles.lmLegend}>
              {legendStatuses.map((k) => (
                <span key={k}>
                  <i style={{ background: TONE_SWATCH[k] }} />
                  {STATUS_LABEL[k]}
                </span>
              ))}
              <span>
                {/* 用 b 不用 i —— `.lmLegend i` 是那三個色塊的規則（14x14 圓角方塊），
                    星星套上去會被框成一個方塊 */}
                <b className={styles.lmStarMine} aria-hidden="true">
                  ★
                </b>
                我有物件在售
              </span>
              {/* 商圈色塊。**只標名稱、不標戶數**（2026-08-26 系統擁有者指定） */}
              {ZONES.map((z) => (
                <span key={z.id}>
                  <i className={styles.lmZoneChip} style={{ background: z.color }} />
                  {z.name}
                </span>
              ))}
            </div>
            <p className={styles.lmNote}>
              {/* 不要寫「資訊會出現在下方／右邊」—— 桌機在右、手機在下，
                  寫死方位一定有一半的人被誤導 */}
              {rows.length === 0
                ? // 選到還沒有建案的商圈時，講清楚是「這一區還沒有」，
                  // 不要讓畫面看起來像壞掉。地圖色塊仍然在，客戶還是看得到位置。
                  "這一區目前沒有我在追蹤的建案。地圖上的色塊還在，可以先看看位置；" +
                  "想找這一帶的房子直接跟我說，我手上不一定有掛在網站上。"
                : `地圖上有 ${rows.length} 個建案。點大樓圖示看建案資訊與我的在售物件；` +
                  "縮小到看整個生活圈時，建案會收成一顆藍色膠囊，點它就展開。"}
            </p>
            {/* ⚠️ 這行不可以拿掉。商圈沒有官方界線，不講清楚就等於對外發表
                沒查證過的界線 —— 這個專案 8/21 已經因為同樣的事把土地分區那層
                整個下架過一次。

                ⚠️ 2026-08-27 後半句改過：色塊**不再是「照地標圈出來的」**，
                五塊全部是系統擁有者本人用 /map?zones=1 點的（見 port-zones.ts 檔頭）。
                原本那句還在講沙鹿車站、靜宜大學那串地標，已經與事實不符。
                「非官方界線／沒有法定分區」這半句是事實也是重點，不要動。 */}
            <p className={styles.lmZoneNote}>
              色塊為<b>商圈範圍示意</b>，非官方界線 —— 商圈本來就沒有法定分區，
              這裡是依在地實務認知標示的概略範圍，僅供辨位參考。
            </p>
          </div>
        </div>

        {/* ── 選中的建案（桌機在右欄、手機在地圖下方）── */}
        <section ref={detailRef} className={styles.detailPane} aria-live="polite">
          {selected ? (
            <>
              <header className={styles.detailHead}>
                <div>
                  <h3 className={styles.detailTitle}>
                    {selected.name}
                    <span className={BADGE_CLASS[selected.status]}>{STATUS_LABEL[selected.status]}</span>
                  </h3>
                  {selected.alias && <p className={styles.detailAlias}>{`又稱 ${selected.alias}`}</p>}
                </div>
                <button type="button" className={styles.detailClose} onClick={() => setSelectedId(null)}>
                  關閉 ✕
                </button>
              </header>

              <dl className={styles.detailList}>
                <div>
                  <dt>建設公司</dt>
                  <dd>{selected.builder}</dd>
                </div>
                <div>
                  <dt>位置</dt>
                  <dd>{AREA_LABEL[selected.area]}</dd>
                </div>
                <div>
                  <dt>完工</dt>
                  <dd>
                    {/*
                      ⚠️ 只有「帶年份」的才加「完工」兩個字。
                      `completion` 的值很雜：「2023」「約 2025」「約 2016～17」是年份，
                      但也有「興建中」「成屋」「新成屋」這種純狀態字。
                      原本只特判了「興建中」，所以 45 案（成屋 34、新成屋 11）畫面上
                      是「成屋 完工」「新成屋 完工」，唸不通 —— 2026-08-31 改成看有沒有
                      四位數年份。新增別種狀態字時不用回來改。
                    */}
                    {/\d{4}/.test(selected.completion)
                      ? `${selected.completion} 完工`
                      : selected.completion}
                  </dd>
                </div>
                {selected.units != null && (
                  <div>
                    <dt>總戶數</dt>
                    <dd>{`${fmt(selected.units)} 戶`}</dd>
                  </div>
                )}
                {houseAge(selected.completion) && (
                  <div>
                    <dt>屋齡</dt>
                    <dd>{houseAge(selected.completion)}</dd>
                  </div>
                )}
                {selected.streets && (
                  <div>
                    <dt>坐落</dt>
                    <dd>{selected.streets}</dd>
                  </div>
                )}
                {selected.layout && (
                  <div>
                    <dt>房型坪數</dt>
                    <dd>{selected.layout}</dd>
                  </div>
                )}
                {selected.floors && (
                  <div>
                    <dt>樓高</dt>
                    <dd>{selected.floors}</dd>
                  </div>
                )}
                {selected.publicRatio && (
                  <div>
                    <dt>公設比</dt>
                    <dd>{selected.publicRatio}</dd>
                  </div>
                )}
                {selected.siteAreaPing != null && (
                  <div>
                    <dt>基地面積</dt>
                    <dd>{`約 ${fmt(selected.siteAreaPing)} 坪`}</dd>
                  </div>
                )}
                {selected.note && (
                  <div>
                    <dt>備註</dt>
                    <dd>{selected.note}</dd>
                  </div>
                )}
                {filledAmenities(selected.area).length > 0 && (
                  <div>
                    <dt>周邊機能</dt>
                    <dd>
                      {filledAmenities(selected.area).map((g) => (
                        <span key={g.label} className={styles.amenityGroup}>
                          <b>{g.label}</b>
                          {g.items.join("、")}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
                <div>
                  <dt>資料出處</dt>
                  <dd>{selected.sources.map((k) => SOURCES[k]?.label ?? k).join("、")}</dd>
                </div>
              </dl>

              {/* ── 我在這個建案的在售物件 ── */}
              {selectedListings.length > 0 ? (
                <div className={styles.mineBlock}>
                  <h4 className={styles.mineTitle}>{`我在 ${selected.name} 的在售物件`}</h4>
                  {/* 橫條式：照片在左、文字在右（2026-08-26 系統擁有者拍板）。
                      右欄只有約 476px 可用，/listings 那種直式卡片塞進來，
                      標題會變成一行 4 個字。

                      ⚠️ 樣式全部是這頁自己的 `styles.sale*`，**不要再借用**
                         `listings.module.css` 的 .card/.body/.title —— 那份是
                         兩頁共用的，借了就得同時滿足兩種版面，遲早改壞其中一邊。
                         PhotoCarousel 仍然共用（它是自成一體的元件）。 */}
                  <div className={styles.saleList}>
                    {selectedListings.map((item) => (
                      <article key={item.id} className={styles.saleRow}>
                        <div className={styles.saleThumb}>
                          <PhotoCarousel photos={item.photos} alt={`${selected.name}－${item.title}`} />
                        </div>
                        <div className={styles.saleBody}>
                          <span className={styles.saleArea}>{selected.name}</span>
                          <h5 className={styles.saleTitle}>{item.title}</h5>
                          <ul className={styles.salePoints}>
                            {item.points.map((p) => (
                              <li key={p}>{p}</li>
                            ))}
                          </ul>
                          {/* 這裡刻意只有兩顆：物件介紹＋預約諮詢。
                              「影片賞析」是 /listings 才有的，系統擁有者指定這頁不要。 */}
                          {/* 👆 兩顆按鈕都掛 data-listing-slug／data-listing-action，
                              全站的 ListingClickTracker 會自己聽到並記一次點擊。
                              這裡的 slug 用地圖物件的 id（UUID）—— 地圖物件沒有 slug，
                              跟精選好案那些人看得懂的 slug 共用同一張表也不會撞。 */}
                          <div className={styles.saleBtns}>
                            {item.linkHref && (
                              <a
                                className={styles.saleLink}
                                href={item.linkHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                data-listing-slug={item.id}
                                data-listing-action="link"
                              >
                                物件介紹 ↗
                              </a>
                            )}
                            <Link
                              className={styles.saleBtn}
                              href="/card/booking"
                              data-listing-slug={item.id}
                              data-listing-action="booking"
                            >
                              預約諮詢
                            </Link>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                  <p className={styles.mineNote}>
                    ⚠️ 物件資訊僅供初步參考。
                    <strong>實際坪數、格局、屋況與產權，以現場勘查及不動產說明書所載為準。</strong>
                    物件狀態隨時可能異動，成交後即下架。
                  </p>
                </div>
              ) : (
                <div className={styles.noMine}>
                  <p>
                    {`目前我手上沒有 ${selected.name} 的物件在售。這一區釋出速度很快，`}
                    想找這個建案可以先跟我說，有案子我第一時間通知你。
                  </p>
                  <Link className={styles.cta} href="/card/booking">
                    {`想找 ${selected.name}？預約諮詢`}
                  </Link>
                </div>
              )}
            </>
          ) : (
            <p className={styles.detailEmpty}>
              點清單裡的建案、或地圖上的大樓圖示，這裡就會顯示建案資訊與我在那個建案的在售物件。
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

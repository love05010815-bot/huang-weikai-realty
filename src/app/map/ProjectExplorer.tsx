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

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  AREA_LABEL,
  COORDS,
  PROJECTS,
  SOURCES,
  STATUS_LABEL,
  projectStats,
  type Project,
  type ProjectArea,
  type ProjectStatus,
} from "@/data/port-projects";
import LeafletMap from "./LeafletMap";
import PhotoCarousel from "../listings/PhotoCarousel";
import styles from "./Map.module.css";
// 物件卡片跟 /listings 共用同一份樣式，改一處兩邊都會變
import lst from "../listings/listings.module.css";

type StatusFilter = "all" | ProjectStatus;
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
};

/** 明確對照，不要用 `badge${status}` 組字串 —— CSS Modules 的類名是雜湊過的，
    組錯了不會報錯，只是樣式默默不見。 */
const BADGE_CLASS: Record<ProjectStatus, string> = {
  presale: styles.badgePresale,
  newly: styles.badgeNewly,
  completed: styles.badgeDone,
};

export default function ProjectExplorer({
  listings = {},
}: {
  listings?: Record<string, ProjectListing[]>;
}) {
  const [status, setStatus] = useState<StatusFilter>("all");
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

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = PROJECTS.filter((p) => {
      if (status !== "all" && p.status !== status) return false;
      if (area !== "all" && p.area !== area) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.alias?.toLowerCase().includes(q) ||
        p.builder.toLowerCase().includes(q)
      );
    });

    // 同系列（同建商＋同前綴，例：遠雄之星1…8）先算出整個系列的最大戶數。
    //
    // ⚠️ 這個前置步驟不能省。比較函式如果「同系列比序號、不同系列比戶數」，
    //    會排出 A<B<C<A 這種繞回來的結果（之星1<之星8<星呈<之星1），
    //    Array.sort 拿到不一致的比較函式，出來的順序是未定義的。
    //    所以整個系列要當成一個單位去跟別人比戶數，系列內部才比序號。
    const seriesUnits = new Map<string, number>();
    for (const p of list) {
      const k = p.builder + "//" + nameKey(p.name).base;
      seriesUnits.set(k, Math.max(seriesUnits.get(k) ?? 0, p.units ?? 0));
    }

    return list.sort((a, b) => {
      // ① 依建商名稱排序（系統擁有者拍板，原本是戶數多到少）。
      // 中文要用 localeCompare 指定 zh-Hant，不能用原生字串比較 ——
      // 原生是照 Unicode 編碼排，跟人類直覺的順序對不上，同一家建商也不會排在一起。
      const byBuilder = a.builder.localeCompare(b.builder, "zh-Hant");
      if (byBuilder !== 0) return byBuilder;

      const ka = nameKey(a.name);
      const kb = nameKey(b.name);

      // ② 同一系列 → 照序號小到大（2026-08-24 系統擁有者拍板）。
      //    中港雲頂1 排在 中港雲頂3 前面，遠雄之星 1→8 依序排。
      if (ka.base === kb.base) return ka.seq - kb.seq;

      // ③ 同建商但不同系列 → 維持戶數多到少
      const ua = seriesUnits.get(a.builder + "//" + ka.base) ?? 0;
      const ub = seriesUnits.get(b.builder + "//" + kb.base) ?? 0;
      if (ua !== ub) return ub - ua;

      // ④ 戶數也一樣才比名字，純粹是為了讓順序固定、不會每次重整就跳動
      return ka.base.localeCompare(kb.base, "zh-Hant");
    });
  }, [status, area, query]);

  const selected = useMemo(
    () => PROJECTS.find((p) => p.id === selectedId) ?? null,
    [selectedId]
  );
  const selectedListings = selected ? listings[selected.id] ?? [] : [];

  const onSelect = useCallback((p: Project) => setSelectedId(p.id), []);

  return (
    <div className={styles.explorer}>
      {/* ── 概況 ── */}
      <ul className={styles.statRow}>
        <li>
          <b>{stats.total}</b>
          <span>個建案</span>
        </li>
        <li>
          <b>{stats.builders}</b>
          <span>家建商</span>
        </li>
        <li>
          <b>{stats.presale}</b>
          <span>預售中</span>
        </li>
        <li>
          <b>{stats.newly}</b>
          <span>新成屋</span>
        </li>
        <li>
          <b>{stats.completed}</b>
          <span>成屋</span>
        </li>
        <li>
          <b>{fmt(stats.units)}</b>
          <span>{`戶（${stats.withUnits} 案合計）`}</span>
        </li>
      </ul>

      {/* ── 篩選 ── */}
      <div className={styles.filterBar}>
        <div className={styles.chips} role="group" aria-label="依銷售階段篩選">
          {([
            ["all", `全部（${stats.total}）`],
            ["presale", `預售中（${stats.presale}）`],
            ["newly", `新成屋（${stats.newly}）`],
            ["completed", `成屋（${stats.completed}）`],
          ] as Array<[StatusFilter, string]>).map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={status === k ? styles.chipOn : styles.chip}
              onClick={() => setStatus(k)}
              aria-pressed={status === k}
            >
              {label}
            </button>
          ))}
        </div>

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
      </div>

      <div className={styles.chips} role="group" aria-label="依位置篩選">
        {([
          ["all", `全區（${stats.total}）`],
          ["梧棲", `梧棲區（${stats.wuqi}）`],
          ["清水", `清水區（${stats.qingshui}）`],
          ["市鎮中心", `核心區（${stats.core}）`],
        ] as Array<[AreaFilter, string]>).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={area === k ? styles.chipOn : styles.chip}
            onClick={() => setArea(k)}
            aria-pressed={area === k}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── 地圖 ── */}
      <div className={styles.lmWrap}>
        <LeafletMap projects={rows} selectedId={selectedId} onSelect={onSelect} mine={mine} />
        <div className={styles.lmBar}>
          <div className={styles.lmLegend}>
            {(Object.keys(TONE_SWATCH) as ProjectStatus[]).map((k) => (
              <span key={k}>
                <i style={{ background: TONE_SWATCH[k] }} />
                {STATUS_LABEL[k]}
              </span>
            ))}
            <span>
              <i className={styles.lmDotMine} />
              我有物件在售
            </span>
          </div>
          <p className={styles.lmNote}>
            {`地圖上有 ${rows.length} 個建案。點大樓圖示看詳情，資訊會出現在地圖下方。`}
          </p>
        </div>
      </div>

      {/* ── 選中的建案 ── */}
      <section className={styles.detailPane} aria-live="polite">
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
                  {selected.completion.includes("興建中")
                    ? selected.completion
                    : `${selected.completion} 完工`}
                </dd>
              </div>
              {selected.units != null && (
                <div>
                  <dt>總戶數</dt>
                  <dd>{`${fmt(selected.units)} 戶`}</dd>
                </div>
              )}
              {selected.statusNote && (
                <div>
                  <dt>銷售狀態</dt>
                  <dd>{selected.statusNote}</dd>
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
                  <dt>樓層</dt>
                  <dd>{selected.floors}</dd>
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
              <div>
                <dt>資料出處</dt>
                <dd>{selected.sources.map((k) => SOURCES[k]?.label ?? k).join("、")}</dd>
              </div>
            </dl>

            {/* ── 我在這個建案的在售物件 ── */}
            {selectedListings.length > 0 ? (
              <div className={styles.mineBlock}>
                <h4 className={styles.mineTitle}>{`我在 ${selected.name} 的在售物件`}</h4>
                <div className={lst.grid}>
                  {selectedListings.map((item) => (
                    <article key={item.id} className={lst.card}>
                      <PhotoCarousel photos={item.photos} alt={`${selected.name}－${item.title}`} />
                      <div className={lst.body}>
                        <span className={lst.area}>{selected.name}</span>
                        <h5 className={lst.title}>{item.title}</h5>
                        <ul className={lst.points}>
                          {item.points.map((p) => (
                            <li key={p}>{p}</li>
                          ))}
                        </ul>
                        {/* 這裡刻意只有兩顆：物件介紹＋預約諮詢。
                            「影片賞析」是 /listings 才有的，系統擁有者指定這頁不要。 */}
                        {item.linkHref && (
                          <a
                            className={lst.actionLink}
                            href={item.linkHref}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            物件介紹 ↗
                          </a>
                        )}
                        <Link className={lst.actionBtn} href="/card/booking">
                          預約諮詢
                        </Link>
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
            👆 點地圖上的大樓圖示，或下方清單裡的建案名稱，這裡就會顯示建案資訊與我的在售物件。
          </p>
        )}
      </section>

      {/* ── 建案索引（也是給 Google 讀的內容）── */}
      <div className={styles.indexBlock}>
        <h3 className={styles.indexTitle}>
          {`區內建案一覽（${rows.length}／${stats.total}）`}
          {mineTotal > 0 && <span className={styles.indexMine}>{`我有 ${mineTotal} 件在售`}</span>}
        </h3>
        {rows.length === 0 ? (
          <p className={styles.empty}>沒有符合的建案。換個關鍵字或篩選試試。</p>
        ) : (
          <ul className={styles.indexList}>
            {rows.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={p.id === selectedId ? styles.indexItemOn : styles.indexItem}
                  onClick={() => setSelectedId(p.id)}
                  aria-pressed={p.id === selectedId}
                >
                  <i style={{ background: TONE_SWATCH[p.status] }} aria-hidden="true" />
                  <b>{p.name}</b>
                  <em>{p.builder}</em>
                  {p.units != null && <span>{`${fmt(p.units)} 戶`}</span>}
                  <span>{AREA_LABEL[p.area]}</span>
                  {(mine[p.id] ?? 0) > 0 && <u>{`在售 ${mine[p.id]}`}</u>}
                  {!COORDS[p.id] && <s>未標位置</s>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

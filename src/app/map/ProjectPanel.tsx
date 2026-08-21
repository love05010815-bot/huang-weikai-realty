"use client";

/**
 * 台中港市鎮中心 —— 建案總覽（`/map` 的第二層）
 *
 * 只負責篩選與呈現。要改建案內容請改 src/data/port-projects.ts。
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  PROJECTS,
  SOURCES,
  STATUS_LABEL,
  projectStats,
  type Project,
  type ProjectStatus,
} from "@/data/port-projects";
import styles from "./Map.module.css";

type Filter = "all" | ProjectStatus;
type DistrictFilter = "all" | "梧棲" | "清水";
type Sort = "units" | "name" | "mine";

/** 掛在建案底下的在售物件。只帶畫面用得到的欄位 */
export type ProjectListing = {
  slug: string;
  title: string;
  area: string;
  photo: string | null;
};

const fmt = (n: number) => n.toLocaleString("zh-TW");

export default function ProjectPanel({
  listings = {},
}: {
  /** 建案 id → 該建案的在售物件。由 page.tsx 從資料庫撈好傳進來 */
  listings?: Record<string, ProjectListing[]>;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [district, setDistrict] = useState<DistrictFilter>("all");
  const [sort, setSort] = useState<Sort>("units");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const stats = useMemo(() => projectStats(), []);
  const mineCount = useMemo(
    () => Object.values(listings).reduce((s, l) => s + l.length, 0),
    [listings]
  );
  const mineProjects = useMemo(
    () => Object.keys(listings).filter((id) => listings[id].length > 0).length,
    [listings]
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PROJECTS.filter((p) => {
      if (filter !== "all" && p.status !== filter) return false;
      if (district !== "all" && p.district !== district) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.alias?.toLowerCase().includes(q) ||
        p.builder?.toLowerCase().includes(q) ||
        p.streets?.toLowerCase().includes(q)
      );
    }).sort((a, b) => {
      if (sort === "mine") {
        // 有在售物件的排前面，其次才比戶數
        const diff = (listings[b.id]?.length ?? 0) - (listings[a.id]?.length ?? 0);
        if (diff !== 0) return diff;
        return (b.units ?? 0) - (a.units ?? 0);
      }
      if (sort === "units") return (b.units ?? 0) - (a.units ?? 0);
      return a.name.localeCompare(b.name, "zh-Hant");
    });
  }, [filter, district, sort, query, listings]);

  const shownUnits = rows.reduce((s, p) => s + (p.units ?? 0), 0);

  return (
    <div className={styles.projects}>
      {/* ── 概況 ── */}
      <ul className={styles.statRow}>
        <li>
          <b>{stats.total}</b>
          <span>個建案</span>
        </li>
        <li>
          <b>{fmt(stats.units)}</b>
          <span>總戶數</span>
        </li>
        <li>
          <b>{stats.presale}</b>
          <span>預售中</span>
        </li>
        <li>
          <b>{stats.completed}</b>
          <span>成屋</span>
        </li>
        <li>
          <b>{stats.builders}</b>
          <span>家建商</span>
        </li>
        <li>
          <b>2</b>
          <span>個行政區</span>
        </li>
      </ul>

      {/* ── 篩選 ── */}
      <div className={styles.filterBar}>
        <div className={styles.chips} role="group" aria-label="依狀態篩選">
          {([
            ["all", "全部"],
            ["presale", "預售中"],
            ["completed", "成屋"],
          ] as Array<[Filter, string]>).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={filter === key ? styles.chipOn : styles.chip}
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
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

        <label className={styles.sortWrap}>
          <span className={styles.srOnly}>排序方式</span>
          <select
            className={styles.sortSelect}
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
          >
            <option value="units">戶數多到少</option>
            <option value="name">依名稱</option>
            {mineCount > 0 && <option value="mine">有在售物件優先</option>}
          </select>
        </label>
      </div>

      {/* 重劃區橫跨梧棲與清水，清水客戶會想只看清水的案子 */}
      <div className={styles.chips} role="group" aria-label="依行政區篩選">
        {([
          ["all", `全區（${stats.total}）`],
          ["梧棲", `梧棲區（${stats.wuqi}）`],
          ["清水", `清水區（${stats.qingshui}）`],
        ] as Array<[DistrictFilter, string]>).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={district === key ? styles.chipOn : styles.chip}
            onClick={() => setDistrict(key)}
            aria-pressed={district === key}
          >
            {label}
          </button>
        ))}
      </div>

      <p className={styles.resultCount}>
        {`顯示 ${rows.length} 個建案，共 ${fmt(shownUnits)} 戶`}
        {stats.districtUnknown > 0 && district !== "all" && (
          <span className={styles.warnNote}>
            {`另有 ${stats.districtUnknown} 案的行政區尚未查證，不會出現在梧棲／清水的篩選結果裡`}
          </span>
        )}
      </p>

      {/* ── 清單 ── */}
      {rows.length === 0 ? (
        <p className={styles.empty}>沒有符合的建案。換個關鍵字試試。</p>
      ) : (
        <ul className={styles.projectGrid}>
          {rows.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              listings={listings[p.id] ?? []}
              open={openId === p.id}
              onToggle={() => setOpenId(openId === p.id ? null : p.id)}
            />
          ))}
        </ul>
      )}

      {mineCount > 0 && (
        <p className={styles.mineSummary}>
          {`目前在這個重劃區有 ${mineCount} 件在售物件，分佈在 ${mineProjects} 個建案。`}
          <Link href="/listings">看全部好案 →</Link>
        </p>
      )}
    </div>
  );
}

function ProjectCard({
  project: p,
  listings,
  open,
  onToggle,
}: {
  project: Project;
  listings: ProjectListing[];
  open: boolean;
  onToggle: () => void;
}) {
  const hasMine = listings.length > 0;
  return (
    <li
      className={`${styles.projectCard} ${open ? styles.projectCardOpen : ""} ${
        hasMine ? styles.projectCardMine : ""
      }`}
    >
      <button type="button" className={styles.projectHead} onClick={onToggle} aria-expanded={open}>
        <span className={styles.projectTitleRow}>
          <span className={styles.projectName}>{p.name}</span>
          <span className={p.status === "presale" ? styles.badgePresale : styles.badgeDone}>
            {STATUS_LABEL[p.status]}
          </span>
        </span>

        {hasMine && (
          <span className={styles.mineBadge}>{`🏠 我有 ${listings.length} 件在售`}</span>
        )}
        {p.alias && <span className={styles.projectAlias}>{`又稱 ${p.alias}`}</span>}
        <span className={styles.projectMeta}>
          {p.builder ? (
            <span>
              {p.builder}
              {p.builderGuess && <em className={styles.guess}>建商推定</em>}
            </span>
          ) : (
            <span className={styles.muted}>建商待確認</span>
          )}
          {p.units != null && <span>{`${fmt(p.units)} 戶`}</span>}
          {p.district ? (
            <span className={styles.districtTag}>{`${p.district}區`}</span>
          ) : (
            <span className={styles.districtTagMuted}>行政區待確認</span>
          )}
        </span>
      </button>

      {open && (
        <div className={styles.projectBody}>
          <dl className={styles.detailList}>
            {p.streets && (
              <div>
                <dt>坐落</dt>
                <dd>{p.streets}</dd>
              </div>
            )}
            {p.layout && (
              <div>
                <dt>房型坪數</dt>
                <dd>{p.layout}</dd>
              </div>
            )}
            {p.floors && (
              <div>
                <dt>樓層</dt>
                <dd>{p.floors}</dd>
              </div>
            )}
            {p.siteAreaPing != null && (
              <div>
                <dt>基地面積</dt>
                <dd>{`約 ${fmt(p.siteAreaPing)} 坪`}</dd>
              </div>
            )}
            {p.note && (
              <div>
                <dt>備註</dt>
                <dd>{p.note}</dd>
              </div>
            )}
            <div>
              <dt>資料出處</dt>
              <dd>
                {p.sources.map((key) => SOURCES[key]?.label ?? key).join("、")}
                {!p.verified && <span className={styles.unverified}>尚未人工核對</span>}
              </dd>
            </div>
          </dl>

          {listings.length > 0 ? (
            <div className={styles.mineBlock}>
              <h4 className={styles.mineTitle}>{`我在 ${p.name} 的在售物件`}</h4>
              <ul className={styles.mineList}>
                {listings.map((l) => (
                  <li key={l.slug}>
                    <Link href="/listings" className={styles.mineItem}>
                      {l.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={l.photo} alt="" width={72} height={54} loading="lazy" />
                      ) : (
                        <span className={styles.minePhotoHolder} aria-hidden="true" />
                      )}
                      <span>
                        <b>{l.title}</b>
                        <em>{l.area}</em>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href="/card/booking" className={styles.cta}>
                {`預約看 ${p.name} 的物件`}
              </Link>
            </div>
          ) : (
            <>
              <p className={styles.noMine}>
                {`目前我手上沒有 ${p.name} 的物件在售。這一區的釋出速度很快，想找這個建案可以先跟我說，有案子我第一時間通知你。`}
              </p>
              <Link href="/card/booking" className={styles.cta}>
                {`想找 ${p.name}？預約諮詢`}
              </Link>
            </>
          )}
        </div>
      )}
    </li>
  );
}

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
type Sort = "units" | "name";

const fmt = (n: number) => n.toLocaleString("zh-TW");

export default function ProjectPanel() {
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("units");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const stats = useMemo(() => projectStats(), []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PROJECTS.filter((p) => {
      if (filter !== "all" && p.status !== filter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.alias?.toLowerCase().includes(q) ||
        p.builder?.toLowerCase().includes(q) ||
        p.streets?.toLowerCase().includes(q)
      );
    }).sort((a, b) =>
      sort === "units"
        ? (b.units ?? 0) - (a.units ?? 0)
        : a.name.localeCompare(b.name, "zh-Hant")
    );
  }, [filter, sort, query]);

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
          </select>
        </label>
      </div>

      <p className={styles.resultCount}>
        {`顯示 ${rows.length} 個建案，共 ${fmt(shownUnits)} 戶`}
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
              open={openId === p.id}
              onToggle={() => setOpenId(openId === p.id ? null : p.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ProjectCard({
  project: p,
  open,
  onToggle,
}: {
  project: Project;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <li className={`${styles.projectCard} ${open ? styles.projectCardOpen : ""}`}>
      <button type="button" className={styles.projectHead} onClick={onToggle} aria-expanded={open}>
        <span className={styles.projectTitleRow}>
          <span className={styles.projectName}>{p.name}</span>
          <span className={p.status === "presale" ? styles.badgePresale : styles.badgeDone}>
            {STATUS_LABEL[p.status]}
          </span>
        </span>
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

          <Link href="/card/booking" className={styles.cta}>
            {`想了解 ${p.name} 的行情？預約諮詢`}
          </Link>
        </div>
      )}
    </li>
  );
}

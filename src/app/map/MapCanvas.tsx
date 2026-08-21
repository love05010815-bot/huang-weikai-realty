"use client";

/**
 * 台中港特定區土地分佈圖 —— 互動畫布
 *
 * 這裡只負責「怎麼畫、怎麼互動」。要改地塊內容請改 src/data/port-district.ts。
 */

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BULK_NOTES,
  CANVAS,
  LANDMARKS,
  M2_TO_PING,
  PARCELS,
  ROADS,
  STATUS,
  ZONES,
  type Parcel,
  type StatusKey,
  type ZoneKey,
} from "@/data/port-district";
import styles from "./Map.module.css";

type View = { x: number; y: number; w: number; h: number };
type ColorMode = "zone" | "status";

const ASPECT = CANVAS.h / CANVAS.w;
const MIN_W = CANVAS.w / 10;
const MAX_W = CANVAS.w * 1.25;
const INITIAL: View = { x: 0, y: 0, w: CANVAS.w, h: CANVAS.h };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 螢幕座標 → SVG 座標（已處理 xMidYMid meet 的留白） */
function toSvg(view: View, box: DOMRect, cx: number, cy: number) {
  const scale = Math.min(box.width / view.w, box.height / view.h);
  const ox = box.left + (box.width - view.w * scale) / 2;
  const oy = box.top + (box.height - view.h * scale) / 2;
  return { x: view.x + (cx - ox) / scale, y: view.y + (cy - oy) / scale };
}

/** 以 anchor 為定點縮放。factor 大於 1 代表放大 */
function zoomAt(view: View, factor: number, anchor: { x: number; y: number }): View {
  const w = clamp(view.w / factor, MIN_W, MAX_W);
  const h = w * ASPECT;
  return {
    w,
    h,
    x: anchor.x - (anchor.x - view.x) * (w / view.w),
    y: anchor.y - (anchor.y - view.y) * (h / view.h),
  };
}

const ping = (m2: number) => Math.round(m2 * M2_TO_PING * 100) / 100;
const fmt = (n: number) => n.toLocaleString("zh-TW", { maximumFractionDigits: 2 });

export default function MapCanvas() {
  const [view, setView] = useState<View>(INITIAL);
  const [mode, setMode] = useState<ColorMode>("zone");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Parcel | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ view: View; anchor: { x: number; y: number }; dist: number } | null>(null);
  const moved = useRef(false);

  const q = query.trim();
  const matches = useMemo(() => {
    if (!q) return null;
    const lower = q.toLowerCase();
    return new Set(
      PARCELS.filter(
        (p) =>
          p.name?.toLowerCase().includes(lower) ||
          p.note?.toLowerCase().includes(lower) ||
          ZONES[p.zone].label.includes(q)
      ).map((p) => p.id)
    );
  }, [q]);

  const stats = useMemo(() => {
    const named = PARCELS.filter((p) => p.name).length;
    const verified = PARCELS.filter((p) => p.verified).length;
    const area = PARCELS.reduce((sum, p) => sum + (p.areaM2 ?? 0), 0);
    return { total: PARCELS.length, named, verified, area };
  }, []);

  /* ── 手勢 ── */

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved.current = false;
      const box = svgRef.current?.getBoundingClientRect();
      if (!box) return;
      const pts = [...pointers.current.values()];
      if (pts.length === 1) {
        gesture.current = { view, anchor: toSvg(view, box, pts[0].x, pts[0].y), dist: 0 };
      } else if (pts.length === 2) {
        const mx = (pts[0].x + pts[1].x) / 2;
        const my = (pts[0].y + pts[1].y) / 2;
        gesture.current = {
          view,
          anchor: toSvg(view, box, mx, my),
          dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        };
      }
    },
    [view]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = gesture.current;
      const box = svgRef.current?.getBoundingClientRect();
      if (!g || !box) return;
      const pts = [...pointers.current.values()];

      if (pts.length === 1) {
        const now = toSvg(view, box, pts[0].x, pts[0].y);
        const dx = g.anchor.x - now.x;
        const dy = g.anchor.y - now.y;
        if (Math.abs(dx) > 1.5 || Math.abs(dy) > 1.5) moved.current = true;
        setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
        return;
      }

      if (pts.length === 2 && g.dist > 0) {
        moved.current = true;
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        setView(zoomAt(g.view, clamp(dist / g.dist, 0.2, 6), g.anchor));
      }
    },
    [view]
  );

  const endPointer = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) gesture.current = null;
  }, []);

  const onWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      const box = svgRef.current?.getBoundingClientRect();
      if (!box) return;
      const anchor = toSvg(view, box, e.clientX, e.clientY);
      setView(zoomAt(view, e.deltaY < 0 ? 1.18 : 1 / 1.18, anchor));
    },
    [view]
  );

  const nudgeZoom = (factor: number) =>
    setView((v) => zoomAt(v, factor, { x: v.x + v.w / 2, y: v.y + v.h / 2 }));

  /* ── 上色 ── */

  const fillOf = (p: Parcel) => (mode === "zone" ? ZONES[p.zone].fill : STATUS[p.status].fill);
  const inkOf = (p: Parcel) => (mode === "zone" ? ZONES[p.zone].ink : STATUS[p.status].ink);

  const zoom = CANVAS.w / view.w;
  const legend =
    mode === "zone"
      ? (Object.keys(ZONES) as ZoneKey[]).map((k) => ({ key: k, label: ZONES[k].label, fill: ZONES[k].fill }))
      : (Object.keys(STATUS) as StatusKey[]).map((k) => ({ key: k, label: STATUS[k].label, fill: STATUS[k].fill }));

  return (
    <div className={styles.shell}>
      {/* ── 工具列 ── */}
      <div className={styles.toolbar}>
        <div className={styles.modeSwitch} role="group" aria-label="上色依據">
          <button
            type="button"
            className={mode === "zone" ? styles.modeOn : styles.modeOff}
            onClick={() => setMode("zone")}
            aria-pressed={mode === "zone"}
          >
            依分區
          </button>
          <button
            type="button"
            className={mode === "status" ? styles.modeOn : styles.modeOff}
            onClick={() => setMode("status")}
            aria-pressed={mode === "status"}
          >
            依開發狀態
          </button>
        </div>

        <label className={styles.search}>
          <span className={styles.srOnly}>搜尋建商或分區</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋建商，例如：潤泰、遠雄"
            className={styles.searchInput}
          />
        </label>

        <div className={styles.zoomBtns}>
          <button type="button" onClick={() => nudgeZoom(1 / 1.35)} aria-label="縮小">
            −
          </button>
          <button type="button" onClick={() => nudgeZoom(1.35)} aria-label="放大">
            ＋
          </button>
          <button type="button" onClick={() => setView(INITIAL)} className={styles.resetBtn}>
            回全區
          </button>
        </div>
      </div>

      <div className={styles.stage}>
        {/* ── 地圖 ── */}
        <div className={styles.canvasWrap}>
          <svg
            ref={svgRef}
            className={styles.canvas}
            viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
            role="img"
            aria-label="台中港特定區中正段南段與梧棲段土地分佈示意圖"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
            onPointerLeave={endPointer}
            onWheel={onWheel}
          >
            <rect x={0} y={0} width={CANVAS.w} height={CANVAS.h} fill="#FBF8F2" />

            {/* 周邊地標 */}
            {LANDMARKS.map((l) => {
              const [x, y, w, h] = l.rect;
              const cx = x + w / 2;
              const cy = y + h / 2;
              return (
                <g key={l.label}>
                  <rect
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    rx={4}
                    fill={l.tone === "port" ? "#DCE9F2" : "#E4E1D7"}
                    stroke="#C4CDD4"
                    strokeWidth={0.8}
                  />
                  <text
                    x={cx}
                    y={cy}
                    fontSize={15}
                    fill="#4A5C68"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    transform={`rotate(-90 ${cx} ${cy})`}
                  >
                    {l.label}
                  </text>
                </g>
              );
            })}

            {/* 道路 */}
            {ROADS.map((r, i) => {
              const [x, y, w, h] = r.rect;
              const cx = x + w / 2;
              const cy = y + h / 2;
              return (
                <g key={`${r.name}-${i}`}>
                  <rect x={x} y={y} width={w} height={h} fill="#FFFFFF" stroke="#C9D2D8" strokeWidth={0.7} />
                  {r.name && (
                    <text
                      x={cx}
                      y={cy}
                      fontSize={11}
                      fontWeight={600}
                      fill="#5C6A73"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      transform={r.dir === "v" ? `rotate(-90 ${cx} ${cy})` : undefined}
                    >
                      {`${r.name} ${r.width}`}
                    </text>
                  )}
                </g>
              );
            })}

            {/* 地塊 */}
            {PARCELS.map((p) => {
              const [x, y, w, h] = p.rect;
              const hit = matches ? matches.has(p.id) : true;
              const isOn = selected?.id === p.id;
              return (
                <g
                  key={p.id}
                  className={styles.parcel}
                  opacity={hit ? 1 : 0.22}
                  tabIndex={0}
                  role="button"
                  aria-label={`${p.name ?? "未標註地塊"}，${ZONES[p.zone].label}`}
                  onClick={() => {
                    if (!moved.current) setSelected(p);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(p);
                    }
                  }}
                >
                  <rect
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    fill={fillOf(p)}
                    stroke={isOn ? "#01354D" : "#FFFFFF"}
                    strokeWidth={isOn ? 3 : 1}
                    rx={1.5}
                  />
                  {p.name && w > 44 && h > 22 && (
                    <text
                      x={x + w / 2}
                      y={p.areaM2 && h > 34 ? y + h / 2 - 6 : y + h / 2}
                      fontSize={11}
                      fontWeight={700}
                      fill={inkOf(p)}
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {p.name}
                    </text>
                  )}
                  {p.name && p.areaM2 && w > 44 && h > 34 && (
                    <text
                      x={x + w / 2}
                      y={y + h / 2 + 8}
                      fontSize={8.5}
                      fill={inkOf(p)}
                      opacity={0.85}
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {`${fmt(p.areaM2)} ㎡`}
                    </text>
                  )}
                </g>
              );
            })}

            {/* 容積註記 */}
            {BULK_NOTES.map((b) => (
              <g key={b.text}>
                <rect
                  x={b.x - 24}
                  y={b.y - 10}
                  width={48}
                  height={20}
                  rx={3}
                  fill="#F6D23C"
                  stroke="#C9A81F"
                  strokeWidth={0.8}
                />
                <text
                  x={b.x}
                  y={b.y}
                  fontSize={11}
                  fontWeight={700}
                  fill="#3D3208"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {b.text}
                </text>
              </g>
            ))}
          </svg>

          <p className={styles.hint}>
            {`滾輪縮放・拖曳平移・點地塊看詳情（手機可雙指縮放）　目前 ${zoom.toFixed(1)}×`}
          </p>
        </div>

        {/* ── 側欄 ── */}
        <aside className={styles.side}>
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>圖例</h2>
            <ul className={styles.legend}>
              {legend.map((l) => (
                <li key={l.key}>
                  <span className={styles.swatch} style={{ background: l.fill }} aria-hidden="true" />
                  {l.label}
                </li>
              ))}
            </ul>
          </div>

          <div className={`${styles.card} ${styles.detail}`}>
            <h2 className={styles.cardTitle}>地塊詳情</h2>
            {selected ? (
              <>
                <p className={styles.detailName}>
                  {selected.name ?? "未標註地塊"}
                  {selected.name && !selected.verified && <span className={styles.unverified}>待確認</span>}
                </p>
                <dl className={styles.detailList}>
                  <div>
                    <dt>使用分區</dt>
                    <dd>{ZONES[selected.zone].label}</dd>
                  </div>
                  <div>
                    <dt>開發狀態</dt>
                    <dd>{STATUS[selected.status].label}</dd>
                  </div>
                  {selected.areaM2 != null && (
                    <div>
                      <dt>土地面積</dt>
                      <dd>
                        {`${fmt(selected.areaM2)} ㎡`}
                        <span className={styles.sub}>{`約 ${fmt(ping(selected.areaM2))} 坪`}</span>
                      </dd>
                    </div>
                  )}
                  {selected.bulk && (
                    <div>
                      <dt>建蔽／容積</dt>
                      <dd>{selected.bulk}</dd>
                    </div>
                  )}
                  {selected.note && (
                    <div>
                      <dt>備註</dt>
                      <dd>{selected.note}</dd>
                    </div>
                  )}
                </dl>
                <Link href="/card/booking" className={styles.cta}>
                  想了解這一帶的行情？預約諮詢
                </Link>
              </>
            ) : (
              <p className={styles.empty}>點地圖上任一塊地，這裡會顯示建商、面積與分區。</p>
            )}
          </div>

          <div className={styles.card}>
            <h2 className={styles.cardTitle}>資料進度</h2>
            <ul className={styles.stats}>
              <li>
                <b>{stats.total}</b> 塊地塊已描繪
              </li>
              <li>
                <b>{stats.named}</b> 塊已填建商／用途
              </li>
              <li>
                <b>{stats.verified}</b> 塊已人工核對
              </li>
              <li>
                {`已登錄面積 `}
                <b>{fmt(Math.round(stats.area))}</b>
                {` ㎡（約 ${fmt(Math.round(stats.area * M2_TO_PING))} 坪）`}
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

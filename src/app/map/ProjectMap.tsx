"use client";

/**
 * 台中港市鎮中心 —— 建案組成圖
 *
 * ⚠️ 這是「組成示意圖」，不是位置圖。先講清楚它畫的是什麼、不是什麼：
 *
 *   ✅ 真的：重劃區的四至（官方公告）、每案屬於梧棲側／清水側／核心區
 *            （系統擁有者的總表）、方塊大小＝戶數比例、顏色＝銷售階段。
 *   ❌ 假的：方塊在區塊內的左右上下位置。那是排版排出來的，不是真實坐落。
 *
 * 為什麼不畫真位置：39 案裡只有 9 案查得到明確路段。剩下 30 案用猜的，
 * 會做出一張「看起來很權威但其實錯的圖」——`/map` 的地塊層就是這樣被雪藏的。
 *
 * 要升級成真位置圖：把每案的 `street` 欄補齊（`port-projects.ts`），
 * 再把下面的 layout() 換成依道路定位。資料結構已經留好了。
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AREA_LABEL,
  DISTRICT,
  PROJECTS,
  STATUS_LABEL,
  type Project,
  type ProjectArea,
  type ProjectStatus,
} from "@/data/port-projects";
import styles from "./Map.module.css";

const W = 1300;
const H = 980;

/** 銷售階段配色。跟清單的 badge 同一組色，兩邊看起來才是同一個系統 */
const STATUS_FILL: Record<ProjectStatus, { fill: string; ink: string; stroke: string }> = {
  presale: { fill: "#F3A9BF", ink: "#5E1F33", stroke: "#D98BA4" },
  newly: { fill: "#9FC7E8", ink: "#123A5C", stroke: "#7FAACF" },
  completed: { fill: "#A9D6A5", ink: "#1F4A22", stroke: "#8ABF86" },
  unknown: { fill: "#D9D4CC", ink: "#4A453F", stroke: "#BDB6AC" },
};

/**
 * 兩個區塊在畫布上的範圍。清水在北、梧棲在南。
 *
 * ⚠️ 這支是**死程式碼**（`page.tsx` 註明已被 ProjectExplorer 取代，沒有人 import）。
 *    2026-08-27 拿掉 ProjectArea 的「市鎮中心」時順手讓它編得過而已，沒有重新排版。
 *    真要復活這張圖，y/h 要重算 —— 中間那條被拿掉後版面會空一塊。
 */
const ZONES: Array<{ key: ProjectArea; y: number; h: number; tint: string }> = [
  { key: "清水", y: 96, h: 300, tint: "#EDF4FA" },
  { key: "梧棲", y: 568, h: 320, tint: "#F1F7F0" },
];

type Placed = Project & { x: number; y: number; w: number; h: number };

/**
 * 區塊內的排版：戶數大的先放、由左至右、放不下就換行。
 * 純幾何，跟真實坐落無關（檔頭已警告）。
 */
function layout(list: Project[], zone: { y: number; h: number }): Placed[] {
  const PAD = 26;
  const GAP = 8;
  const ROW_H = 52;
  const left = 78;
  const right = W - 78;
  const maxW = right - left;

  // 方塊寬度照戶數開根號縮放——直接用戶數線性縮放的話，
  // 2495 戶的遠雄幸福成會把 114 戶的中港雲頂1 壓成一條線。
  const widthOf = (units?: number) => {
    if (units == null) return 104;
    return Math.min(280, Math.max(96, Math.sqrt(units) * 6.2));
  };

  const sorted = [...list].sort((a, b) => (b.units ?? 0) - (a.units ?? 0));
  const out: Placed[] = [];
  let x = left;
  let y = zone.y + PAD;

  for (const p of sorted) {
    const w = widthOf(p.units);
    if (x + w > right && x > left) {
      x = left;
      y += ROW_H + GAP;
    }
    out.push({ ...p, x, y, w, h: ROW_H });
    x += w + GAP;
  }

  // 排完超出區塊高度時，把整批往上壓一點，不要溢出到隔壁區
  const bottom = y + ROW_H;
  const limit = zone.y + zone.h - PAD;
  if (bottom > limit && out.length) {
    const scale = (limit - zone.y - PAD) / (bottom - zone.y - PAD);
    for (const p of out) {
      p.y = zone.y + PAD + (p.y - zone.y - PAD) * scale;
      p.h = ROW_H * Math.min(1, scale + 0.12);
    }
  }
  void maxW;
  return out;
}

export default function ProjectMap({
  listings = {},
}: {
  listings?: Record<string, number>;
}) {
  const [selected, setSelected] = useState<Project | null>(null);

  const placed = useMemo(
    () =>
      ZONES.flatMap((z) =>
        layout(
          PROJECTS.filter((p) => p.area === z.key),
          z
        )
      ),
    []
  );

  return (
    <div className={styles.pmWrap}>
      {/* 手機上這張圖縮到 359px 寬時字只剩 3.6px，等於看不到。
          所以讓它在自己的容器裡橫向捲動，而不是整頁縮小。 */}
      <div className={styles.pmScroller}>
      <svg
        className={styles.pmCanvas}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="台中港市鎮中心重劃區建案組成示意圖"
      >
        <rect x={0} y={0} width={W} height={H} fill="#FBF8F2" />

        {/* 四至道路 —— 這四條是官方公告的邊界，畫成外框 */}
        <rect x={54} y={54} width={W - 108} height={H - 108} fill="none" stroke="#C9D2D8" strokeWidth={2} rx={6} />
        <text x={W / 2} y={38} fontSize={17} fontWeight={700} fill="#5C6A73" textAnchor="middle">
          民族路三段（北界）
        </text>
        <text x={W / 2} y={H - 20} fontSize={17} fontWeight={700} fill="#5C6A73" textAnchor="middle">
          大仁路二段・八德路一段・大智路二段（南界）
        </text>
        <text x={26} y={H / 2} fontSize={17} fontWeight={700} fill="#5C6A73" textAnchor="middle" transform={`rotate(-90 26 ${H / 2})`}>
          臨港路五段（西界）
        </text>
        <text x={W - 26} y={H / 2} fontSize={17} fontWeight={700} fill="#5C6A73" textAnchor="middle" transform={`rotate(90 ${W - 26} ${H / 2})`}>
          港埠路三段（東界）
        </text>

        {/* 三個區塊 */}
        {ZONES.map((z) => {
          const count = PROJECTS.filter((p) => p.area === z.key).length;
          return (
            <g key={z.key}>
              <rect x={62} y={z.y} width={W - 124} height={z.h} rx={10} fill={z.tint} stroke="#DDE5EA" strokeWidth={1} />
              <text x={78} y={z.y + 20} fontSize={15} fontWeight={800} fill="#4A5C68">
                {`${AREA_LABEL[z.key]}　${count} 案`}
              </text>
            </g>
          );
        })}

        {/* 建案方塊 */}
        {placed.map((p) => {
          const c = STATUS_FILL[p.status];
          const on = selected?.id === p.id;
          const mine = (listings[p.id] ?? 0) > 0;
          return (
            <g
              key={p.id}
              className={styles.pmItem}
              tabIndex={0}
              role="button"
              aria-label={`${p.name}，${p.builder}，${STATUS_LABEL[p.status]}`}
              onClick={() => setSelected(p)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelected(p);
                }
              }}
            >
              <rect
                x={p.x}
                y={p.y}
                width={p.w}
                height={p.h}
                rx={7}
                fill={c.fill}
                stroke={on ? "#01354D" : c.stroke}
                strokeWidth={on ? 3 : 1}
                strokeDasharray={p.units == null ? "4 3" : undefined}
              />
              {mine && <circle cx={p.x + p.w - 11} cy={p.y + 11} r={5} fill="#01354D" />}
              <text
                x={p.x + p.w / 2}
                y={p.y + (p.units != null ? p.h / 2 - 6 : p.h / 2)}
                fontSize={13}
                fontWeight={700}
                fill={c.ink}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {p.name}
              </text>
              {p.units != null && (
                <text
                  x={p.x + p.w / 2}
                  y={p.y + p.h / 2 + 11}
                  fontSize={11}
                  fill={c.ink}
                  opacity={0.85}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {`${p.units.toLocaleString("zh-TW")} 戶`}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      </div>

      <div className={styles.pmSide}>
        <div className={styles.pmLegend}>
          {(Object.keys(STATUS_FILL) as ProjectStatus[]).map((k) => (
            <span key={k}>
              <i style={{ background: STATUS_FILL[k].fill, borderColor: STATUS_FILL[k].stroke }} />
              {STATUS_LABEL[k]}
            </span>
          ))}
          <span>
            <i className={styles.pmDashed} />
            戶數待補
          </span>
          <span>
            <i className={styles.pmDot} />
            我有物件在售
          </span>
        </div>

        {selected ? (
          <div className={styles.pmDetail}>
            <h3>{selected.name}</h3>
            <p>
              {selected.builder}
              {"　"}
              {AREA_LABEL[selected.area]}
              {"　"}
              {selected.completion.includes("興建中") ? selected.completion : `${selected.completion} 完工`}
            </p>
            {selected.units != null && <p>{`總戶數 ${selected.units.toLocaleString("zh-TW")} 戶`}</p>}
            {selected.streets && <p>{`坐落：${selected.streets}`}</p>}
            <Link href="/card/booking" className={styles.cta}>
              {`想找 ${selected.name}？預約諮詢`}
            </Link>
          </div>
        ) : (
          <p className={styles.pmHint}>點任一個建案看詳情。方塊大小代表戶數，顏色代表銷售階段。</p>
        )}

        <p className={styles.pmScrollHint}>圖比螢幕寬，可以左右滑動看完整區域。</p>

        <p className={styles.pmDisclaimer}>
          <b>這是組成示意圖，不是位置圖。</b>
          方塊在區塊裡的左右上下是排版排出來的，<b>不代表實際坐落位置</b>。
          真實的是：重劃區四至（官方公告）、每案屬於哪一側（在地確認）、方塊大小的戶數比例、顏色的銷售階段。
          {`本區共 ${PROJECTS.length} 案，其中 ${PROJECTS.filter((p) => p.street).length} 案已有明確路段資料。`}
        </p>

        <p className={styles.pmSections}>
          {`重劃區涵蓋梧棲區${DISTRICT.sections.梧棲區.join("、")}與清水區${DISTRICT.sections.清水區.join("、")}。`}
        </p>
      </div>
    </div>
  );
}

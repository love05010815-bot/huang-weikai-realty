"use client";

/**
 * 台中港市鎮中心 —— 建案地圖（受控元件）
 *
 * 只負責「畫地圖、畫圖釘、回報點了誰」。選了哪個建案、要顯示什麼詳情，
 * 全部由外層的 ProjectExplorer 決定 —— 因為詳情裡還要放在售物件卡片，
 * 那個寬度側欄放不下，得畫在地圖下方。
 *
 * ## 幾個刻意的決定
 *
 * 1. **Leaflet 用動態 import**，它載入時就會碰 `window`，在伺服器端會炸。
 *    所以這張地圖不會出現在 SSR 的 HTML 裡 —— SEO 靠外層那份建案清單。
 *
 * 2. **圖釘做小（28×34）**。39 棟擠在 115 公頃裡，圖釘一大就整片疊在一起
 *    點不到（實測 34×42 時有 22 組彼此不到 25px）。
 *
 * 3. **`?fix=1` 是座標校正模式**，網址加參數才出現。刻意在瀏覽器端讀網址 ——
 *    頁面一讀 server 的 searchParams 就會從靜態掉成每次請求渲染。
 */

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMapType, Marker } from "leaflet";
import { COORDS, MAP_CENTER, type Project, type ProjectStatus } from "@/data/port-projects";
import styles from "./Map.module.css";
// Leaflet 的樣式一定要在頂層 import。放進 useEffect 動態 import 不會生效，
// 圖磚會亂疊、控制項會跑版。
import "leaflet/dist/leaflet.css";

/** 銷售階段配色，跟清單的 badge 同一組 */
const TONE: Record<ProjectStatus, { bg: string; ink: string }> = {
  presale: { bg: "#D9466F", ink: "#fff" },
  newly: { bg: "#1E6FA8", ink: "#fff" },
  completed: { bg: "#2F7A34", ink: "#fff" },
};

function buildingSvg(bg: string, ink: string, mine: boolean, on: boolean) {
  const scale = on ? 1.28 : 1;
  const w = Math.round(28 * scale);
  const h = Math.round(34 * scale);
  return `
<svg width="${w}" height="${h}" viewBox="0 0 28 34" xmlns="http://www.w3.org/2000/svg">
  <path d="M14 34c0 0-10.5-11.5-10.5-19.5A10.5 10.5 0 0 1 24.5 14.5C24.5 22.5 14 34 14 34z"
        fill="${bg}" stroke="${on ? "#01354D" : "#fff"}" stroke-width="${on ? 2.6 : 1.8}"/>
  <rect x="8" y="7" width="12" height="13" rx="1.2" fill="${ink}" opacity="0.95"/>
  <g fill="${bg}">
    <rect x="9.6" y="9" width="2.6" height="2.6"/><rect x="13.6" y="9" width="2.6" height="2.6"/>
    <rect x="9.6" y="12.8" width="2.6" height="2.6"/><rect x="13.6" y="12.8" width="2.6" height="2.6"/>
    <rect x="9.6" y="16.6" width="2.6" height="2.6"/><rect x="13.6" y="16.6" width="2.6" height="2.6"/>
  </g>
  ${mine ? '<circle cx="22" cy="6.5" r="5.5" fill="#01354D" stroke="#fff" stroke-width="1.8"/>' : ""}
</svg>`.trim();
}

/**
 * 同座標的建案散開，不然疊在一起點不到。
 * 用 index 決定角度，同樣的資料每次都散在同樣的位置（不用亂數，畫面才不會跳）。
 */
function spread(list: Array<{ p: Project; lat: number; lng: number }>) {
  const seen = new Map<string, number>();
  return list.map(({ p, lat, lng }) => {
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    const i = seen.get(key) ?? 0;
    seen.set(key, i + 1);
    if (i === 0) return { p, lat, lng };
    const angle = (i * 2.399) % (Math.PI * 2); // 黃金角，散得比較開
    const r = 0.00035 + i * 0.00008;
    return { p, lat: lat + Math.sin(angle) * r, lng: lng + Math.cos(angle) * r };
  });
}

export default function LeafletMap({
  projects,
  selectedId,
  onSelect,
  mine = {},
}: {
  /** 要畫的建案（已經過篩選） */
  projects: Project[];
  selectedId: string | null;
  onSelect: (p: Project) => void;
  /** 建案 id → 在售物件數，有的話圖釘右上加一顆深藍點 */
  mine?: Record<string, number>;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMapType | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const firstFitRef = useRef(true);

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [fixMode, setFixMode] = useState(false);

  useEffect(() => {
    setFixMode(new URLSearchParams(window.location.search).get("fix") === "1");
  }, []);

  /* ── 建立地圖（只做一次）── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const L = (await import("leaflet")).default;
        if (cancelled || !boxRef.current || mapRef.current) return;
        LRef.current = L;

        const map = L.map(boxRef.current, {
          center: [MAP_CENTER.lat, MAP_CENTER.lng],
          zoom: 15,
          // 頁面往下捲時不要被地圖吃掉滾輪，要縮放用右下角的 ＋／−
          scrollWheelZoom: false,
        });
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 貢獻者',
        }).addTo(map);

        mapRef.current = map;
        setReady(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  /* ── 校正模式：點地圖吐座標 ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fixMode) return;
    const handler = (e: import("leaflet").LeafletMouseEvent) =>
      setPicked(`{ lat: ${e.latlng.lat.toFixed(5)}, lng: ${e.latlng.lng.toFixed(5)}, precision: "exact" },`);
    map.on("click", handler);
    return () => {
      map.off("click", handler);
    };
  }, [ready, fixMode]);

  /* ── 依 projects 重畫圖釘 ── */
  useEffect(() => {
    const map = mapRef.current;
    const L = LRef.current;
    if (!map || !L) return;

    for (const m of markersRef.current.values()) m.remove();
    markersRef.current.clear();

    const placed = projects
      .map((p) => {
        const c = COORDS[p.id];
        return c ? { p, lat: c.lat, lng: c.lng } : null;
      })
      .filter(Boolean) as Array<{ p: Project; lat: number; lng: number }>;

    const points: Array<[number, number]> = [];
    for (const { p, lat, lng } of spread(placed)) {
      const tone = TONE[p.status];
      const on = p.id === selectedId;
      const size = on ? [36, 44] : [28, 34];
      const marker = L.marker([lat, lng], {
        title: p.name,
        zIndexOffset: on ? 1000 : 0,
        icon: L.divIcon({
          className: styles.lmPin,
          html: buildingSvg(tone.bg, tone.ink, (mine[p.id] ?? 0) > 0, on),
          iconSize: size as [number, number],
          iconAnchor: [size[0] / 2, size[1]],
        }),
      })
        .addTo(map)
        .on("click", () => onSelect(p));
      markersRef.current.set(p.id, marker);
      points.push([lat, lng]);
    }

    // 只在第一次、或篩選讓範圍改變時重新框選。
    // 每次選取都 fitBounds 的話，點一個建案整張圖就跳一下，很煩。
    if (points.length && firstFitRef.current) {
      map.fitBounds(L.latLngBounds(points), { padding: [50, 50], maxZoom: 17 });
      firstFitRef.current = false;
    }
  }, [projects, selectedId, mine, onSelect, ready]);

  /* ── 外部選了某個建案（例如點下方清單）就飛過去 ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const c = COORDS[selectedId];
    if (!c) return;
    map.flyTo([c.lat, c.lng], Math.max(map.getZoom(), 16), { duration: 0.6 });
  }, [selectedId]);

  return (
    <div className={styles.lmMapCol}>
      <div ref={boxRef} className={styles.lmMap} role="application" aria-label="台中港市鎮中心建案地圖" />
      {failed && (
        <p className={styles.lmFail}>
          地圖載入失敗，可能是網路擋掉了圖磚。下方的建案清單不受影響，一樣看得到全部建案。
        </p>
      )}
      {!ready && !failed && <p className={styles.lmLoading}>地圖載入中…</p>}

      {fixMode && (
        <div className={styles.lmFix}>
          <b>座標校正模式</b>
          <p>在地圖上點建案的正確位置，下面會給你可以貼回 port-projects.ts 的一行。</p>
          <code>{picked ?? "（還沒點）"}</code>
        </div>
      )}
    </div>
  );
}

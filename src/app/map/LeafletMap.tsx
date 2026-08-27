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
 *
 * 4. **`?zones=1` 是商圈界線繪製模式**。商圈沒有官方界線，`port-zones.ts` 裡沙鹿那五塊
 *    是照真實地標圈出來的示意範圍；系統擁有者要調的話用這個模式在地圖上依序點，
 *    畫面會吐出可以直接貼回 `port-zones.ts` 的 `ring` 陣列。
 *    ⚠️ **畫出來的 ring 只能拿去換商圈。** 市鎮重劃區那塊是地政局公告的四至，
 *    貼上去等於把官方界線改成手畫的 —— 細節見 `port-zones.ts` 檔頭。
 */

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMapType, Marker } from "leaflet";
import { COORDS, MAP_CENTER, type Project, type ProjectStatus } from "@/data/port-projects";
import { ZONES, zoneBounds } from "@/data/port-zones";
import styles from "./Map.module.css";
// Leaflet 的樣式一定要在頂層 import。放進 useEffect 動態 import 不會生效，
// 圖磚會亂疊、控制項會跑版。
import "leaflet/dist/leaflet.css";

/**
 * 低於這個縮放層級就把 39 個建案收成一顆聚合圖示。
 * 14 是實測出來的分界：14 以上圖釘之間還有點得到的間距，13 就疊成一團。
 */
const CLUSTER_ZOOM = 14;

/**
 * 縮到聚合層級時，那顆膠囊上寫的字。
 *
 * **只寫名稱、不寫案數**（2026-08-27 系統擁有者指定，原本左邊掛一顆黃色數字徽章）——
 * 跟圖例「只標名稱、不標戶數」同一個規矩。
 *
 * 這串字跟 `port-zones.ts` 裡那塊 official 色塊是**同一個地方的同一個名字**，
 * 兩邊要一起改，不然縮放前後客戶會看到兩個名字。
 */
const DISTRICT_NAME = "梧棲清水市鎮重劃區";

/** 膠囊尺寸。跟 `.lmCluster` 的 width/height 一致（那邊是 border-box） */
const CLUSTER_SIZE: [number, number] = [150, 36];

/** 銷售階段配色，跟清單的 badge 同一組 */
const TONE: Record<ProjectStatus, { bg: string; ink: string }> = {
  presale: { bg: "#D9466F", ink: "#fff" },
  newly: { bg: "#1E6FA8", ink: "#fff" },
  completed: { bg: "#2F7A34", ink: "#fff" },
};

/**
 * 圖釘的畫布尺寸。**大樓本身還是 28x34**，但右上角要放星星，
 * 所以畫布往右往上各留一點：34x38，大樓整個往下移 4。
 *
 * ⚠️ `tipX` 是「針尖」在畫布上的 x（不再是正中央）。Leaflet 的 iconAnchor
 *    要用它換算，寫死 size[0]/2 的話針尖會偏掉，圖釘就不是指在那個地址上。
 */
const PIN_VB = { w: 34, h: 38, tipX: 14 } as const;

/**
 * 「我有物件在售」的黃色星星（2026-08-26 系統擁有者指定，原本是深藍圓點）。
 *
 * 畫兩次：先白色粗描邊當光暈，再畫黃色本體加細的深金色邊。
 * 只畫一次的話，遇到淺色底圖或綠色圖釘都會糊掉 —— 這顆星星的用途就是要一眼看見。
 */
// ⚠️ 白色光暈是 3.4 寬、往外突出 1.7，所以星星最高點要留在 y=2 而不是 y=1 ——
//    貼齊 y=1 的話光暈上緣會被畫布切掉一條（實測 -0.7）。
const STAR_POINTS =
  "24.5,2 26.5,6.75 31.63,7.18 27.73,10.55 28.91,15.57 24.5,12.9 20.09,15.57 21.27,10.55 17.37,7.18 22.5,6.75";

function buildingSvg(bg: string, ink: string, mine: boolean, on: boolean) {
  const scale = on ? 1.28 : 1;
  const w = Math.round(PIN_VB.w * scale);
  const h = Math.round(PIN_VB.h * scale);
  const star = mine
    ? `
  <polygon points="${STAR_POINTS}" fill="none" stroke="#fff" stroke-width="3.4" stroke-linejoin="round"/>
  <polygon points="${STAR_POINTS}" fill="#FFC107" stroke="#8A5B00" stroke-width="0.9" stroke-linejoin="round"/>`
    : "";
  return `
<svg width="${w}" height="${h}" viewBox="0 0 ${PIN_VB.w} ${PIN_VB.h}" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(0,4)">
    <path d="M14 34c0 0-10.5-11.5-10.5-19.5A10.5 10.5 0 0 1 24.5 14.5C24.5 22.5 14 34 14 34z"
          fill="${bg}" stroke="${on ? "#01354D" : "#fff"}" stroke-width="${on ? 2.6 : 1.8}"/>
    <rect x="8" y="7" width="12" height="13" rx="1.2" fill="${ink}" opacity="0.95"/>
    <g fill="${bg}">
      <rect x="9.6" y="9" width="2.6" height="2.6"/><rect x="13.6" y="9" width="2.6" height="2.6"/>
      <rect x="9.6" y="12.8" width="2.6" height="2.6"/><rect x="13.6" y="12.8" width="2.6" height="2.6"/>
      <rect x="9.6" y="16.6" width="2.6" height="2.6"/><rect x="13.6" y="16.6" width="2.6" height="2.6"/>
    </g>
  </g>${star}
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

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [fixMode, setFixMode] = useState(false);
  const [zoneMode, setZoneMode] = useState(false);
  /**
   * 目前縮放層級。**只用來決定「39 個圖釘」還是「一顆聚合圖示」**。
   *
   * 為什麼需要：地圖現在要框住整個生活圈（含沙鹿三個商圈），縮到那個層級時
   * 那 39 個建案全擠在 72x62 像素裡 —— 實測 141 對圖釘距離不到 20px、
   * 最近的只差 3px，等於一坨黑點，一案都點不到。
   * 系統擁有者的參考圖（樂居生活圈圖）也是把市鎮中心畫成一塊，不是 39 個點。
   */
  const [zoom, setZoom] = useState(CLUSTER_ZOOM);
  const [ring, setRing] = useState<Array<[number, number]>>([]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setFixMode(q.get("fix") === "1");
    setZoneMode(q.get("zones") === "1");
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

        // 初始視野：一次框住 39 個建案**與**三塊商圈色塊。
        //
        // ⚠️ 這件事一定要在「建立地圖」這裡做，不能放到畫圖釘那個 effect。
        //    踩過的坑：放在那邊時，React 嚴格模式會讓元件掛載兩次，
        //    fitBounds 有機會被呼叫在**已經 remove() 掉的那個地圖實例**上 ——
        //    完全沒有作用，也不會報錯，畫面就停在初始的 zoom 15。
        //    （debug 到最後才發現：傳進去的 bounds 是對的，getZoom() 卻沒變。）
        //
        // 用 COORDS 全部 39 筆而不是篩選後的 projects —— 初始視野不該被篩選影響。
        map.fitBounds(
          L.latLngBounds([
            ...Object.values(COORDS).map((c) => [c.lat, c.lng] as [number, number]),
            ...zoneBounds(),
          ]),
          // ⚠️ `animate: false` 不是可有可無的。Leaflet 的縮放是 CSS transition，
          //    靠 transitionend 收尾；只要地圖當下沒有在合成畫面（背景分頁、
          //    預覽面板沒顯示、某些嵌入情境），那個事件永遠不會來，動畫就卡在半路，
          //    getZoom() 一直回舊值，**畫面停在初始視野而且完全不報錯**。
          //    初始視野本來就不需要動畫，直接跳過去最穩。
          { padding: [30, 30], maxZoom: 16, animate: false }
        );

        map.on("zoomend", () => setZoom(map.getZoom()));
        setZoom(map.getZoom());

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

  /* ── 範圍色塊（跟建案篩選無關）── */
  useEffect(() => {
    const map = mapRef.current;
    const L = LRef.current;
    if (!map || !L) return;
    const layers = ZONES.map((z) => {
      const poly = L.polygon(z.ring, {
        color: z.color,
        // 官方界線畫粗框、示意商圈畫細框 —— 客戶會把界線清楚那塊當成法定範圍，
        // 兩種混在同一張圖上就要看得出差別（見 port-zones.ts 檔頭）
        //
        // ⚠️ 2026-08-27 系統擁有者指定：官方界線改回實線，不要 dashArray。
        //    所以現在兩種的差別只剩粗細與顏色，別自己把虛線加回來。
        weight: z.official ? 3 : 2,
        // 填色要夠淡，色塊是背景不是主角 —— 太濃會把上面的建案圖釘吃掉
        fillColor: z.color,
        fillOpacity: 0.16,
        // 色塊不吃滑鼠事件：不然想點色塊裡的圖釘會先點到色塊
        interactive: false,
      }).addTo(map);

      // ⚠️ 縮到聚合層級時，重劃區的名字改由那顆膠囊來寫。
      //    兩個標籤都落在色塊正中央（膠囊釘在 MAP_CENTER，tooltip 在多邊形中心，
      //    zoom 13 時只差 3～4 px），同時掛就是兩行字疊在一起糊成一團。
      if (!(z.official && zoom < CLUSTER_ZOOM)) {
        poly.bindTooltip(z.name, {
          permanent: true,
          direction: "center",
          className: styles.lmZoneLabel,
        });
      }
      return poly;
    });
    return () => {
      for (const l of layers) l.remove();
    };
  }, [ready, zoom]);

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

  /* ── 商圈繪製模式：依序點，湊出一個 ring ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !zoneMode) return;
    const handler = (e: import("leaflet").LeafletMouseEvent) =>
      setRing((r) => [...r, [+e.latlng.lat.toFixed(4), +e.latlng.lng.toFixed(4)]]);
    map.on("click", handler);
    return () => {
      map.off("click", handler);
    };
  }, [ready, zoneMode]);

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

    // 縮得太遠就收成一顆，點了才展開 —— 理由見 CLUSTER_ZOOM 的註解
    if (zoom < CLUSTER_ZOOM && placed.length > 1) {
      const cluster = L.marker([MAP_CENTER.lat, MAP_CENTER.lng], {
        // 這裡也不寫案數 —— 滑上去跳出來的字一樣算「顯示」
        title: `${DISTRICT_NAME}，點開看區內建案`,
        zIndexOffset: 800,
        icon: L.divIcon({
          className: styles.lmCluster,
          html: DISTRICT_NAME,
          iconSize: CLUSTER_SIZE,
          iconAnchor: [CLUSTER_SIZE[0] / 2, CLUSTER_SIZE[1] / 2],
        }),
      })
        .addTo(map)
        // animate:false 的理由跟初始視野同一個（見上面那段註解）
        .on("click", () => map.setView([MAP_CENTER.lat, MAP_CENTER.lng], 15, { animate: false }));
      markersRef.current.set("__cluster__", cluster);
      return;
    }

    for (const { p, lat, lng } of spread(placed)) {
      const tone = TONE[p.status];
      const on = p.id === selectedId;
      // 有星星的畫布是 34x38（見 PIN_VB），選中放大 1.28 倍
      const size: [number, number] = on
        ? [Math.round(PIN_VB.w * 1.28), Math.round(PIN_VB.h * 1.28)]
        : [PIN_VB.w, PIN_VB.h];
      const hasMine = (mine[p.id] ?? 0) > 0;
      const marker = L.marker([lat, lng], {
        title: p.name,
        // 有星星的往上疊 —— 星星在右上角，很容易被右上方那顆圖釘蓋掉，
        // 而那顆星星正是這張地圖上最該被看見的東西。
        zIndexOffset: on ? 1000 : hasMine ? 500 : 0,
        icon: L.divIcon({
          className: styles.lmPin,
          html: buildingSvg(tone.bg, tone.ink, hasMine, on),
          iconSize: size,
          // ⚠️ 不是 size[0]/2 —— 畫布右上角多留了空間給星星，針尖不在正中央。
          //    寫死一半的話圖釘會往右偏，等於指錯地址。
          iconAnchor: [(size[0] * PIN_VB.tipX) / PIN_VB.w, size[1]],
        }),
      })
        .addTo(map)
        .on("click", () => onSelect(p));
      markersRef.current.set(p.id, marker);
    }

    // 初始視野在「建立地圖」那一步就框好了（含商圈），這裡只管畫圖釘。
  }, [projects, selectedId, mine, onSelect, ready, zoom]);

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

      {zoneMode && (
        <div className={styles.lmFix}>
          <b>商圈界線繪製模式</b>
          <p>
            沿著商圈邊界依序點（不用回到起點，會自動閉合）。點完把下面整段貼給我，
            我換掉 port-zones.ts 裡那一塊的 ring。
          </p>
          <code>
            {ring.length === 0
              ? "（還沒點）"
              : "ring: [" + ring.map(([a, b]) => `[${a}, ${b}]`).join(", ") + "],"}
          </code>
          <button type="button" onClick={() => setRing([])}>
            {`清空重畫（目前 ${ring.length} 點）`}
          </button>
        </div>
      )}
    </div>
  );
}

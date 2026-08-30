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
 * 4. **`?zones=1` 是商圈界線繪製模式**。商圈沒有官方界線，`port-zones.ts` 裡那五塊
 *    非官方色塊**全部是系統擁有者本人用這個模式點出來的**（2026-08-27 完成，
 *    在此之前是我照地標圈的示意方框）。用這個模式在地圖上依序點，
 *    畫面會吐出可以直接貼回 `port-zones.ts` 的 `ring` 陣列。
 *    ⚠️ 收到的 ring 要先檢查**自我交叉**：他繞回起點時容易多點幾下，
 *    多邊形打結色塊就會破圖（新光田那次 32 點裡有 3 點要拿掉）。
 *    ⚠️ **畫出來的 ring 只能拿去換商圈。** 市鎮重劃區那塊是地政局公告的四至，
 *    貼上去等於把官方界線改成手畫的 —— 細節見 `port-zones.ts` 檔頭。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as LeafletMapType, Marker } from "leaflet";
import {
  AREA_FILTERS,
  AREA_LABEL,
  COORDS,
  MAP_CENTER,
  PROJECTS,
  type Project,
  type ProjectArea,
  type ProjectStatus,
} from "@/data/port-projects";
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

/**
 * 縮到聚合層級時，圖釘要收成**哪幾顆**膠囊。一個 group 一顆。
 *
 * ## 為什麼是多顆，不是一顆
 *
 * 初始視野框的是整個海線生活圈（圖釘＋六塊色塊，對角 10.6 km），實測落在
 * **zoom 12**，本來就低於 `CLUSTER_ZOOM` —— 也就是說「膠囊」不是縮到很遠才
 * 會看到的東西，**那就是客戶進來的第一眼**。
 *
 * 只做一顆的話，沙鹿建案一進來就會被吞進「梧棲清水市鎮重劃區」這顆膠囊：
 * 名字是錯的（沙鹿不在重劃區），釘的位置也是錯的（釘在重劃區重心，離沙鹿
 * 六公里）。而且**不會報錯**，畫面看起來還很正常。
 *
 * ## 沙鹿建案進來時要做的事
 *
 * 只要把下面那行註解打開。`areas` 對應 `ProjectArea`，新增區域一定要一起加進來
 * —— 沒加進來的不會消失（會退回畫成圖釘，見 `buildClusters`），但就沒有膠囊。
 *
 * ⚠️ `name` 若跟 `port-zones.ts` 的色塊同名，那塊色塊的 tooltip 會**自動讓位**
 *    （兩個標籤都落在色塊中央，同時掛就是兩行字疊在一起糊成一團）。
 *    所以改名要兩邊一起改，`buildClusters` 的結果同時餵給圖釘與色塊兩個 effect。
 *
 * ⚠️ **兩個 group 的重心太近，膠囊就會疊在一起**（膠囊是 150x36，沒有閃避邏輯）。
 *    實測：拿梧棲／清水硬拆成兩組時重心只差 25x26 px，整個疊住。
 *    沙鹿那組算過沒問題 —— 重心距重劃區 6.17 km，zoom 12 換算相距 109x140 px，
 *    垂直 140 遠大於 36，不會疊。**再加第三組之前先算一次這個距離。**
 */
const PIN_GROUPS: ReadonlyArray<{ id: string; name: string; areas: readonly ProjectArea[] }> = [
  { id: "shizheng", name: DISTRICT_NAME, areas: ["梧棲", "清水"] },
  // ⚠️ 名字刻意用色塊的「沙鹿火車站商圈」，不是篩選臉的「沙鹿車站商圈」（差一個「火」）。
  //    實測膠囊重心與那塊色塊的中心在 zoom 12 只差 19x8 px、zoom 13 差 37x16 px ——
  //    膠囊 150x36，兩個標籤一定疊住。**同名才會讓色塊的字自動讓位**（見上面那條）。
  //    要改成跟篩選臉一致之前，先想好疊字怎麼解。
  { id: "shalu", name: "沙鹿火車站商圈", areas: ["沙鹿車站"] },
  // 2026-08-27 補的位子。名字同樣用色塊上的字（這裡剛好跟篩選臉一致），
  // 這樣有 2 案以上時膠囊出現，色塊的字才會自動讓位、不會疊字。
  // 現在 0 案，MIN_CLUSTER 會直接略過這組，畫面上什麼都不會多出來。
  // 2026-08-27 補進 64 案，膠囊要跟著開。名字用色塊上的字（這裡跟篩選臉一致），
  // 同名色塊的字才會自動讓位、不會疊字。
  { id: "luliao", name: "鹿寮萬家福商圈", areas: ["鹿寮萬家福"] },
  { id: "beishi", name: "北勢靜宜商圈", areas: ["北勢靜宜"] },
];

/** 一顆膠囊至少要代表這麼多案。只剩一案還畫成 150px 的膠囊，不如直接畫那根圖釘 */
const MIN_CLUSTER = 2;

type Placed = { p: Project; lat: number; lng: number };
type Cluster = { id: string; name: string; lat: number; lng: number; members: Placed[] };

/**
 * 算出這個縮放層級下要畫幾顆膠囊、剩下哪些照常畫圖釘。
 *
 * 純函式、不碰 Leaflet —— 圖釘那個 effect 跟色塊那個 effect 要看**同一份**結果，
 * 各算各的就會出現「膠囊蓋著色塊、色塊的字卻還在」這種疊字畫面。
 */
function buildClusters(placed: Placed[], zoom: number): { clusters: Cluster[]; loose: Placed[] } {
  // 放得夠大就不聚合，全部照常畫
  if (zoom >= CLUSTER_ZOOM) return { clusters: [], loose: placed };

  const clusters: Cluster[] = [];
  const taken = new Set<Placed>();

  for (const g of PIN_GROUPS) {
    const members = placed.filter((x) => g.areas.includes(x.p.area));
    if (members.length < MIN_CLUSTER) continue;
    for (const x of members) taken.add(x);
    clusters.push({
      id: g.id,
      name: g.name,
      // 重心用實際圖釘現算，不寫死一個點 —— 寫死的話補了建案、或某一區的案子
      // 補上座標之後，膠囊還是釘在舊位置，而且不會報錯。
      lat: members.reduce((s, x) => s + x.lat, 0) / members.length,
      lng: members.reduce((s, x) => s + x.lng, 0) / members.length,
      members,
    });
  }

  // ⚠️ 沒被任何 group 認領的（`ProjectArea` 加了新區、卻忘了加進 `PIN_GROUPS`），
  //    一律退回畫成圖釘。擠一點但看得到，好過默默消失 —— 這頁的失敗模式一向是
  //    「靜默失效」，寧可醜也不要不見。
  return { clusters, loose: placed.filter((x) => !taken.has(x)) };
}

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
  /**
   * 校正模式收集到的座標。**2026-08-27 從「一次只顯示一筆」改成累積** ——
   * 舊版每點一下就蓋掉上一筆，系統擁有者要標 64 案就得來回複製 64 次。
   */
  const [fixList, setFixList] = useState<Array<{ id: string; name: string; lat: number; lng: number }>>([]);
  /** 目前要標的建案 id。點一下地圖之後會自動跳到下一個還沒座標的案子 */
  const [fixTarget, setFixTarget] = useState<string>("");
  /**
   * 給地圖 click handler 讀的 `fixTarget`。
   *
   * ⚠️ 不能直接在 handler 裡用 state —— 那個 effect 的相依只有 [ready, fixMode]，
   *    handler 會閉包住第一次的 fixTarget，永遠標到同一案。把相依加上 fixTarget
   *    也可以，但每換一次建案就要 off/on 一次事件，用 ref 乾淨。
   */
  const fixTargetRef = useRef("");
  fixTargetRef.current = fixTarget;
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

  /**
   * 標得出位置的建案 ＋ 這個縮放層級下的聚合結果。
   *
   * 畫圖釘與畫色塊是兩個 effect，但**必須看同一份聚合結果** —— 各算各的就會
   * 出現「膠囊蓋在色塊上、色塊自己的字也還在」的疊字畫面。
   */
  const placed = useMemo(
    () =>
      projects
        .map((p) => {
          const c = COORDS[p.id];
          return c ? { p, lat: c.lat, lng: c.lng } : null;
        })
        .filter(Boolean) as Placed[],
    [projects]
  );
  const { clusters, loose } = useMemo(() => buildClusters(placed, zoom), [placed, zoom]);

  /**
   * 校正模式的建案下拉。**還沒有座標的排前面**（那才是要標的），已經有的排後面
   * 並標「已標」—— 舊座標要修正時也找得到。
   *
   * 用全部 PROJECTS 而不是傳進來的 `projects`：`projects` 是篩選後的清單，
   * 忘了切篩選臉就會有一半建案選不到。
   */
  const fixOptions = useMemo(() => {
    const done = new Set(fixList.map((x) => x.id));
    // 同一區排在一起。PROJECTS 是照建商分組的，直接用它的順序會在區之間跳來跳去，
    // 標 64 案時等於地圖要一直大幅移動。
    const areaOrder = AREA_FILTERS.map((f) => f.value);
    return PROJECTS.map((x) => {
      const has = !!COORDS[x.id];
      return {
        id: x.id,
        has,
        area: x.area,
        name: x.name,
        label:
          `${AREA_LABEL[x.area]}｜${x.name}` +
          (done.has(x.id) ? "（這次已點）" : has ? "（已標）" : ""),
      };
    }).sort(
      (a, b) =>
        Number(a.has) - Number(b.has) ||
        areaOrder.indexOf(a.area) - areaOrder.indexOf(b.area) ||
        a.name.localeCompare(b.name, "zh-Hant")
    );
  }, [fixList]);

  /**
   * 點完一案就自動跳到下一個「還沒座標、這次也還沒點」的建案。
   * 沒有這段的話每點一下都要回去手動換建案，64 案會點到不想點。
   */
  useEffect(() => {
    if (!fixMode) return;
    const done = new Set(fixList.map((x) => x.id));
    if (fixTarget && !done.has(fixTarget)) return;
    // 照下拉的順序找下一個（同區排在一起），不要用 PROJECTS 的原始順序
    const next = fixOptions.find((x) => !x.has && !done.has(x.id));
    setFixTarget(next ? next.id : "");
  }, [fixMode, fixList, fixTarget, fixOptions]);

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
    // 這個縮放層級下有膠囊的區名。同名的色塊要把自己的 tooltip 讓出來。
    const capsuleNames = new Set(clusters.map((c) => c.name));
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

      // ⚠️ 有同名膠囊蓋在上面時，這塊色塊的名字改由膠囊來寫。
      //    兩個標籤都落在色塊正中央（膠囊釘在成員圖釘的重心，tooltip 在多邊形
      //    中心，zoom 13 時只差 3～4 px），同時掛就是兩行字疊在一起糊成一團。
      //
      //    以名字比對而不是看 `z.official`：篩選後某一區只剩一案時就不會畫膠囊
      //    （見 MIN_CLUSTER），這時色塊的字必須自己出現，不然那塊就變成無名色塊。
      if (!capsuleNames.has(z.name)) {
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
  }, [ready, zoom, clusters]);

  /* ── 校正模式：點地圖收座標（會累積）── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fixMode) return;
    const handler = (e: import("leaflet").LeafletMouseEvent) => {
      setFixList((list) => {
        const id = fixTargetRef.current;
        if (!id) return list;
        const p = PROJECTS.find((x) => x.id === id);
        if (!p) return list;
        // 同一案再點一次就覆蓋，不要留兩筆
        const next = list.filter((x) => x.id !== id);
        next.push({ id, name: p.name, lat: +e.latlng.lat.toFixed(5), lng: +e.latlng.lng.toFixed(5) });
        return next;
      });
    };
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

    // 縮得太遠就一區收成一顆膠囊，點了才展開 —— 理由見 PIN_GROUPS 的註解。
    // 沒被任何 group 認領的仍然照常畫圖釘（`loose`），不會消失。
    for (const c of clusters) {
      const cluster = L.marker([c.lat, c.lng], {
        // 這裡也不寫案數 —— 滑上去跳出來的字一樣算「顯示」
        title: `${c.name}，點開看這一區的建案`,
        zIndexOffset: 800,
        icon: L.divIcon({
          className: styles.lmCluster,
          html: c.name,
          iconSize: CLUSTER_SIZE,
          iconAnchor: [CLUSTER_SIZE[0] / 2, CLUSTER_SIZE[1] / 2],
        }),
      })
        .addTo(map)
        // 展開到「這一區」而不是寫死的中心點＋zoom 15：點沙鹿那顆就該落在沙鹿。
        // animate:false 的理由跟初始視野同一個（見上面那段註解）。
        .on("click", () =>
          map.fitBounds(
            L.latLngBounds(c.members.map((m) => [m.lat, m.lng] as [number, number])),
            { padding: [40, 40], maxZoom: 16, animate: false }
          )
        );
      markersRef.current.set(`__cluster_${c.id}__`, cluster);
    }

    for (const { p, lat, lng } of spread(loose)) {
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
    // `projects` 與 `zoom` 不在相依裡是對的 —— 兩者都已經吃進 clusters／loose 了
    // （見上面的 useMemo），再列一次只會多重畫一輪。
  }, [clusters, loose, selectedId, mine, onSelect, ready]);

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
          <p>
            先在下面選建案，再到地圖上點它的位置。
            <b>點完會自動跳到下一個還沒座標的案子</b>，所以可以一直點下去，
            最後整段複製一次給我就好。同一案再點一次會覆蓋，不會留兩筆。
          </p>
          <select
            className={styles.lmFixPick}
            value={fixTarget}
            onChange={(e) => setFixTarget(e.target.value)}
          >
            <option value="">（選一個建案）</option>
            {fixOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <code>
            {fixList.length === 0
              ? "（還沒點）"
              : fixList
                  .map((x) => `"${x.id}": { lat: ${x.lat}, lng: ${x.lng}, precision: "exact" }, // ${x.name}`)
                  .join(String.fromCharCode(10))}
          </code>
          <button type="button" onClick={() => setFixList((l) => l.slice(0, -1))}>
            {`刪掉最後一筆（目前 ${fixList.length} 筆）`}
          </button>
          <button type="button" onClick={() => setFixList([])}>
            全部清空
          </button>
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

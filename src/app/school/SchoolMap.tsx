"use client";

/**
 * 學區查詢的地圖：畫出台中市 625 個里的邊界，點哪個里就回報哪個里；
 * 也能用手機定位找出所在的里。
 *
 * 里界 GeoJSON（約 800KB）只在這個元件掛上去時才抓，選下拉的人不用付這個流量。
 * Leaflet 本體照 /map 的做法：CSS 在頂層 import、JS 在 effect 裡動態載入。
 */
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMapType, GeoJSON as LeafletGeoJSON, Marker, Layer } from "leaflet";
import "leaflet/dist/leaflet.css";
import styles from "./school.module.css";

export interface LiRef {
  district: string;
  li: string;
}

interface VillageProps {
  c: string;
  t: string;
  v: string;
}

type Ring = Array<[number, number]>;
interface VillageFeature {
  type: "Feature";
  properties: VillageProps;
  geometry: { type: "Polygon"; coordinates: Ring[] } | { type: "MultiPolygon"; coordinates: Ring[][] };
}
interface VillageCollection {
  type: "FeatureCollection";
  features: VillageFeature[];
}

const GEOJSON_URL = "/data/taichung-villages.geojson";
/** 台中市區到海線都看得到的初始視野 */
const INITIAL_CENTER: [number, number] = [24.2, 120.62];
const INITIAL_ZOOM = 11;

function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lng: number, lat: number, rings: Ring[]): boolean {
  if (rings.length === 0 || !pointInRing(lng, lat, rings[0])) return false;
  for (let k = 1; k < rings.length; k++) if (pointInRing(lng, lat, rings[k])) return false;
  return true;
}

export function villageAt(collection: VillageCollection, lng: number, lat: number): VillageProps | null {
  for (const f of collection.features) {
    const g = f.geometry;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    for (const poly of polys) if (pointInPolygon(lng, lat, poly)) return f.properties;
  }
  return null;
}

const BASE_STYLE = { color: "#5A7A8C", weight: 1, opacity: 0.55, fillColor: "#5A7A8C", fillOpacity: 0.04 };
const SELECTED_STYLE = { color: "#1D5C76", weight: 2.5, opacity: 1, fillColor: "#1D5C76", fillOpacity: 0.28 };
const SCHOOL_STYLE = { color: "#C77700", weight: 1.5, opacity: 0.9, fillColor: "#F2B84B", fillOpacity: 0.22 };
const SCHOOL_PART_STYLE = { color: "#C77700", weight: 1.5, opacity: 0.9, fillColor: "#F2B84B", fillOpacity: 0.1, dashArray: "4 3" };
/** 路名查出來「可能是這幾個里」：紫色，跟學區的黃色、選到的藍色分開 */
const CANDIDATE_STYLE = { color: "#6b21a8", weight: 2, opacity: 0.95, fillColor: "#a78bfa", fillOpacity: 0.22 };

export default function SchoolMap({
  selected,
  schoolLis,
  candidates = [],
  onPick,
  focusToken,
}: {
  /** 目前選的里；由下拉或地圖改都會進來 */
  selected: LiRef | null;
  /** 要整片標出來的學區（某所學校的所有里） */
  schoolLis: Array<LiRef & { whole: boolean }>;
  /** 路名查出來的候選里（一條路經過好幾個里時），紫色標出來讓客戶點 */
  candidates?: LiRef[];
  onPick: (li: LiRef, source: "map" | "geo") => void;
  /** 每次從下拉換里就加一，地圖才知道要飛過去（地圖上自己點的不用飛） */
  focusToken: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMapType | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const layerRef = useRef<LeafletGeoJSON | null>(null);
  const dataRef = useRef<VillageCollection | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const byKeyRef = useRef<Map<string, Layer>>(new Map());
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [geoMsg, setGeoMsg] = useState<string>("");

  /* ── 建地圖＋載里界（只做一次）── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ default: L }, res] = await Promise.all([import("leaflet"), fetch(GEOJSON_URL)]);
        if (!res.ok) throw new Error(`geojson ${res.status}`);
        const data = (await res.json()) as VillageCollection;
        if (cancelled || !boxRef.current || mapRef.current) return;
        LRef.current = L;
        dataRef.current = data;

        const map = L.map(boxRef.current, {
          center: INITIAL_CENTER,
          zoom: INITIAL_ZOOM,
          // 頁面往下捲時不要被地圖吃掉滾輪，縮放用右下角的＋／－或手指
          scrollWheelZoom: false,
        });
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 貢獻者',
        }).addTo(map);

        const layer = L.geoJSON(data as never, {
          style: () => BASE_STYLE,
          onEachFeature: (feature, lyr) => {
            const p = (feature as VillageFeature).properties;
            byKeyRef.current.set(`${p.t}${p.v}`, lyr);
            lyr.on("click", () => onPickRef.current({ district: p.t, li: p.v }, "map"));
          },
        }).addTo(map);
        layerRef.current = layer;
        mapRef.current = map;
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("failed");
      }
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
      byKeyRef.current.clear();
    };
  }, []);

  /* ── 重畫樣式：選到的里最深、學校的學區淺色 ── */
  useEffect(() => {
    const L = LRef.current;
    const layer = layerRef.current;
    if (!L || !layer || status !== "ready") return;
    const schoolKeys = new Map(schoolLis.map((s) => [`${s.district}${s.li}`, s.whole]));
    const candidateKeys = new Set(candidates.map((c) => `${c.district}${c.li}`));
    const selectedKey = selected ? `${selected.district}${selected.li}` : null;
    layer.eachLayer((lyr) => {
      const f = (lyr as unknown as { feature: VillageFeature }).feature;
      const key = `${f.properties.t}${f.properties.v}`;
      const path = lyr as unknown as { setStyle: (s: object) => void; bringToFront?: () => void };
      if (key === selectedKey) path.setStyle(SELECTED_STYLE);
      else if (schoolKeys.has(key)) path.setStyle(schoolKeys.get(key) ? SCHOOL_STYLE : SCHOOL_PART_STYLE);
      else if (candidateKeys.has(key)) path.setStyle(CANDIDATE_STYLE);
      else path.setStyle(BASE_STYLE);
    });
    for (const key of candidateKeys) {
      const lyr = byKeyRef.current.get(key) as unknown as { bringToFront?: () => void } | undefined;
      lyr?.bringToFront?.();
    }
    if (selectedKey) {
      const lyr = byKeyRef.current.get(selectedKey) as unknown as { bringToFront?: () => void } | undefined;
      lyr?.bringToFront?.();
    }
  }, [selected, schoolLis, candidates, status]);

  /* ── 路名的候選里 → 框住它們 ── */
  useEffect(() => {
    const map = mapRef.current;
    const L = LRef.current;
    if (!map || !L || status !== "ready" || candidates.length === 0) return;
    let bounds: import("leaflet").LatLngBounds | null = null;
    for (const c of candidates) {
      const lyr = byKeyRef.current.get(`${c.district}${c.li}`) as unknown as
        | { getBounds?: () => import("leaflet").LatLngBounds }
        | undefined;
      const b = lyr?.getBounds?.();
      if (!b) continue;
      bounds = bounds ? bounds.extend(b) : L.latLngBounds(b.getSouthWest(), b.getNorthEast());
    }
    if (bounds) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15, animate: false });
  }, [candidates, status]);

  /* ── 從下拉換里 → 飛過去 ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready" || !selected) return;
    const lyr = byKeyRef.current.get(`${selected.district}${selected.li}`) as unknown as
      | { getBounds?: () => import("leaflet").LatLngBounds }
      | undefined;
    const bounds = lyr?.getBounds?.();
    if (bounds) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15, animate: false });
    // focusToken 變了才飛（地圖上點的那次不飛），selected 只是拿來查 bounds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusToken, status]);

  /* ── 學校整片學區 → 框住它 ── */
  useEffect(() => {
    const map = mapRef.current;
    const L = LRef.current;
    if (!map || !L || status !== "ready" || schoolLis.length === 0) return;
    let bounds: import("leaflet").LatLngBounds | null = null;
    for (const s of schoolLis) {
      const lyr = byKeyRef.current.get(`${s.district}${s.li}`) as unknown as
        | { getBounds?: () => import("leaflet").LatLngBounds }
        | undefined;
      const b = lyr?.getBounds?.();
      if (!b) continue;
      bounds = bounds ? bounds.extend(b) : L.latLngBounds(b.getSouthWest(), b.getNorthEast());
    }
    if (bounds) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15, animate: false });
  }, [schoolLis, status]);

  const locate = () => {
    const map = mapRef.current;
    const L = LRef.current;
    const data = dataRef.current;
    if (!map || !L || !data) return;
    if (!("geolocation" in navigator)) {
      setGeoMsg("這個瀏覽器不支援定位，請在地圖上直接點你的位置。");
      return;
    }
    setGeoMsg("定位中…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const hit = villageAt(data, lng, lat);
        if (markerRef.current) markerRef.current.remove();
        markerRef.current = L.circleMarker([lat, lng], {
          radius: 8,
          color: "#fff",
          weight: 2,
          fillColor: "#B42318",
          fillOpacity: 1,
        }).addTo(map) as unknown as Marker;
        map.setView([lat, lng], 15, { animate: false });
        if (hit) {
          setGeoMsg(`你現在在 ${hit.t}${hit.v}（定位誤差約 ${Math.round(pos.coords.accuracy)} 公尺）`);
          onPickRef.current({ district: hit.t, li: hit.v }, "geo");
        } else {
          setGeoMsg("定位到的位置不在台中市範圍內，請在地圖上直接點你的位置。");
        }
      },
      (err) => {
        setGeoMsg(
          err.code === err.PERMISSION_DENIED
            ? "沒有取得定位權限。可以在地圖上直接點你的位置。"
            : "定位失敗，請在地圖上直接點你的位置。",
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  };

  return (
    <div className={styles.mapWrap}>
      <div className={styles.mapBar}>
        <button type="button" className={styles.mapBtn} onClick={locate} disabled={status !== "ready"}>
          📍 用我現在的位置
        </button>
        <span className={styles.mapHint}>
          {status === "loading" ? "載入里界中…" : status === "failed" ? "地圖載入失敗，請改用上面的下拉選單。" : "或直接在地圖上點你家的位置"}
        </span>
      </div>
      <div ref={boxRef} className={styles.mapBox} aria-label="台中市里界地圖" />
      {geoMsg ? <p className={styles.geoMsg}>{geoMsg}</p> : null}
    </div>
  );
}

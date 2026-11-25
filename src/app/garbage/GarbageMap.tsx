"use client";

/**
 * 垃圾車查詢的地圖：查詢位置一個點、附近的收運點各一顆有編號的圖釘（編號跟下面清單一致）。
 * Leaflet 照 /map、/school 的做法：CSS 在頂層 import、JS 在 effect 裡動態載入。
 */
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMapType, LayerGroup } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLng, Place } from "@/lib/garbage-truck";
import styles from "./garbage.module.css";

export default function GarbageMap({
  origin,
  places,
  activeKey,
  onPick,
}: {
  origin: LatLng;
  places: Place[];
  activeKey: string | null;
  onPick: (key: string) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMapType | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const groupRef = useRef<LayerGroup | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { default: L } = await import("leaflet");
        if (cancelled || !boxRef.current || mapRef.current) return;
        LRef.current = L;
        const map = L.map(boxRef.current, {
          center: [origin.lat, origin.lng],
          zoom: 16,
          // 頁面往下捲時不要被地圖吃掉滾輪
          scrollWheelZoom: false,
        });
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 貢獻者',
        }).addTo(map);
        groupRef.current = L.layerGroup().addTo(map);
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
    };
    // 地圖只建一次；位置與圖釘由下面那個 effect 更新
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const group = groupRef.current;
    if (!ready || !L || !map || !group) return;
    group.clearLayers();
    const points: Array<[number, number]> = [[origin.lat, origin.lng]];
    L.circleMarker([origin.lat, origin.lng], {
      radius: 9,
      color: "#fff",
      weight: 3,
      fillColor: "#1D5C76",
      fillOpacity: 1,
    })
      .bindTooltip("查詢的位置")
      .addTo(group);
    places.forEach((p, i) => {
      if (!p.at) return;
      const key = `${p.district}|${p.caption}`;
      points.push([p.at.lat, p.at.lng]);
      L.marker([p.at.lat, p.at.lng], {
        icon: L.divIcon({
          className: "",
          html: `<span class="${styles.pin} ${key === activeKey ? styles.pinOn : ""}">${i + 1}</span>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
        zIndexOffset: key === activeKey ? 1000 : 0,
        title: p.caption,
      })
        .on("click", () => onPickRef.current(key))
        .addTo(group);
    });
    return undefined;
  }, [ready, origin.lat, origin.lng, places, activeKey]);

  /* 換了查詢位置才重新對焦（滑過清單換顏色時不要動視野） */
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;
    const points: Array<[number, number]> = [[origin.lat, origin.lng]];
    for (const p of places) if (p.at) points.push([p.at.lat, p.at.lng]);
    map.invalidateSize();
    if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 17 });
    else map.setView(points[0], 16);
  }, [ready, origin.lat, origin.lng, places]);

  if (failed) return null;
  return <div ref={boxRef} className={styles.map} aria-label="附近收運點地圖" />;
}

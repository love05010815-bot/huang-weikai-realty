"use client";

/**
 * 台中港市鎮中心 —— 建案實景地圖
 *
 * OpenStreetMap 底圖 ＋ 大樓圖示標在建案的真實座標上，點圖示看建案資訊。
 *
 * ## 幾個刻意的決定
 *
 * 1. **Leaflet 用動態 import**，因為它在載入時就會碰 `window`，在伺服器端會炸。
 *    整包只在瀏覽器端載，所以這張地圖不會出現在 SSR 的 HTML 裡 ——
 *    SEO 靠下面那個「建案總覽」清單（那是伺服器渲染的），不靠地圖。
 *
 * 2. **座標精度會顯示出來**。OSM 在台灣沒有門牌級資料，只有巷弄的位置比較準，
 *    只知道路名的就會有一兩個街廓的誤差。標成「約略位置」，不要讓客戶以為是精確的。
 *
 * 3. **同座標的建案會自動散開**。有兩案都只查到「港新三路」，不散開會疊在一起點不到。
 *    散開是視覺處理，不是位置資料 —— 所以只動畫面，不動 COORDS。
 *
 * 4. **`?fix=1` 是座標校正模式**（不對外，網址加參數才會出現）。
 *    在地圖上點正確位置，畫面給一行可以貼回 `port-projects.ts` 的程式碼。
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
// Leaflet 的樣式一定要在頂層 import（App Router 允許 client component 引 node_modules 的 CSS）。
// 放進 useEffect 裡動態 import 不會生效，圖磚會亂疊、控制項也會跑版。
import "leaflet/dist/leaflet.css";
import {
  AREA_LABEL,
  COORDS,
  MAP_CENTER,
  PROJECTS,
  STATUS_LABEL,
  type Project,
  type ProjectStatus,
} from "@/data/port-projects";
import styles from "./Map.module.css";

/** 大樓圖示的配色，跟清單的 badge 同一組 */
const TONE: Record<ProjectStatus, { bg: string; ink: string }> = {
  presale: { bg: "#D9466F", ink: "#fff" },
  newly: { bg: "#1E6FA8", ink: "#fff" },
  completed: { bg: "#2F7A34", ink: "#fff" },
};

/** 大樓 icon。窗戶格子讓它一眼看得出是大樓，不是普通圖釘 */
function buildingSvg(bg: string, ink: string, mine: boolean) {
  return `
<svg width="34" height="42" viewBox="0 0 34 42" xmlns="http://www.w3.org/2000/svg">
  <path d="M17 42c0 0-13-14.2-13-24A13 13 0 0 1 30 18c0 9.8-13 24-13 24z" fill="${bg}" stroke="#fff" stroke-width="2"/>
  <rect x="10" y="9" width="14" height="16" rx="1.5" fill="${ink}" opacity="0.95"/>
  <g fill="${bg}">
    <rect x="12" y="11.5" width="3" height="3"/><rect x="16.5" y="11.5" width="3" height="3"/>
    <rect x="12" y="16" width="3" height="3"/><rect x="16.5" y="16" width="3" height="3"/>
    <rect x="12" y="20.5" width="3" height="3"/><rect x="16.5" y="20.5" width="3" height="3"/>
  </g>
  ${mine ? '<circle cx="27" cy="8" r="6.5" fill="#01354D" stroke="#fff" stroke-width="2"/>' : ""}
</svg>`.trim();
}

/**
 * 同一個座標的建案散開，不然會疊在一起點不到。
 * 用 index 決定角度，同樣的資料每次都散在同樣的位置（不要用亂數，畫面會跳）。
 */
function spread(list: Array<{ p: Project; lat: number; lng: number }>) {
  const groups = new Map<string, number>();
  return list.map(({ p, lat, lng }) => {
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    const i = groups.get(key) ?? 0;
    groups.set(key, i + 1);
    if (i === 0) return { p, lat, lng, nudged: false };
    const angle = (i * 2.399) % (Math.PI * 2); // 黃金角，散得比較開
    const r = 0.00035 + i * 0.00008;
    return { p, lat: lat + Math.sin(angle) * r, lng: lng + Math.cos(angle) * r, nudged: true };
  });
}

export default function LeafletMap({ listings = {} }: { listings?: Record<string, number> }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Project | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  /**
   * `?fix=1` 打開座標校正模式。
   *
   * ⚠️ 刻意在瀏覽器端讀網址，不從 server component 的 `searchParams` 傳進來 ——
   *    頁面一旦讀 searchParams 就會被迫變成每次請求都重新渲染（build 會從 ○ 變 ƒ），
   *    這頁是要給 Google 收錄的公開頁，不該為了一個內部小工具犧牲快取。
   */
  const [fixMode, setFixMode] = useState(false);
  useEffect(() => {
    setFixMode(new URLSearchParams(window.location.search).get("fix") === "1");
  }, []);

  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;

    (async () => {
      try {
        const L = (await import("leaflet")).default;
        if (cancelled || !boxRef.current) return;

        map = L.map(boxRef.current, {
          center: [MAP_CENTER.lat, MAP_CENTER.lng],
          zoom: 15,
          // 頁面往下捲時不要被地圖吃掉滾輪，要縮放用右下角的 ＋／−
          scrollWheelZoom: false,
        });

        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 貢獻者',
        }).addTo(map);

        const placed = PROJECTS.map((p) => {
          const c = COORDS[p.id];
          return c ? { p, lat: c.lat, lng: c.lng } : null;
        }).filter(Boolean) as Array<{ p: Project; lat: number; lng: number }>;

        for (const { p, lat, lng } of spread(placed)) {
          const tone = TONE[p.status];
          const mine = (listings[p.id] ?? 0) > 0;
          const icon = L.divIcon({
            className: styles.lmPin,
            html: buildingSvg(tone.bg, tone.ink, mine),
            iconSize: [34, 42],
            iconAnchor: [17, 42],
          });
          L.marker([lat, lng], { icon, title: p.name })
            .addTo(map)
            .on("click", () => setSelected(p));
        }

        if (fixMode) {
          map.on("click", (e: import("leaflet").LeafletMouseEvent) => {
            setPicked(`{ lat: ${e.latlng.lat.toFixed(5)}, lng: ${e.latlng.lng.toFixed(5)}, precision: "exact" },`);
          });
        }

        setReady(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [listings, fixMode]);

  const total = PROJECTS.length;
  const located = PROJECTS.filter((p) => COORDS[p.id]).length;
  const c = selected ? COORDS[selected.id] : null;

  return (
    <div className={styles.lmWrap}>
      <div className={styles.lmMapCol}>
        <div ref={boxRef} className={styles.lmMap} role="application" aria-label="台中港市鎮中心建案地圖" />
        {failed && (
          <p className={styles.lmFail}>
            地圖載入失敗，可能是網路擋掉了圖磚。下方的「建案總覽」不受影響，一樣看得到全部建案。
          </p>
        )}
        {!ready && !failed && <p className={styles.lmLoading}>地圖載入中…</p>}
        <p className={styles.lmNote}>
          {`已標出 ${located} / ${total} 個建案。點大樓圖示看詳情；地圖可拖曳，用右下角 ＋／− 縮放。`}
        </p>
      </div>

      <aside className={styles.lmSide}>
        <div className={styles.lmLegend}>
          {(Object.keys(TONE) as ProjectStatus[]).map((k) => (
            <span key={k}>
              <i style={{ background: TONE[k].bg }} />
              {STATUS_LABEL[k]}
            </span>
          ))}
          <span>
            <i className={styles.lmDotMine} />
            我有物件在售
          </span>
        </div>

        {selected ? (
          <div className={styles.pmDetail}>
            <h3>{selected.name}</h3>
            {selected.alias && <p>{`又稱 ${selected.alias}`}</p>}
            <p>
              {selected.builder}
              {"　"}
              {AREA_LABEL[selected.area]}
              {"　"}
              {selected.completion.includes("興建中") ? selected.completion : `${selected.completion} 完工`}
            </p>
            {selected.units != null && <p>{`總戶數 ${selected.units.toLocaleString("zh-TW")} 戶`}</p>}
            {selected.streets && <p>{`坐落：${selected.streets}`}</p>}
            {c?.precision === "street" && (
              <p className={styles.lmApprox}>
                📍 <b>約略位置</b>：只查到路名，圖釘取該路中點，可能差一兩個街廓。
              </p>
            )}
            {(listings[selected.id] ?? 0) > 0 && (
              <p className={styles.lmMine}>{`🏠 我在這個建案有 ${listings[selected.id]} 件在售`}</p>
            )}
            <Link href="/card/booking" className={styles.cta}>
              {`想找 ${selected.name}？預約諮詢`}
            </Link>
          </div>
        ) : (
          <p className={styles.pmHint}>點地圖上的大樓圖示，這裡會顯示建案資訊。</p>
        )}

        {fixMode && (
          <div className={styles.lmFix}>
            <b>座標校正模式</b>
            <p>在地圖上點建案的正確位置，下面會給你可以貼回 `port-projects.ts` 的一行。</p>
            <code>{picked ?? "（還沒點）"}</code>
          </div>
        )}

        <p className={styles.pmDisclaimer}>
          <b>位置精度說明：</b>
          圖釘位置來自 OpenStreetMap 的路網資料。OSM 在台灣沒有門牌級資料，
          <b>只查到路名的建案，圖釘取該路中點，可能差一兩個街廓</b>，點開會標「約略位置」。
          要確認確切位置請直接問我。
        </p>
      </aside>
    </div>
  );
}

"use client";

/**
 * 垃圾車查詢的畫面：一個輸入框打「地址」或「社區名」（也可以用手機定位），
 * 列出附近的收運點、今天幾點來、一週各天的時間，並畫在地圖上。
 *
 * 流程：位置（座標）→ grid.json 查這附近有哪些行政區 → 抓那幾區的收運點 → 照距離排。
 *   ・地址：路名清單用學區查詢那份（/data/addr/index.json），選到路之後抓該區的門牌座標（geo/<區>.json）換成位置。
 *   ・社區：伺服器把建案地圖的建案（名稱＋座標）傳進來，只有海線四區。
 *   ・定位：瀏覽器 geolocation，座標不送到伺服器。
 *
 * ⚠️ 「今天星期幾、現在幾點」只在瀏覽器算（這頁是靜態的，伺服器算的時間會停在建置那一刻）。
 * ⚠️ 這個站被回報很多次「按了沒反應」其實是結果開在畫面外 —— 查到之後一定自己捲到結果。
 * 規則都在 lib/garbage-truck.ts，改完跑 `npm run check:garbage`。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ADDR_INDEX_URL, findRoads, type AddrIndex, type RoadHit } from "@/lib/address-index";
import {
  DAY_LABELS,
  FAR_RADIUS_M,
  GARBAGE_GRID_URL,
  GARBAGE_META_URL,
  NEAR_RADIUS_M,
  buildPlaces,
  distanceText,
  districtsNear,
  findCommunities,
  garbageGeoUrl,
  garbageStopsUrl,
  locate,
  nearestPlaces,
  nextVisit,
  slotText,
  splitTail,
  taipeiNow,
  unlocatedOnRoad,
  visitsOn,
  type Community,
  type GarbageMeta,
  type GeoFile,
  type GridFile,
  type LatLng,
  type Place,
  type StopsFile,
} from "@/lib/garbage-truck";
import tax from "../tax/tax.module.css";
import sch from "../school/school.module.css";
import styles from "./garbage.module.css";
import GarbageMap from "./GarbageMap";

interface Origin extends LatLng {
  /** 結果標題用：「梧棲區文化路二段100號」「○○社區」「您現在的位置」 */
  label: string;
  /** 位置準不準的補充說明（沒有就不印） */
  note: string;
  /** 用地址查的才有：拿來找「同一條路上、沒座標」的收運點 */
  road: { district: string; road: string } | null;
}

interface Result {
  origin: Origin;
  near: Place[];
  widened: boolean;
  /** 同一條路上定位不到的收運點 */
  sameRoad: Place[];
}

type Status = { kind: "idle" } | { kind: "busy"; text: string } | { kind: "error"; text: string };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return (await res.json()) as T;
}

export default function GarbageFinder({ communities }: { communities: Community[] }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [addrIndex, setAddrIndex] = useState<AddrIndex | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [result, setResult] = useState<Result | null>(null);
  const [meta, setMeta] = useState<GarbageMeta | null>(null);
  const [now, setNow] = useState<{ day: number; minutes: number } | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const gridRef = useRef<GridFile | null>(null);
  const stopsCache = useRef(new Map<string, StopsFile>());
  const geoCache = useRef(new Map<string, GeoFile>());
  const resultRef = useRef<HTMLDivElement>(null);
  const indexAsked = useRef(false);

  useEffect(() => {
    setNow(taipeiNow());
    const timer = window.setInterval(() => setNow(taipeiNow()), 60_000);
    getJson<GarbageMeta>(GARBAGE_META_URL)
      .then(setMeta)
      .catch(() => {});
    return () => window.clearInterval(timer);
  }, []);

  /** 路名清單（68KB）等客戶碰到輸入框才抓 */
  const ensureIndex = useCallback(() => {
    if (indexAsked.current) return;
    indexAsked.current = true;
    getJson<AddrIndex>(ADDR_INDEX_URL)
      .then(setAddrIndex)
      .catch(() => {
        indexAsked.current = false;
      });
  }, []);

  const communityHits = useMemo(() => findCommunities(communities, query, 6), [communities, query]);
  const roadHits = useMemo(
    () => (addrIndex && query.trim().length >= 2 ? findRoads(addrIndex, query, 8) : []),
    [addrIndex, query],
  );

  /** 位置 → 附近的收運點 */
  const search = useCallback(async (origin: Origin) => {
    setOpen(false);
    setStatus({ kind: "busy", text: "正在找附近的收運點…" });
    try {
      if (!gridRef.current) gridRef.current = await getJson<GridFile>(GARBAGE_GRID_URL);
      const districts = districtsNear(gridRef.current, origin);
      if (origin.road && !districts.includes(origin.road.district)) districts.push(origin.road.district);
      if (districts.length === 0) {
        setResult(null);
        setStatus({ kind: "error", text: "這個位置不在臺中市的收運範圍內，請換一個地址試試。" });
        return;
      }
      const files = await Promise.all(
        districts.map(async (district) => {
          let file = stopsCache.current.get(district);
          if (!file) {
            file = await getJson<StopsFile>(garbageStopsUrl(district));
            stopsCache.current.set(district, file);
          }
          return { district, file };
        }),
      );
      const places = buildPlaces(files, origin);
      const { places: near, widened } = nearestPlaces(places);
      const sameRoad = origin.road ? unlocatedOnRoad(places, origin.road.district, origin.road.road) : [];
      setResult({ origin, near, widened, sameRoad });
      setActiveKey(null);
      setStatus({ kind: "idle" });
      // 等結果畫出來再捲
      window.setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    } catch {
      setStatus({ kind: "error", text: "收運資料暫時讀不到，請稍後再試一次。" });
    }
  }, []);

  /** 選到一條路（可能帶著巷弄號）→ 換成座標 */
  const pickRoad = useCallback(
    async (hit: RoadHit) => {
      const full = `${hit.district}${hit.road}${hit.tail}`;
      setQuery(full);
      setOpen(false);
      setStatus({ kind: "busy", text: "正在定位這個地址…" });
      try {
        let geo = geoCache.current.get(hit.district);
        if (!geo) {
          geo = await getJson<GeoFile>(garbageGeoUrl(hit.district));
          geoCache.current.set(hit.district, geo);
        }
        const { lane, no } = splitTail(geo.roads[hit.road], hit.tail);
        const at = locate(geo, hit.road, lane, no) ?? (lane || no != null ? locate(geo, hit.road, "", null) : null);
        if (!at) {
          setResult(null);
          setStatus({ kind: "error", text: `門牌資料裡找不到「${hit.district}${hit.road}」的位置，請換附近的路名或用社區名查。` });
          return;
        }
        let note = "";
        if (no == null) note = "沒有門牌號，先用這條路的中間位置算距離；在路名後面補上門牌號（例：100號）會更準。";
        else if (at.how === "road") note = "門牌資料裡找不到這個巷弄，先用這條路的中間位置算距離。";
        else if (at.how === "lane") note = "門牌資料裡找不到這條巷弄，先用巷口的位置算距離。";
        else if (at.how === "near") note = "門牌資料裡沒有這個號碼，先用同一條路上最接近的門牌算距離。";
        await search({ lat: at.lat, lng: at.lng, label: full, note, road: { district: hit.district, road: hit.road } });
      } catch {
        setStatus({ kind: "error", text: "門牌資料暫時讀不到，請稍後再試一次。" });
      }
    },
    [search],
  );

  const pickCommunity = useCallback(
    (c: Community) => {
      setQuery(c.name);
      void search({ lat: c.lat, lng: c.lng, label: `${c.name}（${c.area}）`, note: "", road: null });
    },
    [search],
  );

  /** 按「查詢」或 Enter：整條地址優先，其次社區，再其次清單第一條路 */
  const submit = useCallback(() => {
    const text = query.trim();
    if (!text) {
      setStatus({ kind: "error", text: "請先輸入地址或社區名。" });
      return;
    }
    const wholeAddress = roadHits.find((h) => h.prefix);
    if (wholeAddress) return void pickRoad(wholeAddress);
    // 社區：名字完全一樣、或只有一個符合才直接查；「遠雄之星」這種一打六個的要他自己點，不替他猜
    const sameName = communityHits.find((c) => c.name === text);
    if (sameName) return pickCommunity(sameName);
    if (communityHits.length === 1 && roadHits.length === 0) return pickCommunity(communityHits[0]);
    if (communityHits.length > 0) {
      setOpen(true);
      setStatus({ kind: "error", text: "有好幾個符合的社區或路名，請從清單點選一個。" });
      return;
    }
    if (roadHits.length === 1) return void pickRoad(roadHits[0]);
    if (roadHits.length > 1) {
      setOpen(true);
      setStatus({ kind: "error", text: "有好幾條路符合，請從清單點選一條。" });
      return;
    }
    setStatus({
      kind: "error",
      text: addrIndex
        ? "找不到這個地址或社區。地址請從路名打起（例：梧棲區文化路二段100號）；社區名目前只收錄梧棲、清水、沙鹿、龍井。"
        : "路名清單還在載入，請再按一次查詢。",
    });
  }, [query, roadHits, communityHits, pickRoad, pickCommunity, addrIndex]);

  const useMyLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setStatus({ kind: "error", text: "這個瀏覽器不支援定位，請改用地址或社區名查。" });
      return;
    }
    setStatus({ kind: "busy", text: "正在取得您的位置…" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setQuery("");
        void search({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: "您現在的位置",
          note: pos.coords.accuracy > 150 ? `定位誤差約 ${Math.round(pos.coords.accuracy)} 公尺，室內會比較不準，用地址查比較穩。` : "",
          road: null,
        });
      },
      () => setStatus({ kind: "error", text: "拿不到定位（可能沒有允許定位權限），請改用地址或社區名查。" }),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, [search]);

  const showSuggest = open && query.trim().length >= 2 && (communityHits.length > 0 || roadHits.length > 0);
  const keyOf = (p: Place) => `${p.district}|${p.caption}`;

  return (
    <div>
      <form
        className={tax.form}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className={tax.field}>
          <span className={tax.label}>
            地址或社區名<span className={tax.labelHint}>打兩個字以上會跳出清單</span>
          </span>
          <div className={styles.inputRow}>
            <div className={`${sch.addrWrap} ${styles.inputGrow}`}>
              <input
                className={tax.input}
                type="text"
                inputMode="text"
                autoComplete="off"
                enterKeyHint="search"
                placeholder="例：梧棲區文化路二段100號，或直接打社區名"
                value={query}
                onFocus={() => {
                  ensureIndex();
                  setOpen(true);
                }}
                onChange={(e) => {
                  ensureIndex();
                  setQuery(e.target.value);
                  setOpen(true);
                  if (status.kind === "error") setStatus({ kind: "idle" });
                }}
                onBlur={() => window.setTimeout(() => setOpen(false), 180)}
              />
              {showSuggest ? (
                <ul className={sch.suggest}>
                  {communityHits.map((c) => (
                    <li key={`c-${c.name}-${c.lat}`}>
                      <button type="button" className={sch.suggestBtn} onMouseDown={(e) => e.preventDefault()} onClick={() => pickCommunity(c)}>
                        <span className={`${sch.suggestDistrict} ${styles.tagCommunity}`}>社區</span>
                        {c.name}
                        <span className={sch.suggestTail}>{c.area}</span>
                      </button>
                    </li>
                  ))}
                  {roadHits.map((h) => (
                    <li key={`r-${h.district}-${h.road}`}>
                      <button type="button" className={sch.suggestBtn} onMouseDown={(e) => e.preventDefault()} onClick={() => void pickRoad(h)}>
                        <span className={sch.suggestDistrict}>{h.district}</span>
                        {h.road}
                        {h.tail ? <span className={sch.suggestTail}>{h.tail}</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <button type="submit" className={styles.goBtn} disabled={status.kind === "busy"}>
              查詢
            </button>
          </div>
        </label>

        <div className={styles.formFoot}>
          <button type="button" className={sch.linkBtn} onClick={useMyLocation} disabled={status.kind === "busy"}>
            📍 用我現在的位置查
          </button>
          <span className={styles.footHint}>地址可以只打到路名；社區名目前收錄梧棲、清水、沙鹿、龍井 {communities.length} 個社區。</span>
        </div>

        {status.kind === "busy" ? <div className={`${sch.addrStatus} ${sch.addrNone}`}>{status.text}</div> : null}
        {status.kind === "error" ? (
          <div className={`${sch.addrStatus} ${sch.addrWarn}`} role="alert">
            {status.text}
          </div>
        ) : null}
      </form>

      {result ? (
        <div className={`${sch.results} ${styles.results}`} ref={resultRef}>
          <div className={sch.resultHead}>
            <div className={sch.resultLabel}>{result.origin.label} 附近</div>
            <div className={sch.resultTitle}>
              {result.near.length === 0
                ? "附近沒有查到收運點"
                : result.widened
                  ? `最近的收運點在 ${distanceText(result.near[0].distance ?? 0).replace("約 ", "")}外`
                  : `${NEAR_RADIUS_M} 公尺內有 ${result.near.length} 個收運點`}
            </div>
            <div className={sch.resultSub}>
              {now ? `今天是星期${DAY_LABELS[now.day]}。` : ""}時間是環保局的表定時間，實際會因天候、車流提早或延後，建議提早 5 分鐘等。
            </div>
          </div>

          <div className={styles.body}>
            {result.origin.note ? <div className={`${sch.addrStatus} ${sch.addrWarn} ${styles.flush}`}>{result.origin.note}</div> : null}
            {result.widened && result.near.length > 0 ? (
              <div className={`${sch.addrStatus} ${sch.addrWarn} ${styles.flush}`}>
                {NEAR_RADIUS_M} 公尺內沒有收運點，下面列的是 {FAR_RADIUS_M / 1000} 公里內最近的 {result.near.length} 個。
              </div>
            ) : null}
            {result.near.length === 0 && result.sameRoad.length === 0 ? (
              <div className={`${sch.addrStatus} ${sch.addrNone} ${styles.flush}`}>
                {FAR_RADIUS_M / 1000} 公里內沒有定位得到的收運點。社區大樓多半由管委會委託清運，可以問管理室；也可以撥臺中市環保局或 1999 詢問。
              </div>
            ) : null}

            {result.near.length > 0 ? (
              <GarbageMap
                origin={result.origin}
                places={result.near}
                activeKey={activeKey}
                onPick={(key) => {
                  setActiveKey(key);
                  document.getElementById(`stop-${key}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
              />
            ) : null}

            <ol className={styles.list}>
              {result.near.map((p, i) => (
                <PlaceCard key={keyOf(p)} place={p} index={i + 1} now={now} active={activeKey === keyOf(p)} onHover={() => setActiveKey(keyOf(p))} />
              ))}
            </ol>

            {result.sameRoad.length > 0 ? (
              <>
                <h3 className={styles.subTitle}>同一條路上、地圖標不出來的收運點</h3>
                <p className={styles.subDesc}>
                  環保局這幾筆只寫了路口或地標、沒有門牌號，算不出距離，但都在「{result.origin.road?.road}」上，一起列給您對照。
                </p>
                <ol className={styles.list}>
                  {result.sameRoad.slice(0, 8).map((p) => (
                    <PlaceCard key={keyOf(p)} place={p} index={null} now={now} active={false} onHover={() => {}} />
                  ))}
                </ol>
              </>
            ) : null}

            <p className={styles.legend}>
              <strong>沿街</strong>＝垃圾車經過不久留，請提早在路邊等；<strong>定點</strong>＝垃圾車會停靠一段時間。
              ♻️＝那一天同時收資源回收。距離是直線距離，不是走路的距離。
              {meta ? ` 收運資料抓取日：${meta.fetched}。` : ""}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PlaceCard({
  place,
  index,
  now,
  active,
  onHover,
}: {
  place: Place;
  index: number | null;
  now: { day: number; minutes: number } | null;
  active: boolean;
  onHover: () => void;
}) {
  const next = now ? nextVisit(place, now.day, now.minutes) : null;
  const todays = now ? visitsOn(place, now.day) : [];
  const kinds = new Set(place.visits.map((v) => v.kind));
  const cars = [...new Set(place.visits.map((v) => v.car).filter(Boolean))];

  let headline = "";
  let headlineSub = "";
  if (now && next) {
    if (next.inDays === 0) {
      headline = `今天 ${slotText(next.slot)}`;
      headlineSub = next.recycle ? "垃圾＋資源回收" : "只收垃圾，今天不收回收";
    } else {
      headline = todays.length > 0 ? "今天的已經過了" : "今天不收";
      headlineSub = `下一班：${next.inDays === 1 ? "明天" : ""}星期${DAY_LABELS[next.day]} ${slotText(next.slot)}`;
    }
  }

  return (
    <li
      id={`stop-${place.district}|${place.caption}`}
      className={`${styles.card} ${active ? styles.cardOn : ""}`}
      onMouseEnter={onHover}
      onFocus={onHover}
    >
      <div className={styles.cardTop}>
        {index != null ? <span className={styles.num}>{index}</span> : null}
        <div className={styles.cardMain}>
          <div className={styles.caption}>{place.caption}</div>
          <div className={styles.where}>
            {place.district}
            {place.li}
            {place.distance != null ? <>・{distanceText(place.distance)}</> : null}
            {kinds.has(0) ? <span className={styles.kind}>沿街</span> : null}
            {kinds.has(1) ? <span className={`${styles.kind} ${styles.kindFixed}`}>定點</span> : null}
          </div>
        </div>
        {headline ? (
          <div className={`${styles.next} ${next && next.inDays === 0 ? styles.nextToday : ""}`}>
            <div className={styles.nextBig}>{headline}</div>
            <div className={styles.nextSub}>{headlineSub}</div>
          </div>
        ) : null}
      </div>

      <div className={styles.week}>
        {DAY_LABELS.map((label, d) => {
          const list = visitsOn(place, d);
          return (
            <div key={label} className={`${styles.day} ${now && now.day === d ? styles.dayToday : ""} ${list.length === 0 ? styles.dayOff : ""}`}>
              <div className={styles.dayLabel}>{label}</div>
              {list.length === 0 ? (
                <div className={styles.dayNone}>不收</div>
              ) : (
                list.map((v, i) => (
                  // 手機一格只有三十幾 px：起、訖、回收各佔一行，時間才不會從中間斷開
                  <div key={i} className={styles.dayTime}>
                    <span>{v.slot.start}</span>
                    {v.slot.end !== v.slot.start ? <span className={styles.dayEnd}>–{v.slot.end}</span> : null}
                    {v.recycle ? <span title="這一天收資源回收">♻️</span> : null}
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>
      {cars.length > 0 ? <div className={styles.car}>車牌：{cars.join("、")}</div> : null}
    </li>
  );
}

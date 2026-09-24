"use client";

/**
 * 學區查詢的操作畫面。
 *
 * 兩個分頁：
 *   「查我家的學區」—— 打路名或整條地址（門牌資料對里鄰）、選行政區＋里（想更準可以填鄰），
 *                     或打開地圖用點的／用定位；結果分國小、國中兩欄，每所學校把它公告裡寫這個里的那一段原文放出來。
 *   「查學校的學區」—— 反過來，選一所學校看它收哪些里，可以整片畫在地圖上。
 *
 * 資料都是掛上去才 fetch、不打進 JS bundle：
 *   學區 public/data/school-districts.json（~600KB）
 *   路名清單 public/data/addr/index.json（~70KB，客戶點進路名框才抓）
 *   門牌 → 里鄰 public/data/addr/<區>.json（每區 10–130KB，選到那一區的路才抓）
 * 里的下拉用 src/data/taichung-villages.json（10KB）直接 import。
 *
 * 路名搜尋（2026-09-24 系統擁有者：「有的客戶可能不知道自己的里，加用路名搜尋」）：
 *   打「中央路」跳建議 → 選「梧棲區 中央路一段」→ 沒有門牌就列出這條路經過的里（一個就直接選、
 *   多個就紫色標在地圖上讓客戶點）；有門牌號碼就直接對到里＋鄰，連鄰欄都幫他填好。
 *   整條地址貼進來也行（「台中市梧棲區中央路一段100號」會自己拆區、路、巷弄、號）。
 *
 * ⚠️ 結果在畫面外的老毛病（這個站被回報過五次）：地圖打開之後結果會被推到下面，
 *    所以從地圖或定位選到里會自動捲過去，結果不在畫面裡時底下還有一條「看結果」的浮條。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import villagesJson from "@/data/taichung-villages.json";
import {
  DISTRICTS,
  linStatus,
  schoolsForLi,
  type School,
  type SchoolDistrictData,
  type SchoolMatch,
  type Zone,
} from "@/lib/school-district";
import {
  ADDR_INDEX_URL,
  addrDistrictUrl,
  candidatesFor,
  findRoads,
  lanesOf,
  parseHouse,
  resolveHouse,
  type AddrDistrictFile,
  type AddrIndex,
  type Candidate,
  type RoadHit,
  type RoadRef,
} from "@/lib/address-index";
import SchoolMap, { type LiRef } from "./SchoolMap";
import styles from "./school.module.css";
import tax from "../tax/tax.module.css";
import home from "../home.module.css";

const VILLAGES = villagesJson as Record<string, string[]>;
const DATA_URL = "/data/school-districts.json";

/** [1,2,3,5,7,8] → 「1–3、5、7–8」 */
function compress(nums: number[]): string {
  const s = [...new Set(nums)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < s.length; ) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    if (j > i + 1) out.push(`${s[i]}–${s[j]}`);
    else if (j === i + 1) out.push(`${s[i]}、${s[j]}`);
    else out.push(`${s[i]}`);
    i = j + 1;
  }
  return out.join("、");
}

function describeZone(z: Zone): string {
  if (z.mode === "all") return "整里";
  if (z.mode === "allExcept") return `整里，第 ${compress(z.excluded)} 鄰除外`;
  if (z.mode === "part") {
    const parts: string[] = [];
    if (z.lins.length) parts.push(`第 ${compress(z.lins)} 鄰`);
    if (z.condLins.length) parts.push(`第 ${compress(z.condLins)} 鄰依門牌分`);
    if (z.excluded.length) parts.push(`第 ${compress(z.excluded)} 鄰除外`);
    return parts.join("；");
  }
  return z.conds.join("；") || "依公告的條件";
}

function levelLabel(s: School): string {
  if (/高級中學|高中|高工/.test(s.name)) return "國中部";
  if (/中小學/.test(s.name)) return s.level === "elementary" ? "國小部" : "國中部";
  return "";
}

function Pills({ zones, lin }: { zones: Zone[]; lin: number | null }) {
  const pills: Array<{ text: string; cls: string }> = [];
  if (lin != null) {
    const statuses = zones.map((z) => linStatus(z, lin));
    if (statuses.includes("in")) pills.push({ text: `✅ 第 ${lin} 鄰在學區內`, cls: styles.pillIn });
    else if (statuses.includes("cond")) pills.push({ text: `⚠️ 第 ${lin} 鄰依門牌分`, cls: styles.pillWarn });
  } else if (zones.some((z) => z.mode === "all")) pills.push({ text: "整里", cls: styles.pillAll });
  else if (zones.some((z) => z.mode === "allExcept")) pills.push({ text: "整里（部分鄰除外）", cls: styles.pillAll });
  else if (zones.some((z) => z.mode === "part")) pills.push({ text: "只有部分鄰", cls: styles.pillPart });
  else pills.push({ text: "依街道／門牌分界", cls: styles.pillCond });
  if (zones.some((z) => z.conds.length > 0) && lin == null && !pills.some((p) => p.cls === styles.pillCond))
    pills.push({ text: "部分依門牌分", cls: styles.pillCond });
  if (zones.some((z) => z.shared)) pills.push({ text: "共同學區・可擇一", cls: styles.pillShared });
  if (zones.some((z) => z.free)) pills.push({ text: "自由學區", cls: styles.pillFree });
  return (
    <span className={styles.pills}>
      {pills.map((p) => (
        <span key={p.text} className={`${styles.pill} ${p.cls}`}>
          {p.text}
        </span>
      ))}
    </span>
  );
}

function SchoolCard({
  match,
  lin,
  onShowOnMap,
}: {
  match: SchoolMatch;
  lin: number | null;
  onShowOnMap: (s: School) => void;
}) {
  const { school, zones } = match;
  const sub = levelLabel(school);
  return (
    <article className={styles.card}>
      <div className={styles.cardHead}>
        <h4 className={styles.schoolName}>
          {school.shortName}
          {sub ? <small className={styles.levelTag}>{sub}</small> : null}
        </h4>
        <Pills zones={zones} lin={lin} />
      </div>
      {zones.map((z, i) => (
        <div key={i} className={styles.zone}>
          <div className={styles.zoneLine}>{describeZone(z)}</div>
          <div className={styles.zoneRaw}>公告原文：{z.raw}</div>
        </div>
      ))}
      <div className={styles.cardActions}>
        <button type="button" className={styles.linkBtn} onClick={() => onShowOnMap(school)}>
          🗺️ 在地圖上看這所學校的整個學區
        </button>
        <details className={styles.details}>
          <summary>完整學區公告</summary>
          <div className={styles.rawText}>{school.raw}</div>
        </details>
      </div>
    </article>
  );
}

function ResultColumn({
  title,
  matches,
  lin,
  onShowOnMap,
}: {
  title: string;
  matches: SchoolMatch[];
  lin: number | null;
  onShowOnMap: (s: School) => void;
}) {
  return (
    <div className={styles.col}>
      <h3 className={styles.colTitle}>
        {title}
        <span className={styles.colCount}>{matches.length} 所</span>
      </h3>
      {matches.length === 0 ? (
        <p className={styles.none}>
          教育局公告裡找不到這個里對應的{title}
          {lin != null ? `（第 ${lin} 鄰）` : ""}。可能是公告用了不同的寫法，或這個里是用街道分界，請把鄰欄清空再看一次，或直接問我。
        </p>
      ) : (
        matches.map((m) => <SchoolCard key={m.school.id} match={m} lin={lin} onShowOnMap={onShowOnMap} />)
      )}
    </div>
  );
}

/** 路名搜尋的狀態列 */
interface AddrStatus {
  kind: "ok" | "warn" | "pick" | "none" | "loading";
  text: string;
  /** 一條路經過好幾個里：讓客戶點 */
  candidates?: Candidate[];
  /** 同一個門牌好幾個鄰：讓客戶點 */
  lins?: number[];
}

const STATUS_CLASS: Record<AddrStatus["kind"], string> = {
  ok: styles.addrOk,
  warn: styles.addrWarn,
  pick: styles.addrPick,
  none: styles.addrNone,
  loading: styles.addrNone,
};

export default function SchoolFinder() {
  const [tab, setTab] = useState<"place" | "school">("place");
  const [district, setDistrict] = useState("");
  const [li, setLi] = useState("");
  const [lin, setLin] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [focusToken, setFocusToken] = useState(0);
  const [mapSchool, setMapSchool] = useState<School | null>(null);
  const [pickedSchoolId, setPickedSchoolId] = useState("");
  const [data, setData] = useState<SchoolDistrictData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [resultsVisible, setResultsVisible] = useState(true);
  const resultsRef = useRef<HTMLDivElement>(null);
  const scrollPendingRef = useRef(false);

  /* ── 路名搜尋 ── */
  const [addrIndex, setAddrIndex] = useState<AddrIndex | null>(null);
  const addrIndexRequested = useRef(false);
  const [addrQuery, setAddrQuery] = useState("");
  const [addrOpen, setAddrOpen] = useState(false);
  const [addrRoad, setAddrRoad] = useState<RoadRef | null>(null);
  const [addrLane, setAddrLane] = useState("");
  const [addrNo, setAddrNo] = useState("");
  const [addrFile, setAddrFile] = useState<{ district: string; file: AddrDistrictFile } | null>(null);
  const addrFiles = useRef(new Map<string, AddrDistrictFile>());
  const [addrStatus, setAddrStatus] = useState<AddrStatus | null>(null);
  const [mapCandidates, setMapCandidates] = useState<LiRef[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(DATA_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: SchoolDistrictData) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** 路名清單只在客戶碰到路名框時才抓 */
  const ensureAddrIndex = useCallback(() => {
    if (addrIndexRequested.current) return;
    addrIndexRequested.current = true;
    fetch(ADDR_INDEX_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: AddrIndex) => setAddrIndex(d))
      .catch(() => {
        addrIndexRequested.current = false;
      });
  }, []);

  const loadAddrFile = useCallback(async (d: string): Promise<AddrDistrictFile> => {
    const cached = addrFiles.current.get(d);
    if (cached) return cached;
    const res = await fetch(addrDistrictUrl(d));
    if (!res.ok) throw new Error(String(res.status));
    const file = (await res.json()) as AddrDistrictFile;
    addrFiles.current.set(d, file);
    return file;
  }, []);

  const addrHits = useMemo<RoadHit[]>(
    () => (addrIndex && addrQuery.trim() ? findRoads(addrIndex, addrQuery, 10) : []),
    [addrIndex, addrQuery],
  );

  const clearAddr = useCallback(() => {
    setAddrQuery("");
    setAddrRoad(null);
    setAddrLane("");
    setAddrNo("");
    setAddrStatus(null);
    setMapCandidates([]);
    setAddrOpen(false);
  }, []);

  const pickRoad = (hit: RoadHit) => {
    const parts = parseHouse(hit.tail);
    setAddrRoad({ district: hit.district, road: hit.road });
    setAddrLane(parts.lane);
    setAddrNo(parts.no != null ? String(parts.no) : "");
    setAddrQuery(`${hit.district}${hit.road}${parts.lane}${parts.no != null ? `${parts.no}號` : ""}`);
    setAddrOpen(false);
    setMapSchool(null);
  };

  /** 選到路（或改巷弄、號）之後 → 對里鄰，把區里鄰的下拉帶入 */
  useEffect(() => {
    if (!addrRoad) return;
    let cancelled = false;
    const { district: d, road } = addrRoad;
    setAddrStatus({ kind: "loading", text: "門牌資料載入中…" });
    (async () => {
      let file: AddrDistrictFile;
      try {
        file = await loadAddrFile(d);
      } catch {
        if (!cancelled) setAddrStatus({ kind: "none", text: "門牌資料載入失敗，請改用下面的下拉選單或地圖。" });
        return;
      }
      if (cancelled) return;
      setAddrFile({ district: d, file });
      const noNum = Number(addrNo);
      const hasNo = addrNo.trim() !== "" && Number.isInteger(noNum) && noNum >= 1;
      const label = `${d}${road}${addrLane}`;

      if (hasNo) {
        const r = resolveHouse(file, d, road, addrLane, noNum);
        if (!r) {
          setAddrStatus({ kind: "none", text: `門牌資料裡沒有「${label}」的門牌，請改用下面的下拉選單或地圖。` });
          return;
        }
        setDistrict(d);
        const where = r.exact ? "" : `資料裡沒有 ${noNum} 號，用最接近的 ${r.nearestNo} 號推算：`;
        const fallback = r.laneFallback ? `（沒有「${addrLane}」這條巷弄的資料，用整條路查）` : "";
        if (r.hits.length === 1) {
          const hit = r.hits[0];
          setLi(hit.li);
          setMapCandidates([]);
          if (hit.lins.length === 1) {
            setLin(String(hit.lins[0]));
            setAddrStatus({
              kind: r.exact ? "ok" : "warn",
              text: `${r.exact ? "✅ 門牌對到" : "⚠️ "}${where}${d}${hit.li} 第 ${hit.lins[0]} 鄰${fallback}，已幫你帶入下面的欄位。`,
            });
          } else {
            setLin("");
            setAddrStatus({
              kind: "warn",
              text: `${where}${d}${hit.li}，但這個門牌有 ${hit.lins.length} 個鄰（同一棟大樓不同樓層編在不同鄰）${fallback}。知道自己是哪一鄰就點一下，不知道就先看整個里：`,
              lins: hit.lins,
            });
          }
        } else {
          setLi("");
          setLin("");
          setMapCandidates(r.hits.map((h) => ({ district: d, li: h.li })));
          setAddrStatus({
            kind: "pick",
            text: `${where}這個門牌在資料裡跨 ${r.hits.length} 個里（門牌整編中會這樣）${fallback}，請照戶口名簿點一個：`,
            candidates: r.hits.map((h) => ({ li: h.li, weight: 0 })),
          });
        }
        return;
      }

      const cands = candidatesFor(file, road, addrLane);
      if (cands.length === 0) {
        setAddrStatus({ kind: "none", text: `門牌資料裡沒有「${label}」的門牌，請改用下面的下拉選單或地圖。` });
        return;
      }
      setDistrict(d);
      setLin("");
      if (cands.length === 1) {
        setLi(cands[0].li);
        setMapCandidates([]);
        setAddrStatus({ kind: "ok", text: `✅ ${label} 整條都在 ${d}${cands[0].li}，已帶入下面的欄位。補上門牌號碼可以連鄰一起對到。` });
      } else {
        setLi("");
        setMapCandidates(cands.map((c) => ({ district: d, li: c.li })));
        setShowMap(true);
        setAddrStatus({
          kind: "pick",
          text: `${label} 經過 ${cands.length} 個里。補上門牌號碼就能直接對到里和鄰；不知道門牌就點一個里（地圖上紫色的就是這幾個）：`,
          candidates: cands,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [addrRoad, addrLane, addrNo, loadAddrFile]);

  const addrLanes = useMemo(
    () => (addrFile && addrRoad && addrFile.district === addrRoad.district ? lanesOf(addrFile.file, addrRoad.road) : []),
    [addrFile, addrRoad],
  );

  const chooseLi = (chosen: string) => {
    if (addrRoad) setDistrict(addrRoad.district);
    setLi(chosen);
    setFocusToken((n) => n + 1);
    setAddrStatus({ kind: "ok", text: `已選 ${addrRoad ? addrRoad.district : district}${chosen}。知道鄰的話再填鄰，結果會更準。` });
  };

  const linNum = useMemo(() => {
    const n = Number(lin);
    return lin.trim() !== "" && Number.isInteger(n) && n >= 1 && n <= 99 ? n : null;
  }, [lin]);

  const results = useMemo(() => {
    if (!data || !district || !li) return null;
    return schoolsForLi(data.schools, district, li, linNum);
  }, [data, district, li, linNum]);

  const pickedSchool = useMemo(
    () => (data && pickedSchoolId ? data.schools.find((s) => s.id === pickedSchoolId) ?? null : null),
    [data, pickedSchoolId],
  );

  /** 地圖上要整片標出來的學區 */
  const schoolLis = useMemo(() => {
    const s = tab === "school" ? pickedSchool : mapSchool;
    if (!s) return [];
    return s.zones.map((z) => ({ district: z.district, li: z.li, whole: z.mode === "all" || z.mode === "allExcept" }));
  }, [tab, pickedSchool, mapSchool]);

  const selected: LiRef | null = district && li ? { district, li } : null;

  /* 從地圖／定位選到里之後，結果在地圖下面，捲過去 */
  useEffect(() => {
    if (!scrollPendingRef.current || !results) return;
    scrollPendingRef.current = false;
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [results]);

  /* 結果不在畫面裡 → 底下浮一條 */
  useEffect(() => {
    const el = resultsRef.current;
    if (!el || !results) {
      setResultsVisible(true);
      return;
    }
    const io = new IntersectionObserver((entries) => setResultsVisible(entries[0]?.isIntersecting ?? true), {
      threshold: 0.05,
    });
    io.observe(el);
    return () => io.disconnect();
  }, [results]);

  const pickFromMap = (ref: LiRef) => {
    setDistrict(ref.district);
    setLi(ref.li);
    setMapSchool(null);
    scrollPendingRef.current = true;
    if (addrRoad) setAddrStatus({ kind: "ok", text: `已在地圖上選 ${ref.district}${ref.li}。知道鄰的話再填鄰，結果會更準。` });
  };

  const showSchoolOnMap = (s: School) => {
    setMapSchool(s);
    setShowMap(true);
    setTab("place");
  };

  const schoolOptions = useMemo(() => {
    if (!data) return [];
    return DISTRICTS.map((d) => ({
      district: d,
      schools: data.schools
        .filter((s) => s.district === d)
        .sort((a, b) => (a.level === b.level ? a.shortName.localeCompare(b.shortName, "zh-Hant") : a.level === "elementary" ? -1 : 1)),
    })).filter((g) => g.schools.length > 0);
  }, [data]);

  const liOptions = district ? VILLAGES[district] ?? [] : [];

  return (
    <>
      <div className={tax.tabs}>
        <button type="button" className={tab === "place" ? `${tax.tab} ${tax.tabOn}` : tax.tab} onClick={() => setTab("place")}>
          查我家的學區
        </button>
        <button type="button" className={tab === "school" ? `${tax.tab} ${tax.tabOn}` : tax.tab} onClick={() => setTab("school")}>
          查學校的學區
        </button>
      </div>

      {tab === "place" ? (
        <>
          <div className={tax.form}>
            {/* ── 路名／地址 ── */}
            <div className={styles.addrBlock}>
              <label className={tax.field}>
                <span className={tax.label}>
                  路名或地址
                  <span className={tax.labelHint}>不知道自己在哪個里？打路名就會跳建議；貼整個地址（含門牌）最準</span>
                </span>
                <div className={styles.addrWrap}>
                  <input
                    className={tax.input}
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    placeholder="例：梧棲區中央路一段100號、沙鹿區中山路"
                    value={addrQuery}
                    onFocus={() => {
                      ensureAddrIndex();
                      setAddrOpen(true);
                    }}
                    onBlur={() => setTimeout(() => setAddrOpen(false), 150)}
                    onChange={(e) => {
                      ensureAddrIndex();
                      setAddrQuery(e.target.value);
                      setAddrOpen(true);
                      if (addrRoad) {
                        setAddrRoad(null);
                        setAddrStatus(null);
                        setMapCandidates([]);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (addrHits.length > 0) pickRoad(addrHits[0]);
                      } else if (e.key === "Escape") setAddrOpen(false);
                    }}
                  />
                  {addrOpen && addrQuery.trim() && !addrRoad ? (
                    <ul className={styles.suggest} role="listbox">
                      {!addrIndex ? (
                        <li className={styles.suggestHint}>路名清單載入中…</li>
                      ) : addrHits.length === 0 ? (
                        <li className={styles.suggestHint}>找不到這條路。試試不加「段」、只打前兩個字，或改用下面的下拉選單、地圖。</li>
                      ) : (
                        addrHits.map((h) => (
                          <li key={`${h.district}${h.road}`}>
                            <button type="button" className={styles.suggestBtn} onMouseDown={(e) => e.preventDefault()} onClick={() => pickRoad(h)}>
                              <span className={styles.suggestDistrict}>{h.district}</span>
                              {h.road}
                              {h.prefix && h.tail ? <span className={styles.suggestTail}>{h.tail}</span> : null}
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  ) : null}
                </div>
              </label>

              {addrRoad ? (
                <div className={styles.addrDetail}>
                  <div className={styles.addrRoadName}>
                    {addrRoad.district}
                    {addrRoad.road}
                  </div>
                  <label className={tax.field}>
                    <span className={tax.label}>
                      巷弄<span className={tax.labelHint}>選填</span>
                    </span>
                    <select className={tax.input} value={addrLane} onChange={(e) => setAddrLane(e.target.value)}>
                      <option value="">整條路（不分巷弄）</option>
                      {addrLanes.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                      {addrLane && !addrLanes.includes(addrLane) ? <option value={addrLane}>{addrLane}（資料裡沒有）</option> : null}
                    </select>
                  </label>
                  <label className={tax.field}>
                    <span className={tax.label}>
                      號<span className={tax.labelHint}>選填</span>
                    </span>
                    <input
                      className={tax.input}
                      type="number"
                      inputMode="numeric"
                      min="1"
                      step="1"
                      placeholder="例：100"
                      value={addrNo}
                      onChange={(e) => setAddrNo(e.target.value)}
                    />
                  </label>
                </div>
              ) : null}

              {addrStatus ? (
                <div className={`${styles.addrStatus} ${STATUS_CLASS[addrStatus.kind]}`}>
                  {addrStatus.text}
                  {addrStatus.candidates ? (
                    <div className={styles.chips}>
                      {addrStatus.candidates.map((c) => (
                        <button key={c.li} type="button" className={styles.chip} onClick={() => chooseLi(c.li)}>
                          {c.li}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {addrStatus.lins ? (
                    <div className={styles.chips}>
                      {addrStatus.lins.map((n) => (
                        <button
                          key={n}
                          type="button"
                          className={styles.chip}
                          onClick={() => {
                            setLin(String(n));
                            setAddrStatus({ kind: "ok", text: `已選第 ${n} 鄰，已帶入下面的欄位。` });
                          }}
                        >
                          第 {n} 鄰
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {addrIndex && (addrStatus.kind === "ok" || addrStatus.kind === "warn") ? (
                    <div className={styles.addrSource}>依民政局 {addrIndex.month} 門牌資料，以戶口名簿為準。</div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className={styles.grid}>
              <label className={tax.field}>
                <span className={tax.label}>行政區</span>
                <select
                  className={tax.input}
                  value={district}
                  onChange={(e) => {
                    setDistrict(e.target.value);
                    setLi("");
                    setMapSchool(null);
                    clearAddr();
                  }}
                >
                  <option value="">請選擇</option>
                  {DISTRICTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label className={tax.field}>
                <span className={tax.label}>
                  里<span className={tax.labelHint}>戶籍地址上的「○○里」</span>
                </span>
                <select
                  className={tax.input}
                  value={li}
                  disabled={!district}
                  onChange={(e) => {
                    setLi(e.target.value);
                    setMapSchool(null);
                    setFocusToken((n) => n + 1);
                    if (showMap) scrollPendingRef.current = true;
                    if (addrRoad) setAddrStatus(null);
                  }}
                >
                  <option value="">{district ? "請選擇" : "先選行政區"}</option>
                  {liOptions.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className={tax.field}>
                <span className={tax.label}>
                  鄰<span className={tax.labelHint}>選填，知道再填</span>
                </span>
                <input
                  className={tax.input}
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="99"
                  step="1"
                  placeholder="例：12"
                  value={lin}
                  onChange={(e) => setLin(e.target.value)}
                />
              </label>
            </div>
            <div className={styles.formFoot}>
              <button type="button" className={styles.mapToggle} onClick={() => setShowMap((v) => !v)}>
                {showMap ? "▲ 收起地圖" : "🗺️ 不知道自己在哪個里？用地圖找（可用手機定位）"}
              </button>
              {(district || li || lin || addrQuery) && (
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={() => {
                    setDistrict("");
                    setLi("");
                    setLin("");
                    setMapSchool(null);
                    clearAddr();
                  }}
                >
                  清除
                </button>
              )}
            </div>
            {showMap ? (
              <SchoolMap selected={selected} schoolLis={schoolLis} candidates={mapCandidates} onPick={pickFromMap} focusToken={focusToken} />
            ) : null}
            {mapSchool && showMap ? (
              <p className={styles.mapLegend}>
                地圖上黃色是<strong>{mapSchool.shortName}</strong>的學區（實線＝整里、虛線＝只有部分鄰），藍色是你選的里。
                <button type="button" className={styles.linkBtn} onClick={() => setMapSchool(null)}>
                  清掉黃色
                </button>
              </p>
            ) : null}
            {mapCandidates.length > 0 && showMap && !mapSchool ? (
              <p className={styles.mapLegend}>
                地圖上紫色是<strong>{addrRoad ? `${addrRoad.district}${addrRoad.road}${addrLane}` : "這條路"}</strong>經過的里，點你家所在的那一塊。
              </p>
            ) : null}
          </div>

          {!selected ? (
            <div className={tax.alert}>
              <p className={tax.alertTitle}>打路名、或選好行政區和里，學區會直接出現在下面</p>
              <p className={tax.alertBody}>
                不知道自己在哪個里？最上面打路名或整個地址（有門牌號碼連鄰都對得到），或打開地圖點一下你家的位置、在現場直接用手機定位。
              </p>
            </div>
          ) : loadFailed ? (
            <div className={tax.alert}>
              <p className={tax.alertTitle}>學區資料載入失敗</p>
              <p className={tax.alertBody}>請重新整理頁面再試一次；還是不行就直接問我。</p>
            </div>
          ) : !results ? (
            <div className={tax.alert}>
              <p className={tax.alertTitle}>學區資料載入中…</p>
            </div>
          ) : (
            <div ref={resultsRef} className={styles.results}>
              <div className={styles.resultHead}>
                <div className={styles.resultLabel}>學區查詢結果</div>
                <div className={styles.resultTitle}>
                  {district}
                  {li}
                  {linNum != null ? ` 第 ${linNum} 鄰` : ""}
                </div>
                <div className={styles.resultSub}>
                  {linNum != null
                    ? "只列出這個鄰符合的學校；不確定鄰別的話把鄰欄清空，看整個里的情況。"
                    : "同一個里可能被切給好幾所學校，看下面每所學校寫的鄰別。"}
                </div>
              </div>
              <div className={styles.cols}>
                <ResultColumn title="國小" matches={results.elementary} lin={linNum} onShowOnMap={showSchoolOnMap} />
                <ResultColumn title="國中" matches={results.junior} lin={linNum} onShowOnMap={showSchoolOnMap} />
              </div>
              <p className={styles.meta}>
                資料整理自臺中市政府教育局學區公告，抓取日期 {data?.fetchedAt}。共同學區可擇一，額滿學校另有設籍規定，請再向學校確認。
              </p>
              <div className={tax.cta}>
                <p className={tax.ctaText}>想找這個學區裡的房子，或想確認能不能入學？</p>
                <Link className={`${home.btn} ${home.btnPrimary}`} href="/card/booking">
                  預約諮詢
                </Link>
              </div>
            </div>
          )}

          {results && !resultsVisible ? (
            <button
              type="button"
              className={tax.stickyBar}
              onClick={() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              <span className={tax.stickyText}>
                {district}
                {li}：國小 {results.elementary.length} 所、國中 {results.junior.length} 所
              </span>
              <span className={tax.stickyGo}>看結果 ↓</span>
            </button>
          ) : null}
        </>
      ) : (
        <>
          <div className={tax.form}>
            <label className={tax.field}>
              <span className={tax.label}>
                學校<span className={tax.labelHint}>依行政區分組</span>
              </span>
              <select className={tax.input} value={pickedSchoolId} onChange={(e) => setPickedSchoolId(e.target.value)} disabled={!data}>
                <option value="">{data ? "請選擇學校" : loadFailed ? "資料載入失敗" : "資料載入中…"}</option>
                {schoolOptions.map((g) => (
                  <optgroup key={g.district} label={g.district}>
                    {g.schools.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.shortName}
                        {levelLabel(s) ? `（${levelLabel(s)}）` : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            {pickedSchool ? (
              <button type="button" className={styles.mapToggle} onClick={() => setShowMap((v) => !v)}>
                {showMap ? "▲ 收起地圖" : "🗺️ 在地圖上看整個學區"}
              </button>
            ) : null}
            {pickedSchool && showMap ? (
              <SchoolMap
                selected={null}
                schoolLis={schoolLis}
                onPick={(ref) => {
                  pickFromMap(ref);
                  setTab("place");
                }}
                focusToken={focusToken}
              />
            ) : null}
          </div>

          {!pickedSchool ? (
            <div className={tax.alert}>
              <p className={tax.alertTitle}>選一所學校，它收哪些里會列在下面</p>
              <p className={tax.alertBody}>高中列的是國中部的學區；中小學會分成國小部、國中部兩筆。</p>
            </div>
          ) : (
            <div className={styles.results}>
              <div className={styles.resultHead}>
                <div className={styles.resultLabel}>
                  {pickedSchool.district}・{pickedSchool.level === "elementary" ? "國小" : "國中"}學區
                </div>
                <div className={styles.resultTitle}>
                  {pickedSchool.shortName}
                  {levelLabel(pickedSchool) ? `（${levelLabel(pickedSchool)}）` : ""}
                </div>
                <div className={styles.resultSub}>共 {pickedSchool.zones.length} 個里（含只有部分鄰的）</div>
              </div>
              <div className={styles.schoolBody}>
                <ul className={styles.zoneList}>
                  {pickedSchool.zones.map((z, i) => (
                    <li key={i} className={styles.zoneItem}>
                      <strong>
                        {z.district !== pickedSchool.district ? z.district : ""}
                        {z.li}
                      </strong>
                      <span className={styles.zoneItemDesc}>{describeZone(z)}</span>
                      <Pills zones={[z]} lin={null} />
                    </li>
                  ))}
                </ul>
                <details className={styles.details}>
                  <summary>完整學區公告原文</summary>
                  <div className={styles.rawText}>{pickedSchool.raw}</div>
                </details>
                <p className={styles.meta}>資料整理自臺中市政府教育局學區公告，抓取日期 {data?.fetchedAt}。</p>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

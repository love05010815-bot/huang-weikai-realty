"use client";
/**
 * /match 的互動流程：填條件 → 配對結果 → 預約看屋 → 導到官方 LINE
 *
 * 四個步驟都在同一個元件裡切換（不換頁），買方在手機上不會迷路。
 * 資料都打 /api/match/*；買方的 id 記在 localStorage，下次來條件會接在同一筆上，
 * 之後新物件推播才對得到人。
 *
 * ?book=物件編號：從 LINE 卡片的「預約看屋」按鈕進來，直接跳到那一戶的預約表單。
 */
import { useCallback, useEffect, useState } from "react";
import styles from "./match.module.css";

type Meta = {
  cities: { city: string; districts: string[] }[];
  types: readonly string[];
  features: readonly string[];
  threshold: number;
  addFriendUrl: string;
};

type Listing = {
  id: string;
  title: string;
  city: string;
  district: string;
  address: string;
  price: number;
  originalPrice: number | null;
  unitPrice: number | null;
  rooms: number;
  halls: number;
  baths: number;
  size: number;
  landSize: number;
  type: string;
  age: number;
  floor: string;
  features: string[];
  images: string[];
  video: string | null;
  sourceUrl: string;
};

type Match = Listing & { score: number; reasons: string[]; misses: string[]; recommended: boolean };

type SearchResult = { buyerId: string | null; summary: string; threshold: number; total: number; matches: Match[] };

type Booking = {
  viewing: { code: string; preferredAt: string; name: string; phone: string };
  buyerId: string | null;
  listing: { id: string; title: string; city: string; district: string; address: string; price: number };
  line: { confirmText: string; oaMessageUrl: string; addFriendUrl: string };
};

type Step = "form" | "results" | "booking" | "success";

const ROOMS = [
  { v: 0, l: "不限" },
  { v: 1, l: "1 房" },
  { v: 2, l: "2 房" },
  { v: 3, l: "3 房" },
  { v: 4, l: "4 房以上" },
];
const AGES = [
  { v: 0, l: "不限" },
  { v: 5, l: "5 年內" },
  { v: 10, l: "10 年內" },
  { v: 20, l: "20 年內" },
  { v: 30, l: "30 年內" },
];
const SLOTS = ["上午 10:00–12:00", "下午 14:00–17:00", "晚上 18:00–20:00"];
const BUYER_KEY = "match_buyer_id";

const money = (n: number) => `${Number(n).toLocaleString("zh-TW")} 萬`;
/** 屋齡 0 = 店網沒給（土地就沒有屋齡），不顯示；未滿一年在解析時記成 0.5 → 新成屋 */
const ageText = (a: number) => (Number(a) <= 0 ? "" : Number(a) < 1 ? "新成屋" : `屋齡 ${a} 年`);

/** 「台中市沙鹿區 · 27 坪 · 3 房 2 廳 2 衛 · 華廈 · 屋齡 30 年」—— 沒有的欄位（土地沒房數）直接省略 */
function metaLine(l: Listing): string {
  const parts = [`${l.city}${l.district}`];
  if (l.landSize > 0 && /土地|農|建地/.test(l.type)) parts.push(`地坪 ${l.landSize} 坪`);
  else if (l.size > 0) parts.push(`${l.size} 坪`);
  if (l.rooms > 0) parts.push(`${l.rooms} 房 ${l.halls} 廳 ${l.baths} 衛`);
  if (l.type) parts.push(l.type);
  const age = ageText(l.age);
  if (age) parts.push(age);
  return parts.join(" · ");
}

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function readBuyerId(): string | null {
  try {
    return localStorage.getItem(BUYER_KEY);
  } catch {
    return null;
  }
}
function writeBuyerId(id: string | null): void {
  if (!id) return;
  try {
    localStorage.setItem(BUYER_KEY, id);
  } catch {
    // 私密瀏覽等情況存不了，沒關係
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

type PrefState = {
  city: string;
  districts: string[];
  budgetMax: string;
  rooms: number;
  sizeMin: string;
  sizeMax: string;
  types: string[];
  maxAge: number;
  features: string[];
};

const EMPTY_PREF: PrefState = { city: "", districts: [], budgetMax: "", rooms: 0, sizeMin: "", sizeMax: "", types: [], maxAge: 0, features: [] };

function toggle(list: string[], v: string): string[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export default function MatchApp() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [step, setStep] = useState<Step>("form");
  const [pref, setPref] = useState<PrefState>(EMPTY_PREF);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [selected, setSelected] = useState<Listing | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", date: tomorrow(), slot: SLOTS[0], note: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [buyerId, setBuyerId] = useState<string | null>(null);

  const go = useCallback((next: Step) => {
    setStep(next);
    setError(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  useEffect(() => {
    setBuyerId(readBuyerId());
    api<Meta>("/api/match/meta")
      .then(setMeta)
      .catch(() => setMeta({ cities: [], types: [], features: [], threshold: 60, addFriendUrl: "" }));

    const bookId = new URLSearchParams(window.location.search).get("book");
    if (bookId) {
      api<Listing>(`/api/match/listing/${encodeURIComponent(bookId)}`)
        .then((listing) => {
          setSelected(listing);
          setStep("booking");
        })
        .catch((e: Error) => setNotice(e.message));
    }
  }, []);

  const districts = meta?.cities.find((c) => c.city === pref.city)?.districts ?? [];

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const preference = {
        city: pref.city,
        districts: pref.districts,
        budgetMax: Number(pref.budgetMax) || 0,
        rooms: pref.rooms,
        sizeMin: Number(pref.sizeMin) || 0,
        sizeMax: Number(pref.sizeMax) || 0,
        types: pref.types,
        maxAge: pref.maxAge,
        features: pref.features,
      };
      const data = await api<SearchResult>("/api/match/search", { method: "POST", body: JSON.stringify({ preference, buyerId }) });
      if (data.buyerId) {
        setBuyerId(data.buyerId);
        writeBuyerId(data.buyerId);
      }
      setResult(data);
      go("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "配對失敗，請稍後再試");
    } finally {
      setBusy(false);
    }
  }

  function openBooking(listing: Listing) {
    setSelected(listing);
    setForm((f) => ({ ...f, date: f.date || tomorrow() }));
    go("booking");
  }

  async function onBook(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const name = form.name.trim();
    const phone = form.phone.trim();
    if (!name) return setError("請填寫姓名");
    if (!/^[\d+\-\s()]{8,}$/.test(phone)) return setError("請填寫正確的手機號碼");
    if (!form.date) return setError("請選擇日期");
    setBusy(true);
    setError(null);
    try {
      const data = await api<Booking>("/api/match/viewing", {
        method: "POST",
        body: JSON.stringify({
          listingId: selected.id,
          name,
          phone,
          preferredAt: `${form.date} ${form.slot}`,
          note: form.note.trim(),
          buyerId,
          website: form.website,
        }),
      });
      if (data.buyerId) {
        setBuyerId(data.buyerId);
        writeBuyerId(data.buyerId);
      }
      setBooking(data);
      go("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "送出失敗，請稍後再試");
    } finally {
      setBusy(false);
    }
  }

  // ------------------------------------------------------------ 步驟 1：條件
  if (step === "form") {
    return (
      <div className={styles.wrap}>
        {notice && <p className={styles.error}>{notice}</p>}
        <form className={styles.card} onSubmit={onSearch} noValidate>
          <label className={styles.field}>
            縣市
            <select className={styles.select} value={pref.city} onChange={(e) => setPref((p) => ({ ...p, city: e.target.value, districts: [] }))}>
              <option value="">不限</option>
              {meta?.cities.map((c) => (
                <option key={c.city} value={c.city}>
                  {c.city}
                </option>
              ))}
            </select>
          </label>

          <div className={styles.field}>
            <div className={styles.label}>行政區（可複選）</div>
            {districts.length ? (
              <div className={styles.chips}>
                {districts.map((d) => (
                  <button key={d} type="button" className={`${styles.chip} ${pref.districts.includes(d) ? styles.chipOn : ""}`} onClick={() => setPref((p) => ({ ...p, districts: toggle(p.districts, d) }))}>
                    {d}
                  </button>
                ))}
              </div>
            ) : (
              <span className={styles.hint}>請先選擇縣市</span>
            )}
          </div>

          <label className={styles.field}>
            預算上限（萬）
            <input className={styles.input} type="number" inputMode="numeric" min={0} step={10} placeholder="例如 1500" value={pref.budgetMax} onChange={(e) => setPref((p) => ({ ...p, budgetMax: e.target.value }))} />
          </label>

          <div className={styles.field}>
            <div className={styles.label}>房數</div>
            <div className={styles.chips}>
              {ROOMS.map((r) => (
                <button key={r.v} type="button" className={`${styles.chip} ${pref.rooms === r.v ? styles.chipOn : ""}`} onClick={() => setPref((p) => ({ ...p, rooms: r.v }))}>
                  {r.l}
                </button>
              ))}
            </div>
          </div>

          <div className={`${styles.field} ${styles.two}`}>
            <label>
              坪數下限
              <input className={styles.input} type="number" inputMode="decimal" min={0} placeholder="不限" value={pref.sizeMin} onChange={(e) => setPref((p) => ({ ...p, sizeMin: e.target.value }))} />
            </label>
            <label>
              坪數上限
              <input className={styles.input} type="number" inputMode="decimal" min={0} placeholder="不限" value={pref.sizeMax} onChange={(e) => setPref((p) => ({ ...p, sizeMax: e.target.value }))} />
            </label>
          </div>

          <div className={styles.field}>
            <div className={styles.label}>類型（可複選）</div>
            <div className={styles.chips}>
              {(meta?.types ?? []).map((t) => (
                <button key={t} type="button" className={`${styles.chip} ${pref.types.includes(t) ? styles.chipOn : ""}`} onClick={() => setPref((p) => ({ ...p, types: toggle(p.types, t) }))}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <label className={styles.field}>
            屋齡上限
            <select className={styles.select} value={pref.maxAge} onChange={(e) => setPref((p) => ({ ...p, maxAge: Number(e.target.value) }))}>
              {AGES.map((a) => (
                <option key={a.v} value={a.v}>
                  {a.l}
                </option>
              ))}
            </select>
          </label>

          <div className={styles.field}>
            <div className={styles.label}>其他需求</div>
            <div className={styles.chips}>
              {(meta?.features ?? []).map((f) => (
                <button key={f} type="button" className={`${styles.chip} ${pref.features.includes(f) ? styles.chipOn : ""}`} onClick={() => setPref((p) => ({ ...p, features: toggle(p.features, f) }))}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy || !meta}>
            {busy ? "配對中…" : "開始配對"}
          </button>
        </form>
      </div>
    );
  }

  // ------------------------------------------------------------ 步驟 2：結果
  if (step === "results" && result) {
    const recommended = result.matches.filter((m) => m.recommended);
    const others = result.matches.filter((m) => !m.recommended).slice(0, 6);
    const card = (m: Match) => (
      <article key={m.id} className={styles.listing}>
        {m.images[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.img} src={m.images[0]} alt={m.title} loading="lazy" />
        )}
        <div className={styles.body}>
          <span className={`${styles.score} ${m.recommended ? "" : styles.scoreLow}`}>配對度 {m.score}%</span>
          <div className={styles.title}>{m.title}</div>
          <div className={styles.price}>
            {money(m.price)}
            {m.originalPrice ? <span className={styles.priceOld}>原價 {money(m.originalPrice)}</span> : null}
          </div>
          <div className={styles.meta}>{metaLine(m)}</div>
          <ul className={styles.reasons}>
            {m.reasons.slice(0, 3).map((r) => (
              <li key={r}>{r}</li>
            ))}
            {m.misses.slice(0, 2).map((r) => (
              <li key={r} className={styles.miss}>
                {r}
              </li>
            ))}
          </ul>
          <div className={styles.actions}>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`} onClick={() => openBooking(m)}>
              預約看屋
            </button>
            {m.sourceUrl && (
              <a className={styles.detail} href={m.sourceUrl} target="_blank" rel="noopener noreferrer">
                物件詳情 →
              </a>
            )}
          </div>
        </div>
      </article>
    );
    return (
      <div className={styles.wrap}>
        <button type="button" className={styles.linkBtn} onClick={() => go("form")}>
          ← 修改條件
        </button>
        <p className={styles.summary}>{result.summary}</p>
        {meta?.addFriendUrl && (
          <div className={styles.banner}>
            加入官方 LINE，之後有符合條件的新物件會自動通知您。{" "}
            <a href={meta.addFriendUrl} target="_blank" rel="noopener noreferrer">
              加入好友 →
            </a>
          </div>
        )}
        {result.matches.length === 0 ? (
          <div className={styles.empty}>目前沒有在售物件，請稍後再試。</div>
        ) : (
          <div className={styles.grid}>
            <p className={styles.hint}>{recommended.length ? `推薦 ${recommended.length} 個物件（配對度 ≥ ${result.threshold}%）` : "沒有達到推薦門檻的物件，以下是最接近的："}</p>
            {recommended.map(card)}
            {others.length > 0 && recommended.length > 0 && <p className={styles.hint}>其他接近的物件</p>}
            {others.map(card)}
          </div>
        )}
      </div>
    );
  }

  // ------------------------------------------------------------ 步驟 3：預約
  if (step === "booking" && selected) {
    return (
      <div className={styles.wrap}>
        <button type="button" className={styles.linkBtn} onClick={() => go(result ? "results" : "form")}>
          ← {result ? "返回結果" : "重新配對"}
        </button>
        <div className={`${styles.listing} ${styles.compact}`}>
          {selected.images[0] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.img} src={selected.images[0]} alt="" />
          )}
          <div className={styles.body}>
            <div className={styles.title}>{selected.title}</div>
            <div className={styles.price}>{money(selected.price)}</div>
            <div className={styles.meta}>{metaLine(selected)}</div>
          </div>
        </div>
        <form className={styles.card} onSubmit={onBook} noValidate>
          <label className={styles.field}>
            姓名
            <input className={styles.input} autoComplete="name" placeholder="怎麼稱呼您" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </label>
          <label className={styles.field}>
            手機
            <input className={styles.input} type="tel" autoComplete="tel" inputMode="tel" placeholder="0912-345-678" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </label>
          <div className={`${styles.field} ${styles.two}`}>
            <label>
              希望日期
              <input className={styles.input} type="date" min={tomorrow()} value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </label>
            <label>
              時段
              <select className={styles.select} value={form.slot} onChange={(e) => setForm((f) => ({ ...f, slot: e.target.value }))}>
                {SLOTS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
          <label className={styles.field}>
            備註（選填）
            <textarea className={styles.textarea} rows={2} placeholder="例如：想同時看附近其他物件" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
          </label>
          {/* honeypot：人看不到、機器人會填 */}
          <input className={styles.hp} tabIndex={-1} autoComplete="off" name="website" value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} />
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy}>
            {busy ? "送出中…" : "送出預約"}
          </button>
        </form>
      </div>
    );
  }

  // ------------------------------------------------------------ 步驟 4：導到官方 LINE
  if (step === "success" && booking) {
    return (
      <div className={`${styles.wrap} ${styles.center}`}>
        <div className={styles.big}>✅</div>
        <h2>預約已送出</h2>
        <p className={styles.summary}>
          預約編號 <strong className={styles.code}>{booking.viewing.code}</strong>
        </p>
        <div className={styles.box}>
          <b>{booking.listing.title}</b>
          <br />
          {booking.viewing.preferredAt}
          <br />
          {booking.viewing.name}｜{booking.viewing.phone}
        </div>
        <div className={styles.box}>
          最後一步：
          <ol>
            <li>點下方按鈕開啟官方 LINE（尚未加好友會先引導加入）</li>
            <li>直接送出已預先填好的「{booking.line.confirmText}」</li>
            <li>立即收到預約確認卡，專員將與您聯繫</li>
          </ol>
        </div>
        <a className={`${styles.btn} ${styles.btnLine}`} href={booking.line.oaMessageUrl}>
          前往官方 LINE 完成預約
        </a>
        <p className={styles.hint}>
          若按鈕沒有反應，請先{" "}
          <a href={booking.line.addFriendUrl} target="_blank" rel="noopener noreferrer">
            加入官方帳號好友
          </a>
          ，再傳送「{booking.line.confirmText}」。
        </p>
        <button type="button" className={styles.linkBtn} onClick={() => go("form")}>
          再找其他物件
        </button>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.linkBtn} onClick={() => go("form")}>
        ← 重新開始
      </button>
    </div>
  );
}

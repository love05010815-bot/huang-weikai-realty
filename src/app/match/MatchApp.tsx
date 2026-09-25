"use client";
/**
 * /match 的互動流程：填條件 → 配對結果 → 預約看屋 → 導到官方 LINE
 *
 * 四個步驟都在同一個元件裡切換（不換頁），買方在手機上不會迷路。
 * 資料都打 /api/match/*；買方的 id 記在 localStorage，下次來條件會接在同一筆上，
 * 之後新物件推播才對得到人。
 *
 * ?book=物件編號：從 LINE 卡片的「預約看屋」按鈕進來，直接跳到那一戶的預約表單。
 * ?k=識別碼：從官方帳號的連結進來，認得出是同一位買方 —— 先帶回他上次設定的條件，
 *   之後改的也寫回同一筆（換手機、清掉瀏覽資料都不會變成兩個人）。讀完立刻把 k 從網址上拿掉。
 * ?k=識別碼&go=1：專員在後台代客建檔後傳給客戶的連結。條件已經填好，進來直接看結果。
 *   🔴 這條路的結果是 **page.tsx 在伺服器端先配好、跟著 HTML 一起送過來的**（initial prop），
 *      不是進來之後再打 API。2026-09-27 他反映客戶點開要等 5 秒才有物件、以為要重填 ——
 *      原本是先畫出一張空表單，再等 /me → /search 兩趟。現在客戶第一眼就是物件，
 *      這個元件在那條路上**一個 API 都不用打**（選項 /meta 除外，那是「修改條件」才用到的）。
 *
 * 條件表單的欄位在 PreferenceForm.tsx、狀態換算在 preference-state.ts —— 後台代客建檔用同一份。
 */
import { useCallback, useEffect, useState } from "react";
import styles from "./match.module.css";
import PreferenceForm from "./PreferenceForm";
import { EMPTY_META, EMPTY_PREF, toApiPreference, toPrefState, type ApiPreference, type MatchMeta, type PrefState } from "./preference-state";

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

type SearchResult = {
  buyerId: string | null;
  summary: string;
  threshold: number;
  /** 目前在售的總數 */
  total: number;
  /** 符合條件的總數。matches 只有前 40 筆，兩個數字不一定一樣 */
  matched: number;
  matches: Match[];
};

type Me = { buyerId: string; preference: ApiPreference | null; name: string | null; phone: string | null; notify: boolean };

type Booking = {
  viewing: { code: string; preferredAt: string; name: string; phone: string };
  buyerId: string | null;
  /** 這一筆預約包含的物件；**不管幾間都只有一個編號** */
  listings: { id: string; title: string; city: string; district: string; address: string; price: number }[];
  /** 送出時已經下架、被剔除的間數 */
  dropped: number;
  line: { confirmText: string; oaMessageUrl: string; addFriendUrl: string; qrDataUrl: string };
};

type Step = "form" | "results" | "booking" | "success";

/**
 * 伺服器端先算好、跟著 HTML 一起送來的東西（只有 ?k=…&go=1 那條路會有）。
 *   undefined → 伺服器沒處理（一般訪客、或官方帳號「修改條件」那種只帶 k 的連結），照原本在瀏覽器裡跑
 *   null      → 伺服器處理了但識別碼不認，當一般訪客
 *   物件      → 直接用；result 為 null 表示這位買方還沒留條件，先給表單
 */
export type MatchInitial = {
  buyerId: string;
  token: string;
  preference: ApiPreference | null;
  name: string | null;
  phone: string | null;
  result: SearchResult | null;
};

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

export default function MatchApp({ initial }: { initial?: MatchInitial | null } = {}) {
  const [meta, setMeta] = useState<MatchMeta | null>(null);
  const [step, setStep] = useState<Step>(initial?.result ? "results" : "form");
  const [pref, setPref] = useState<PrefState>(() => (initial?.preference ? toPrefState(initial.preference) : EMPTY_PREF));
  const [result, setResult] = useState<SearchResult | null>(initial?.result ?? null);
  /**
   * 已勾選要看的物件。2026-09-18 改成可以一次勾好幾間 ——
   * 他說「客戶選八間不要跳八個訊息八個代號」，所以整批只送一次、只拿一個編號。
   */
  const [picked, setPicked] = useState<Listing[]>([]);
  const [form, setForm] = useState({ name: initial?.name ?? "", phone: initial?.phone ?? "", date: tomorrow(), slot: SLOTS[0], note: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [buyerId, setBuyerId] = useState<string | null>(initial?.buyerId ?? null);
  /** 從官方帳號連結帶進來的買方識別碼；有它就不靠瀏覽器記的編號 */
  const [token, setToken] = useState<string | null>(initial?.token ?? null);
  const [loaded, setLoaded] = useState<string | null>(
    // 伺服器帶了條件但沒有結果（他還沒留條件時 result 是 null）→ 跟原本一樣提示一句
    initial?.preference && !initial.result ? "已帶入您目前設定的條件，改好按「開始配對」就會更新，之後的新物件通知也照新條件配。" : null,
  );
  /**
   * 是不是用電腦看這一頁。
   * 導到官方 LINE 的深層連結（line.me/R/…）**只在手機有效**，桌機按了會被丟到 line.me 官網首頁，
   * 所以電腦上要改成請他用手機掃 QR。用 pointer:coarse 判斷比看 UA 可靠。
   */
  const [isDesktop, setIsDesktop] = useState(false);

  const go = useCallback((next: Step) => {
    setStep(next);
    setError(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  useEffect(() => {
    setIsDesktop(typeof window.matchMedia === "function" && !window.matchMedia("(pointer: coarse)").matches);
    // 伺服器已經認出他是誰 → 記進瀏覽器，下次直接來也對得回同一筆；沒有才看瀏覽器記的
    if (initial?.buyerId) writeBuyerId(initial.buyerId);
    else setBuyerId(readBuyerId());
    api<MatchMeta>("/api/match/meta")
      .then(setMeta)
      // 讀不到選項時房數仍然給得出來（不靠資料庫），其餘留空讓表單至少能用「不限」配對
      .catch(() => setMeta(EMPTY_META));

    const params = new URLSearchParams(window.location.search);

    // 從官方帳號的連結進來：帶回他目前設定的條件與聯絡方式，然後立刻把識別碼從網址上拿掉
    // —— 網址會被截圖、被轉貼，留著等於把他的資料給別人。識別碼過期就當沒帶，照原本流程走。
    const k = params.get("k");
    // go=1 是專員代客建檔後傳給客戶的連結：條件他已經填好了，客戶點開就直接看物件。
    // 那條路 page.tsx 已經在伺服器端處理完（initial 不是 undefined），這裡就不再打 /me。
    const autoGo = params.get("go") === "1";
    if (k && initial === undefined) {
      setToken(k);
      api<Me>(`/api/match/me?k=${encodeURIComponent(k)}`)
        .then((me) => {
          setBuyerId(me.buyerId);
          writeBuyerId(me.buyerId);
          if (me.preference) {
            const loadedPref = toPrefState(me.preference);
            setPref(loadedPref);
            if (autoGo) {
              // state 這時候還沒更新，買方編號與識別碼直接帶進去
              void runSearch(loadedPref, { buyerId: me.buyerId, token: k });
            } else {
              setLoaded("已帶入您目前設定的條件，改好按「開始配對」就會更新，之後的新物件通知也照新條件配。");
            }
          }
          setForm((f) => ({ ...f, name: me.name || f.name, phone: me.phone || f.phone }));
        })
        .catch(() => {
          // 連結失效不用嚇買方，就當一般訪客重新填一次
        });
    }
    if (k) {
      // 不管哪條路，識別碼都要從網址上拿掉 —— 網址會被截圖、被轉貼，留著等於把他的資料給別人
      params.delete("k");
      params.delete("go");
      const rest = params.toString();
      window.history.replaceState(null, "", rest ? `${window.location.pathname}?${rest}` : window.location.pathname);
    }

    const bookId = params.get("book");
    if (bookId) {
      api<Listing>(`/api/match/listing/${encodeURIComponent(bookId)}`)
        .then((listing) => {
          setPicked([listing]);
          setStep("booking");
        })
        .catch((e: Error) => setNotice(e.message));
    }
  }, []);

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    await runSearch(pref);
  }

  /**
   * 拿一組條件去配對、跳到結果。
   * 跟 onSearch 分開，是因為從代客建檔的連結進來要自動跑一次 —— 那時 state 還沒更新，
   * 條件、買方編號、識別碼都得直接傳進來。
   */
  async function runSearch(p: PrefState, ids: { buyerId?: string | null; token?: string | null } = {}) {
    setBusy(true);
    setError(null);
    try {
      const preference = toApiPreference(p);
      const data = await api<SearchResult>("/api/match/search", { method: "POST", body: JSON.stringify({ preference, buyerId: ids.buyerId ?? buyerId, token: ids.token ?? token }) });
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

  const isPicked = (id: string) => picked.some((p) => p.id === id);

  function togglePick(listing: Listing) {
    setPicked((list) => (list.some((p) => p.id === listing.id) ? list.filter((p) => p.id !== listing.id) : [...list, listing]));
  }

  function goBooking() {
    if (!picked.length) return;
    setForm((f) => ({ ...f, date: f.date || tomorrow() }));
    go("booking");
  }

  async function onBook(e: React.FormEvent) {
    e.preventDefault();
    if (!picked.length) return;
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
          listingIds: picked.map((p) => p.id),
          name,
          phone,
          preferredAt: `${form.date} ${form.slot}`,
          note: form.note.trim(),
          buyerId,
          token,
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
        {loaded && <p className={styles.loaded}>{loaded}</p>}
        <form className={styles.card} onSubmit={onSearch} noValidate>
          <PreferenceForm meta={meta} value={pref} onChange={setPref} styles={styles} />

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
    // 2026-09-25 起 /api/match/search 只會回「條件全部符合」的物件（見 lib/match/matcher.ts
    // 的 rankListings），所以這裡不再分「推薦」與「其他接近的」—— 列出來的每一間都符合。
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
            <button
              type="button"
              className={`${styles.btn} ${isPicked(m.id) ? styles.btnPicked : styles.btnPrimary} ${styles.btnSm}`}
              onClick={() => togglePick(m)}
            >
              {isPicked(m.id) ? "✓ 已選（再按取消）" : "＋ 加入預約"}
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
          <div className={styles.empty}>
            {result.total === 0 ? (
              "目前沒有在售物件，請稍後再試。"
            ) : (
              <>
                {/* 空手而回也要講清楚為什麼、下一步做什麼 —— 直接丟一句「沒有物件」，客戶就走了 */}
                <p className={styles.emptyTitle}>沒有完全符合這些條件的物件</p>
                <p>
                  目前在售的 {result.total} 間裡，沒有同時符合您所有條件的。
                  可以按上面的「修改條件」放寬其中一項（例如屋齡或預算）再找一次。
                </p>
                <p>您填的條件我們已經記下來了 —— 加官方 LINE 好友，之後有符合的新物件會第一時間通知您。</p>
              </>
            )}
          </div>
        ) : (
          <div className={styles.grid}>
            <p className={styles.hint}>
              符合您條件的物件 {result.matched ?? result.matches.length} 個
              {(result.matched ?? 0) > result.matches.length && `，先顯示前 ${result.matches.length} 個（縮小條件可以看得更精準）`}
            </p>
            {result.matches.map(card)}
          </div>
        )}
        {/* 勾好的物件整批送出，只會拿到一個預約編號 */}
        {picked.length > 0 && (
          <div className={styles.pickBar}>
            <span className={styles.pickCount}>已選 {picked.length} 間</span>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={goBooking}>
              一起預約這 {picked.length} 間 →
            </button>
          </div>
        )}
      </div>
    );
  }

  // ------------------------------------------------------------ 步驟 3：預約
  if (step === "booking" && picked.length > 0) {
    return (
      <div className={styles.wrap}>
        <button type="button" className={styles.linkBtn} onClick={() => go(result ? "results" : "form")}>
          ← {result ? "返回結果（可再加物件）" : "重新配對"}
        </button>
        {picked.length > 1 && <p className={styles.summary}>這 {picked.length} 間會一起送出，只會有一個預約編號。</p>}
        {picked.map((p) => (
          <div key={p.id} className={`${styles.listing} ${styles.compact}`}>
            {p.images[0] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={styles.img} src={p.images[0]} alt="" />
            )}
            <div className={styles.body}>
              <div className={styles.title}>{p.title}</div>
              <div className={styles.price}>{money(p.price)}</div>
              <div className={styles.meta}>{metaLine(p)}</div>
              {picked.length > 1 && (
                <button type="button" className={styles.linkBtn} onClick={() => togglePick(p)}>
                  移除這間
                </button>
              )}
            </div>
          </div>
        ))}
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
          {booking.listings.length > 1 ? (
            <>
              <b>共 {booking.listings.length} 間</b>
              <ol className={styles.pickedList}>
                {booking.listings.map((l) => (
                  <li key={l.id}>{l.title}</li>
                ))}
              </ol>
            </>
          ) : (
            <b>{booking.listings[0]?.title ?? "物件"}</b>
          )}
          <br />
          {booking.viewing.preferredAt}
          <br />
          {booking.viewing.name}｜{booking.viewing.phone}
        </div>
        {booking.dropped > 0 && (
          <p className={styles.hint}>其中 {booking.dropped} 間在送出時已經下架，沒有列入這次預約。</p>
        )}
        <div className={styles.box}>
          您的預約已經送出，專員已經收到通知，會盡快與您聯繫。
          <br />
          下面這一步是為了讓您在官方 LINE 收到確認卡，之後有新物件也能第一時間通知您。
        </div>
        {isDesktop ? (
          <>
            {/* 電腦上 line.me/R/… 會被導到 LINE 官網首頁，只能請他用手機掃 */}
            <div className={styles.box}>
              <b>用手機掃這個 QR code</b>
              <ol>
                <li>掃描後會開啟官方 LINE，訊息已經填好</li>
                <li>直接按送出「{booking.line.confirmText}」</li>
                <li>立即收到預約確認卡</li>
              </ol>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.qr} src={booking.line.qrDataUrl} alt="用手機掃描開啟官方 LINE" width={220} height={220} />
            </div>
            <p className={styles.hint}>
              手機上才能直接開啟 LINE。若您正在用手機看這頁，可以按{" "}
              <a href={booking.line.oaMessageUrl}>這裡前往官方 LINE</a>。
            </p>
          </>
        ) : (
          <>
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
          </>
        )}
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

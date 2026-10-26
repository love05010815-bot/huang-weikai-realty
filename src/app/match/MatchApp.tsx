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
 *
 * 🔑 租屋（2026-10-26 他要的「在這個配對裡面增加租屋的物件」，同日下午「代客建檔的連結裡也要分買屋還是租」）：
 *    表單最上面是「買房／租屋」切換（在 PreferenceForm 裡，代客建檔同一份），條件存在 pref.deal；送的還是 /api/match/search，
 *    伺服器依 deal 配出租或買賣（lib/match/search.ts），條件一樣存成買方條件（租屋的客人不推播，見 lib/match/sync.ts）。
 *    ?deal=rent 進來（租屋單戶頁「回租屋快搜」、分享的租屋連結）直接切到租屋。
 *    結果頁兩種共用，靠 result.deal 決定價格寫「萬」還是「元／月」、租屋沒有「算月付金」、
 *    「看這戶」進站內 /rent/<編號>（不外連官網）、分享的也是 /rent/<編號>。預約流程兩種完全一樣。
 */
import Link from "next/link";
import ShareButton from "@/app/_ui/ShareButton";
import share from "@/app/_ui/ShareButton.module.css";
import type { ColleagueContact } from "@/lib/match/colleague-link";
import { formatDealPrice, type Deal } from "@/lib/match/rent";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./match.module.css";
import PreferenceForm from "./PreferenceForm";
import { EMPTY_META, EMPTY_PREF, setDealIn, toApiPreference, toPrefState, type ApiPreference, type MatchMeta, type PrefState } from "./preference-state";

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
  /** 買賣／出租（2026-10-26）：出租的 price 是元／月 */
  deal?: Deal;
  /** 出租型態（整層(棟)住家／獨立套房…），只有出租才有 */
  rentType?: string;
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
  /** "rent" ＝ 這是租屋模式的結果（/api/match/rent）；沒有就是買房 */
  deal?: Deal;
};

type Me = { buyerId: string; preference: ApiPreference | null; name: string | null; phone: string | null; notify: boolean; colleague?: ColleagueContact | null };

type Booking = {
  viewing: { code: string; preferredAt: string; name: string; phone: string };
  buyerId: string | null;
  /** 這一筆預約包含的物件；**不管幾間都只有一個編號** */
  listings: { id: string; title: string; city: string; district: string; address: string; price: number }[];
  /** 送出時已經下架、被剔除的間數 */
  dropped: number;
  /** 本人的客人才有（導官方帳號）；同事的客人是 null，改看 colleague（2026-10-05 同事版） */
  line: { confirmText: string; oaMessageUrl: string; addFriendUrl: string; qrDataUrl: string } | null;
  colleague: ColleagueContact | null;
};

type Step = "form" | "results" | "booking" | "success";

/**
 * ↩️ 離開結果頁時存在 sessionStorage 的東西（2026-10-26 他要的「點看這戶進去，下個分頁要有返回上一頁所有物件的列表」）：
 * 單戶頁的「返回物件列表」（?back=1）、瀏覽器的上一頁、單戶頁的「預約看這戶」（?book=）回來時整頁接回來，客人不用重找。
 * 只在這個分頁有效、30 分鐘內有效；專屬連結（k）與伺服器先配好的（initial）優先，不接。
 */
type LastState = { pref: PrefState; result: SearchResult; picked: Listing[]; scrollY: number; at: number };

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
const LAST_KEY = "match_last_results";
const LAST_TTL_MS = 30 * 60_000;

const money = (n: number) => `${Number(n).toLocaleString("zh-TW")} 萬`;
/** 買賣寫「萬」、出租寫「元／月」 */
const priceOf = (l: { price: number; deal?: Deal }) => formatDealPrice(l.price, l.deal);
/** 屋齡 0 = 店網沒給（土地就沒有屋齡），不顯示；未滿一年在解析時記成 0.5 → 新成屋 */
const ageText = (a: number) => (Number(a) <= 0 ? "" : Number(a) < 1 ? "新成屋" : `屋齡 ${a} 年`);

/** 「台中市沙鹿區 · 27 坪 · 3 房 2 廳 2 衛 · 華廈 · 屋齡 30 年」—— 沒有的欄位（土地沒房數）直接省略 */
function metaLine(l: Listing): string {
  const parts = [`${l.city}${l.district}`];
  if (l.landSize > 0 && /土地|農|建地/.test(l.type)) parts.push(`地坪 ${l.landSize} 坪`);
  else if (l.size > 0) parts.push(`${l.size} 坪`);
  if (l.rooms > 0) parts.push(`${l.rooms} 房 ${l.halls} 廳 ${l.baths} 衛`);
  if (l.type) parts.push(l.type);
  if (l.deal === "rent" && l.rentType) parts.push(l.rentType);
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

function saveLast(s: Omit<LastState, "at">): void {
  try {
    sessionStorage.setItem(LAST_KEY, JSON.stringify({ ...s, at: Date.now() }));
  } catch {
    // 存不了就算了，回來時會是空表單
  }
}

function readLast(): LastState | null {
  try {
    const raw = sessionStorage.getItem(LAST_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<LastState>;
    if (!s || typeof s !== "object" || !s.result || !Array.isArray(s.result.matches) || !s.pref || typeof s.pref !== "object") return null;
    if (!Number.isFinite(Number(s.at)) || Date.now() - Number(s.at) > LAST_TTL_MS) return null;
    return { pref: s.pref as PrefState, result: s.result as SearchResult, picked: Array.isArray(s.picked) ? (s.picked as Listing[]) : [], scrollY: Number(s.scrollY) || 0, at: Number(s.at) };
  } catch {
    return null;
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/**
 * colleague：這位客人是同事的（2026-10-05 同事版）→ 署名、加 LINE、預約完成頁全部換成同事的，不碰官方帳號。
 * 伺服器端先認出來的從 props 進來；用 ?k= 在瀏覽器裡認的從 /api/match/me 回來。
 */
export default function MatchApp({ initial, colleague: colleagueProp = null }: { initial?: MatchInitial | null; colleague?: ColleagueContact | null } = {}) {
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
  const [colleague, setColleague] = useState<ColleagueContact | null>(colleagueProp);
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
  /** ↩️ 從單戶頁回來時要捲回剛才的位置（readLast 給的）；用掉就清 */
  const [restoreScroll, setRestoreScroll] = useState<number | null>(null);
  /** 離開這一頁時要存的最新狀態（事件 handler 拿不到最新的 state，所以放 ref） */
  const latest = useRef({ pref, result, picked });
  latest.current = { pref, result, picked };
  /** 上一次 saveLast 的時間：點「看這戶」當下存的那份有正確的捲動位置，卸載時（瀏覽器已經捲到頂）不要再蓋掉它 */
  const savedAt = useRef(0);
  const rememberList = useCallback(() => {
    const { pref: p, result: r, picked: pk } = latest.current;
    if (!r) return;
    saveLast({ pref: p, result: r, picked: pk, scrollY: window.scrollY });
    savedAt.current = Date.now();
  }, []);

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

    // 🔑 ?deal=rent：從租屋單戶頁「回租屋快搜」回來、或分享出去的租屋連結 → 直接開在租屋模式（2026-10-26）
    if (params.get("deal") === "rent") setPref((p) => setDealIn(p, "rent"));

    // ↩️ 從單戶頁「返回物件列表」回來（?back=1）、按瀏覽器的上一頁、或從單戶頁按「預約看這戶」（?book=）回來：
    //    把剛才那一頁的結果（條件、物件、已勾的）接回來，客人不用重找一次（2026-10-26 他要的）。
    const navType = (performance.getEntriesByType?.("navigation")?.[0] as PerformanceNavigationTiming | undefined)?.type;
    const wantRestore = params.get("back") === "1" || navType === "back_forward" || params.has("book");
    const last = wantRestore && initial === undefined && !params.get("k") ? readLast() : null;
    if (last) {
      setPref(last.pref);
      setResult(last.result);
      setPicked(last.picked);
      if (!params.has("book")) {
        setStep("results");
        setRestoreScroll(last.scrollY);
      }
    }
    if (params.has("back")) {
      params.delete("back");
      const rest = params.toString();
      window.history.replaceState(null, "", rest ? `${window.location.pathname}?${rest}` : window.location.pathname);
    }

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
          if (me.colleague !== undefined) setColleague(me.colleague);
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
          // 已經勾在列表裡的保留（從單戶頁按「預約看這戶」回來時，剛才勾的也要一起預約）
          setPicked((list) => (list.some((p) => p.id === listing.id) ? list : [...list, listing]));
          setStep("booking");
        })
        .catch((e: Error) => setNotice(e.message));
    }
  }, []);

  // ↩️ 離開結果頁時把目前的結果存起來：點「看這戶」在連結的 onClick 存（那時捲動位置還是對的）；
  //    其他離開方式（上一頁、關分頁、分享連結）靠 pagehide 與卸載補存，但剛存過 1.5 秒內的不蓋（瀏覽器那時已經捲到頂）
  useEffect(() => {
    const save = () => {
      if (Date.now() - savedAt.current < 1500) return;
      rememberList();
    };
    window.addEventListener("pagehide", save);
    return () => {
      window.removeEventListener("pagehide", save);
      save();
    };
  }, [rememberList]);

  // 接回來之後捲到剛才看的位置（結果畫好才捲，不然還沒有高度）
  useEffect(() => {
    if (restoreScroll === null || step !== "results") return;
    const y = restoreScroll;
    setRestoreScroll(null);
    window.setTimeout(() => window.scrollTo({ top: y }), 60);
  }, [restoreScroll, step]);

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
      saveLast({ pref: p, result: data, picked: latest.current.picked, scrollY: 0 });
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
          {/* 「買房／租屋」切換在 PreferenceForm 最上面（代客建檔同一份表單） */}
          <PreferenceForm meta={meta} value={pref} onChange={setPref} styles={styles} />

          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy || !meta}>
            {busy ? "配對中…" : pref.deal === "rent" ? "開始找租屋" : "開始配對"}
          </button>
        </form>
      </div>
    );
  }

  // ------------------------------------------------------------ 步驟 2：結果
  if (step === "results" && result) {
    // 2026-09-25 起 /api/match/search 只會回「條件全部符合」的物件（見 lib/match/matcher.ts
    // 的 rankListings），所以這裡不再分「推薦」與「其他接近的」—— 列出來的每一間都符合。
    // 🔑 租屋模式的結果（/api/match/rent）：價格寫「元／月」、沒有算月付金、「看這戶」與分享都走站內 /rent/<編號>
    const rent = result.deal === "rent";
    const card = (m: Match) => (
      <article key={m.id} className={styles.listing}>
        {m.images[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.img} src={m.images[0]} alt={m.title} loading="lazy" />
        )}
        {/* 📤 分享疊在卡片（照片）右上角（2026-10-20 他指定「以圖示呈現」）：分享站內 /match?book=編號，朋友點開直接看到這一戶、可預約 */}
        <ShareButton
          className={share.onPhotoRight}
          path={rent ? `/rent/${encodeURIComponent(m.id)}` : `/match?book=${encodeURIComponent(m.id)}`}
          title={m.title}
          text={`${m.title}｜${priceOf(m)}｜${m.city}${m.district}`}
        />
        <div className={styles.body}>
          <span className={`${styles.score} ${m.recommended ? "" : styles.scoreLow}`}>配對度 {m.score}%</span>
          <div className={styles.title}>{m.title}</div>
          <div className={styles.price}>
            {priceOf(m)}
            {!rent && m.originalPrice ? <span className={styles.priceOld}>原價 {money(m.originalPrice)}</span> : null}
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
            {rent ? (
              /* 出租物件的資料頁在站內（他要的「不導入外部連結」），/rent/<編號> 跟買賣單戶頁同一套版面 */
              <Link className={styles.detail} href={`/rent/${encodeURIComponent(m.id)}`} onClick={rememberList}>
                看這戶 →
              </Link>
            ) : (
              m.sourceUrl && (
                <a className={styles.detail} href={m.sourceUrl} target="_blank" rel="noopener noreferrer">
                  物件詳情 →
                </a>
              )
            )}
            {/* 💰 算月付金（2026-10-20 他要的）：帶著售價進 /tax 的房貸月付金，那邊預設貸 8 成直接算出來。租屋不用（他說的） */}
            {!rent && m.price > 0 && (
              <a className={styles.detail} href={`/tax?price=${m.price}&title=${encodeURIComponent(m.title)}#loan`}>
                算月付金 →
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
        {colleague ? (
          <div className={styles.banner}>
            有想問的可以直接找{colleague.name}：{" "}
            {colleague.lineUrl && (
              <a href={colleague.lineUrl} target="_blank" rel="noopener noreferrer">
                加 LINE →
              </a>
            )}
            {colleague.lineUrl && colleague.phone ? "　" : ""}
            {colleague.phone && <a href={`tel:${colleague.phone.replace(/\D/g, "")}`}>撥電話 {colleague.phone}</a>}
          </div>
        ) : rent ? null : (
          meta?.addFriendUrl && (
            <div className={styles.banner}>
              加入官方 LINE，之後有符合條件的新物件會自動通知您。{" "}
              <a href={meta.addFriendUrl} target="_blank" rel="noopener noreferrer">
                加入好友 →
              </a>
            </div>
          )
        )}
        {result.matches.length === 0 ? (
          <div className={styles.empty}>
            {result.total === 0 ? (
              rent ? "目前沒有出租中的物件，請稍後再試。" : "目前沒有在售物件，請稍後再試。"
            ) : (
              <>
                {/* 空手而回也要講清楚為什麼、下一步做什麼 —— 直接丟一句「沒有物件」，客戶就走了 */}
                <p className={styles.emptyTitle}>沒有完全符合這些條件的物件</p>
                <p>
                  目前{rent ? "出租中" : "在售"}的 {result.total} 間裡，沒有同時符合您所有條件的。
                  可以按上面的「修改條件」放寬其中一項（例如{rent ? "租金或房數" : "屋齡或預算"}）再找一次。
                </p>
                {/* 租屋查詢不存條件、不推播（lib/match/rent.ts），所以不要承諾「有新物件會通知」 */}
                {!rent && <p>{colleague ? `您填的條件${colleague.name}已經記下來了，有符合的新物件會再通知您。` : "您填的條件我們已經記下來了 —— 加官方 LINE 好友，之後有符合的新物件會第一時間通知您。"}</p>}
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
              <div className={styles.price}>{priceOf(p)}</div>
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
        {booking.colleague || !booking.line ? (
          <>
            {/* 同事的客人（2026-10-05 同事版）：不導官方帳號，直接給同事的 LINE 與電話 */}
            <div className={styles.box}>
              您的預約已經送出，{booking.colleague?.name ?? "專員"}會盡快與您聯繫。
              <br />
              有急事可以直接聯絡，說預約編號 {booking.viewing.code} 就可以。
            </div>
            {booking.colleague?.lineUrl && (
              <a className={`${styles.btn} ${styles.btnLine}`} href={booking.colleague.lineUrl} target="_blank" rel="noopener noreferrer">
                LINE 聯絡{booking.colleague.name}
              </a>
            )}
            {booking.colleague?.phone && (
              <a className={`${styles.btn} ${styles.btnPrimary}`} href={`tel:${booking.colleague.phone.replace(/\D/g, "")}`}>
                撥電話 {booking.colleague.phone}
              </a>
            )}
          </>
        ) : (
          <>
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

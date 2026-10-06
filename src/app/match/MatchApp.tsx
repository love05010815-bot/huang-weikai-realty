"use client";
/**
 * /match 的互動流程：好案配對找房（工具列篩選 → 物件卡 → 勾選）→ 預約看屋 → 導到官方 LINE／同事
 *
 * 2026-10-06 他說「客人看到的配對找房改用梧棲店官網的好案配對」（三個做法裡選了「把店官網那套找房工具搬過來」）：
 * 物件區改成跟店頭官網 pacifi-realtor-wuchi.vercel.app 的「好案配對找房」同一套介面 ——
 * 上面一張白色工具列（區域、類型、房數、總價、坪數、屋齡、樓層、其他需求、關鍵字），
 * 下面三欄物件卡（門市標籤、名稱、地址、房廳衛坪數屋齡、價格、查看詳情、選這間預約看屋），一次 9 張、「載入更多」。
 * 資料用自己的庫：/api/match/listings 一次抓全部在售、在瀏覽器裡篩（店頭官網也是整包 listings.json 這樣做），
 * 篩的規則就是 lib/match/matcher.ts 的 rankListings（純函式，瀏覽器跑得動）——
 * 客人在這裡看到的，跟同事在代客建檔看到的一模一樣，沒有第二套規則。樣式在 browse.module.css。
 *
 * 客人改了條件 → 停 0.8 秒就寫回 /api/match/search（同一筆買方；之後的新物件通知照新條件配）。
 * 關鍵字只是在這一頁找東西，不算條件、不寫回。
 *
 * 三個步驟在同一個元件裡切換（不換頁）；預約與完成頁沿用原本的（match.module.css）。
 * 買方的 id 記在 localStorage，下次來條件會接在同一筆上，之後新物件推播才對得到人。
 *
 * ?k=識別碼：從官方帳號的連結進來，認得出是同一位買方 —— 帶回他上次設定的條件直接篩，
 *   之後改的也寫回同一筆（換手機、清掉瀏覽資料都不會變成兩個人）。讀完立刻把 k 從網址上拿掉。
 * ?k=識別碼&go=1：專員在後台代客建檔後傳給客戶的連結。
 *   🔴 這條路的第一眼是 **page.tsx 在伺服器端先配好、跟著 HTML 一起送過來的**（initial.result，前 40 間），
 *      2026-09-27 他反映客戶點開要等 5 秒才有物件、以為要重填。整池在瀏覽器抓到之後就換成即時篩的結果。
 * ?book=物件編號：從 LINE 卡片的「預約看屋」按鈕進來，直接跳到那一戶的預約表單。
 * ?items=S編號,S編號：從店頭官網勾完物件跳回來（那邊「前往預約看屋」帶的，2026-10-06 那個視窗定的契約），
 *   這幾間直接勾好、進預約表單；已下架的剔除並提示。租屋（R 開頭）我們沒有，一樣當下架處理。
 */
import type { ColleagueContact } from "@/lib/match/colleague-link";
import { describePreference, rankListings } from "@/lib/match/matcher";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import bs from "./browse.module.css";
import { cardMeta, fullAddress, keywordHit, PAGE_SIZE, parseIdList, priceText, type CardListing } from "./browse-state";
import styles from "./match.module.css";
import { EMPTY_META, EMPTY_PREF, LAND_TYPE, toApiPreference, toPrefState, toggle, toggleTypeIn, type ApiPreference, type MatchMeta, type PrefState } from "./preference-state";

/** 物件（/api/match/listings 與 /api/match/search 回的形狀；rankListings 要的欄位都在） */
type Listing = CardListing & {
  city: string;
  unitPrice: number | null;
  usageType: string;
  floor: string;
  features: string[];
  video: string | null;
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

type Pool = { total: number; listings: Listing[] };

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

type Step = "browse" | "booking" | "success";

/**
 * 伺服器端先算好、跟著 HTML 一起送來的東西（只有 ?k=…&go=1 那條路會有）。
 *   undefined → 伺服器沒處理（一般訪客、或官方帳號「修改條件」那種只帶 k 的連結），照原本在瀏覽器裡跑
 *   null      → 伺服器處理了但識別碼不認，當一般訪客
 *   物件      → 直接用；result 為 null 表示這位買方還沒留條件
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

/**
 * colleague：這位客人是同事的（2026-10-05 同事版）→ 署名、加 LINE、預約完成頁全部換成同事的，不碰官方帳號。
 * 伺服器端先認出來的從 props 進來；用 ?k= 在瀏覽器裡認的從 /api/match/me 回來。
 * meta：工具列的選項（縣市行政區、類型、房數、屋齡…），page.tsx 在伺服器端算好傳進來，第一眼就畫得出工具列。
 */
export default function MatchApp({
  initial,
  colleague: colleagueProp = null,
  meta: metaProp,
}: { initial?: MatchInitial | null; colleague?: ColleagueContact | null; meta?: MatchMeta } = {}) {
  const meta = metaProp ?? EMPTY_META;
  const [step, setStep] = useState<Step>("browse");
  const [pref, setPref] = useState<PrefState>(() => (initial?.preference ? toPrefState(initial.preference) : EMPTY_PREF));
  const [keyword, setKeyword] = useState("");
  /** 全部在售（/api/match/listings）；還沒到之前先用伺服器配好的 result 撐第一眼 */
  const [pool, setPool] = useState<Listing[] | null>(null);
  const [poolError, setPoolError] = useState<string | null>(null);
  const [result] = useState<SearchResult | null>(initial?.result ?? null);
  const [shown, setShown] = useState(PAGE_SIZE);
  /** 有條件的（專屬連結進來）工具列先收起來，第一眼就是物件；一般訪客展開讓他選 */
  const [filtersOpen, setFiltersOpen] = useState<boolean>(() => !initial?.preference);
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
  /** 條件正在寫回資料庫（工具列角落的小字） */
  const [saving, setSaving] = useState(false);
  /**
   * 是不是用電腦看這一頁。
   * 導到官方 LINE 的深層連結（line.me/R/…）**只在手機有效**，桌機按了會被丟到 line.me 官網首頁，
   * 所以電腦上要改成請他用手機掃 QR。用 pointer:coarse 判斷比看 UA 可靠。
   */
  const [isDesktop, setIsDesktop] = useState(false);
  /** 使用者有沒有自己動過條件 —— 動過才寫回資料庫；帶進來的、/me 讀回來的不算 */
  const dirty = useRef(false);
  /** 寫回條件時要帶的身分；放 ref 是為了不讓 buyerId 一變就重跑那個 effect */
  const ids = useRef({ buyerId, token });
  ids.current = { buyerId, token };
  /** ?items=／?book= 要預先勾好的物件編號，等整池到了再對 */
  const wantIds = useRef<string[]>([]);

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

    const params = new URLSearchParams(window.location.search);

    // 從官方帳號的連結進來：帶回他目前設定的條件與聯絡方式，然後立刻把識別碼從網址上拿掉
    // —— 網址會被截圖、被轉貼，留著等於把他的資料給別人。識別碼過期就當沒帶，照一般訪客走。
    // go=1 那條路 page.tsx 已經在伺服器端處理完（initial 不是 undefined），這裡就不再打 /me。
    const k = params.get("k");
    if (k && initial === undefined) {
      setToken(k);
      api<Me>(`/api/match/me?k=${encodeURIComponent(k)}`)
        .then((me) => {
          setBuyerId(me.buyerId);
          writeBuyerId(me.buyerId);
          if (me.colleague !== undefined) setColleague(me.colleague);
          if (me.preference) {
            setPref(toPrefState(me.preference));
            setFiltersOpen(false);
          }
          setForm((f) => ({ ...f, name: me.name || f.name, phone: me.phone || f.phone }));
        })
        .catch(() => {
          // 連結失效不用嚇買方，就當一般訪客
        });
    }

    // 店頭官網勾完跳回來的 items=、LINE 卡片的 book=：整池到了再對（下面那個 effect）
    wantIds.current = parseIdList([params.get("items"), params.get("book")].filter(Boolean).join(","));

    if (k || params.has("items") || params.has("book")) {
      // 不管哪條路，識別碼都要從網址上拿掉 —— 網址會被截圖、被轉貼，留著等於把他的資料給別人
      params.delete("k");
      params.delete("go");
      params.delete("items");
      params.delete("book");
      const rest = params.toString();
      window.history.replaceState(null, "", rest ? `${window.location.pathname}?${rest}` : window.location.pathname);
    }

    api<Pool>("/api/match/listings")
      .then((p) => setPool(p.listings))
      .catch((e: Error) => setPoolError(e.message || "目前無法讀取物件，請稍後再試"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 整池到了：把 items=／book= 指定的那幾間勾好、直接進預約表單；下架的講一聲
  useEffect(() => {
    if (!pool || !wantIds.current.length) return;
    const want = wantIds.current;
    wantIds.current = [];
    const found = pool.filter((l) => want.includes(l.id));
    const missing = want.length - found.length;
    if (missing > 0) setNotice(found.length ? `您選的物件裡有 ${missing} 間已經下架或成交了，其餘照常預約。` : "您選的物件已經下架或成交了，請重新挑選。");
    if (found.length) {
      setPicked(found);
      setStep("booking");
    }
  }, [pool]);

  // 條件變了：從第一頁重畫；使用者自己改的才寫回資料庫（停 0.8 秒再寫，別每點一下就打一次）
  useEffect(() => {
    setShown(PAGE_SIZE);
    if (!dirty.current) return;
    const t = setTimeout(async () => {
      setSaving(true);
      try {
        const data = await api<SearchResult>("/api/match/search", {
          method: "POST",
          body: JSON.stringify({ preference: toApiPreference(pref), buyerId: ids.current.buyerId, token: ids.current.token }),
        });
        if (data.buyerId) {
          setBuyerId(data.buyerId);
          writeBuyerId(data.buyerId);
        }
      } catch {
        // 條件存不進去不影響看物件；下一次改條件會再試
      } finally {
        setSaving(false);
      }
    }, 800);
    return () => clearTimeout(t);
  }, [pref]);

  useEffect(() => {
    setShown(PAGE_SIZE);
  }, [keyword]);

  // ------------------------------------------------------------ 篩選（在瀏覽器裡跑，規則跟後台同一份）
  const ranked = useMemo<Listing[] | null>(
    () => (pool ? rankListings(toApiPreference(pref), pool, { limit: pool.length || 1 }).map((r) => r.listing) : null),
    [pool, pref],
  );
  const base: Listing[] = ranked ?? result?.matches ?? [];
  const list = useMemo(() => (keyword.trim() ? base.filter((l) => keywordHit(l, keyword)) : base), [base, keyword]);
  /** 符合的總數：整池到了就是 list 的長度；還沒到就用伺服器算的（matches 只有前 40 筆） */
  const matched = ranked || keyword.trim() ? list.length : (result?.matched ?? 0);
  const total = pool ? pool.length : (result?.total ?? 0);
  const visible = list.slice(0, shown);
  const waiting = !pool && !result && !poolError;
  const summary = describePreference(toApiPreference(pref));
  const wantsLand = pref.types.includes(LAND_TYPE);

  const set = (patch: Partial<PrefState> | ((prev: PrefState) => Partial<PrefState>)) => {
    dirty.current = true;
    setPref((prev) => ({ ...prev, ...(typeof patch === "function" ? patch(prev) : patch) }));
  };
  const pillClass = (on: boolean) => `${bs.pill} ${on ? bs.pillOn : ""}`;
  /** 沒選縣市時行政區那排先拿第一個縣市（台中市）的來畫，點了就順手把縣市設好 */
  const cityForPills = pref.city || meta.cities[0]?.city || "";
  const districts = meta.cities.find((c) => c.city === cityForPills)?.districts ?? [];

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

  // ------------------------------------------------------------ 步驟 1：好案配對找房
  if (step === "browse") {
    const card = (l: Listing) => {
      const on = isPicked(l.id);
      return (
        <article key={l.id} className={`${bs.card} ${on ? bs.cardOn : ""}`}>
          {l.images[0] ? (
            <div className={bs.thumb}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={l.images[0]} alt={l.title} loading="lazy" />
            </div>
          ) : (
            <div className={bs.thumb} />
          )}
          <div className={bs.body}>
            {l.store && <span className={bs.store}>{l.store}</span>}
            <h3 className={bs.title}>{l.title}</h3>
            <p className={bs.addr}>{fullAddress(l)}</p>
            <p className={bs.meta}>{cardMeta(l)}</p>
            <div className={bs.foot}>
              <span className={bs.price}>
                {priceText(l.price)}
                {l.originalPrice ? <span className={bs.old}>原價 {priceText(l.originalPrice)}</span> : null}
              </span>
              {l.sourceUrl && (
                <a className={`${bs.btn} ${bs.btnOutline} ${bs.btnSm}`} href={l.sourceUrl} target="_blank" rel="noopener noreferrer">
                  查看詳情
                </a>
              )}
            </div>
            <label className={bs.pick}>
              <input type="checkbox" checked={on} onChange={() => togglePick(l)} />
              選這間預約看屋
            </label>
          </div>
        </article>
      );
    };

    return (
      <div className={bs.browse}>
        {notice && <p className={styles.error}>{notice}</p>}

        {colleague ? (
          <div className={bs.agent}>
            <div className={bs.agentWho}>
              為您服務的業務<b>{colleague.name}</b>
            </div>
            <div className={bs.agentBtns}>
              {colleague.lineUrl && (
                <a className={`${bs.btn} ${bs.btnRed} ${bs.btnSm}`} href={colleague.lineUrl} target="_blank" rel="noopener noreferrer">
                  加 LINE 聯絡{colleague.name}
                </a>
              )}
              {colleague.phone && (
                <a className={`${bs.btn} ${bs.btnOutline} ${bs.btnSm}`} href={`tel:${colleague.phone.replace(/\D/g, "")}`}>
                  撥打 {colleague.phone}
                </a>
              )}
            </div>
          </div>
        ) : (
          meta.addFriendUrl && (
            <div className={bs.agent}>
              <div className={bs.agentWho}>加入官方 LINE，之後有符合條件的新物件會自動通知您。</div>
              <div className={bs.agentBtns}>
                <a className={`${bs.btn} ${bs.btnRed} ${bs.btnSm}`} href={meta.addFriendUrl} target="_blank" rel="noopener noreferrer">
                  加入好友
                </a>
              </div>
            </div>
          )
        )}

        <div className={bs.sumbar}>
          <div className={bs.sumText}>
            {summary === "不限條件" ? "目前沒有設定條件，列出全部在售物件" : <>您的條件：<b>{summary}</b></>}
            {saving ? "　（條件儲存中…）" : ""}
          </div>
          <button type="button" className={bs.linkBtn} onClick={() => setFiltersOpen((o) => !o)}>
            {filtersOpen ? "收合條件 ▲" : "調整條件 ▼"}
          </button>
        </div>

        {filtersOpen && (
          <div className={bs.tool}>
            <div className={bs.row}>
              <input className={`${bs.input} ${bs.keyword}`} type="search" placeholder="搜尋物件名稱或地址，例如：三房、四維路" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
              {meta.cities.length > 1 && (
                <select className={bs.select} value={pref.city} onChange={(e) => set({ city: e.target.value, districts: [] })} aria-label="縣市">
                  <option value="">縣市不限</option>
                  {meta.cities.map((c) => (
                    <option key={c.city} value={c.city}>
                      {c.city}
                    </option>
                  ))}
                </select>
              )}
              <div className={bs.range}>
                <input className={bs.input} type="number" inputMode="numeric" min={0} step={10} placeholder="最高總價" value={pref.budgetMax} onChange={(e) => set({ budgetMax: e.target.value })} aria-label="預算上限" />
                <span className={bs.unit}>萬</span>
              </div>
            </div>

            <div className={bs.row}>
              <span className={bs.lbl}>區域</span>
              {districts.length ? (
                <div className={bs.pills}>
                  {districts.map((d) => (
                    <button key={d} type="button" className={pillClass(pref.districts.includes(d))} onClick={() => set((p) => ({ city: cityForPills, districts: toggle(p.districts, d) }))}>
                      {d}
                    </button>
                  ))}
                </div>
              ) : (
                <span className={bs.hint}>請先選擇縣市</span>
              )}
            </div>

            <div className={bs.row}>
              <span className={bs.lbl}>類型</span>
              <div className={bs.pills}>
                {meta.types.map((t) => (
                  <button key={t} type="button" className={pillClass(pref.types.includes(t))} onClick={() => { dirty.current = true; setPref((p) => toggleTypeIn(p, t)); }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {wantsLand && (
              <div className={bs.row}>
                <span className={bs.lbl}>土地</span>
                <div className={bs.pills}>
                  {meta.landCategories.map((c) => (
                    <button key={c} type="button" className={pillClass(pref.landCategories.includes(c))} onClick={() => set((p) => ({ landCategories: toggle(p.landCategories, c) }))}>
                      {c}
                    </button>
                  ))}
                </div>
                <div className={bs.range}>
                  <input className={bs.input} type="number" inputMode="decimal" min={0} placeholder="地坪下限" value={pref.landMin} onChange={(e) => set({ landMin: e.target.value })} aria-label="土地坪數下限" />
                  <span>～</span>
                  <input className={bs.input} type="number" inputMode="decimal" min={0} placeholder="地坪上限" value={pref.landMax} onChange={(e) => set({ landMax: e.target.value })} aria-label="土地坪數上限" />
                  <span className={bs.unit}>坪</span>
                </div>
              </div>
            )}

            <div className={bs.row}>
              <span className={bs.lbl}>房數</span>
              <div className={bs.pills}>
                {meta.rooms.map((r) => (
                  <button key={r.value} type="button" className={pillClass(pref.roomsList.includes(r.value))} onClick={() => set((p) => ({ roomsList: toggle(p.roomsList, r.value) }))}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={bs.row}>
              <span className={bs.lbl}>坪數</span>
              <div className={bs.range}>
                <input className={bs.input} type="number" inputMode="decimal" min={0} placeholder="建坪下限" value={pref.sizeMin} onChange={(e) => set({ sizeMin: e.target.value })} aria-label="建物坪數下限" />
                <span>～</span>
                <input className={bs.input} type="number" inputMode="decimal" min={0} placeholder="建坪上限" value={pref.sizeMax} onChange={(e) => set({ sizeMax: e.target.value })} aria-label="建物坪數上限" />
                <span className={bs.unit}>坪</span>
              </div>
              <span className={bs.lbl}>屋齡</span>
              <div className={bs.range}>
                <select className={bs.select} value={pref.ageMin} onChange={(e) => set({ ageMin: e.target.value })} aria-label="屋齡下限">
                  <option value="">不限</option>
                  {meta.ages.map((a) => (
                    <option key={a.value} value={String(a.value)}>
                      {a.label}
                    </option>
                  ))}
                </select>
                <span>～</span>
                <select className={bs.select} value={pref.ageMax} onChange={(e) => set({ ageMax: e.target.value })} aria-label="屋齡上限">
                  <option value="">不限</option>
                  {meta.ages.map((a) => (
                    <option key={a.value} value={String(a.value)}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
              <span className={bs.lbl}>樓層</span>
              <select className={bs.select} value={pref.floor} onChange={(e) => set({ floor: e.target.value })} aria-label="希望樓層">
                <option value="">樓層不限</option>
                {meta.floors.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={bs.row}>
              <span className={bs.lbl}>需求</span>
              <div className={bs.pills}>
                {meta.features.map((f) => (
                  <button key={f} type="button" className={pillClass(pref.features.includes(f))} onClick={() => set((p) => ({ features: toggle(p.features, f) }))}>
                    {f}
                  </button>
                ))}
              </div>
              <button type="button" className={bs.linkBtn} style={{ marginLeft: "auto" }} onClick={() => { setKeyword(""); set(() => EMPTY_PREF); }}>
                清除全部條件
              </button>
            </div>
          </div>
        )}

        <p className={bs.count}>
          {waiting ? "物件載入中⋯" : (
            <>
              共 <b>{matched}</b> 筆符合物件{total > 0 ? `（目前在售 ${total} 間）` : ""}
              {!ranked && result && result.matched > result.matches.length ? "，先顯示前 40 間，其餘載入中⋯" : ""}
            </>
          )}
        </p>

        {waiting ? null : poolError && !result ? (
          <div className={bs.empty}>{poolError}</div>
        ) : list.length === 0 ? (
          <div className={bs.empty}>
            {total === 0 ? (
              "目前沒有在售物件，請稍後再試。"
            ) : (
              <>
                <p className={bs.emptyTitle}>沒有完全符合這些條件的物件</p>
                <p>目前在售的 {total} 間裡，沒有同時符合您所有條件的。可以按「調整條件」放寬其中一項（例如屋齡或預算）再找一次。</p>
                <p>{colleague ? `您填的條件${colleague.name}已經記下來了，有符合的新物件會再通知您。` : "您填的條件我們已經記下來了 —— 加官方 LINE 好友，之後有符合的新物件會第一時間通知您。"}</p>
              </>
            )}
          </div>
        ) : (
          <div className={bs.grid}>{visible.map(card)}</div>
        )}

        {shown < list.length && (
          <div className={bs.moreWrap}>
            <button type="button" className={`${bs.btn} ${bs.btnOutline} ${bs.btnLg}`} onClick={() => setShown((s) => s + PAGE_SIZE)}>
              載入更多物件（還有 {list.length - shown} 間）
            </button>
          </div>
        )}

        <p className={bs.note}>
          物件資料來自太平洋房屋官網與店網，僅供瀏覽參考，實際成交以現況與官網公告為準。點「查看詳情」會開啟物件頁。
          <br />
          看中意的勾「選這間預約看屋」，可以一次勾好幾間，再按下面的「一起預約」。
        </p>

        {/* 勾好的物件整批送出，只會拿到一個預約編號 */}
        {picked.length > 0 && (
          <div className={bs.bar}>
            <span className={bs.barCount}>
              已選 <b>{picked.length}</b> 間
            </span>
            <button type="button" className={`${bs.btn} ${bs.btnRed}`} onClick={goBooking}>
              一起預約這 {picked.length} 間 →
            </button>
          </div>
        )}
      </div>
    );
  }

  // ------------------------------------------------------------ 步驟 2：預約
  if (step === "booking" && picked.length > 0) {
    return (
      <div className={styles.wrap}>
        <button type="button" className={styles.linkBtn} onClick={() => go("browse")}>
          ← 返回物件（可再加物件）
        </button>
        {notice && <p className={styles.hint}>{notice}</p>}
        {picked.length > 1 && <p className={styles.summary}>這 {picked.length} 間會一起送出，只會有一個預約編號。</p>}
        {picked.map((p) => (
          <div key={p.id} className={`${styles.listing} ${styles.compact}`}>
            {p.images[0] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={styles.img} src={p.images[0]} alt="" />
            )}
            <div className={styles.body}>
              <div className={styles.title}>{p.title}</div>
              <div className={styles.price}>{priceText(p.price)}</div>
              <div className={styles.meta}>{fullAddress(p)}</div>
              <div className={styles.meta}>{cardMeta(p)}</div>
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

  // ------------------------------------------------------------ 步驟 3：導到官方 LINE／同事
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
        {booking.dropped > 0 && <p className={styles.hint}>其中 {booking.dropped} 間在送出時已經下架，沒有列入這次預約。</p>}
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
                  手機上才能直接開啟 LINE。若您正在用手機看這頁，可以按 <a href={booking.line.oaMessageUrl}>這裡前往官方 LINE</a>。
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
        <button
          type="button"
          className={styles.linkBtn}
          onClick={() => {
            setPicked([]);
            setBooking(null);
            go("browse");
          }}
        >
          再找其他物件
        </button>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.linkBtn} onClick={() => go("browse")}>
        ← 回到物件
      </button>
    </div>
  );
}

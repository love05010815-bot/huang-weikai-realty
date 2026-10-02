"use client";

/**
 * 收藏頁的內容：兩個頁籤「我的最愛」「瀏覽足跡」
 *
 * 資料兩層：
 *   ① 客戶瀏覽器裡的清單（store.ts）—— 有 key 跟收藏當下的名稱快照，**掛載後立刻畫得出來**
 *   ② /api/favorites 回來的「現在」—— 建案在售件數、物件售價、封面、是不是已下架，回來就蓋上去
 *
 * API 掛了就停在①：卡片照樣有名字可以點，上面多一行「暫時讀不到最新資料」。
 * 不要做成「API 回來前整頁轉圈圈」—— 這頁最常見的狀況是客戶在手機訊號不好的地方打開。
 *
 * 足跡跟最愛共用同一種卡片，差在足跡那邊的愛心是「可以加進最愛」、而且有「從足跡移除」。
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { OWNER } from "@/config/owner";
import { formatWan } from "@/lib/houseol-price";
import {
  favoritesApiHref,
  type FavoritesPayload,
  type ListingCard,
  type ProjectCard,
  type SavedItem,
} from "@/lib/favorites";
import FavButton from "@/app/_ui/favorites/FavButton";
import { clearTrail, removeTrail, useSavedState } from "@/app/_ui/favorites/store";
import styles from "./favorites.module.css";

type Tab = "favs" | "trail";
type Cards = Pick<FavoritesPayload, "projects" | "listings">;
type Fetch = "idle" | "loading" | "ok" | "error";

const NO_CARDS: Cards = { projects: {}, listings: {} };

/** 「9/30」這種短日期。足跡只在掛載後才渲染，所以用瀏覽器時區沒有 hydration 問題 */
function shortDate(ms: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" });
}

export default function FavoritesView() {
  const { favs, trail } = useSavedState();
  const [tab, setTab] = useState<Tab>("favs");
  const [cards, setCards] = useState<Cards>(NO_CARDS);
  const [fetchState, setFetchState] = useState<Fetch>("idle");

  // 收藏鈕旁邊「查看我的最愛 →」連到 /favorites；足跡要分享連結的話是 /favorites#trail
  useEffect(() => {
    if (window.location.hash === "#trail") setTab("trail");
  }, []);

  /** 兩個清單合起來要查哪些 key。簽章變了才重打，按愛心移除不會害它重打一次 */
  const apiHref = useMemo(() => favoritesApiHref([...favs, ...trail]), [favs, trail]);

  useEffect(() => {
    if (!apiHref) {
      setCards(NO_CARDS);
      setFetchState("idle");
      return;
    }
    const ctrl = new AbortController();
    setFetchState("loading");
    fetch(apiHref, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<FavoritesPayload>) : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        // 新的蓋上去、舊的留著：這次沒查的 key（例如剛移除又加回來）還有上一輪的資料可用
        setCards((prev) => ({
          projects: { ...prev.projects, ...data.projects },
          listings: { ...prev.listings, ...data.listings },
        }));
        setFetchState("ok");
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setFetchState("error");
      });
    return () => ctrl.abort();
  }, [apiHref]);

  const list = tab === "favs" ? favs : trail;

  return (
    <div className={styles.wrap}>
      <div className={styles.tabs} role="tablist" aria-label="我的最愛與瀏覽足跡">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "favs"}
          className={tab === "favs" ? styles.tabOn : styles.tab}
          onClick={() => setTab("favs")}
        >
          我的最愛
          <span className={styles.count}>{favs.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "trail"}
          className={tab === "trail" ? styles.tabOn : styles.tab}
          onClick={() => setTab("trail")}
        >
          瀏覽足跡
          <span className={styles.count}>{trail.length}</span>
        </button>
      </div>

      {fetchState === "error" && list.length > 0 && (
        <p className={styles.warn}>暫時讀不到最新資料，先顯示你收藏當時的資訊；售價與上架狀態請以物件頁為準。</p>
      )}

      {list.length === 0 ? (
        tab === "favs" ? (
          <div className={styles.empty}>
            <p>還沒有收藏任何建案或物件。</p>
            <p className={styles.emptyHint}>在建案地圖點開一個建案、或在精選好案的卡片上，按一下 ♡ 就會收在這裡。</p>
            <div className={styles.emptyBtns}>
              <Link className={styles.btnPrimary} href="/map">
                去建案地圖逛逛
              </Link>
              <Link className={styles.btnGhost} href="/listings">
                看精選好案
              </Link>
            </div>
          </div>
        ) : (
          <div className={styles.empty}>
            <p>還沒有瀏覽紀錄。</p>
            <p className={styles.emptyHint}>在建案地圖點開建案、或打開某一戶的介紹頁，就會留在這裡，方便你回頭找。</p>
          </div>
        )
      ) : (
        <ul className={styles.list}>
          {list.map((item) =>
            item.kind === "project" ? (
              <ProjectRow
                key={`p:${item.key}`}
                item={item}
                card={cards.projects[item.key]}
                inTrail={tab === "trail"}
                loading={fetchState === "loading"}
              />
            ) : (
              <ListingRow
                key={`l:${item.key}`}
                item={item}
                card={cards.listings[item.key]}
                missing={fetchState === "ok" && !cards.listings[item.key]}
                inTrail={tab === "trail"}
                loading={fetchState === "loading"}
              />
            ),
          )}
        </ul>
      )}

      {tab === "trail" && trail.length > 0 && (
        <div className={styles.trailFoot}>
          <button
            type="button"
            className={styles.clear}
            onClick={() => {
              if (window.confirm("要清除全部瀏覽足跡嗎？（我的最愛不會動）")) clearTrail();
            }}
          >
            清除全部足跡
          </button>
        </div>
      )}

      <p className={styles.notice}>
        收藏與足跡只存在<strong>這台裝置的這個瀏覽器</strong>裡，不會上傳、也不會跟任何人分享；
        換手機、換瀏覽器或清除瀏覽資料就會消失。想長期保留的建案，歡迎直接
        <Link href="/card/booking">預約諮詢</Link>，我幫你一起記著。
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- 建案

function ProjectRow({
  item,
  card,
  inTrail,
  loading,
}: {
  item: SavedItem;
  card: ProjectCard | undefined;
  inTrail: boolean;
  loading: boolean;
}) {
  const name = card?.name ?? item.title;
  const sub = card ? `${card.builder}・${card.area}` : item.sub;
  return (
    <li className={styles.item}>
      <div className={styles.thumbHolder} aria-hidden="true">
        🏙️
      </div>
      <div className={styles.body}>
        <div className={styles.topRow}>
          <span className={styles.kind}>建案</span>
          {card && <span className={styles.status}>{card.status}</span>}
          {inTrail && item.at > 0 && <span className={styles.when}>{`${shortDate(item.at)} 看過`}</span>}
        </div>
        <h2 className={styles.name}>{name}</h2>
        <p className={styles.meta}>
          {sub}
          {card && (
            <>
              {card.completion && <span>{/\d{4}/.test(card.completion) ? `${card.completion} 完工` : card.completion}</span>}
              {card.units != null && <span>{`${card.units.toLocaleString("zh-TW")} 戶`}</span>}
            </>
          )}
        </p>
        {card ? (
          card.mine > 0 ? (
            <p className={styles.mine}>{`🏠 ${OWNER.alias}目前在這個建案有 ${card.mine} 件在售`}</p>
          ) : (
            <p className={styles.mineNone}>{`目前${OWNER.alias}手上沒有這個建案的物件在售，想找可以先跟我說`}</p>
          )
        ) : loading ? (
          <p className={styles.mineNone}>讀取在售物件…</p>
        ) : null}
        <div className={styles.btns}>
          <Link className={styles.btnPrimary} href={{ pathname: "/map", query: { project: item.key } }}>
            到地圖看這個建案 →
          </Link>
          <Link className={styles.btnGhost} href="/card/booking">
            預約諮詢
          </Link>
          <FavButton kind="project" id={item.key} title={name} sub={sub} />
          {inTrail && (
            <button
              type="button"
              className={styles.x}
              onClick={() => removeTrail("project", item.key)}
              aria-label={`從足跡移除 ${name}`}
            >
              從足跡移除
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------- 精選好案

function ListingRow({
  item,
  card,
  missing,
  inTrail,
  loading,
}: {
  item: SavedItem;
  card: ListingCard | undefined;
  /** API 回來了但沒有這戶 ＝ 後台整筆刪掉了 */
  missing: boolean;
  inTrail: boolean;
  loading: boolean;
}) {
  const title = card?.title ?? item.title;
  const area = card?.area ?? item.sub;
  const sold = card?.status === "sold";
  return (
    <li className={styles.item}>
      {card?.cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.thumb} src={card.cover} alt="" width={160} height={107} loading="lazy" />
      ) : (
        <div className={styles.thumbHolder} aria-hidden="true">
          🏠
        </div>
      )}
      <div className={styles.body}>
        <div className={styles.topRow}>
          <span className={styles.kind}>精選好案</span>
          {area && <span className={styles.area}>{area}</span>}
          {sold && <span className={styles.sold}>已下架</span>}
          {missing && <span className={styles.sold}>已不在網站上</span>}
          {inTrail && item.at > 0 && <span className={styles.when}>{`${shortDate(item.at)} 看過`}</span>}
        </div>
        <h2 className={styles.name}>{title}</h2>
        {card?.price != null ? (
          <p className={styles.price}>
            售價 <b>{formatWan(card.price)}</b>
          </p>
        ) : loading && !card ? (
          <p className={styles.mineNone}>讀取售價…</p>
        ) : null}
        <div className={styles.btns}>
          {!missing && (
            <Link className={styles.btnPrimary} href={`/listings/${encodeURIComponent(item.key)}`}>
              {sold ? "看這戶的頁面 →" : "看這戶的完整介紹 →"}
            </Link>
          )}
          {!sold && !missing && (
            <Link className={styles.btnGhost} href={`/card/booking?listing=${encodeURIComponent(item.key)}`}>
              預約看這戶
            </Link>
          )}
          {(sold || missing) && (
            <Link className={styles.btnGhost} href="/listings">
              看看其他好案
            </Link>
          )}
          <FavButton kind="listing" id={item.key} title={title} sub={area} />
          {inTrail && (
            <button
              type="button"
              className={styles.x}
              onClick={() => removeTrail("listing", item.key)}
              aria-label={`從足跡移除 ${title}`}
            >
              從足跡移除
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

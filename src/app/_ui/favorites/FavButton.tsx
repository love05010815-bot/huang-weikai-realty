"use client";

/**
 * ❤️ 收藏鈕 —— 放在建案詳情、精選好案卡片、單一物件頁上的那顆愛心
 *
 * 兩種長相：
 *   pill  「♡ 收藏」／「♥ 已收藏」藥丸，放在文字旁邊
 *   icon  只有愛心的圓鈕，疊在卡片照片的左上角（右上角是相簿的「1/3」計數，不要撞）
 *
 * 按了「加入」之後，旁邊會冒出一顆「查看我的最愛 →」4 秒 —— 回饋就長在手指旁邊，
 * 不用另外做一個全站 toast 去跟 /map 的比較列、首頁的名片小鈕、右下角的 LINE 鈕搶位置。
 *
 * 狀態從 `store.ts` 來，同一戶在首頁、/listings、單戶頁各有一顆愛心，按哪一顆其他的都會跟著變。
 *
 * ⚠️ 這是 client component，但可以直接放進 server component（首頁、/listings 都是）。
 *    不能放在 <a> 或 <Link> 裡面 —— 按鈕包在連結裡是無效的 HTML，點擊行為會打架。
 *    首頁卡片的文字區整塊是 <Link>，所以愛心疊在照片上、不在文字區裡。
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { FAVORITES_HREF, type SavedKind } from "@/lib/favorites";
import HeartIcon from "./HeartIcon";
import { toggleFav, useIsFav } from "./store";
import styles from "./FavButton.module.css";

type Props = {
  kind: SavedKind;
  /** project ＝ 建案 id；listing ＝ slug */
  id: string;
  /** 收藏當下的名稱快照（收藏頁 API 還沒回來之前先顯示這個） */
  title: string;
  /** 第二行快照：建案是「建商・區域」，精選好案是「區域」 */
  sub: string;
  variant?: "pill" | "icon";
  className?: string;
};

export default function FavButton({ kind, id, title, sub, variant = "pill", className }: Props) {
  const on = useIsFav(kind, id);
  const [justAdded, setJustAdded] = useState(false);

  useEffect(() => {
    if (!justAdded) return;
    const t = window.setTimeout(() => setJustAdded(false), 4000);
    return () => window.clearTimeout(t);
  }, [justAdded]);

  const onClick = () => {
    setJustAdded(toggleFav({ kind, key: id, title, sub }));
  };

  const cls =
    variant === "icon" ? (on ? styles.iconOn : styles.icon) : on ? styles.pillOn : styles.pill;

  return (
    <span className={className ? `${styles.wrap} ${className}` : styles.wrap}>
      <button
        type="button"
        className={cls}
        onClick={onClick}
        aria-pressed={on}
        aria-label={on ? `從我的最愛移除：${title}` : `加入我的最愛：${title}`}
        title={on ? "從我的最愛移除" : "加入我的最愛"}
      >
        <HeartIcon filled={on} className={styles.svg} />
        {variant === "pill" && <span>{on ? "已收藏" : "收藏"}</span>}
      </button>
      {justAdded && (
        <Link href={FAVORITES_HREF} className={styles.peek}>
          查看我的最愛 →
        </Link>
      )}
    </span>
  );
}

"use client";

/**
 * 🔀 「加入比較」的選取狀態 —— /map 的在售物件與 /favorites 的精選好案共用
 *
 * 選了哪幾件存在 sessionStorage：客戶點「開始比較」是開新分頁，回到原本那頁時勾選要還在；
 * 重新整理也要在。用 sessionStorage 不用 localStorage —— 關掉瀏覽器就清掉，
 * 下次再開不會莫名其妙帶著上禮拜勾的四戶。
 *
 * 兩個頁各自一把 storageKey：/map 存的是 map_listing 的 UUID、/favorites 存的是精選好案的 slug，
 * 混在同一份裡「已選 N 件」會把對方頁的勾選也算進去。
 *
 * 第一次 render 一律是空的（server 沒有 sessionStorage），掛載後才讀回來，
 * 這樣 hydration 兩邊一致，不會噴 mismatch。
 */

import { useCallback, useEffect, useState } from "react";
import { COMPARE_MAX } from "@/lib/map-compare";

/** /map 用的鍵。/favorites 傳自己的（lib/favorites.ts 的 FAV_COMPARE_STORAGE_KEY） */
export const MAP_COMPARE_STORAGE_KEY = "weikai.map.compare.v1";

function load(key: string): string[] {
  try {
    const raw = window.sessionStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string").slice(0, COMPARE_MAX);
  } catch {
    return [];
  }
}

function save(key: string, ids: string[]): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // 無痕模式或儲存空間被擋：這次的勾選只活在記憶體裡，功能照常
  }
}

export function useCompare(storageKey: string = MAP_COMPARE_STORAGE_KEY) {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    const stored = load(storageKey);
    if (stored.length > 0) setIds(stored);
  }, [storageKey]);

  const replace = useCallback(
    (next: string[]) => {
      const clean = [...new Set(next)].slice(0, COMPARE_MAX);
      setIds(clean);
      save(storageKey, clean);
    },
    [storageKey],
  );

  const toggle = useCallback(
    (id: string) => {
      setIds((prev) => {
        const next = prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= COMPARE_MAX ? prev : [...prev, id];
        save(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  const remove = useCallback(
    (id: string) => {
      setIds((prev) => {
        const next = prev.filter((x) => x !== id);
        save(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  const clear = useCallback(() => replace([]), [replace]);

  return {
    ids,
    has: (id: string) => ids.includes(id),
    full: ids.length >= COMPARE_MAX,
    toggle,
    remove,
    clear,
    replace,
  };
}

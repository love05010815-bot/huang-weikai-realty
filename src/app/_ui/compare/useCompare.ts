"use client";

/**
 * 🔀 /map 的「加入比較」選取狀態
 *
 * 選了哪幾件存在 sessionStorage：客戶點「開始比較」是開新分頁，回到地圖這頁時勾選要還在；
 * 重新整理也要在。用 sessionStorage 不用 localStorage —— 關掉瀏覽器就清掉，
 * 下次再開不會莫名其妙帶著上禮拜勾的四戶。
 *
 * 第一次 render 一律是空的（server 沒有 sessionStorage），掛載後才讀回來，
 * 這樣 hydration 兩邊一致，不會噴 mismatch。
 */

import { useCallback, useEffect, useState } from "react";
import { COMPARE_MAX } from "@/lib/map-compare";

const STORAGE_KEY = "weikai.map.compare.v1";

function load(): string[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string").slice(0, COMPARE_MAX);
  } catch {
    return [];
  }
}

function save(ids: string[]): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // 無痕模式或儲存空間被擋：這次的勾選只活在記憶體裡，功能照常
  }
}

export function useCompare() {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    const stored = load();
    if (stored.length > 0) setIds(stored);
  }, []);

  const replace = useCallback((next: string[]) => {
    const clean = [...new Set(next)].slice(0, COMPARE_MAX);
    setIds(clean);
    save(clean);
  }, []);

  const toggle = useCallback((id: string) => {
    setIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= COMPARE_MAX ? prev : [...prev, id];
      save(next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setIds((prev) => {
      const next = prev.filter((x) => x !== id);
      save(next);
      return next;
    });
  }, []);

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

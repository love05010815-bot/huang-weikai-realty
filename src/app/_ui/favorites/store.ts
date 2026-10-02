"use client";

/**
 * ❤️ 我的最愛／瀏覽足跡 —— 瀏覽器那一側的讀寫（localStorage）
 *
 * 規則（上限、格式、去重）全在 `lib/favorites.ts`，這裡只負責：
 *   ・把 localStorage 讀進記憶體、改完寫回去
 *   ・讓畫面上**所有**用到它的元件同步（卡片上的愛心、header 的數字、收藏頁）——
 *     用 `useSyncExternalStore`，一個地方按了愛心，別的地方立刻跟著變，不用層層傳 props
 *   ・另一個分頁改了（`storage` 事件）這邊也跟著更新
 *
 * ## hydration 為什麼不會 mismatch
 *
 * server 沒有 localStorage。`getServerSnapshot` 永遠回同一個空的物件，
 * React 在 hydration 時用它，掛載完才拿 `getSnapshot`（真的讀 localStorage）重畫一次。
 * 所以第一眼永遠是「沒收藏」，下一個 frame 才變成真的 —— 這是刻意的，
 * 不要為了讓第一眼就對而在 render 裡直接讀 localStorage，那會噴 hydration 錯誤。
 *
 * ⚠️ `getSnapshot` 回的物件**沒變就要是同一個 reference**，不然 React 會無限重畫。
 *    所以記憶體裡只有一份 `state`，改動一律換新物件、不改舊的。
 */

import { useSyncExternalStore } from "react";
import {
  FAV_MAX,
  FAV_STORAGE_KEY,
  TRAIL_MAX,
  TRAIL_STORAGE_KEY,
  parseSaved,
  pushTop,
  removeSaved,
  sameItem,
  toggleSaved,
  type SavedItem,
  type SavedKind,
} from "@/lib/favorites";

export type SavedState = { favs: SavedItem[]; trail: SavedItem[] };

/** server 與 hydration 用的空狀態。一定要是同一個 reference */
const EMPTY: SavedState = { favs: [], trail: [] };

let state: SavedState | null = null;
const listeners = new Set<() => void>();

function read(key: string, max: number): SavedItem[] {
  try {
    const raw = window.localStorage.getItem(key);
    return parseSaved(raw ? JSON.parse(raw) : [], max);
  } catch {
    // 無痕模式、儲存被擋、或存的東西壞掉：當作空的，功能照常（只是這次不會記住）
    return [];
  }
}

function write(key: string, list: SavedItem[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // 寫不進去就只活在記憶體裡，畫面還是會對
  }
}

function load(): SavedState {
  if (!state) state = { favs: read(FAV_STORAGE_KEY, FAV_MAX), trail: read(TRAIL_STORAGE_KEY, TRAIL_MAX) };
  return state;
}

function commit(next: SavedState): void {
  state = next;
  for (const fn of listeners) fn();
}

function onStorage(event: StorageEvent): void {
  // key 是 null ＝ 整個 localStorage 被清掉
  if (event.key !== null && event.key !== FAV_STORAGE_KEY && event.key !== TRAIL_STORAGE_KEY) return;
  state = null;
  load();
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): SavedState {
  return typeof window === "undefined" ? EMPTY : load();
}

function getServerSnapshot(): SavedState {
  return EMPTY;
}

// ---------------------------------------------------------------- hooks

/** 整份狀態。第一眼（server／hydration）永遠是空的，掛載後才是真的 */
export function useSavedState(): SavedState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useIsFav(kind: SavedKind, key: string): boolean {
  const { favs } = useSavedState();
  return favs.some((x) => sameItem(x, kind, key));
}

// ---------------------------------------------------------------- 動作（不是 hook，事件處理裡直接呼叫）

/** 愛心按一下。回傳 true ＝ 這次是「加入」，false ＝ 這次是「移除」 */
export function toggleFav(item: Omit<SavedItem, "at">): boolean {
  const s = load();
  const r = toggleSaved(s.favs, item, FAV_MAX);
  write(FAV_STORAGE_KEY, r.list);
  commit({ ...s, favs: r.list });
  return r.added;
}

export function removeFav(kind: SavedKind, key: string): void {
  const s = load();
  const favs = removeSaved(s.favs, kind, key);
  write(FAV_STORAGE_KEY, favs);
  commit({ ...s, favs });
}

/** 看過一個建案／一戶就記一筆；看過的移到最上面，不會重複 */
export function recordTrail(item: Omit<SavedItem, "at">): void {
  const s = load();
  const trail = pushTop(s.trail, { ...item, at: Date.now() }, TRAIL_MAX);
  write(TRAIL_STORAGE_KEY, trail);
  commit({ ...s, trail });
}

export function removeTrail(kind: SavedKind, key: string): void {
  const s = load();
  const trail = removeSaved(s.trail, kind, key);
  write(TRAIL_STORAGE_KEY, trail);
  commit({ ...s, trail });
}

export function clearTrail(): void {
  const s = load();
  write(TRAIL_STORAGE_KEY, []);
  commit({ ...s, trail: [] });
}

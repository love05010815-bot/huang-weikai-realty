"use client";
/**
 * 名單上「往左滑就刪除」的一列（2026-10-05 他要的：「在客戶名單內多一個可以往左滑就刪除該名單的功能」）。
 *
 * 手指往左拖，右邊露出紅色的「刪除」；放開時拖超過一半就停在打開的位置，不到就彈回去。
 * 刪除要按兩下（第一下變「確定刪除」，3 秒沒按第二下就復原）—— 不用 window.confirm，手機上少一個跳窗。
 * 用 pointer 事件，手機的觸控跟電腦的滑鼠同一套；touch-action: pan-y 讓上下捲動照常由瀏覽器處理，
 * 只有左右的移動才歸這裡管（瀏覽器判定是上下捲動時會送 pointercancel，這裡就把列彈回去）。
 * 拖動中直接改 DOM 的 transform、不經 React state —— 名單幾百列，每個 move 都 setState 會卡。
 * 一次只開一列：開關由外面的 openId 控制，別列一開這列就自己關。
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type SyntheticEvent } from "react";

type Styles = { readonly [key: string]: string };

/** 刪除鈕的寬度（px），要跟 intake.module.css 的 .swipeDel 一樣 */
const REVEAL = 92;
/** 手指動超過這個距離才開始判定是左右還是上下 */
const SLOP = 6;

export default function SwipeRow({
  open,
  onOpenChange,
  onDelete,
  deleting,
  styles,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 按第二下才會叫 */
  onDelete: () => void;
  deleting: boolean;
  styles: Styles;
  children: ReactNode;
}) {
  const body = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; dx: number; axis: "" | "x" | "y" } | null>(null);
  /** 這一次手指有左右拖過：放開後跟著來的 click 不算（不要打開那位買方） */
  const moved = useRef(false);
  const [armed, setArmed] = useState(false);

  const pos = (o: boolean) => `translateX(${o ? -REVEAL : 0}px)`;

  // 外面說開／關 → 動畫到定位；關起來時也把「確定刪除」復原
  useEffect(() => {
    const el = body.current;
    if (el) {
      el.style.transition = "transform 0.18s ease-out";
      el.style.transform = pos(open);
    }
    if (!open) setArmed(false);
  }, [open]);

  // 第一下按了、3 秒沒按第二下就復原
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  function down(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, dx: 0, axis: "" };
    moved.current = false;
  }

  function move(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const el = body.current;
    if (!d || !el) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.axis) {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      d.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (d.axis === "x") {
        el.setPointerCapture(e.pointerId);
        el.style.transition = "none";
      }
    }
    if (d.axis !== "x") return;
    moved.current = true;
    d.dx = dx;
    let x = (open ? -REVEAL : 0) + dx;
    if (x > 0) x = 0; // 往右不能超過原位
    if (x < -REVEAL) x = -REVEAL + (x + REVEAL) * 0.25; // 超過刪除鈕的寬就變很黏
    el.style.transform = `translateX(${x}px)`;
  }

  function up() {
    const d = drag.current;
    const el = body.current;
    drag.current = null;
    if (!d || !el) return;
    el.style.transition = "transform 0.18s ease-out";
    if (d.axis !== "x") {
      el.style.transform = pos(open);
      return;
    }
    const next = (open ? -REVEAL : 0) + d.dx < -REVEAL / 2;
    el.style.transform = pos(next);
    if (next !== open) onOpenChange(next);
  }

  /** 拖過就不算點；已經打開的列，點一下是關起來，不是開那位買方 */
  function clickCapture(e: SyntheticEvent) {
    if (moved.current) {
      moved.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (open) {
      e.preventDefault();
      e.stopPropagation();
      onOpenChange(false);
    }
  }

  return (
    <div className={styles.swipe}>
      <button
        type="button"
        className={`${styles.swipeDel} ${armed ? styles.swipeDelArmed : ""}`}
        onClick={() => (armed ? onDelete() : setArmed(true))}
        disabled={deleting}
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
      >
        {deleting ? "刪除中" : armed ? "確定刪除" : "刪除"}
      </button>
      <div ref={body} className={styles.swipeBody} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onClickCapture={clickCapture}>
        {children}
      </div>
    </div>
  );
}

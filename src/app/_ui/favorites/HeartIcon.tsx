/** ❤️ 愛心。filled ＝ 已收藏（實心）、否則只有外框。顏色吃 currentColor，由外面決定 */
export default function HeartIcon({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      focusable="false"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <path d="M12 20.5s-7.5-4.6-9.4-9.3C1.2 7.7 3.4 4.5 6.8 4.5c2 0 3.6 1.1 4.4 2.3L12 8l.8-1.2c.8-1.2 2.4-2.3 4.4-2.3 3.4 0 5.6 3.2 4.2 6.7-1.9 4.7-9.4 9.3-9.4 9.3Z" />
    </svg>
  );
}

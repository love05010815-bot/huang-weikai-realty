/**
 * /card 名片用 icon — 社群用官方品牌 SVG(合規:官方色/形),聯絡用 Lucide 風線性 icon。
 * 不依賴外部載入,inline SVG 最快最專業。
 *
 * 2026-09-02 起首頁也用這一份（`_ui/SocialLinks.tsx`），**同一頁會出現兩顆 IG icon**
 * （hero 頂端一排＋預約諮詢一排）—— 所以 IG 那顆的漸層 id 不能再寫死，見 InstagramIcon。
 */
import { useId } from "react";
// ---- 社群品牌 icon(官方色,圓形底)----
export function FacebookIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path fill="#1877F2" d="M24 12.07C24 5.41 18.63 0 12 0S0 5.41 0 12.07c0 6.02 4.39 11.01 10.13 11.93v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.49 0-1.96.93-1.96 1.89v2.25h3.32l-.53 3.49h-2.8v8.44C19.61 23.08 24 18.09 24 12.07Z" />
    </svg>
  );
}

export function YoutubeIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path fill="#FF0000" d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19C0 8.08 0 12 0 12s0 3.92.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14C24 15.92 24 12 24 12s0-3.92-.5-5.81Z" />
      <path fill="#fff" d="M9.6 15.6 15.82 12 9.6 8.4Z" />
    </svg>
  );
}

export function LineIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect width="24" height="24" rx="6" fill="#06C755" />
      <path
        fill="#fff"
        d="M20 10.9c0-3.58-3.59-6.49-8-6.49s-8 2.91-8 6.49c0 3.21 2.85 5.9 6.69 6.41.26.06.62.17.71.4.08.2.05.52.03.73l-.12.69c-.03.2-.16.8.7.43s4.67-2.75 6.37-4.71c1.17-1.29 1.54-2.6 1.54-4.07Z"
      />
      <path
        fill="#06C755"
        d="M17.38 12.96h-2.25a.15.15 0 0 1-.15-.15v-3.49a.15.15 0 0 1 .15-.15h2.25a.15.15 0 0 1 .15.15v.57a.15.15 0 0 1-.15.15h-1.53v.59h1.53a.15.15 0 0 1 .15.15v.57a.15.15 0 0 1-.15.15h-1.53v.59h1.53a.15.15 0 0 1 .15.15v.57a.15.15 0 0 1-.15.15Zm-8.32 0a.15.15 0 0 1-.15-.15v-3.49a.15.15 0 0 1 .15-.15h.57a.15.15 0 0 1 .15.15v2.76h1.52a.15.15 0 0 1 .15.15v.58a.15.15 0 0 1-.15.15Zm-1.4-3.79a.15.15 0 0 1 .15.15v3.49a.15.15 0 0 1-.15.15h-.57a.15.15 0 0 1-.15-.15V9.32a.15.15 0 0 1 .15-.15Zm6.27 0a.15.15 0 0 1 .15.15v3.49a.15.15 0 0 1-.15.15h-.57a.15.16 0 0 1-.12-.06l-1.6-2.16v2.07a.15.15 0 0 1-.15.15h-.57a.15.15 0 0 1-.15-.15V9.32a.15.15 0 0 1 .15-.15h.59l.02.02 1.59 2.15V9.32a.15.15 0 0 1 .15-.15Z"
      />
    </svg>
  );
}

export function InstagramIcon({ size = 24 }: { size?: number }) {
  /* ⚠️ 漸層的 id 一定要每顆不一樣。原本寫死 `id="ig-grad"`，首頁上下各放一顆之後
     整頁就有兩個同名 id（HTML 不合法）。瀏覽器多半會拿第一顆的漸層來畫，所以**畫面看起來
     正常、也不會報錯**，但只要第一顆被藏起來（display:none）或被移走，第二顆就會整塊變黑
     —— Safari 對 display:none 裡的漸層一直有這個毛病。
     useId 在 SSR 與 client 會給出同一個值（`_R_x_` 這種），hydration 不會對不上。 */
  const gradId = `ig-grad-${useId()}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#FEDA75" />
          <stop offset="0.25" stopColor="#FA7E1E" />
          <stop offset="0.5" stopColor="#D62976" />
          <stop offset="0.75" stopColor="#962FBF" />
          <stop offset="1" stopColor="#4F5BD5" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill={`url(#${gradId})`} />
      <rect x="5" y="5" width="14" height="14" rx="4.2" fill="none" stroke="#fff" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3.2" fill="none" stroke="#fff" strokeWidth="1.8" />
      <circle cx="16.4" cy="7.6" r="1.1" fill="#fff" />
    </svg>
  );
}

/**
 * TikTok 的音符。**路徑只寫一次、疊三層**（青、洋紅各偏移一點點，白色壓在最上面），
 * 那個「印刷沒對準」的錯位就是 TikTok 的官方識別，少了會變成看不出是誰的音符。
 *
 * ⚠️ 底是**黑色圓角方塊**，不是像 FB／YT 那樣只有純色形狀。
 *    因為官方音符是白的，直接畫在頁面上，只要背景是淺色就整個消失
 *    —— 而且 build 不會報錯，畫面上就只是一塊空白。包一層黑底才能貼到任何背景上。
 */
const TIKTOK_NOTE =
  "M12.53.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07Z";

export function TiktokIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect width="24" height="24" rx="6" fill="#010101" />
      {/* 原始路徑是 24 高的整個音符，縮到 0.61 再置中，四周才留得出黑邊 */}
      <g transform="translate(5.1 4.7) scale(0.61)">
        <path fill="#25F4EE" transform="translate(-1.4 -1.4)" d={TIKTOK_NOTE} />
        <path fill="#FE2C55" transform="translate(1.4 1.4)" d={TIKTOK_NOTE} />
        <path fill="#fff" d={TIKTOK_NOTE} />
      </g>
    </svg>
  );
}

// ---- 聯絡 / UI 線性 icon ----
export function PhoneIcon({ size = 18, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}

export function MailIcon({ size = 18, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 6L2 7" />
    </svg>
  );
}

export function PinIcon({ size = 18, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

export function CalendarIcon({ size = 20, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

export function ChatIcon({ size = 20, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
    </svg>
  );
}

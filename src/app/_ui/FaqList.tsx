/**
 * ❓ 常見問題的手風琴清單 —— 首頁「常見問題」區塊跟 /faq 頁共用，題目與答案在 src/config/faq.ts。
 *
 * 2026-10-20 他先要 /faq 一頁，接著說「把常見問題放在首頁影音專區的下方單獨顯示」，
 * 兩個地方要長得一樣，所以抽成一個元件、一份 CSS。
 *
 * 原生 <details>／<summary>：不用 JS、鍵盤與讀屏軟體原生支援、收著的內容 Google 一樣讀得到。
 * 每題的 id 是 `faq-<id>`（首頁已經有 #listings、#tools 這些錨點，前綴避免撞名），
 * 所以 weikaihouse.com/#faq-sell、weikaihouse.com/faq#faq-sell 都能直接跳到賣房那題。
 */
import Link from "next/link";
import { FAQ } from "@/config/faq";
import css from "./FaqList.module.css";

export default function FaqList({ firstOpen = true }: { firstOpen?: boolean }) {
  return (
    <div className={css.list}>
      {FAQ.map((item, i) => (
        <details key={item.id} id={`faq-${item.id}`} className={css.item} open={firstOpen && i === 0}>
          <summary>
            <span className={css.q}>{item.q}</span>
            <svg
              className={css.chev}
              viewBox="0 0 24 24"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </summary>
          <div className={css.answer}>
            <p>{item.intro}</p>
            <ol className={css.steps}>
              {item.steps.map((s) => (
                <li key={s.title}>
                  <strong>{s.title}</strong>｜{s.text}
                </li>
              ))}
            </ol>
            <p>{item.costs}</p>
            <div className={css.links}>
              {item.links.map((l) => (
                <Link key={l.href} className={css.link} href={l.href}>
                  {l.label} →
                </Link>
              ))}
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}

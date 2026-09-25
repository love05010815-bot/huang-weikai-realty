"use client";
/**
 * 一位買方目前符合的物件清單（給專員看的精簡版：左圖右字、店網連結）。
 * 後台買方詳情與手機快速建檔共用；樣式用 styles 傳進來，用到：
 *   muted / list / item / thumb / thumbEmpty / itemTitle / price / meta / itemLink
 */
import type { BriefMatch } from "@/lib/match/intake";

type Styles = { readonly [key: string]: string };

const money = (n: number) => `${Number(n).toLocaleString("zh-TW")} 萬`;

export default function MatchList({
  styles,
  matches,
  matched,
  total,
  hasPreference,
}: {
  styles: Styles;
  matches: BriefMatch[];
  matched: number;
  total: number;
  hasPreference: boolean;
}) {
  if (!hasPreference) return <p className={styles.muted}>還沒有條件，填了才配得出物件。</p>;
  if (matched === 0) {
    return (
      <p className={styles.muted}>
        目前在售的 {total} 間裡沒有完全符合的。可以放寬一項再看，或先這樣存著 —— 有新物件符合時，綁了 LINE 的買方會自動收到通知。
      </p>
    );
  }
  return (
    <>
      <p className={styles.muted}>
        符合條件的物件 {matched} 間{matched > matches.length ? `，這裡先列前 ${matches.length} 間` : ""}（依價格由低到高）
      </p>
      <div className={styles.list}>
        {matches.map((m) => (
          <div key={m.id} className={styles.item}>
            {m.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={styles.thumb} src={m.image} alt="" loading="lazy" />
            ) : (
              <div className={styles.thumbEmpty} />
            )}
            <div>
              <p className={styles.itemTitle}>{m.title}</p>
              <p className={styles.price}>{money(m.price)}</p>
              <p className={styles.meta}>{m.meta}</p>
              {m.sourceUrl && (
                <a className={styles.itemLink} href={m.sourceUrl} target="_blank" rel="noopener noreferrer">
                  店網物件頁 →
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

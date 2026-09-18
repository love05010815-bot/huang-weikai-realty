/**
 * 文章內文的渲染 —— 前台內頁與後台預覽**共用這一支**。
 *
 * 只吐乾淨的 `<p> <h2> <ul> <hr> <strong> <a>`，樣式由外層那個 class 決定
 * （前台是 `news.module.css` 的 `.body`，後台預覽是它自己那塊）。
 * 這樣同一段文字在兩邊長得一樣 —— 預覽跟正式頁不同調，是這個專案最常見的坑。
 *
 * ⚠️ 不用 `dangerouslySetInnerHTML`。他的文案是從 FB／ChatGPT 複製貼上的，
 *    裡面出現 `<` 或 `<script` 的機率不是零；一律走 React 的節點，內容永遠是文字。
 *
 * 切段規則在 `@/lib/posts-text`，不要在這裡另外加語法。
 */
import { parsePostBody, type PostSpan } from "@/lib/posts-text";

function Spans({ spans }: { spans: PostSpan[] }) {
  return (
    <>
      {spans.map((s, i) => {
        if (s.kind === "strong") return <strong key={i}>{s.text}</strong>;
        if (s.kind === "link") {
          return (
            <a key={i} href={s.href} target="_blank" rel="noopener noreferrer nofollow">
              {s.text}
            </a>
          );
        }
        return <span key={i}>{s.text}</span>;
      })}
    </>
  );
}

export default function PostBody({ body, className }: { body: string; className?: string }) {
  const blocks = parsePostBody(body);
  return (
    <div className={className}>
      {blocks.map((block, i) => {
        if (block.kind === "divider") return <hr key={i} />;
        if (block.kind === "heading") {
          return (
            <h2 key={i}>
              <Spans spans={block.spans} />
            </h2>
          );
        }
        if (block.kind === "list") {
          return (
            <ul key={i}>
              {block.items.map((item, j) => (
                <li key={j}>
                  <Spans spans={item} />
                </li>
              ))}
            </ul>
          );
        }
        // 段落：他怎麼換行就怎麼換行（<br>），不要把好幾行併成一行
        return (
          <p key={i}>
            {block.lines.map((line, j) => (
              <span key={j}>
                {j > 0 ? <br /> : null}
                <Spans spans={line} />
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

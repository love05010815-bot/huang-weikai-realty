/**
 * 房產消息的煙霧測試 —— 內文排版規則切得對不對。不碰資料庫、不連網。
 * 用法：node --experimental-strip-types scripts/check-posts.mjs
 * 改 src/lib/posts-text.ts 前後都跑一次。
 *
 * 🔴 最重要的一條在 C 區：**他怎麼換行，前台就怎麼換行**。
 *    他的文案是從 FB 貼文複製過來的、一行一句，被合併成一整段的話
 *    前台長出來的東西就不是他寫的那篇 —— 而且兩邊都不會報錯。
 */
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
const T = await import("../src/lib/posts-text.ts");

let pass = true;
const ok = (cond, label, got, want) => {
  if (!cond) pass = false;
  console.log(
    `${cond ? "  ✅" : "  ❌"} ${String(label).padEnd(34)} ${String(got).slice(0, 60).padEnd(22)}${cond ? "" : "應為 " + want}`,
  );
};

/** 他 2026-09-17 自己寫的第一篇（節錄），當回歸測試的真實樣本。 */
const REAL = [
  "準備換屋、購置第2戶的朋友注意了！📣",
  "央行最新政策出爐，房市信用管制再度適度鬆綁！",
  "",
  "🏦 政策利率維持不變，正式「連10凍」",
  "🏡 自然人第2戶購屋貸款最高成數",
  "👉 從原本「6成」調升至「7成」",
  "📅 2026/9/18 起正式實施",
  "",
  "【舉例來說】",
  "若購買總價 1,500 萬元的房子：",
  "",
  "- 最高貸款6成＝900萬元",
  "- 最高貸款7成＝1,050萬元",
  "",
  "不過要特別注意⚠️",
  "「最高7成」≠ 每個人都一定能貸到7成！",
].join("\n");

console.log("=== A 區塊種類 ===");
const blocks = T.parsePostBody(REAL);
ok(blocks.length === 6, "切出 6 個區塊", blocks.length, 6);
ok(blocks[0].kind === "paragraph", "第 1 塊是段落", blocks[0].kind, "paragraph");
ok(blocks[2].kind === "heading", "【】那行變小標", blocks[2].kind, "heading");
ok(blocks[2].spans[0].text === "舉例來說", "小標文字不含【】", blocks[2].spans?.[0]?.text, "舉例來說");
ok(blocks[4].kind === "list", "- 開頭變清單", blocks[4].kind, "list");
ok(blocks[4].items.length === 2, "清單兩項", blocks[4].items?.length, 2);

console.log("=== B emoji 開頭的行不可以變清單 ===");
const emojiBlock = blocks[1];
ok(emojiBlock.kind === "paragraph", "🏦🏡👉📅 那塊是段落不是清單", emojiBlock.kind, "paragraph");
ok(emojiBlock.lines.length === 4, "而且是 4 行", emojiBlock.lines?.length, 4);
ok(emojiBlock.lines[0][0].text.startsWith("🏦"), "emoji 留在字裡沒被吃掉", emojiBlock.lines?.[0]?.[0]?.text?.slice(0, 2), "🏦");

console.log("=== C 換行照他貼的樣子 ===");
ok(blocks[0].lines.length === 2, "空行前那段保留 2 行", blocks[0].lines?.length, 2);
const oneLine = T.parsePostBody("第一行\n第二行\n第三行");
ok(oneLine.length === 1 && oneLine[0].lines.length === 3, "三行不會被併成一行", oneLine[0]?.lines?.length, 3);
const twoParas = T.parsePostBody("第一段\n\n第二段");
ok(twoParas.length === 2, "空行才分段", twoParas.length, 2);

console.log("=== D 行內樣式 ===");
const spans = T.parseSpans("實際核貸仍要看 **個人條件**，細節見 https://www.cbc.gov.tw/tw/np.asp 這頁。");
ok(spans.some((s) => s.kind === "strong" && s.text === "個人條件"), "**粗體**", "有", "有");
const link = spans.find((s) => s.kind === "link");
ok(!!link && link.href === "https://www.cbc.gov.tw/tw/np.asp", "網址變連結", link?.href, "…np.asp");
ok(spans.at(-1).text.startsWith(" 這頁"), "連結後面的中文沒被吃進網址", spans.at(-1)?.text?.slice(0, 3), " 這頁");
const tail = T.parseSpans("詳見 https://example.com/a。");
ok(tail.find((s) => s.kind === "link").href === "https://example.com/a", "句號不算進網址", tail.find((s) => s.kind === "link")?.href, "…/a");

console.log("=== E 分隔線與 ## 小標 ===");
const md = T.parsePostBody("## 三個重點\n內容\n\n---\n\n收尾");
ok(md[0].kind === "heading" && md[0].spans[0].text === "三個重點", "## 也算小標", md[0]?.spans?.[0]?.text, "三個重點");
ok(md.some((b) => b.kind === "divider"), "--- 變分隔線", "有", "有");

console.log("=== F 摘要與字數 ===");
const ex = T.postExcerpt(REAL, 20);
ok(ex.length <= 21 && ex.endsWith("…"), "摘要會截斷加刪節號", ex, "≤20 字＋…");
ok(!ex.includes("\n") && !ex.includes("【"), "摘要是純文字、沒有語法符號", ex, "純文字");
ok(T.postCharCount("台中 海線\n房市！") === 7, "字數不含空白換行", T.postCharCount("台中 海線\n房市！"), 7);
ok(T.postReadMinutes("字".repeat(1200)) === 3, "1200 字約 3 分鐘", T.postReadMinutes("字".repeat(1200)), 3);
ok(T.postReadMinutes("很短") === 1, "再短也是 1 分鐘", T.postReadMinutes("很短"), 1);

console.log("=== G 空字串不可以爆掉 ===");
ok(T.parsePostBody("").length === 0, "空內文回空陣列", T.parsePostBody("").length, 0);
ok(T.postExcerpt("") === "", "空內文的摘要是空字串", `"${T.postExcerpt("")}"`, '""');

console.log(pass ? "\n✅ 全部通過" : "\n❌ 有項目沒過");
process.exit(pass ? 0 : 1);

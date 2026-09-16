/**
 * 派工寫稿的煙霧測試 —— prompt 有沒有把規則講全、字數分析切得對不對。不打 API、不碰資料庫。
 * 用法：node --experimental-strip-types scripts/check-copywriter.mjs
 *      加 --live 且環境有 OPENAI_API_KEY（node --env-file=.env.local …）就真的叫一次 OpenAI 寫短影音稿。
 * 改到 src/config/copywriter.ts 或 src/lib/copywriter-text.ts 前後都跑一次。
 */
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
const C = await import("../src/config/copywriter.ts");
const T = await import("../src/lib/copywriter-text.ts");

let pass = true;
const ok = (cond, label, got, want) => {
  if (!cond) pass = false;
  console.log(`${cond ? "  ✅" : "  ❌"} ${String(label).padEnd(36)} ${String(got).slice(0, 60).padEnd(24)}${cond ? "" : "應為 " + want}`);
};

const src = {
  title: "台中10大中古屋熱區 這區移轉量暴衝7成4",
  source: "鏡週刊",
  publishedAt: "2026-09-14 10:43:00",
  url: "https://example.com/news/1",
  text: "台中10大中古屋交易熱門區域出爐！今年前8個月台中全市中古屋交易12,103棟，年減5.0%，其中烏日以年增74.7%奪冠。",
};

console.log("=== A 身分與紅線 ===");
const sys = C.systemPrompt();
ok(sys.includes("黃瑋凱"), "system 有他的名字", sys.includes("黃瑋凱"), "true");
ok(/保證|穩賺|必漲/.test(sys) && sys.includes("不可新增原文沒有的資料"), "system 有紅線＋只用原文事實", "有", "有");

console.log("=== B 知識文章 prompt ===");
const ap = C.articlePrompt(src);
for (const p of C.PLATFORM_RULES) ok(ap.includes(`## ${p.heading}`), `有 ## ${p.heading}`, ap.includes(`## ${p.heading}`), "true");
ok(ap.includes("## 標題候選"), "有標題候選段", ap.includes("## 標題候選"), "true");
ok(ap.includes("硬上限 500") && ap.includes("硬上限 2200"), "有寫 Threads／IG 硬上限", "有", "有");
ok(ap.includes(src.title) && ap.includes(src.text) && ap.includes("鏡週刊 · 2026-09-14 10:43"), "原文區塊完整", "有", "有");
ok(ap.includes("互動邀請") && ap.includes("不要硬推銷"), "結尾要 CTA 不硬推銷", "有", "有");

console.log("=== C 短影音 prompt ===");
const vp = C.videoPrompt(src);
ok(vp.includes("三種版本") && vp.includes("## 版本 A"), "三種版本＋版本標題格式", "有", "有");
ok(vp.includes("15 字內") && vp.includes("黃金三秒鉤子"), "15 字標題＋黃金三秒鉤子", "有", "有");
ok(vp.includes("90% 以上") && vp.includes("重排順序") && vp.includes("邏輯要非常清楚"), "相似度 90%＋重組＋邏輯", "有", "有");
ok(vp.includes("emoji"), "要 emoji", vp.includes("emoji"), "true");
ok(vp.includes("```") && vp.includes(`${C.COPYWRITER.SCRIPT_CHARS[0]} 到 ${C.COPYWRITER.SCRIPT_CHARS[1]} 字`), "口播稿放 ``` 裡＋字數區間", "有", "有");
ok(C.buildPrompt("video", src) === vp && C.buildPrompt("article", src) === ap, "buildPrompt 分線", "對", "對");

console.log("=== D 字數 ===");
ok(T.countChars("台中 海線\n房市！") === 7, "不含空白換行", T.countChars("台中 海線\n房市！"), 7);
ok(T.countChars("😀 emoji 算 1") === 8, "emoji 算 1 字", T.countChars("😀 emoji 算 1"), 8);

console.log("=== E 知識文章分析 ===");
const article = [
  "## 標題候選",
  "- 海線房價",
  "## 📺 YouTube（影片說明欄）",
  "台中中古屋交易前 8 月 12,103 棟。",
  "## Facebook",
  "烏日年增 74.7%。",
  "",
  "#台中房市",
  "## Instagram",
  "IG 內文",
  "## TikTok",
  "短一點",
  "## Threads",
  "字".repeat(501),
  "## LINE VOOM",
  "VOOM 內文",
].join("\n");
const as = T.analyzeDraft("article", article);
ok(as.line === "article" && as.platforms.length === 6, "六個平台都有評估", as.platforms?.length, 6);
const by = Object.fromEntries(as.platforms.map((p) => [p.rule.key, p]));
ok(by.youtube.found && by.youtube.chars === T.countChars("台中中古屋交易前 8 月 12,103 棟。"), "帶 emoji 的標題也切得到 YouTube", by.youtube.chars, T.countChars("台中中古屋交易前 8 月 12,103 棟。"));
ok(by.facebook.chars === T.countChars("烏日年增 74.7%。#台中房市"), "FB 段連標籤一起數", by.facebook.chars, T.countChars("烏日年增 74.7%。#台中房市"));
ok(by.threads.over === true && by.threads.chars === 501, "Threads 501 字 → 超過", `${by.threads.chars}/${by.threads.over}`, "501/true");
ok(by.voom.found && by.voom.chars === 6, "LINE VOOM 有切到", by.voom.chars, 6);
const missing = T.analyzeDraft("article", "## Facebook\n只有 FB");
ok(missing.platforms.filter((p) => !p.found).length === 5, "少五個平台 → found=false", missing.platforms.filter((p) => !p.found).length, 5);

console.log("=== F 短影音分析 ===");
const video = [
  "## 版本 A",
  "🔥 標題：烏日房市暴衝",
  "```",
  "【鉤子】" + "字".repeat(96),
  "【重點一】" + "字".repeat(100),
  "```",
  "## 版本 B",
  "```",
  "字".repeat(300),
  "```",
].join("\n");
const vs = T.analyzeDraft("video", video);
ok(vs.line === "video" && vs.scripts.length === 2, "找到兩段口播稿", vs.scripts?.length, 2);
ok(vs.scripts[0].label === "版本 A" && vs.scripts[0].chars === 4 + 96 + 5 + 100, "版本 A 字數（含【】小標）", `${vs.scripts[0].label} ${vs.scripts[0].chars}`, `版本 A ${4 + 96 + 5 + 100}`);
ok(vs.scripts[0].seconds === Math.round(((4 + 96 + 5 + 100) / 240) * 60), "秒數用 240 字／分估", vs.scripts[0].seconds, Math.round(((4 + 96 + 5 + 100) / 240) * 60));
ok(vs.scripts[1].label === "版本 B" && vs.scripts[1].seconds === 75, "版本 B 300 字 → 75 秒", `${vs.scripts[1].label} ${vs.scripts[1].seconds}`, "版本 B 75");
ok(T.analyzeDraft("video", "沒有 fence").scripts.length === 0, "沒 fence → 空陣列", T.analyzeDraft("video", "沒有 fence").scripts.length, 0);

console.log("=== G 複製到 ChatGPT 的整段指令 ===");
const mp = C.manualPrompt("video", src);
ok(mp.startsWith(C.systemPrompt()), "身分與紅線在最前面", mp.slice(0, 12), "system 開頭");
ok(mp.includes(C.videoPrompt(src)), "後面接完整任務", mp.includes(C.videoPrompt(src)), "true");
ok(mp.includes(src.text), "原文有帶進去", mp.includes(src.text), "true");
ok(C.manualPrompt("article", src).includes(C.articlePrompt(src)), "知識文章那條也對", "對", "對");
ok(C.MANUAL_MODEL.length <= 64, "手動貼回的 model 標籤塞得進 VARCHAR(64)", C.MANUAL_MODEL, "<=64");

if (process.argv.includes("--live")) {
  console.log("=== G 真的叫一次 OpenAI（短影音）===");
  const L = await import("../src/lib/copywriter.ts");
  if (!L.isCopywriterConfigured()) {
    console.log("   環境沒有 OPENAI_API_KEY，略過（用 node --env-file=.env.local …）");
  } else {
    const r = await L.generateCopy("video", src);
    console.log(`   model=${r.model} ms=${r.ms} in=${r.tokensIn} out=${r.tokensOut} truncated=${r.truncated}`);
    const st = T.analyzeDraft("video", r.text);
    for (const s of st.scripts) console.log(`   ${s.label}: ${s.chars} 字 ≈ ${s.seconds} 秒`);
    ok(st.scripts.length === 3, "回三段口播稿", st.scripts.length, 3);
    console.log(r.text.slice(0, 600));
  }
}

console.log(pass ? "\n全部通過" : "\n有失敗的項目");
process.exit(pass ? 0 : 1);

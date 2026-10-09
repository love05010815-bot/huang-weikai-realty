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
// 2026-09-25 他說「文字有點太少」之後加的：字數要是硬要求、七版、官網文章排第一
ok(C.PLATFORM_RULES.length === 7 && C.PLATFORM_RULES[0].key === "site", "七版、官網文章排第一", `${C.PLATFORM_RULES.length}/${C.PLATFORM_RULES[0].key}`, "7/site");
ok(ap.includes("不到下限就是不合格"), "字數寫成硬要求不是建議", ap.includes("不到下限就是不合格"), "true");
ok(!ap.includes("建議 "), "prompt 裡不再有「建議 N 字」這種軟話", "沒有", "沒有");
ok(ap.indexOf("## 官網文章") < ap.indexOf("## YouTube"), "官網文章在社群版本前面", "對", "對");
ok(ap.includes("【為什麼成數會影響自備款】"), "官網文章有教【】小標怎麼寫", "有", "有");
const site = C.PLATFORM_RULES.find((p) => p.key === "site");
ok(site.suggested[0] >= 900 && site.hardLimit === null, "官網文章下限 ≥ 900、沒有硬上限", `${site.suggested[0]}/${site.hardLimit}`, "≥900/null");
const th = C.PLATFORM_RULES.find((p) => p.key === "threads");
ok(th.suggested[1] <= 420 && th.hardLimit === 500, "Threads 上限留餘裕（≤420 字對 500 字元）", `${th.suggested[1]}/${th.hardLimit}`, "≤420/500");
for (const p of C.PLATFORM_RULES) {
  if (p.hardLimit) ok(p.suggested[1] < p.hardLimit, `${p.heading} 字數上限低於平台硬上限`, `${p.suggested[1]}<${p.hardLimit}`, "true");
}
ok(C.COPYWRITER.MAX_OUTPUT_TOKENS.article >= 9000, "知識文章的 token 上限跟著拉高", C.COPYWRITER.MAX_OUTPUT_TOKENS.article, "≥9000");
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
ok(as.line === "article" && as.platforms.length === 7, "七個版本都有評估（官網＋六平台）", as.platforms?.length, 7);
const by = Object.fromEntries(as.platforms.map((p) => [p.rule.key, p]));
ok(by.youtube.found && by.youtube.chars === T.countChars("台中中古屋交易前 8 月 12,103 棟。"), "帶 emoji 的標題也切得到 YouTube", by.youtube.chars, T.countChars("台中中古屋交易前 8 月 12,103 棟。"));
ok(by.facebook.chars === T.countChars("烏日年增 74.7%。#台中房市"), "FB 段連標籤一起數", by.facebook.chars, T.countChars("烏日年增 74.7%。#台中房市"));
ok(by.threads.over === true && by.threads.chars === 501, "Threads 501 字 → 超過", `${by.threads.chars}/${by.threads.over}`, "501/true");
ok(by.voom.found && by.voom.chars === 6, "LINE VOOM 有切到", by.voom.chars, 6);
const missing = T.analyzeDraft("article", "## Facebook\n只有 FB");
ok(missing.platforms.filter((p) => !p.found).length === 6, "只有 FB 那段 → 其他六版 found=false", missing.platforms.filter((p) => !p.found).length, 6);

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

console.log("=== H 放到前台要挖出來的那一段 ===");
const sample = [
  "## 標題候選",
  "- 第2戶房貸放寬到7成，換屋族先算這一筆（18字）",
  "1. 央行連10凍，成數為什麼變了？",
  "",
  "## YouTube",
  "yt 內容",
  "",
  "## Facebook",
  "fb 第一行",
  "fb 第二行",
].join("\n");
ok(T.draftSection(sample, "Facebook") === "fb 第一行\nfb 第二行", "挖得出 Facebook 那一段", JSON.stringify(T.draftSection(sample, "Facebook")), '"fb 第一行\\nfb 第二行"');
ok(T.draftSection(sample, "LINE VOOM") === "", "沒有那一段回空字串（畫面才好報錯）", `"${T.draftSection(sample, "LINE VOOM")}"`, '""');
const cands = T.draftTitleCandidates(sample);
ok(cands[0] === "第2戶房貸放寬到7成，換屋族先算這一筆", "標題候選去掉 - 與字數註記", cands[0], "第2戶房貸…先算這一筆");
ok(cands[1] === "央行連10凍，成數為什麼變了？", "1. 開頭的也收", cands[1], "央行連10凍…");
ok(T.draftTitleCandidates("## Facebook\n沒有標題候選") .length === 0, "沒有標題候選段回空陣列", T.draftTitleCandidates("## Facebook\n沒有標題候選").length, 0);

// 2026-09-29「按放到前台沒反應」的根因：他只貼了其中一個平台的成品回來，整篇連一行 ## 都沒有，
// 而下拉照樣列七個平台、預設「官網文章」→ 一定挖不到。下拉現在只能列這裡回傳的東西。
const avail = T.draftAvailableSections(sample);
ok(avail.join(",") === "YouTube,Facebook", "只回真的切得出來的平台", avail.join(","), "YouTube,Facebook");
const plain = "買氣都冷成這樣了，為什麼有些房價還是不降？🏠\n\n這可能是最近正在看房的人，最有感的一件事。";
ok(T.draftAvailableSections(plain).length === 0, "沒有 ## 的整篇文案 → 空陣列（下拉只剩整篇全部）", T.draftAvailableSections(plain).length, 0);
ok(T.analyzeDraft("article", plain).platforms.every((p) => !p.found), "同一篇：七個平台都 found=false", "全 false", "全 false");

console.log("=== I 翻拍別人的短影音（2026-10-09）===");
const N = await import("../src/config/news.ts");
for (const u of ["https://www.douyin.com/video/7123", "https://v.douyin.com/abc/", "https://www.tiktok.com/@x/video/99", "https://vt.tiktok.com/ZS1/"]) {
  ok(N.isShortVideoUrl(u), `認得出短影音：${u.slice(8, 34)}`, N.isShortVideoUrl(u), "true");
}
for (const u of ["https://money.udn.com/money/story/1", "https://tiktok.com.evil.example/x", "不是網址"]) {
  ok(!N.isShortVideoUrl(u), `不誤判：${u.slice(0, 34)}`, N.isShortVideoUrl(u), "false");
}
const vsrc = { ...src, url: "https://www.douyin.com/video/7123", source: "抖音" };
const rp = C.buildPrompt("video", vsrc);
ok(rp === C.remakePrompt(vsrc), "短影音來源 → 走 remakePrompt", "對", "對");
ok(C.buildPrompt("video", src) === C.videoPrompt(src), "新聞來源 → 還是走 videoPrompt（沒被我改壞）", "對", "對");
ok(C.buildPrompt("article", vsrc) === C.articlePrompt(vsrc), "知識文章那條不受影響", "對", "對");
// 他 2026-10-09 給的原話，一條一條對
ok(rp.includes("10 字內") && !rp.includes("15 字內"), "熱門標題 10 字（不是新聞那條的 15）", "對", "對");
ok(rp.includes("相似度 90% 以上"), "相似度 90%", rp.includes("相似度 90% 以上"), "true");
ok(rp.includes("順序優化重組") && rp.includes("邏輯架構非常清楚"), "順序重組＋邏輯清楚", "有", "有");
ok(rp.includes("黃金三秒鉤子") && rp.includes("三種版本") && rp.includes("emoji"), "鉤子＋三版＋emoji", "有", "有");
ok(rp.includes("## ⚠️ 可能被挑錯的點"), "有「可能被挑錯的點」自我檢查段", "有", "有");
ok(/保證|穩賺|必漲/.test(rp) && rp.includes("投資建議"), "法規紅線寫進去了（已修法規風險）", "有", "有");
// 🔴 這兩條是重點：相似度 90% 不能被讀成「照抄句子」
ok(rp.includes("用你自己的講法重寫"), "明講句子要自己寫", rp.includes("用你自己的講法重寫"), "true");
ok(rp.includes("逐句照抄"), "明講逐句照抄＝搬運別人的腳本", rp.includes("逐句照抄"), "true");
// 格式要跟舊的一致，不然 analyzeDraft 數不到字數與秒數
ok(rp.includes("## 版本 A") && rp.includes("```"), "格式跟舊版一致（後台才數得到字）", "對", "對");
const fake = ["## 版本 A", "🔥 標題：海線房價撐不住", "```", "字".repeat(200), "```"].join("\n");
const fs2 = T.analyzeDraft("video", fake);
ok(fs2.scripts.length === 1 && fs2.scripts[0].seconds === 50, "翻拍的產出照樣算得出秒數", `${fs2.scripts.length}/${fs2.scripts[0]?.seconds}`, "1/50");
ok(C.manualPrompt("video", vsrc).includes(C.remakePrompt(vsrc)), "複製指令帶的是翻拍那套", "對", "對");
ok(rp.includes(vsrc.text), "原片文案有帶進去", rp.includes(vsrc.text), "true");
// 身分那段也要跟著換：翻拍時不要再說「你會拿到一則房地產新聞的全文」
ok(C.promptKind("video", vsrc) === "remake" && C.promptKind("video", src) === "news" && C.promptKind("article", vsrc) === "news", "promptKind 分流正確", "對", "對");
ok(C.systemPrompt("remake").includes("短影音編劇") && !C.systemPrompt("remake").includes("房地產新聞的全文"), "翻拍的身分段講的是影片不是新聞", "對", "對");
ok(C.systemPrompt() === C.systemPrompt("news"), "預設還是新聞那版（沒改壞舊的呼叫）", "對", "對");
ok(C.manualPrompt("video", vsrc).startsWith(C.systemPrompt("remake")), "翻拍的整段指令開頭是翻拍身分", "對", "對");

if (process.argv.includes("--live")) {
  console.log("=== I 真的叫一次 OpenAI（短影音）===");
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

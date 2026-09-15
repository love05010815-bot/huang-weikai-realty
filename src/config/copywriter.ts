/**
 * ✍️ 一鍵派工寫稿 —— 待產文案按「派工寫稿」時，送給 ChatGPT（OpenAI API）的規則全在這。
 *
 * ⚠️ 要改「寫出來的東西長怎樣」只改這個檔：平台字數、口吻、紅線、版本數、口播長度。
 *    程式邏輯在 src/lib/copywriter.ts（打 API）與 src/lib/copywriter-text.ts（數字數），那些不用動。
 *
 * 金鑰與模型走環境變數（見 .env.example）：
 *   OPENAI_API_KEY  platform.openai.com → API keys
 *                   ⚠️ ChatGPT Plus 訂閱「不包含」API；API 另外儲值、按用量計費，一篇文案約新台幣 1 元上下。
 *   OPENAI_MODEL    不填就用底下的 DEFAULT_MODEL。
 *
 * 2026-09-15 他的原話（規格就是這段）：
 *   知識類文章 → 須符合 YT、FB、IG、TikTok、Threads、LINE VOOM 的字數及規範。
 *   短影音     → 1 分鐘內的文稿、跟原文相似度 90% 以上、順序優化重組、邏輯架構非常清楚、
 *                熱門標題 15 字內、黃金三秒鉤子（簡潔強調吸睛）、三種版本、要加 emoji。
 */
import { OWNER } from "@/config/owner";
import type { NewsLine } from "@/lib/news";

export const COPYWRITER = {
  /** 沒設 OPENAI_MODEL 時用的模型。找不到模型會在後台顯示明確錯誤，換一個名字就好。 */
  DEFAULT_MODEL: "gpt-5.1",
  /** 等 OpenAI 回覆的上限。Vercel 一支函式 60 秒，留幾秒給資料庫寫入。 */
  TIMEOUT_MS: 55_000,
  /** 回覆的 token 上限（中文一字約 1 到 2 個 token）。太小會被截斷、太大只是慢。 */
  MAX_OUTPUT_TOKENS: { article: 4500, video: 3000 } satisfies Record<NewsLine, number>,
  /** gpt-5 系列的推理深度：low 最快，文案這種任務品質已經夠。不是 gpt-5／o 系列的模型會自動不送。 */
  REASONING_EFFORT: "low",
  /** 送給模型的原文最多幾字。新聞全文通常 1,000 到 3,000 字，超過的多半是網頁雜訊。 */
  MAX_SOURCE_CHARS: 6000,
  /** 口播語速：一般台灣口語一分鐘約 240 字。估「這稿要講幾秒」用。 */
  SPEECH_CHARS_PER_MINUTE: 240,
  /** 短影音口播文稿的字數區間（1 分鐘內講得完） */
  SCRIPT_CHARS: [180, 230] as const,
} as const;

// ---------------------------------------------------------------- 知識文章：六個平台的規範

export type PlatformKey = "youtube" | "facebook" | "instagram" | "tiktok" | "threads" | "voom";

export type PlatformRule = {
  key: PlatformKey;
  /** 模型輸出時用的 `## 標題`；後台也靠這個字切段、數字數 */
  heading: string;
  /** 平台的硬上限（字元）。超過平台會擋；null = 實務上沒有上限 */
  hardLimit: number | null;
  /** 我們建議的字數區間（給模型看的） */
  suggested: readonly [number, number];
  /** 平台規範，一行一條 */
  rules: readonly string[];
};

/**
 * 各平台的字數與規範（2026-09 整理）。數字是平台文件加實務經驗，會變，變了改這裡就好。
 */
export const PLATFORM_RULES: readonly PlatformRule[] = [
  {
    key: "youtube",
    heading: "YouTube",
    hardLimit: 5000,
    suggested: [300, 600],
    rules: [
      "這是影片說明欄／社群貼文用的文字：第一行是 30 字內的標題，接著是內文",
      "摺疊前只看得到前 2 行，所以前 2 行就要把重點講完",
      "結尾 3 到 5 個 #標籤",
    ],
  },
  {
    key: "facebook",
    heading: "Facebook",
    hardLimit: null,
    suggested: [300, 800],
    rules: [
      "第一行是 40 字內的鉤子：「查看更多」之前只看得到前 3 行",
      "可以條列，段落之間空一行",
      "結尾最多 3 個 #標籤",
    ],
  },
  {
    key: "instagram",
    heading: "Instagram",
    hardLimit: 2200,
    suggested: [150, 400],
    rules: [
      "前 125 字要能獨立成句，之後會被「更多」摺疊",
      "段落之間空一行；不要放網址（IG 內文的網址點不了）",
      "結尾 8 到 12 個 #標籤，放在最後一段",
    ],
  },
  {
    key: "tiktok",
    heading: "TikTok",
    hardLimit: 4000,
    suggested: [50, 300],
    rules: ["這是影片說明文字：一兩句話講完重點，再加 3 到 5 個 #標籤"],
  },
  {
    key: "threads",
    heading: "Threads",
    hardLimit: 500,
    suggested: [100, 450],
    rules: ["500 字元是硬上限，超過發不出去", "口語、像在跟朋友聊天；最多 1 個標籤"],
  },
  {
    key: "voom",
    heading: "LINE VOOM",
    hardLimit: 10000,
    suggested: [200, 1000],
    rules: ["前兩行是重點，之後要按「更多」才看得到", "結尾 3 到 5 個 #標籤；可以邀請加官方帳號聊聊，但不要放電話"],
  },
];

// ---------------------------------------------------------------- 送給模型的話

/** 一則新聞在 prompt 裡需要的欄位 */
export type CopySource = {
  title: string;
  source: string;
  /** 台北時間字串，沒有就 null */
  publishedAt: string | null;
  url: string;
  /** 全文（沒全文就摘要），呼叫前已截到 MAX_SOURCE_CHARS */
  text: string;
};

/** 兩條線共用的身分與紅線。改口吻、改紅線在這。 */
export function systemPrompt(): string {
  return [
    `你是台中海線房仲「${OWNER.name}」的社群內容編輯。你會拿到一則房地產新聞的全文，把它改寫成他可以直接發布的內容。`,
    "",
    "寫作規則：",
    "1. 只能用原文出現的事實、數字、地名、機構名；不可新增原文沒有的資料、不可推測、不可湊數字。",
    "2. 用台灣人習慣的繁體中文口語；不要中國用語（視頻→影片、信息→資訊、質量→品質、優化→改善）。",
    "3. 不動產廣告紅線：不可出現「保證」「穩賺」「必漲」「零風險」「最後機會」「全台第一」這類保證獲利或誇大的字眼；不可替他加任何頭銜或成績；不寫電話、門牌。",
    "4. 適度加 emoji（一段 1 到 2 個就好），不要洗版。",
    "5. 直接輸出成品，不要前言、不要解釋你做了什麼、不要問問題。",
  ].join("\n");
}

function sourceBlock(src: CopySource): string {
  const meta = [src.source, src.publishedAt ? src.publishedAt.slice(0, 16) : ""].filter(Boolean).join(" · ");
  return ["=== 原文 ===", `標題：${src.title}`, meta ? `來源：${meta}` : "", `網址：${src.url}`, "內文：", src.text].filter((l) => l !== "").join("\n");
}

/** 知識文章：六個平台各一版，各自照規範。 */
export function articlePrompt(src: CopySource): string {
  const lines: string[] = [
    "任務：把下面這則新聞改寫成「知識類文章」，六個平台各一版，各自符合該平台的字數與規範。",
    "讀者是想在台中海線買房、租屋或投資的人，要讓他們看完覺得「學到一件事」，不是看到一則新聞。",
    "",
    "輸出格式（照這個順序；每個平台用「## 平台名」當標題，後台靠這個字切段，不要改字）：",
    "",
    "## 標題候選",
    "- 3 個，各 15 字內，要像熱門文章的標題",
    "",
  ];
  for (const p of PLATFORM_RULES) {
    lines.push(`## ${p.heading}`);
    lines.push(`- 建議 ${p.suggested[0]} 到 ${p.suggested[1]} 字${p.hardLimit ? `（平台硬上限 ${p.hardLimit} 字元）` : ""}`);
    for (const r of p.rules) lines.push(`- ${r}`);
    lines.push("");
  }
  lines.push(
    "每個平台的最後一句是自然的互動邀請（留言、私訊），不要硬推銷。",
    "字數以中文字計、不含空白。",
    "",
    sourceBlock(src),
  );
  return lines.join("\n");
}

/** 短影音：三個版本，各有標題、黃金三秒鉤子、1 分鐘內的口播文稿。 */
export function videoPrompt(src: CopySource): string {
  const [lo, hi] = COPYWRITER.SCRIPT_CHARS;
  return [
    "任務：把下面這則新聞改成「1 分鐘內的短影音口播文稿」，給我三種版本（A、B、C），三版切入角度要不同：例如一版講數字、一版講對買方或租客的影響、一版講趨勢或提醒。",
    "",
    "每一版照這個格式（標題那行的字不要改，後台靠它辨識）：",
    "",
    "## 版本 A",
    "🔥 標題：（15 字內，像熱門影片的標題，要吸睛）",
    "⚡ 黃金三秒鉤子：（開頭第一句，10 到 20 字，簡潔、強調、讓人不滑走）",
    "🎬 口播文稿：",
    "```",
    "【鉤子】……",
    "【重點一】……",
    "【重點二】……",
    "【結論】……（最後一句是自然的互動邀請，例如「想知道海線哪裡還有這種價位，留言告訴我」）",
    "```",
    "",
    "硬規則：",
    `- 口播文稿 ${lo} 到 ${hi} 字（一般語速一分鐘約 ${COPYWRITER.SPEECH_CHARS_PER_MINUTE} 字，要在 1 分鐘內講完），只算 \`\`\` 裡面的字`,
    "- 內容跟原文相似度要 90% 以上：只能用原文的事實與數字，可以換句話說、可以重排順序讓邏輯更清楚，不能加原文沒有的內容",
    "- 邏輯要非常清楚：鉤子 → 重點 → 重點 → 結論，一段講一件事，段落照【鉤子】【重點一】【重點二】【結論】標",
    "- 三版都要加 emoji；用台灣口語、適合對著鏡頭講",
    "- 口播文稿一定要放在 ``` 圍起來的區塊裡（後台靠它數字數、估秒數）",
    "",
    sourceBlock(src),
  ].join("\n");
}

export function buildPrompt(line: NewsLine, src: CopySource): string {
  return line === "video" ? videoPrompt(src) : articlePrompt(src);
}

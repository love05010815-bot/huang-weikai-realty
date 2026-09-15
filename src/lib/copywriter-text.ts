/**
 * 派工寫稿產出的文字分析 —— 純函式，不碰 API、不碰資料庫，前後端都能用。
 *
 * 知識文章：照「## 平台名」切段，每段數字數、對平台硬上限。
 * 短影音：找出 ``` 圍起來的口播文稿，數字數、用語速估秒數。
 *
 * 模型自己數的字數不可信（它會少算或多算），所以後台一律自己數。
 */
import { COPYWRITER, PLATFORM_RULES, type PlatformRule } from "@/config/copywriter";
import type { NewsLine } from "@/lib/news";

/** 中文習慣的「字數」：不含空白與換行。 */
export function countChars(text: string): number {
  return Array.from(text.replace(/\s+/g, "")).length;
}

export type PlatformStat = {
  rule: PlatformRule;
  /** 那一段的字數；沒切出來就是 0 */
  chars: number;
  /** 超過平台硬上限 */
  over: boolean;
  /** 有沒有在文案裡找到這個平台的段落 */
  found: boolean;
};

export type ScriptStat = {
  label: string;
  chars: number;
  /** 依語速估的秒數 */
  seconds: number;
};

export type DraftStats = { line: "article"; platforms: PlatformStat[] } | { line: "video"; scripts: ScriptStat[] };

export function analyzeDraft(line: NewsLine, text: string): DraftStats {
  if (line === "video") return { line, scripts: analyzeVideo(text) };
  return { line: "article", platforms: analyzeArticle(text) };
}

function normalizeHeading(h: string): string {
  return h.toLowerCase().replace(/[\s_\-—–·・:：（）()]+/g, "");
}

type Section = { heading: string; body: string };

/** 以 `#`、`##`、`###` 開頭的行切段。 */
function splitSections(text: string): Section[] {
  const sections: Section[] = [];
  let cur: Section | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const m = /^#{1,3}\s+(.+?)\s*$/.exec(raw);
    if (m) {
      cur = { heading: m[1], body: "" };
      sections.push(cur);
      continue;
    }
    if (cur) cur.body += `${raw}\n`;
  }
  return sections;
}

function analyzeArticle(text: string): PlatformStat[] {
  const sections = splitSections(text);
  return PLATFORM_RULES.map((rule) => {
    const want = normalizeHeading(rule.heading);
    const sec = sections.find((s) => normalizeHeading(s.heading).includes(want));
    const chars = sec ? countChars(sec.body) : 0;
    return { rule, chars, over: rule.hardLimit != null && chars > rule.hardLimit, found: !!sec };
  });
}

function analyzeVideo(text: string): ScriptStat[] {
  // 先記下每個「## 版本 X」標題的位置，fenced block 就歸給它前面最近的那個
  const headings: { index: number; label: string }[] = [];
  const headRe = /^#{1,3}\s+(.+?)\s*$/gm;
  let h: RegExpExecArray | null;
  while ((h = headRe.exec(text))) headings.push({ index: h.index, label: h[1] });

  const out: ScriptStat[] = [];
  const fenceRe = /```[^\n]*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = fenceRe.exec(text))) {
    const before = headings.filter((x) => x.index < m!.index);
    const label = before.length ? before[before.length - 1].label : `第 ${i + 1} 段`;
    const chars = countChars(m[1]);
    out.push({ label, chars, seconds: Math.round((chars / COPYWRITER.SPEECH_CHARS_PER_MINUTE) * 60) });
    i += 1;
  }
  return out;
}

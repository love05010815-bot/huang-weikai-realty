/**
 * 物件文案的風險字眼檢查。
 *
 * 起因：2026-08-20 掃過一次文案，「開價低於實登」「保證」已經拿掉，
 * 但「賠售」「近未來藍線捷運 B6 站」還留著。與其等下次再掃一遍，
 * 不如讓後台在你打字的當下就講出來 —— 事後補救永遠比較貴。
 *
 * 這裡標的是**公平交易法上說得出風險的字**，不是幫你改文案。
 * 標出來不等於不能用：說得出根據（實登截圖、核定公告）就可以用，
 * 標記只是提醒你「這句話將來可能要你拿證據」。
 *
 * ⚠️ 這支檔案刻意不 import 任何東西 —— server 端的列表與 client 端的表單要共用。
 */

export type CopyRisk = {
  /** 命中的字 */
  word: string;
  /** 為什麼要小心 */
  why: string;
};

const RULES: ReadonlyArray<{ pattern: RegExp; word: string; why: string }> = [
  {
    pattern: /賠售|虧本|認賠/,
    word: "賠售",
    why: "宣稱屋主虧本賣是事實主張，要說得出根據（原始取得價）。公平會盯的誘餌詞。",
  },
  {
    pattern: /保證|絕對|穩賺|包賺|必漲/,
    word: "保證",
    why: "對品質或報酬打包票，做不到就是廣告不實。改成可查證的具體事實。",
  },
  {
    pattern: /全台第一|第一品牌|最便宜|最低價|唯一一家|最強/,
    word: "最高級用語",
    why: "「第一／最」這類排序主張要有公開可查的統計來源，否則不能寫。",
  },
  {
    pattern: /未來.{0,6}捷運|捷運.{0,4}(規劃|興建中|預定)|即將通車/,
    word: "未通車捷運",
    why: "拿未通車路線當賣點，需路線已核定，且要標明「規劃中／尚未通車」。",
  },
  {
    pattern: /增值|翻倍|漲幅可期|投資報酬/,
    word: "增值承諾",
    why: "對未來房價的預測性說法，容易被認定為誘使交易的不實廣告。",
  },
];

/** 掃一段文字，回傳命中的風險字（同一個字只回一次）。 */
export function findCopyRisks(...texts: Array<string | null | undefined>): CopyRisk[] {
  const haystack = texts.filter(Boolean).join("\n");
  if (!haystack) return [];
  const hits: CopyRisk[] = [];
  for (const rule of RULES) {
    if (rule.pattern.test(haystack) && !hits.some((h) => h.word === rule.word)) {
      hits.push({ word: rule.word, why: rule.why });
    }
  }
  return hits;
}

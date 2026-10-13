/**
 * 🎯 開發物件追蹤 —— 純文字處理（沒有 Prisma，客戶端元件可以 import）
 *
 * 他的用法是「從不同地方丟連結或地址進來」：貼進來的可能是一條 591 網址、
 * 一行地址、或兩者混在一起。這裡負責把它拆開、判斷區域跟來源，
 * 讓他丟進來的那一刻就自動分好區、不用自己填。
 *
 * ⚠️ 跟 lib/owners-text.ts 同一個規矩：這個檔不能 import lib/dev-leads.ts（有 Prisma，
 *    進了客戶端 bundle tsc 抓不到、執行期才炸）。
 */
import { LEAD_AREAS, LEAD_SOURCES, type LeadArea } from "@/config/dev-leads";

/** 台中 29 個行政區，長的排前面（「北屯區」要先於「北區」比對） */
const TAICHUNG_DISTRICTS = [
  "北屯區", "西屯區", "南屯區", "太平區", "大里區", "霧峰區", "烏日區", "豐原區", "后里區", "石岡區",
  "東勢區", "和平區", "新社區", "潭子區", "大雅區", "神岡區", "大肚區", "沙鹿區", "龍井區", "梧棲區",
  "清水區", "大甲區", "外埔區", "大安區", "中區", "東區", "南區", "西區", "北區",
];

const AREA_SET = new Set<string>(LEAD_AREAS);

/**
 * 從地址／文字判斷區域。
 * 1. 先找寫全的「○○區」：在清單裡就直接用；是台中別區（例如西屯區）就歸「其他」。
 * 2. 再找沒寫「區」的海線地名（沙鹿、梧棲…）—— 他口語常這樣打。
 * 認不出來回 null，讓畫面要他自己選。
 */
export function detectArea(text: string): LeadArea | null {
  const t = (text ?? "").replace(/\s+/g, "");
  if (!t) return null;
  for (const d of TAICHUNG_DISTRICTS) {
    if (t.includes(d)) return AREA_SET.has(d) ? (d as LeadArea) : "其他";
  }
  for (const a of LEAD_AREAS) {
    if (a === "其他") continue;
    if (t.includes(a.slice(0, -1))) return a;
  }
  return null;
}

const URL_RE = /https?:\/\/[^\s"'<>）)]+/i;

/** 從網址的網域猜來源（591／樂屋／愛屋…），猜不到回「其他」 */
export function detectSource(url: string): (typeof LEAD_SOURCES)[number] {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "其他";
  }
  if (host.includes("591")) return "591";
  if (host.includes("rakuya")) return "樂屋";
  if (host.includes("houseol")) return "愛屋";
  if (host.includes("facebook") || host === "fb.com" || host.endsWith(".fb.com") || host.includes("fb.watch")) return "FB";
  if (host.includes("housefun")) return "好房網";
  if (host.includes("sinyi")) return "信義";
  if (host.includes("yungching")) return "永慶";
  return "其他";
}

/** 卡片上顯示用的短網域：「rent.591.com.tw」→「591.com.tw」 */
export function hostLabel(url: string): string {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    const parts = h.split(".");
    return parts.length > 3 ? parts.slice(-3).join(".") : h;
  } catch {
    return url;
  }
}

export type QuickAddParsed = {
  sourceUrl: string;
  address: string;
  area: LeadArea | null;
  source: string;
};

/**
 * 把他貼進來的一坨文字拆成：網址、地址、區域、來源。
 * 「台中市清水區中山路 44 號 https://sale.591.com.tw/123.html」→ 兩邊都有；
 * 只有網址 → 地址留空（之後點開連結看到再補）；只有文字 → 當地址。
 */
export function parseQuickAdd(raw: string): QuickAddParsed {
  const text = raw ?? "";
  const m = text.match(URL_RE);
  const sourceUrl = m ? m[0] : "";
  const address = text.replace(URL_RE, " ").replace(/\s+/g, " ").trim();
  const area = detectArea(address) ?? (sourceUrl ? detectArea(decodeURIComponent(sourceUrl)) : null);
  const source = sourceUrl ? detectSource(sourceUrl) : "";
  return { sourceUrl, address, area, source };
}

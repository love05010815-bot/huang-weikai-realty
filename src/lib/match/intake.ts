/**
 * 代客建檔的共用邏輯 —— 後台（Google 登入）跟手機快速連結（/intake?key=）兩條路都走這裡。
 *
 * 這裡**不管權限**：誰能叫由 lib/actions/match.ts（管理員）與 lib/actions/intake.ts（金鑰）各自把關。
 * 三件事：
 *   saveBuyerFromForm  表單 → match_buyer（電話查重、合併）
 *   buildBuyerBrief    這位買方目前符合幾間、專屬連結、建議傳給他的那段話
 *   pushBriefToBuyer   從官方帳號推物件卡給他（計費）
 */
import { MATCH } from "@/config/match";
import { OWNER } from "@/config/owner";
import { listingCarousel, matchPageUrl, pushMessages, text } from "./line";
import { describePreference, normalizePreference, rankListings } from "./matcher";
import { getBuyer, getBuyerByPhone, listAvailableListings, normalizePhone, upsertBuyer, type Buyer, type MatchListing } from "./store";
import { createBuyerToken } from "./token";

export type BuyerFormInput = {
  name: string;
  phone: string;
  note: string;
  /** 表單送來的條件（toApiPreference 的結果）；這裡再 normalize 一次，不信任前端 */
  preference: unknown;
};

export type SaveResult = { ok: true; buyer: Buyer; merged: boolean } | { ok: false; error: string };

/**
 * 存買方。id 為 null = 新建。
 * 新建時用電話查重 —— 同一個人打第二次電話、或他之前自己在 /match 留過條件，
 * 都不該變成兩筆；找到就更新那一筆，回 merged = true 讓畫面提醒一聲。
 */
export async function saveBuyerFromForm(id: string | null, input: BuyerFormInput): Promise<SaveResult> {
  const name = String(input.name ?? "").trim().slice(0, 40);
  const phone = normalizePhone(String(input.phone ?? "")).slice(0, 40);
  const note = String(input.note ?? "").trim().slice(0, 1000);
  if (!name) return { ok: false, error: "請填怎麼稱呼（例如「王先生」）" };
  if (phone.length < 8) return { ok: false, error: "電話至少 8 碼" };
  const preference = normalizePreference(input.preference);

  let targetId = id;
  let merged = false;
  if (!targetId) {
    const existing = await getBuyerByPhone(phone);
    if (existing) {
      targetId = existing.id;
      merged = true;
    }
  }
  const buyer = await upsertBuyer({ id: targetId, name, phone, note, preference });
  return { ok: true, buyer, merged };
}

export type BriefMatch = {
  id: string;
  title: string;
  price: number;
  meta: string;
  sourceUrl: string;
  image: string | null;
};

export type BuyerBrief = {
  summary: string | null;
  /** 符合的總數；matches 只有前幾十筆 */
  matched: number;
  /** 目前在售總數 */
  total: number;
  matches: BriefMatch[];
  /** 這位買方專屬的配對連結（點開直接看物件）；簽章密鑰沒設時是 null */
  link: string | null;
  /** 建議傳給客戶的那段話（畫面上可以改） */
  message: string;
};

/** 「台中市梧棲區 · 22 坪 · 2 房 · 電梯大樓 · 屋齡 1.2 年」—— 沒有的欄位直接省略 */
function metaLine(l: MatchListing): string {
  const parts = [`${l.city}${l.district}`];
  if (l.landSize > 0 && /土地|農|建地/.test(l.type)) parts.push(`地坪 ${l.landSize} 坪`);
  else if (l.size > 0) parts.push(`${l.size} 坪`);
  if (l.rooms > 0) parts.push(`${l.rooms} 房`);
  if (l.type) parts.push(l.type);
  if (l.age > 0) parts.push(l.age < 1 ? "新成屋" : `屋齡 ${l.age} 年`);
  return parts.join(" · ");
}

/** 建議傳給客戶的那段話。他可以在畫面上改過再傳。 */
function buildMessage(name: string, summary: string | null, matched: number, link: string): string {
  const who = `${name}您好，我是太平洋房屋的${OWNER.alias}。`;
  if (!summary) return `${who}\n這是您的專屬找房連結，填好購屋條件就會自動配對，看中意可以直接預約看屋：\n${link}`;
  if (matched === 0) {
    return `${who}\n您的需求（${summary}）我已經記下來了，目前還沒有完全符合的物件，有新的進來會第一時間通知您。\n想調整條件可以點這裡：\n${link}`;
  }
  return `${who}\n依您的需求（${summary}）目前有 ${matched} 間符合，點這裡看：\n${link}\n看到中意的可以直接在裡面預約看屋。`;
}

/**
 * 這位買方的「簡報」：符合幾間、前幾間長什麼樣、專屬連結、建議訊息。
 * 配對用的是跟 /api/match/search 同一支 rankListings，所以他看到的跟客戶點開看到的一模一樣。
 */
export async function buildBuyerBrief(buyer: Buyer, showMax = 40): Promise<BuyerBrief> {
  let matches: BriefMatch[] = [];
  let matched = 0;
  let total = 0;
  if (buyer.preference) {
    const listings = await listAvailableListings();
    total = listings.length;
    const ranked = rankListings(buyer.preference, listings, { limit: listings.length || 1 });
    matched = ranked.length;
    matches = ranked.slice(0, showMax).map((m) => ({
      id: m.listing.id,
      title: m.listing.title,
      price: m.listing.price,
      meta: metaLine(m.listing),
      sourceUrl: m.listing.sourceUrl,
      image: m.listing.images?.[0] && /^https:\/\//.test(m.listing.images[0]) ? m.listing.images[0] : null,
    }));
  }
  const summary = buyer.preference ? describePreference(buyer.preference) : null;
  const token = createBuyerToken(buyer.id);
  const link = token ? matchPageUrl(undefined, token, { go: true }) : null;
  const name = buyer.name || buyer.displayName || "您";
  return { summary, matched, total, matches, link, message: link ? buildMessage(name, summary, matched, link) : "" };
}

/**
 * 從官方帳號把配對到的物件卡推給這位買方 —— **計費，一則**。
 * 只有綁了 LINE、而且還是好友的才推得到；沒綁的走「複製訊息」那條路（免費）。
 * 卡片帶這位買方自己的識別碼：他是收件人不是轉傳者，按「預約看屋」就該認得是他。
 */
export async function pushBriefToBuyer(buyerId: string): Promise<{ ok: boolean; error?: string; count?: number }> {
  const buyer = await getBuyer(buyerId);
  if (!buyer) return { ok: false, error: "找不到這位買方" };
  if (!buyer.lineUserId) return { ok: false, error: "這位買方還沒綁定官方 LINE，請用「複製訊息」傳給他" };
  if (!buyer.followed) return { ok: false, error: "這位買方已封鎖官方帳號，推播送不到" };
  if (!buyer.preference) return { ok: false, error: "還沒有條件，先填條件" };

  const matches = rankListings(buyer.preference, await listAvailableListings(), { threshold: MATCH.threshold, limit: 10 });
  if (!matches.length) return { ok: false, error: "目前沒有符合條件的物件，沒有東西可以推" };

  const token = createBuyerToken(buyer.id);
  const ok = await pushMessages(buyer.lineUserId, [
    text(`🏠 ${OWNER.alias}幫您挑了 ${matches.length} 間符合條件的物件（${describePreference(buyer.preference)}）`),
    listingCarousel(matches, token),
  ]);
  if (!ok) return { ok: false, error: "推播失敗：LINE 沒收（可能是額度用完或 token 沒設）" };
  return { ok: true, count: matches.length };
}

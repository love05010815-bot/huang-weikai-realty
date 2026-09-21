/**
 * 買方配對用的 LINE 訊息 —— Flex 樣板、深層連結、給你的通知
 *
 * 走的是官方帳號 @a8865 的 Messaging API（跟客服機器人同一組 LINE_BOT_ACCESS_TOKEN）。
 * lib/line-bot/client.ts 的 replyMessage／pushMessage 只送純文字，這裡要送 Flex 卡，
 * 所以自己打一次 API；token 還是從那邊拿，不要複製一份設定。
 *
 * ⚠️ reply 免費、push 計費（輕用量每月 200 則）。確認卡一律用 reply，
 *    只有「新物件通知」與「通知你本人」才 push。
 */
import { MATCH } from "@/config/match";
import { getAgentLineIds } from "./agents";
import { OWNER, SITE_URL, SOCIAL } from "@/config/owner";
import { getLineBotToken } from "@/lib/line-bot/client";
import { notifyAbinAdminGroup } from "@/lib/line-notify";
import { escapeHtml, sendMail } from "@/lib/mail";
import type { ListingUpsert } from "./houseol-parse";
import type { Viewing } from "./store";

const LINE_API = "https://api.line.me/v2/bot";
const GREEN = "#06C755";

export type LineMessage = { type: string; [key: string]: unknown };

/** 評分或推播需要的物件欄位（match_listing 與剛同步進來的 ListingUpsert 都符合） */
export type ListingLike = Pick<
  ListingUpsert,
  "id" | "title" | "city" | "district" | "address" | "price" | "rooms" | "size" | "landSize" | "type" | "age" | "images"
>;

async function send(endpoint: string, body: unknown): Promise<boolean> {
  const token = getLineBotToken();
  if (!token) {
    console.error("[match/line] 缺 LINE_BOT_ACCESS_TOKEN，訊息沒送");
    return false;
  }
  try {
    const res = await fetch(`${LINE_API}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`[match/line] ${endpoint} 失敗`, res.status, (await res.text().catch(() => "")).slice(0, 300));
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[match/line] ${endpoint} 例外:`, e);
    return false;
  }
}

/** 用 replyToken 回覆（免費）。一次最多 5 則。 */
export function replyMessages(replyToken: string, messages: LineMessage[]): Promise<boolean> {
  return send("/message/reply", { replyToken, messages: messages.slice(0, 5) });
}

/** 主動推播（計費）。一次最多 5 則。 */
export function pushMessages(to: string, messages: LineMessage[]): Promise<boolean> {
  return send("/message/push", { to, messages: messages.slice(0, 5) });
}

// ---------------------------------------------------------------- 深層連結

/** 加官方帳號好友 */
export const addFriendUrl = (): string => `https://line.me/R/ti/p/${MATCH.lineOaId}`;

/** 開官方帳號聊天室並預填一句話（買方按送出，webhook 就會收到） */
export const oaMessageUrl = (message: string): string =>
  `https://line.me/R/oaMessage/${encodeURIComponent(MATCH.lineOaId)}/?${encodeURIComponent(message)}`;

/**
 * 配對頁。
 *   book=物件編號 → 直接跳到那一戶的預約表單
 *   k=買方識別碼  → 認得出是同一個人（帶回他上次的條件、之後改的條件寫回同一筆）
 *
 * 識別碼是簽章過的買方編號（lib/match/token.ts），**不是** LINE userId ——
 * 個資不進網址。網頁讀完會自己把 k 從網址上拿掉。
 */
export const matchPageUrl = (listingId?: string, token?: string | null): string => {
  const qs = new URLSearchParams();
  if (listingId) qs.set("book", listingId);
  if (token) qs.set("k", token);
  const q = qs.toString();
  return q ? `${SITE_URL}/match?${q}` : `${SITE_URL}/match`;
};

// ---------------------------------------------------------------- 樣板

export const text = (t: string): LineMessage => ({ type: "text", text: String(t).slice(0, 4800) });

export const fmtWan = (price: number): string => `${Number(price).toLocaleString("zh-TW")} 萬`;

/** 屋齡 0 = 店網沒給（土地就沒有屋齡），不顯示；未滿一年在解析時記成 0.5 → 新成屋 */
const ageText = (age: number): string => (Number(age) <= 0 ? "" : Number(age) < 1 ? "新成屋" : `屋齡 ${age} 年`);

/** 「台中市沙鹿區 · 27 坪 · 3 房 · 華廈 · 屋齡 30 年」—— 沒有的欄位（土地沒房數）直接省略 */
function metaLine(l: ListingLike): string {
  const parts = [`${l.city}${l.district}`];
  if (l.landSize > 0 && /土地|農|建地/.test(l.type)) parts.push(`地坪 ${l.landSize} 坪`);
  else if (l.size > 0) parts.push(`${l.size} 坪`);
  if (l.rooms > 0) parts.push(`${l.rooms} 房`);
  if (l.type) parts.push(l.type);
  const age = ageText(l.age);
  if (age) parts.push(age);
  return parts.join(" · ");
}

/** Flex 的 text 不能是空字串（整包會被退），所以每個文字都先保底 */
const safe = (s: string | null | undefined, fallback = "—"): string => (String(s ?? "").trim() ? String(s).trim() : fallback);

const row = (label: string, value: string) => ({
  type: "box",
  layout: "baseline",
  spacing: "sm",
  contents: [
    { type: "text", text: label, color: "#aaaaaa", size: "sm", flex: 1 },
    { type: "text", text: safe(value), wrap: true, size: "sm", flex: 4 },
  ],
});

/** 價格異動通知用：原價 → 現價 的那一行字（降價橘色、調漲綠色，跟賣方立場無關，只是好認） */
function priceChangeLine(from: number, to: number): Record<string, unknown> {
  const diff = Math.abs(to - from);
  const down = to < from;
  return {
    type: "text",
    text: `${down ? "🔻 降價" : "🔺 調漲"} ${fmtWan(diff)}（原 ${fmtWan(from)}）`,
    size: "sm",
    weight: "bold",
    color: down ? "#E8590C" : "#1f7a68",
    wrap: true,
  };
}

export function listingBubble(
  listing: ListingLike,
  opts: { score?: number; reasons?: string[]; token?: string | null; priceFrom?: number } = {},
) {
  const image = listing.images?.[0];
  const bubble: Record<string, unknown> = {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        opts.score != null ? { type: "text", text: `配對度 ${opts.score}%`, size: "xs", color: GREEN, weight: "bold" } : null,
        { type: "text", text: safe(listing.title, "物件"), weight: "bold", size: "lg", wrap: true },
        { type: "text", text: fmtWan(listing.price), size: "xl", weight: "bold", color: "#E8590C" },
        opts.priceFrom && opts.priceFrom !== listing.price ? priceChangeLine(opts.priceFrom, listing.price) : null,
        { type: "text", text: safe(metaLine(listing)), size: "sm", color: "#666666", wrap: true },
        opts.reasons?.length ? { type: "text", text: `✔ ${opts.reasons.slice(0, 3).join("、")}`, size: "xs", color: "#888888", wrap: true } : null,
      ].filter(Boolean),
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        { type: "button", style: "primary", color: GREEN, action: { type: "uri", label: "預約看屋", uri: matchPageUrl(listing.id, opts.token) } },
      ],
    },
  };
  if (image && /^https:\/\//.test(image)) {
    bubble.hero = { type: "image", url: image, size: "full", aspectRatio: "20:13", aspectMode: "cover" };
  }
  return bubble;
}

/** 新物件通知：一則 carousel 裝最多 10 戶 */
export function listingCarousel(items: { listing: ListingLike; score: number; reasons: string[] }[], token?: string | null): LineMessage {
  const bubbles = items.slice(0, 10).map((m) => listingBubble(m.listing, { score: m.score, reasons: m.reasons, token }));
  return {
    type: "flex",
    altText: `有 ${items.length} 個新物件符合您的條件`,
    contents: { type: "carousel", contents: bubbles },
  };
}

/** 價格異動通知：跟新物件同一種卡，多一行「原價 → 現價」 */
export function priceChangeCarousel(
  items: { listing: ListingLike; score: number; reasons: string[]; priceFrom: number }[],
  token?: string | null,
): LineMessage {
  const bubbles = items
    .slice(0, 10)
    .map((m) => listingBubble(m.listing, { score: m.score, reasons: m.reasons, token, priceFrom: m.priceFrom }));
  return {
    type: "flex",
    altText: `有 ${items.length} 個物件價格異動`,
    contents: { type: "carousel", contents: bubbles },
  };
}

/**
 * 預約確認卡。一筆預約可能包含好幾間 —— 一間就照舊顯示標題＋地點，
 * 多間就顯示「共 N 間」再列標題（最多 5 行，Flex 太長手機上讀不完）。
 */
export function viewingConfirmFlex(
  viewing: Viewing,
  listings: ListingLike[],
  { title = "✅ 預約看屋已收到", note }: { title?: string; note?: string } = {},
): LineMessage {
  const first = listings[0] ?? null;
  const multi = listings.length > 1;
  const head: Record<string, unknown>[] = multi
    ? [
        { type: "text", text: `共 ${listings.length} 間`, weight: "bold", size: "md" },
        ...listings.slice(0, 5).map((l, i) => ({
          type: "text",
          text: `${i + 1}. ${safe(l.title, "物件")}｜${fmtWan(l.price)}`,
          size: "sm",
          color: "#333333",
          wrap: true,
        })),
        ...(listings.length > 5
          ? [{ type: "text", text: `…等 ${listings.length} 間`, size: "xs", color: "#888888" }]
          : []),
      ]
    : [
        { type: "text", text: safe(first?.title, "物件"), weight: "bold", size: "md", wrap: true },
        row("地點", first ? `${first.city}${first.district}${first.address}` : ""),
      ];
  return {
    type: "flex",
    altText: `${title} ${viewing.code}`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: GREEN,
        contents: [{ type: "text", text: title, weight: "bold", color: "#ffffff", size: "md" }],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          ...head,
          row("時間", viewing.preferredAt || "待安排"),
          row("姓名", viewing.name),
          row("電話", viewing.phone),
          row("編號", viewing.code),
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: note ?? `${OWNER.alias}會盡快與您聯繫確認時間；若要更改時間，直接在此聊天室留言即可。`,
            size: "xs",
            color: "#888888",
            wrap: true,
          },
        ],
      },
    },
  };
}

/**
 * 買方在 LINE 輸入「找房」或「修改條件」時回的入口卡
 *
 * 帶 token 進去，他在網頁填的條件就會寫回同一筆買方資料 —— 換手機也不會變成兩個人。
 * 已經留過條件的人（summary 有值）看到的是「目前設定 …」＋「重新設定條件」。
 */
export function welcomeFlex(
  { token, summary, mode = "new" }: { token?: string | null; summary?: string | null; mode?: "new" | "edit" } = {},
): LineMessage {
  const editing = mode === "edit" || Boolean(summary);
  const body: Record<string, unknown>[] = [
    { type: "text", text: editing ? "更新購屋條件 🏠" : "找房交給我 🏠", weight: "bold", size: "xl" },
  ];
  if (summary) {
    body.push({
      type: "box",
      layout: "vertical",
      backgroundColor: "#F4F7F6",
      cornerRadius: "6px",
      paddingAll: "10px",
      contents: [
        { type: "text", text: "目前設定", size: "xs", color: "#888888" },
        { type: "text", text: safe(summary), wrap: true, size: "sm", color: "#333333" },
      ],
    });
    body.push({ type: "text", text: "按下面的按鈕重填一次就會蓋掉舊的條件，之後的新物件通知也照新條件配。", wrap: true, size: "sm", color: "#666666" });
  } else {
    body.push({ type: "text", text: "告訴我們您的購屋條件，系統會從目前在售的物件裡自動配對，看中意可以直接預約看屋。", wrap: true, size: "sm", color: "#666666" });
    body.push({ type: "text", text: "之後有符合條件的新物件，也會第一時間通知您。", wrap: true, size: "sm", color: "#666666" });
  }
  return {
    type: "flex",
    altText: editing ? "更新購屋條件" : "開始配對找房",
    contents: {
      type: "bubble",
      body: { type: "box", layout: "vertical", spacing: "md", contents: body },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            color: GREEN,
            action: { type: "uri", label: editing ? "重新設定條件" : "開始配對找房", uri: matchPageUrl(undefined, token) },
          },
          { type: "button", style: "secondary", height: "sm", action: { type: "message", label: "查詢我的預約", text: "我的預約" } },
          { type: "text", text: "不想再收到新物件通知，回覆「停止通知」即可。", size: "xxs", color: "#aaaaaa", wrap: true },
        ],
      },
    },
  };
}

// ---------------------------------------------------------------- 個人名片卡

/** 名片上的社群按鈕。順序＝優先順序，`config/owner.ts` 的 SOCIAL 留空字串就自動跳過。 */
const SOCIAL_BUTTONS: { key: keyof typeof SOCIAL; label: string }[] = [
  { key: "fb", label: "臉書" },
  { key: "ig", label: "IG" },
  { key: "yt", label: "YouTube" },
  { key: "threads", label: "脆" },
  { key: "tiktok", label: "抖音" },
];

/** 把按鈕兩顆兩顆排成一列（一列一顆會把卡片拉得很長，手機上要一直滑） */
function buttonRows(buttons: Record<string, unknown>[]): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push({ type: "box", layout: "horizontal", spacing: "sm", contents: buttons.slice(i, i + 2) });
  }
  return rows;
}

/**
 * 個人名片卡 —— 大頭照、頭銜、一句介紹、手機、經紀業揭露，加上一排按鈕。
 *
 * 內容全部讀 `config/owner.ts`，這裡一個字都不要寫死：名片頁 /card、首頁頁尾、
 * 通知信都讀同一份，改一處就全部一起變。
 *
 * ⚠️ 大頭照必須是 **https 的絕對網址**，LINE 才載得到（本機 http://localhost 不會顯示，
 *    這是預期的，不是壞掉）。所以不是 https 就整個不放 hero，卡片照樣成立、不會破圖。
 *
 * 🔴 這張卡**故意不帶買方識別碼**（別的卡都會帶）—— 它是拿去**轉傳**的，
 *    帶了的話收到的人一點「預約看屋」就會被認成轉傳者本人，條件、預約全部記到同一筆。
 *    所以連結一律用乾淨的 /match，讓每個人自己留自己的條件。
 */
export function agentCardBubble({ withListings = false }: { withListings?: boolean } = {}) {
  const photo = /^https:\/\//.test(SITE_URL) ? `${SITE_URL}${OWNER.photoUrl}` : "";

  const social = SOCIAL_BUTTONS.filter((b) => /^https:\/\//.test(SOCIAL[b.key] ?? "")).slice(0, 3);
  const linkButtons = [
    { type: "button", style: "secondary", height: "sm", action: { type: "uri", label: "官網", uri: SITE_URL } },
    ...social.map((b) => ({
      type: "button",
      style: "secondary",
      height: "sm",
      action: { type: "uri", label: b.label, uri: SOCIAL[b.key] },
    })),
  ];

  const bubble: Record<string, unknown> = {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        { type: "text", text: safe(OWNER.name), weight: "bold", size: "xxl" },
        { type: "text", text: safe(OWNER.title), size: "sm", weight: "bold", color: "#227F71", wrap: true },
        { type: "text", text: safe(OWNER.slogan), size: "sm", color: "#666666", wrap: true },
        withListings
          ? { type: "text", text: "這幾間是依您的條件挑的，想看幾間都可以，勾好一次約時間就行。", size: "sm", color: "#666666", wrap: true }
          : null,
        { type: "text", text: safe(OWNER.phone), size: "xxl", weight: "bold", color: "#E00000", margin: "md" },
        { type: "separator", margin: "md" },
        {
          type: "text",
          text: `${OWNER.brokerage}｜經紀人：${OWNER.brokerName} ${OWNER.brokerLicense}`,
          size: "xxs",
          color: "#aaaaaa",
          wrap: true,
          margin: "md",
        },
      ].filter(Boolean),
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        {
          type: "button",
          style: "primary",
          color: GREEN,
          action: { type: "uri", label: "預約看屋（想看幾間一起約）", uri: matchPageUrl() },
        },
        {
          type: "button",
          style: "primary",
          color: "#22323F",
          action: { type: "uri", label: `撥電話給${OWNER.alias}`, uri: `tel:${OWNER.phoneRaw}` },
        },
        ...buttonRows(linkButtons),
      ],
    },
  };
  if (photo) bubble.hero = { type: "image", url: photo, size: "full", aspectRatio: "1:1", aspectMode: "cover" };
  return bubble;
}

/**
 * 名片（可以再接幾間物件）。
 *
 * 他要的用法（2026-09-21）：在自己的 LINE 跟官方帳號說一聲「名片」，機器人把卡回給他，
 * 他**長按轉傳**到群組或客戶的聊天室。走 reply 是免費的，轉傳幾次都不花那 200 則額度。
 *
 * 🔴 整張卡（含後面的物件）都不帶買方識別碼，原因見 agentCardBubble。
 */
export function agentCardMessage(listings: ListingLike[] = []): LineMessage {
  const picked = listings.slice(0, 9);
  const bubbles = [agentCardBubble({ withListings: picked.length > 0 }), ...picked.map((l) => listingBubble(l))];
  return {
    type: "flex",
    altText: picked.length ? `${OWNER.name}的名片與 ${picked.length} 間推薦物件` : `${OWNER.name}｜${OWNER.title}`,
    // 只有一張就不要包 carousel —— carousel 的卡片會變窄，單張用整個寬度比較好看
    contents: bubbles.length === 1 ? bubbles[0] : { type: "carousel", contents: bubbles },
  };
}

// ---------------------------------------------------------------- 通知你本人

function ownerEmail(): string {
  return process.env.APPOINTMENT_ADMIN_EMAIL || OWNER.email;
}

/**
 * 有人預約看屋（且已綁定 LINE）→ 通知你。三條管道各自獨立失敗，任何一條掛了都不影響買方那邊。
 *   1. 官方帳號 push 到後台勾選的每一支 LINE（見 lib/match/agents.ts；計費，一支一則）
 *   2. Email
 *   3. ABIN admin 群（沒設就自己跳過）
 *
 * 訊息裡刻意寫「怎麼往下處理」：他多數時候人在 LINE 裡，不該被逼著開後台 ——
 * 回客戶就去官方帳號聊天室找那個名字，要標狀態就直接回「確認 BK-XXXXXX」。
 */
export async function notifyOwnerNewViewing(viewing: Viewing, listings: ListingLike[], profileName: string | null): Promise<void> {
  const first = listings[0] ?? null;
  const multi = listings.length > 1;
  const where = first ? `${first.city}${first.district}${first.address}` : "";
  const lines = [
    `🔔 新的看屋預約 ${viewing.code}`,
    // 一次預約多間時只給一個編號，間數寫在這一行；下面再把每一間列出來
    multi ? `物件：共 ${listings.length} 間` : `物件：${first?.title ?? viewing.listingId}`,
    ...(multi
      ? listings.map((l, i) => `　${i + 1}. ${l.title}｜${l.city}${l.district}｜${fmtWan(l.price)}`)
      : where
        ? [`地點：${where}`]
        : []),
    `時間：${viewing.preferredAt || "待安排"}`,
    `姓名：${viewing.name}`,
    `電話：${viewing.phone}`,
    `LINE：${profileName ?? "（尚未綁定）"}`,
    viewing.note ? `備註：${viewing.note}` : null,
    "",
    profileName
      ? `💬 回客戶：到官方帳號的聊天室找「${profileName}」直接回覆就好。`
      : `💬 他還沒在 LINE 綁定，可以先打 ${viewing.phone}。`,
    `✅ 跟客戶談好時間後，直接回這則訊息「已確認」，系統就會通知買方（要取消就回「取消」）。`,
    `　 同時有好幾筆時改打：確認 ${viewing.code}`,
    `後台（不一定要開）：${SITE_URL}/admin/match`,
  ].filter((l): l is string => l !== null);
  const body = lines.join("\n");

  for (const uid of await getAgentLineIds()) {
    await pushMessages(uid, [text(body)]);
  }

  try {
    await sendMail({
      to: ownerEmail(),
      subject: `【預約看屋】${viewing.name}｜${multi ? `共 ${listings.length} 間` : (first?.title ?? viewing.listingId)}｜${viewing.preferredAt || "時間待安排"}`,
      html: `<pre style="font:14px/1.6 -apple-system,'Noto Sans TC',sans-serif;white-space:pre-wrap">${escapeHtml(body)}</pre>`,
      text: body,
    });
  } catch (e) {
    console.error("[match/line] 通知信寄送失敗:", e);
  }

  try {
    await notifyAbinAdminGroup(body);
  } catch (e) {
    console.error("[match/line] admin 群通知失敗:", e);
  }
}

/**
 * /admin/match/buyers/[id] —— 一位買方：資料、需求、目前符合的物件、怎麼傳給他。
 *
 * 配對在這裡伺服器端直接算（跟 /api/match/search 同一支 rankListings），
 * 所以他在後台看到的幾間，跟客戶點開連結看到的一模一樣。
 */
import { redirect } from "next/navigation";
import { adminEmails } from "@/auth";
import { CIS } from "@/app/admin/_components/cis";
import AdminGateNotice from "@/app/admin/appointments/AdminGateNotice";
import { OWNER } from "@/config/owner";
import { getAdminCheckArgs, isCurrentUserAdmin } from "@/lib/admin-check";
import { matchPageUrl } from "@/lib/match/line";
import { describePreference, rankListings } from "@/lib/match/matcher";
import { buildMatchMeta } from "@/lib/match/meta";
import { getBuyer, listAvailableListings, type MatchListing } from "@/lib/match/store";
import { createBuyerToken } from "@/lib/match/token";
import BuyerDetail, { type DetailMatch } from "../BuyerDetail";
import styles from "../buyer-form.module.css";

export const dynamic = "force-dynamic";

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

export default async function BuyerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) return <AdminGateNotice kind="no_provider" />;
  if (adminEmails().length === 0) return <AdminGateNotice kind="no_whitelist" />;
  const { email } = await getAdminCheckArgs();
  const { id } = await params;
  if (!email) redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent(`/admin/match/buyers/${id}`)}`);
  if (!(await isCurrentUserAdmin())) return <AdminGateNotice kind="not_allowed" email={email} />;

  const shell = (children: React.ReactNode) => (
    <main style={{ background: CIS.bg, color: CIS.text, fontFamily: CIS.font, minHeight: "100vh", padding: "20px 16px 40px" }}>{children}</main>
  );

  let buyer;
  try {
    buyer = await getBuyer(id);
  } catch (e) {
    return shell(<p className={styles.error}>資料庫讀不到：{e instanceof Error ? e.message : String(e)}</p>);
  }
  if (!buyer) {
    return shell(
      <div className={styles.wrap}>
        <a className={styles.back} href="/admin/match?tab=buyers">
          ← 買方配對
        </a>
        <p className={styles.muted}>找不到這位買方，可能已經被刪掉了。</p>
      </div>,
    );
  }

  // 幾個查詢循序做：連線池只有 3 條
  const meta = await buildMatchMeta();
  let matches: DetailMatch[] = [];
  let matched = 0;
  let total = 0;
  if (buyer.preference) {
    const listings = await listAvailableListings();
    total = listings.length;
    const ranked = rankListings(buyer.preference, listings, { limit: listings.length || 1 });
    matched = ranked.length;
    matches = ranked.slice(0, 40).map((m) => ({
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
  const name = buyer.name || buyer.displayName || "（未填姓名）";

  return shell(
    <BuyerDetail
      buyer={{
        id: buyer.id,
        name,
        phone: buyer.phone ?? "",
        note: buyer.note,
        displayName: buyer.displayName,
        linked: Boolean(buyer.lineUserId),
        followed: buyer.followed,
        notify: buyer.notify,
        preference: buyer.preference,
        summary,
        updatedAt: buyer.updatedAt ? buyer.updatedAt.toISOString() : null,
      }}
      matches={matches}
      matched={matched}
      total={total}
      link={link}
      message={link ? buildMessage(name, summary, matched, link) : ""}
      meta={meta}
    />,
  );
}

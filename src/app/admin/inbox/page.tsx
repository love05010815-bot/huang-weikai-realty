/**
 * /admin/inbox —— 影音平台留言收件匣
 *
 * YouTube ＋ Facebook 粉專 ＋ Instagram 的留言**混在同一份清單**，依時間新到舊排。
 * 刻意不做成三個區塊 —— 那只是把三個 App 搬到同一頁，客戶昨天在 IG 問的還是要自己去翻。
 *
 * LINE 的一對一私訊在 /admin/line（那是私訊，性質不同所以分開）。
 * 收件匣的範圍就是這三家。TikTok 與 Threads 2026-08-21 由系統擁有者決定不做 ——
 * 它們從來沒有真的接過（沒有 API 程式碼、沒有路由、沒有金鑰），只是頁面上曾有一段說明文字。
 *
 * ⚠️ 留言是**每次進來即時抓的**，不存資料庫。所以「已回覆」是比對實際回覆算出來的，
 *    你在各平台 App 裡回的也算數，不會出現「後台說沒回、其實回過了」。
 */
import { redirect } from "next/navigation";
import { getAdminCheckArgs, isCurrentUserAdmin } from "@/lib/admin-check";
import { adminEmails } from "@/auth";
import { CIS, CHIP } from "@/app/admin/_components/cis";
import { Icon, type IconName } from "@/app/admin/_ui/icons";
import AdminGateNotice from "@/app/admin/appointments/AdminGateNotice";
import { loadInbox } from "@/lib/inbox";
import {
  PLATFORM_COLOR,
  PLATFORM_LABEL,
  type InboxComment,
  type InboxPlatform,
} from "@/lib/inbox-types";
import { YOUTUBE_REDIRECT_URI, isYoutubeConfigured } from "@/lib/youtube";
import { META_REDIRECT_URI, isMetaConfigured } from "@/lib/meta";
import CommentReply from "./CommentReply";
import UnbindButton from "./UnbindYoutube";
import styles from "./inbox.module.css";

export const dynamic = "force-dynamic";

const TZ = "Asia/Taipei";

const PLATFORM_ICON: Record<InboxPlatform, IconName> = {
  youtube: "play",
  facebook: "users",
  instagram: "camera",
};

function fmtTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: TZ,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ yt?: string; meta?: string; why?: string; p?: string }>;
}) {
  if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) {
    return <AdminGateNotice kind="no_provider" />;
  }
  if (adminEmails().length === 0) return <AdminGateNotice kind="no_whitelist" />;
  const { email } = await getAdminCheckArgs();
  if (!email) redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent("/admin/inbox")}`);
  if (!(await isCurrentUserAdmin())) return <AdminGateNotice kind="not_allowed" email={email} />;

  const sp = await searchParams;
  const snapshot = await loadInbox();
  const ytConfigured = isYoutubeConfigured();
  const metaConfigured = isMetaConfigured();

  const filter = (["youtube", "facebook", "instagram"] as const).includes(sp.p as InboxPlatform)
    ? (sp.p as InboxPlatform)
    : null;
  const shown: InboxComment[] = filter
    ? snapshot.all.filter((c) => c.platform === filter)
    : snapshot.all;

  const ytSource = snapshot.sources.find((s) => s.platform === "youtube")!;
  const fbSource = snapshot.sources.find((s) => s.platform === "facebook")!;
  const igSource = snapshot.sources.find((s) => s.platform === "instagram")!;
  const metaBound = fbSource.bound || igSource.bound;

  return (
    <main className={styles.page} style={{ background: CIS.bg, color: CIS.text, fontFamily: CIS.font }}>
      <div className={styles.shell}>
        <h1 className={styles.title}>
          <Icon name="chat" size={25} />
          留言收件匣
        </h1>
        <p className={styles.subtitle} style={{ color: CIS.textMute }}>
          YouTube、Facebook 粉專、Instagram 的留言全部收在這裡，依時間排好，直接回。
          LINE 的一對一私訊在
          <a href="/admin/line" style={{ color: CIS.blueSoft }}>「LINE 機器人」</a>那一頁。
        </p>

        {/* ── 綁定結果回饋：成功要講，失敗更要講原因 ── */}
        {(sp.yt === "bound" || sp.meta === "bound") && (
          <div
            className={styles.notice}
            style={{ background: "rgba(34,197,94,.1)", borderColor: "rgba(34,197,94,.35)", color: "#4ade80" }}
          >
            {sp.yt === "bound" ? "YouTube" : "Facebook／Instagram"} 綁定成功。
          </div>
        )}
        {(sp.yt === "fail" || sp.meta === "fail") && (
          <div
            className={styles.notice}
            style={{ background: "rgba(244,63,94,.1)", borderColor: "rgba(244,63,94,.35)", color: "#fb7185" }}
          >
            <b>{sp.yt === "fail" ? "YouTube" : "Facebook／Instagram"} 綁定失敗。</b>
            {sp.why ? <> 原因：{sp.why}</> : null}
          </div>
        )}
        {(sp.yt === "state_invalid" || sp.meta === "state_invalid") && (
          <div
            className={styles.notice}
            style={{ background: "rgba(245,158,11,.1)", borderColor: "rgba(245,158,11,.35)", color: "#fbbf24" }}
          >
            授權驗證碼對不上（多半是停太久或換了分頁）。重新點一次綁定就好。
          </div>
        )}

        {/* ── 平台狀態列 ── */}
        <div className={styles.sourceRow}>
          <SourceCard
            platform="youtube"
            configured={ytConfigured}
            bound={ytSource.bound}
            accountName={ytSource.accountName}
            count={ytSource.comments.length}
            error={ytSource.error}
            authHref="/api/admin/youtube/auth"
            redirectUri={YOUTUBE_REDIRECT_URI}
            missingEnv="GOOGLE_CALENDAR_CLIENT_ID / SECRET（或 AUTH_GOOGLE_*）"
            setupWhere="Google Cloud Console → 憑證 → OAuth 2.0 用戶端 → 已授權的重新導向 URI"
            unbindTarget="youtube"
          />
          <SourceCard
            platform="facebook"
            configured={metaConfigured}
            bound={fbSource.bound}
            accountName={fbSource.accountName}
            count={fbSource.comments.length}
            error={fbSource.error}
            authHref="/api/admin/meta/auth"
            redirectUri={META_REDIRECT_URI}
            missingEnv="META_APP_ID / META_APP_SECRET"
            setupWhere="developers.facebook.com → 你的 App → Facebook 登入 → 設定 → 有效的 OAuth 重新導向 URI"
            unbindTarget={metaBound ? "meta" : null}
          />
          <SourceCard
            platform="instagram"
            configured={metaConfigured}
            bound={igSource.bound}
            accountName={igSource.accountName}
            count={igSource.comments.length}
            error={igSource.error}
            authHref="/api/admin/meta/auth"
            redirectUri={META_REDIRECT_URI}
            missingEnv="META_APP_ID / META_APP_SECRET"
            setupWhere="跟 Facebook 同一個 App，一次授權兩個都通"
            unbindTarget={null}
            sameAsFacebook
          />
        </div>

        {/* ── 留言清單 ── */}
        {!snapshot.anyBound ? (
          <div
            className={styles.notice}
            style={{ background: "rgba(148,163,184,.08)", borderColor: CIS.cardBorder, color: CIS.textSub }}
          >
            <b>還沒有任何平台綁定，所以這裡是空的（不是沒有人留言）。</b>
            <br />
            上面每張卡片裡都有那個平台的設定步驟。<b>建議先接 YouTube</b> ——
            它沿用網站現有的 Google 設定，只要加一條網址就好。
          </div>
        ) : (
          <>
            <div className={styles.filterRow}>
              <FilterTab href="/admin/inbox" active={!filter} label="全部" count={snapshot.all.length} />
              {(["youtube", "facebook", "instagram"] as const).map((p) => {
                const src = snapshot.sources.find((s) => s.platform === p)!;
                if (!src.bound) return null;
                return (
                  <FilterTab
                    key={p}
                    href={`/admin/inbox?p=${p}`}
                    active={filter === p}
                    label={PLATFORM_LABEL[p]}
                    count={src.comments.length}
                    color={PLATFORM_COLOR[p]}
                  />
                );
              })}
              <span className={styles.spacer} />
              <span style={{ color: CIS.textMute, fontSize: 14 }}>
                待回覆{" "}
                <b style={{ color: snapshot.waiting.length > 0 ? "#fbbf24" : CIS.textMute }}>
                  {snapshot.waiting.length}
                </b>
              </span>
            </div>

            {shown.length === 0 ? (
              <div
                className={styles.notice}
                style={{ background: "rgba(148,163,184,.08)", borderColor: CIS.cardBorder, color: CIS.textSub }}
              >
                目前沒有別人的留言。（你自己留的不算，已經濾掉了。）
              </div>
            ) : (
              <div className={styles.commentList}>
                {shown.map((c) => (
                  <div
                    key={`${c.platform}-${c.id}`}
                    className={`${styles.comment}${c.answeredByOwner ? ` ${styles.commentDone}` : ""}`}
                    style={{
                      background: CIS.card,
                      borderColor: CIS.cardBorder,
                      // 左邊一條平台色，混排時一眼分辨是哪家
                      borderLeft: `3px solid ${PLATFORM_COLOR[c.platform]}`,
                    }}
                  >
                    <div className={styles.commentHead}>
                      {c.authorImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className={styles.avatar} src={c.authorImage} alt="" width={34} height={34} />
                      ) : (
                        <div
                          className={`${styles.avatar} ${styles.avatarFallback}`}
                          style={{ background: "rgba(255,255,255,.06)", color: PLATFORM_COLOR[c.platform] }}
                        >
                          <Icon name={PLATFORM_ICON[c.platform]} size={16} />
                        </div>
                      )}
                      <div className={styles.commentWho}>
                        <div className={styles.commentAuthor}>
                          {c.author}
                          <span
                            className={styles.platformTag}
                            style={{ color: PLATFORM_COLOR[c.platform] }}
                          >
                            {PLATFORM_LABEL[c.platform]}
                          </span>
                        </div>
                        <div className={styles.commentMeta} style={{ color: CIS.textMute }}>
                          {fmtTime(c.publishedAt)}
                          {c.context ? ` ・ 在「${c.context}」` : ""}
                          {c.permalink ? (
                            <>
                              {" ・ "}
                              <a
                                href={c.permalink}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: CIS.blueSoft }}
                              >
                                看原文 ↗
                              </a>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <span
                        className={styles.chip}
                        style={
                          c.answeredByOwner
                            ? { background: CHIP.success.bg, borderColor: CHIP.success.border, color: CHIP.success.color }
                            : { background: CHIP.warn.bg, borderColor: CHIP.warn.border, color: CHIP.warn.color }
                        }
                      >
                        {c.answeredByOwner ? "已回" : "待回覆"}
                      </span>
                    </div>

                    <p className={styles.commentText}>{c.text}</p>

                    {c.replies.length > 0 ? (
                      <div className={styles.replies} style={{ borderColor: CIS.divider }}>
                        {c.replies.map((r, i) => (
                          <div key={i} className={styles.replyItem}>
                            <span
                              className={styles.replyAuthor}
                              style={{ color: r.byOwner ? "#4ade80" : CIS.textMute }}
                            >
                              {r.byOwner ? "你回的" : r.author}
                            </span>
                            <span style={{ color: CIS.textSub }}>{r.text}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <CommentReply
                      platform={c.platform}
                      commentId={c.id}
                      author={c.author}
                      alreadyAnswered={c.answeredByOwner}
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* 2026-08-21 系統擁有者：「先移除 TikTok 跟 Threads 的串接」→ 這一段拿掉。
            那兩個平台從來沒有真的接過（沒有 API 程式碼、沒有路由、沒有金鑰），
            這裡原本只是一段說明文字。收件匣現在的範圍就是 YouTube／FB／IG 三家。
            要再接 Threads 的話：它跟 FB／IG 是分開的一套授權，要另外設定。 */}
      </div>
    </main>
  );
}

function FilterTab({
  href,
  active,
  label,
  count,
  color,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
  color?: string;
}) {
  return (
    <a
      className={styles.filterTab}
      href={href}
      style={
        active
          ? { background: "rgba(255,255,255,.09)", borderColor: color || CIS.blue, color: CIS.text }
          : { borderColor: CIS.cardBorder, color: CIS.textMute }
      }
    >
      {label}
      <span className={styles.filterCount}>{count}</span>
    </a>
  );
}

function SourceCard({
  platform,
  configured,
  bound,
  accountName,
  count,
  error,
  authHref,
  redirectUri,
  missingEnv,
  setupWhere,
  unbindTarget,
  sameAsFacebook,
}: {
  platform: InboxPlatform;
  configured: boolean;
  bound: boolean;
  accountName: string | null;
  count: number;
  error: string | null;
  authHref: string;
  redirectUri: string;
  missingEnv: string;
  setupWhere: string;
  unbindTarget: "youtube" | "meta" | null;
  sameAsFacebook?: boolean;
}) {
  const color = PLATFORM_COLOR[platform];

  return (
    <div className={styles.sourceCard} style={{ background: CIS.card, borderColor: CIS.cardBorder }}>
      <div className={styles.sourceHead}>
        <Icon name={PLATFORM_ICON[platform]} size={18} color={color} />
        <span className={styles.sourceName}>{PLATFORM_LABEL[platform]}</span>
        <span
          className={styles.chip}
          style={
            bound && !error
              ? { background: CHIP.success.bg, borderColor: CHIP.success.border, color: CHIP.success.color }
              : bound && error
                ? { background: CHIP.warn.bg, borderColor: CHIP.warn.border, color: CHIP.warn.color }
                : { background: CHIP.neutral.bg, borderColor: CHIP.neutral.border, color: CHIP.neutral.color }
          }
        >
          {bound && !error ? `${count} 則` : bound && error ? "有問題" : "未綁定"}
        </span>
      </div>

      {bound ? (
        <>
          {accountName ? (
            <div className={styles.sourceAccount} style={{ color: CIS.textMute }}>
              {accountName}
            </div>
          ) : null}
          {error ? (
            <p className={styles.sourceDetail} style={{ color: "#fdba74" }}>
              {error}
            </p>
          ) : null}
          {unbindTarget ? (
            <div style={{ marginTop: 10 }}>
              <UnbindButton target={unbindTarget} />
            </div>
          ) : null}
        </>
      ) : !configured ? (
        <p className={styles.sourceDetail} style={{ color: "#fb7185" }}>
          缺環境變數 <code>{missingEnv}</code>，設好並重新部署才接得起來。
        </p>
      ) : sameAsFacebook ? (
        <p className={styles.sourceDetail} style={{ color: CIS.textSub }}>
          跟 Facebook 同一次授權。IG 必須是<b>專業帳號</b>且<b>連到那個粉專</b>，
          否則 FB 會通、IG 這半不會。
        </p>
      ) : (
        <>
          <p className={styles.sourceDetail} style={{ color: CIS.textSub }}>
            先到 <b>{setupWhere}</b>，把下面這條加進去（<b>照抄，不要自己打</b>）：
          </p>
          <code className={styles.uriBox} style={{ borderColor: CIS.cardBorder }}>
            {redirectUri}
          </code>
          <a
            className={styles.btn}
            style={{ background: CIS.blueDeep, color: "#fff", borderColor: CIS.blueDeep, marginTop: 8 }}
            href={authHref}
          >
            <Icon name="link" size={14} />
            綁定 {PLATFORM_LABEL[platform]}
          </a>
        </>
      )}
    </div>
  );
}

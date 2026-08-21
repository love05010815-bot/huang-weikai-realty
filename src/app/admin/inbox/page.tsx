/**
 * /admin/inbox —— 影音平台留言收件匣。
 *
 * 現在還沒接線。這一頁先把「每個平台到底接不接得起來」寫清楚，
 * 因為那是要先做的決定（有兩個平台不是寫程式能解決的，卡在對方的審核與政策）。
 *
 * 真的開始接的時候：這頁改成收件匣本體，下面這張表移到 README。
 */
import { redirect } from "next/navigation";
import { getAdminCheckArgs, isCurrentUserAdmin } from "@/lib/admin-check";
import { adminEmails } from "@/auth";
import { CIS, CHIP, type ChipTone } from "@/app/admin/_components/cis";
import { Icon, type IconName } from "@/app/admin/_ui/icons";
import AdminGateNotice from "@/app/admin/appointments/AdminGateNotice";
import styles from "./inbox.module.css";

export const dynamic = "force-dynamic";

type Platform = {
  name: string;
  handle: string;
  icon: IconName;
  tone: ChipTone;
  status: string;
  detail: string;
};

/**
 * 三種燈號的意思：
 *   success = 有官方 API 可以讀留言也可以回，我這邊寫完就會動。
 *   warn    = API 有，但要先過對方的審核／驗證，時間不在我們手上。
 *   danger  = 對方沒開放，寫程式解不掉。
 */
const PLATFORMS: Platform[] = [
  {
    name: "YouTube",
    handle: "@swujnuty0325・1,987 訂閱",
    icon: "play",
    tone: "success",
    status: "可以接",
    detail:
      "YouTube Data API v3 讀留言、回留言都有。網站本來就在用 Google 登入，加一個授權範圍就好，不用另外申請開發者身分。免費配額一天 10,000 單位，以你的留言量用不完。",
  },
  {
    name: "Facebook 粉專",
    handle: "wei.kai.dream.home・837 追蹤",
    icon: "users",
    tone: "warn",
    status: "要先過審核",
    detail:
      "Graph API 讀留言、回留言都有，但要先開 Meta 開發者帳號、做商家驗證，再送權限審核。審核時間不在我們手上（通常一到兩週），要準備用途說明和操作錄影。",
  },
  {
    name: "Instagram",
    handle: "swujnuty0325・255 追蹤",
    icon: "camera",
    tone: "warn",
    status: "要先過審核",
    detail:
      "跟 Facebook 同一套 Meta 審核，一次過就兩個都通。前提是這個帳號要切成專業帳號並連到上面那個粉專 —— 目前是不是專業帳號還沒確認。",
  },
  {
    name: "Threads",
    handle: "帳號本尊未確認",
    icon: "threads",
    tone: "warn",
    status: "要先過審核",
    detail:
      "Threads 官方 API 可以讀回覆、也可以回覆，一樣走 Meta 審核。另外這個帳號有出入：FB 和 YouTube 上寫 @wei_kai0605，IG 簡介卻寫 @swujnuty0605，接之前要先確認哪個是本尊。",
  },
  {
    name: "TikTok",
    handle: "@show_787865・978 追蹤",
    icon: "video",
    tone: "danger",
    status: "接不了",
    detail:
      "TikTok 沒有開放給一般開發者讀留言或回留言的 API（只有廣告主用的 Business API 有，要綁商業帳號並通過申請）。這一個現階段只能繼續用手機 App 回，不是程式做不到，是對方沒開。",
  },
];

export default async function InboxPage() {
  if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) {
    return <AdminGateNotice kind="no_provider" />;
  }
  if (adminEmails().length === 0) return <AdminGateNotice kind="no_whitelist" />;
  const { email } = await getAdminCheckArgs();
  if (!email) redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent("/admin/inbox")}`);
  if (!(await isCurrentUserAdmin())) return <AdminGateNotice kind="not_allowed" email={email} />;

  return (
    <main className={styles.page} style={{ background: CIS.bg, color: CIS.text, fontFamily: CIS.font }}>
      <div className={styles.shell}>
        <h1 className={styles.title}>
          <Icon name="chat" size={25} />
          留言收件匣
        </h1>
        <p className={styles.subtitle} style={{ color: CIS.textMute }}>
          把各平台的客人留言收到這一頁，直接在這裡回。
        </p>

        <div
          className={styles.notice}
          style={{ background: "rgba(148,163,184,.08)", borderColor: CIS.cardBorder, color: CIS.textSub }}
        >
          <b>還沒接線。</b>下面是每個平台目前的可行性。
          有兩個平台卡的不是程式，是對方的審核與政策 —— 所以要先決定<b>先接哪一個</b>，不是一次全上。
        </div>

        <div className={styles.sectionTitle} style={{ color: CIS.textMute }}>
          平台可行性
        </div>

        <div className={styles.grid}>
          {PLATFORMS.map((p) => {
            const chip = CHIP[p.tone];
            return (
              <div
                key={p.name}
                className={styles.card}
                style={{ background: CIS.card, borderColor: CIS.cardBorder }}
              >
                <div className={styles.cardHead}>
                  <Icon name={p.icon} size={19} color={CIS.textSub} />
                  <div className={styles.cardName}>{p.name}</div>
                  <span
                    className={styles.chip}
                    style={{ background: chip.bg, borderColor: chip.border, color: chip.color }}
                  >
                    {p.status}
                  </span>
                </div>
                <div className={styles.handle} style={{ color: CIS.textMute }}>
                  {p.handle}
                </div>
                <p className={styles.detail} style={{ color: CIS.textSub }}>
                  {p.detail}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}

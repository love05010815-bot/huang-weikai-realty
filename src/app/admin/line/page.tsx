/**
 * /admin/line —— LINE AI 客服機器人：看客戶問了什麼、需要時把客戶接手過來
 *
 * 這一頁能做兩件事：
 *   1. 看每個客戶跟機器人的完整對話（客戶問什麼＝客戶要什麼，這是最有價值的資料）
 *   2. 「我接手」—— 按下去機器人就對那個客戶閉嘴，改由你本人在 LINE 回
 *
 * 上面那排燈號是機器人的體檢報告。三顆全綠它才會真的回話，
 * 缺一顆客戶就只會收到「稍後由瑋凱回覆」的保底訊息。
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { adminEmails } from "@/auth";
import { getAdminCheckArgs, isCurrentUserAdmin } from "@/lib/admin-check";
import { CIS, CHIP, type ChipTone } from "@/app/admin/_components/cis";
import { Icon } from "@/app/admin/_ui/icons";
import AdminGateNotice from "@/app/admin/appointments/AdminGateNotice";
import { BOT_ENABLED } from "@/config/line-bot";
import { getBotStats, getConversation, listBotUsers } from "@/lib/line-bot/store";
import { toggleBotMuted } from "@/lib/actions/line-bot";
import styles from "./line.module.css";

export const dynamic = "force-dynamic";

const TZ = "Asia/Taipei";

function fmtTime(d: Date | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: TZ,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** 清單上的預覽字：太長會把版面撐爛，切短並把換行壓成空白。 */
function preview(text: string | null, max = 42): string {
  if (!text) return "（還沒有訊息）";
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

type Health = { label: string; tone: ChipTone; status: string; detail: string };

export default async function AdminLinePage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string }>;
}) {
  // 權限：跟其他後台頁一致，四道關卡
  if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) {
    return <AdminGateNotice kind="no_provider" />;
  }
  if (adminEmails().length === 0) return <AdminGateNotice kind="no_whitelist" />;
  const { email } = await getAdminCheckArgs();
  if (!email) redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent("/admin/line")}`);
  if (!(await isCurrentUserAdmin())) return <AdminGateNotice kind="not_allowed" email={email} />;

  const { u: selectedId } = await searchParams;

  // 資料庫連不上時不要讓整頁掛掉 —— 後台開不起來比看不到對話更糟
  let users: Awaited<ReturnType<typeof listBotUsers>> = [];
  let stats = { users: 0, messagesToday: 0 };
  let dbError: string | null = null;
  try {
    [users, stats] = await Promise.all([listBotUsers(100), getBotStats()]);
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }

  const selected = selectedId ? users.find((x) => x.lineUserId === selectedId) : undefined;
  const conversation = selected ? await getConversation(selected.lineUserId).catch(() => []) : [];

  const hasLineKeys = Boolean(
    process.env.LINE_BOT_CHANNEL_SECRET && process.env.LINE_BOT_ACCESS_TOKEN,
  );
  const hasAiKey = Boolean(process.env.ANTHROPIC_API_KEY);

  const health: Health[] = [
    {
      label: "LINE 金鑰",
      tone: hasLineKeys ? "success" : "danger",
      status: hasLineKeys ? "已設定" : "缺金鑰",
      detail: hasLineKeys
        ? "Channel secret 與 access token 都讀得到"
        : "少了就完全收不到、也回不了訊息",
    },
    {
      label: "AI 金鑰",
      tone: hasAiKey ? "success" : "warn",
      status: hasAiKey ? "已設定" : "未設定",
      detail: hasAiKey
        ? "客戶問問題會由 Claude 回答"
        : "機器人只記錄不回話，讓 LINE 內建的自動回應照常接客戶",
    },
    {
      label: "總開關",
      tone: BOT_ENABLED ? "success" : "neutral",
      status: BOT_ENABLED ? "開啟" : "已關閉",
      detail: BOT_ENABLED
        ? "機器人會自動回覆"
        : "在 src/config/line-bot.ts 把 BOT_ENABLED 改回 true 才會回話",
    },
  ];

  const allGreen = hasLineKeys && hasAiKey && BOT_ENABLED;

  return (
    <main
      className={styles.page}
      style={{ background: CIS.bg, color: CIS.text, fontFamily: CIS.font }}
    >
      <div className={styles.shell}>
        <h1 className={styles.title}>
          <Icon name="mobile" size={25} />
          LINE 客服機器人
        </h1>
        <p className={styles.subtitle} style={{ color: CIS.textMute }}>
          客戶私訊 @a8865 的對話都在這裡。想自己回的時候按「我接手」，機器人就會閉嘴。
        </p>

        {/* 體檢燈號 */}
        <div className={styles.healthRow}>
          {health.map((h) => {
            const chip = CHIP[h.tone];
            return (
              <div
                key={h.label}
                className={styles.healthCard}
                style={{ background: CIS.card, borderColor: CIS.cardBorder }}
              >
                <div className={styles.healthHead}>
                  <span className={styles.healthLabel} style={{ color: CIS.textSub }}>
                    {h.label}
                  </span>
                  <span
                    className={styles.chip}
                    style={{ background: chip.bg, color: chip.color, borderColor: chip.border }}
                  >
                    {h.status}
                  </span>
                </div>
                <p className={styles.healthDetail} style={{ color: CIS.textMute }}>
                  {h.detail}
                </p>
              </div>
            );
          })}
        </div>

        {!allGreen && (
          <div
            className={styles.notice}
            style={{
              background: "rgba(245,158,11,.08)",
              borderColor: "rgba(245,158,11,.35)",
              color: CIS.textSub,
            }}
          >
            <b>機器人還沒完全上線。</b>
            {!hasAiKey && (
              <>
                {" "}
                缺 <code>ANTHROPIC_API_KEY</code> —— 到 console.anthropic.com 申請並
                <b>先儲值</b>，設進 Vercel 後要<b>重新部署</b>才會生效（環境變數不會自己套用到已部署的版本）。
              </>
            )}
            {!hasLineKeys && (
              <>
                {" "}
                缺 LINE 金鑰 —— <code>LINE_BOT_CHANNEL_SECRET</code> 與{" "}
                <code>LINE_BOT_ACCESS_TOKEN</code> 兩個都要設。
              </>
            )}
          </div>
        )}

        {dbError && (
          <div
            className={styles.notice}
            style={{
              background: "rgba(244,63,94,.08)",
              borderColor: "rgba(244,63,94,.35)",
              color: CIS.textSub,
            }}
          >
            <b>讀不到對話記錄。</b>資料庫連線出問題：{dbError}
          </div>
        )}

        {/* 小計 */}
        <div className={styles.statRow}>
          <div className={styles.stat} style={{ background: CIS.card, borderColor: CIS.cardBorder }}>
            <div className={styles.statNum}>{stats.users}</div>
            <div className={styles.statLabel} style={{ color: CIS.textMute }}>
              聊過的客戶
            </div>
          </div>
          <div className={styles.stat} style={{ background: CIS.card, borderColor: CIS.cardBorder }}>
            <div className={styles.statNum}>{stats.messagesToday}</div>
            <div className={styles.statLabel} style={{ color: CIS.textMute }}>
              今天的訊息
            </div>
          </div>
          <div className={styles.stat} style={{ background: CIS.card, borderColor: CIS.cardBorder }}>
            <div className={styles.statNum}>{users.filter((x) => x.muted).length}</div>
            <div className={styles.statLabel} style={{ color: CIS.textMute }}>
              你接手中
            </div>
          </div>
        </div>

        {users.length === 0 && !dbError ? (
          <div
            className={styles.empty}
            style={{ background: CIS.card, borderColor: CIS.cardBorder, color: CIS.textSub }}
          >
            <div className={styles.emptyTitle}>還沒有人跟機器人說過話</div>
            <p style={{ color: CIS.textMute, margin: "10px 0 0", lineHeight: 1.8 }}>
              如果你已經設好金鑰卻還是空的，最可能是這兩件事沒做：
              <br />
              1. LINE Developers Console 的 <b>Webhook 網址</b>還沒填成{" "}
              <code>https://weikaihouse.com/api/line/webhook</code>，或沒打開「Use webhook」
              <br />
              2. LINE 官方帳號後台的<b>「自動回應訊息」還開著</b> —— 它會搶在機器人前面把訊息吃掉
              <br />
              <br />
              兩件都做完後，自己用手機傳一則訊息給 @a8865，這裡就會出現。
            </p>
          </div>
        ) : (
          <div className={styles.split}>
            {/* 左：客戶清單 */}
            <div className={styles.listPane}>
              <div className={styles.sectionTitle} style={{ color: CIS.textMute }}>
                客戶（{users.length}）
              </div>
              <div className={styles.list}>
                {users.map((x) => {
                  const active = x.lineUserId === selectedId;
                  return (
                    <Link
                      key={x.lineUserId}
                      href={`/admin/line?u=${encodeURIComponent(x.lineUserId)}`}
                      className={styles.listItem}
                      style={{
                        background: active ? CIS.cardHover : CIS.card,
                        borderColor: active ? CIS.blue : CIS.cardBorder,
                      }}
                    >
                      <div className={styles.listTop}>
                        <span className={styles.listName}>
                          {x.displayName || "（未取得名稱）"}
                        </span>
                        <span className={styles.listTime} style={{ color: CIS.textMute }}>
                          {fmtTime(x.lastMessageAt ?? x.lastSeenAt)}
                        </span>
                      </div>
                      <div className={styles.listPreview} style={{ color: CIS.textMute }}>
                        {preview(x.lastMessage)}
                      </div>
                      {x.muted && (
                        <span
                          className={styles.chip}
                          style={{
                            background: CHIP.warn.bg,
                            color: CHIP.warn.color,
                            borderColor: CHIP.warn.border,
                            marginTop: 6,
                          }}
                        >
                          你接手中
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* 右：對話 */}
            <div className={styles.chatPane}>
              {!selected ? (
                <div
                  className={styles.empty}
                  style={{ background: CIS.card, borderColor: CIS.cardBorder, color: CIS.textMute }}
                >
                  左邊點一位客戶，看你們聊了什麼。
                </div>
              ) : (
                <div
                  className={styles.chatBox}
                  style={{ background: CIS.card, borderColor: CIS.cardBorder }}
                >
                  <div className={styles.chatHead} style={{ borderColor: CIS.divider }}>
                    <div>
                      <div className={styles.chatName}>
                        {selected.displayName || "（未取得名稱）"}
                      </div>
                      <div className={styles.chatMeta} style={{ color: CIS.textMute }}>
                        共 {selected.messageCount} 則・最後出現 {fmtTime(selected.lastSeenAt)}
                      </div>
                    </div>
                    <form action={toggleBotMuted}>
                      <input type="hidden" name="lineUserId" value={selected.lineUserId} />
                      <input type="hidden" name="next" value={selected.muted ? "0" : "1"} />
                      <button
                        type="submit"
                        className={styles.btn}
                        style={
                          selected.muted
                            ? { background: "transparent", color: CIS.textSub, borderColor: CIS.cardBorder }
                            : { background: CIS.blueDeep, color: "#fff", borderColor: CIS.blueDeep }
                        }
                      >
                        {selected.muted ? "放回給機器人" : "我接手"}
                      </button>
                    </form>
                  </div>

                  {selected.muted && (
                    <div className={styles.mutedBar} style={{ color: CHIP.warn.color }}>
                      機器人對這位客戶已停止回覆，請自己在 LINE 回。他說的話還是會記錄在這裡。
                    </div>
                  )}

                  <div className={styles.chatBody}>
                    {conversation.length === 0 ? (
                      <p style={{ color: CIS.textMute }}>這位客戶還沒有訊息記錄。</p>
                    ) : (
                      conversation.map((m, i) => (
                        <div
                          key={i}
                          className={m.role === "user" ? styles.turnUser : styles.turnBot}
                        >
                          <div
                            className={styles.bubble}
                            style={
                              m.role === "user"
                                ? { background: "rgba(255,255,255,.07)", color: CIS.text }
                                : { background: "rgba(238,130,138,.14)", color: CIS.text }
                            }
                          >
                            {m.content}
                          </div>
                          <div className={styles.turnTime} style={{ color: CIS.textMute }}>
                            {m.role === "user" ? "客戶" : "機器人"}・{fmtTime(m.createdAt)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

/**
 * 後台被擋下來時顯示的說明頁。
 *
 * 分成兩種：白名單沒設（設定沒做完）、登入的帳號不在白名單（換帳號）。
 * 這頁只講「怎麼解」，不吐任何預約資料。
 */
import { CIS } from "@/app/admin/_components/cis";

type Props =
  | { kind: "no_provider" }
  | { kind: "no_whitelist" }
  | { kind: "not_allowed"; email: string };

const TITLES: Record<Props["kind"], string> = {
  no_provider: "後台登入還沒設定完成",
  no_whitelist: "後台還沒開放",
  not_allowed: "這個帳號沒有後台權限",
};

export default function AdminGateNotice(props: Props) {
  return (
    <main
      style={{
        minHeight: "100dvh",
        background: CIS.bg,
        color: CIS.text,
        fontFamily: CIS.font,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 520,
          width: "100%",
          background: CIS.card,
          border: `1px solid ${CIS.cardBorder}`,
          borderRadius: CIS.radius,
          padding: 28,
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 12 }}>🔒</div>
        <h1 style={{ fontSize: 19, fontWeight: 700, margin: "0 0 12px" }}>{TITLES[props.kind]}</h1>

        {props.kind === "no_provider" && (
          <p style={{ fontSize: 14, lineHeight: 1.75, color: CIS.textSub, margin: 0 }}>
            還沒填 Google 登入憑證，所以沒有任何登入方式可用。
            <br />
            請在部署環境加上 <code style={code}>AUTH_GOOGLE_ID</code> 與{" "}
            <code style={code}>AUTH_GOOGLE_SECRET</code>（到 Google Cloud Console 建 OAuth 用戶端取得），重新部署後即可登入。
          </p>
        )}

        {props.kind === "no_whitelist" && (
          <p style={{ fontSize: 14, lineHeight: 1.75, color: CIS.textSub, margin: 0 }}>
            系統還沒設定管理員白名單，所以誰都進不來（這是刻意的，忘了設定的後果應該是「進不去」而不是「全世界都進得去」）。
            <br />
            請在部署環境加上 <code style={code}>ADMIN_EMAILS</code>，填你要用來登入的 Google 信箱，多組用逗號分隔。
          </p>
        )}

        {props.kind === "not_allowed" && (
          <p style={{ fontSize: 14, lineHeight: 1.75, color: CIS.textSub, margin: 0 }}>
            你目前登入的是 <strong style={{ color: CIS.text }}>{props.email}</strong>，
            這個信箱不在 <code style={code}>ADMIN_EMAILS</code> 白名單裡。
            <br />
            請改用白名單裡的 Google 帳號登入，或把這個信箱加進白名單。
          </p>
        )}

        <div style={{ marginTop: 22, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {props.kind === "not_allowed" && (
            <a href="/api/auth/signout?callbackUrl=%2F" style={btn}>
              登出並換帳號
            </a>
          )}
          <a
            href="/"
            style={{
              ...btn,
              background: props.kind === "not_allowed" ? "transparent" : CIS.blueDeep,
              color: props.kind === "not_allowed" ? CIS.textMute : "#fff",
              border: props.kind === "not_allowed" ? `1px solid ${CIS.cardBorder}` : "none",
            }}
          >
            回官網首頁
          </a>
        </div>
      </div>
    </main>
  );
}

const code: React.CSSProperties = {
  background: "rgba(255,255,255,0.07)",
  padding: "2px 6px",
  borderRadius: 5,
  fontSize: 13,
};

const btn: React.CSSProperties = {
  display: "inline-block",
  background: CIS.blueDeep,
  color: "#fff",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 600,
  padding: "10px 18px",
  borderRadius: CIS.radiusSm,
};

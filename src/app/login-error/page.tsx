/**
 * /login-error —— NextAuth 登入失敗時的說明頁（取代內建的英文「Access Denied」）
 *
 * 2026-10-12 他在手機用兩個 Google 帳號登入後台都被擋、看到英文的 Access Denied 不知道是什麼意思。
 * 其實是「Google 登入成功，但這個帳號不在後台白名單」。這頁用中文講清楚是哪一種、該怎麼辦。
 *
 * 由 auth.ts 的 `pages.error` 指過來，NextAuth 會帶 `?error=AccessDenied|Configuration|Verification|…`。
 * 白名單信箱只露前三個字（登入得了 Google 的人才看得到這頁，但還是不整個印出來）。
 */
import type { Metadata } from "next";
import { adminEmails } from "@/auth";
import { CIS } from "@/app/admin/_components/cis";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "後台登入失敗",
  robots: { index: false, follow: false },
};

function mask(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return "（未設定）";
  return `${user.slice(0, 3)}…@${domain}`;
}

export default async function LoginErrorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  const error = raw || "Default";
  const hints = adminEmails().map(mask);

  const denied = error === "AccessDenied";

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
        padding: 20,
      }}
    >
      <div
        style={{
          maxWidth: 480,
          width: "100%",
          background: CIS.card,
          border: `1px solid ${CIS.cardBorder}`,
          borderRadius: CIS.radius,
          padding: 24,
        }}
      >
        <div style={{ fontSize: 30, marginBottom: 10 }}>🔒</div>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 10px" }}>
          {denied ? "這個 Google 帳號沒有後台權限" : "登入沒有成功"}
        </h1>

        {denied ? (
          <p style={{ fontSize: 14.5, lineHeight: 1.8, color: CIS.textSub, margin: "0 0 16px" }}>
            Google 登入本身是成功的，但你剛剛選的帳號不在後台的白名單裡。
            後台只認下面這個信箱，請按下面的按鈕、在選帳號的畫面換成它：
          </p>
        ) : (
          <p style={{ fontSize: 14.5, lineHeight: 1.8, color: CIS.textSub, margin: "0 0 16px" }}>
            Google 那邊回了一個錯誤（{error}）。通常再試一次就好；一直不行的話，截圖這個畫面傳給我。
          </p>
        )}

        {denied && hints.length > 0 && (
          <ul style={{ margin: "0 0 16px", paddingLeft: 20, fontSize: 15, fontWeight: 700, lineHeight: 1.8 }}>
            {hints.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        )}

        <a
          href="/api/auth/signin?callbackUrl=%2Fadmin"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxSizing: "border-box",
            width: "100%",
            minHeight: 48,
            padding: "12px 16px",
            borderRadius: 999,
            background: "#e00000",
            border: "1px solid #e00000",
            color: "#fff",
            fontSize: 16,
            fontWeight: 800,
            textDecoration: "none",
          }}
        >
          {denied ? "換個帳號重新登入" : "再試一次"}
        </a>

        {denied && (
          <p style={{ fontSize: 13, lineHeight: 1.7, color: CIS.textMute, margin: "14px 0 0" }}>
            手機上如果選帳號的畫面沒有那個信箱，先在手機的 Google 設定裡把它加進來，或在登入畫面按「使用其他帳戶」。
            想讓別的信箱也能進後台的話，把那個信箱告訴我，我加進白名單。
          </p>
        )}
      </div>
    </main>
  );
}

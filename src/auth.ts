/**
 * 後台登入 —— Google 帳號登入，白名單制。
 *
 * 只有 `ADMIN_EMAILS` 裡列出的信箱能進 `/admin/appointments`。
 * 前台名片與預約表單不需要登入，這裡純粹是後台的門。
 *
 * 沒設定 `AUTH_*` 也不會壞：前台照常運作，只是後台進不去。
 */
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/**
 * 允許進後台的信箱（.env 用逗號分隔多組）。
 *
 * 2026-10-12 他自己在 Vercel 改 ADMIN_EMAILS 時打成「a@gmail.com、a」（頓號＋多一截），
 * 原本只認半形逗號，整串被當成一個「信箱」、他登入照樣被擋。
 * 現在：逗號／全形逗號／頓號／分號／空白／換行都當分隔，而且只收含 @ 的那幾段——
 * 手打進去的雜訊（空格、多打的一截）不會害整個白名單失效。
 */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || process.env.APPOINTMENT_ADMIN_EMAIL || "")
    .split(/[,，、;；\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes("@"));
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID || "",
      clientSecret: process.env.AUTH_GOOGLE_SECRET || "",
    }),
  ],
  callbacks: {
    /**
     * 🔴 白名單擋在登入這一關，不是等進了後台才擋 ——
     *    不在名單裡的人連 session 都拿不到。
     */
    async signIn({ user }) {
      const list = adminEmails();
      if (list.length === 0) return false; // 沒設白名單 = 誰都不准進，比誰都能進安全
      return list.includes((user.email || "").toLowerCase());
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = String(token.sub || "");
      }
      return session;
    },
  },
  // 登入失敗（帳號不在白名單等）改導到中文說明頁；內建的英文 Access Denied 他看不懂。
  // 這是獨立的自訂路由（src/app/login-error），不是 NextAuth 自己的路徑，不會轉址迴圈。
  pages: { error: "/login-error" },
  // ⚠️ 不要設 pages.signIn。那個欄位是用來指向「自訂登入頁」的；
  //    填 NextAuth 自己的內建路由 /api/auth/signin 會讓它一直轉址到自己，
  //    瀏覽器直接噴 ERR_TOO_MANY_REDIRECTS。留空就是用內建登入頁。
});

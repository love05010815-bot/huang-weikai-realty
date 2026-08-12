/**
 * NextAuth 的路由掛載點。
 *
 * src/auth.ts 只是「設定」，沒有這支檔案的話 /api/auth/signin 會 404，
 * 就算 AUTH_* 全填好也登不進後台。
 */
import { handlers } from "@/auth";

export const { GET, POST } = handlers;

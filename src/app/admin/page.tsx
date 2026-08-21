/**
 * /admin —— 直接轉到預約營運。
 *
 * 在這之前 /admin 是 404，你打網址少打後面那段就會以為後台掛了。
 */
import { redirect } from "next/navigation";

export default function AdminIndexPage() {
  redirect("/admin/appointments");
}

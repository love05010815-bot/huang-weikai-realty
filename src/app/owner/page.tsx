/**
 * /owner —— 「我是屋主」分流頁：房地合一稅試算、我的房子行情多少 兩顆按鈕。
 * 內容在 src/config/roles.ts、畫面在 app/_ui/RolePage.tsx（跟 /buyer 共用），這個檔只是接起來。
 */
import { ROLES } from "@/config/roles";
import RolePage, { roleMetadata } from "@/app/_ui/RolePage";

export const metadata = roleMetadata(ROLES.owner);

export default function OwnerPage() {
  return <RolePage role={ROLES.owner} />;
}

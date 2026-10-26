/**
 * /buyer —— 「我是買方」分流頁：房貸月付金試算、新青安 3.0 資格檢測 兩顆按鈕。
 * 內容在 src/config/roles.ts、畫面在 app/_ui/RolePage.tsx（跟 /owner 共用），這個檔只是接起來。
 */
import { ROLES } from "@/config/roles";
import RolePage, { roleMetadata } from "@/app/_ui/RolePage";

export const metadata = roleMetadata(ROLES.buyer);

export default function BuyerPage() {
  return <RolePage role={ROLES.buyer} />;
}

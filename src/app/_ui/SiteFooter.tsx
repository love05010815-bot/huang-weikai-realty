/**
 * 共用頁尾：三行聯絡資訊＋© ＋最底下一行經紀業揭露。
 *
 * 字跟首頁頁尾（page.tsx 的 <footer>，樣式在 home.module.css 的 .footer）完全一樣，
 * 三個揭露的值都讀 owner.ts。首頁那個沒改成用這個元件 —— 它底下還掛著人氣計數器，
 * 而且首頁的 CSS 分區是別的視窗在管；改首頁頁尾請兩邊一起改。
 *
 * 2026-09-08 起用在單一物件頁（/listings/<slug>）。/about、/listings、/videos、/tax
 * 本來就沒有頁尾，要補的話直接 <SiteFooter /> 放在 </main> 後面即可。
 */
import { OWNER } from "@/config/owner";
import styles from "./SiteFooter.module.css";

export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <p>
        <strong>{OWNER.name}</strong>｜{OWNER.title}
      </p>
      <p>電話 {OWNER.phone}　LINE @a8865</p>
      <p>地址 {OWNER.addressStreet}</p>
      <p>&copy; {new Date().getFullYear()} Huang Wei-Kai Realty. All rights reserved.</p>
      <p className={styles.legal}>
        {OWNER.brokerage}　不動產經紀人：{OWNER.brokerName}　{OWNER.brokerLicense}
      </p>
    </footer>
  );
}

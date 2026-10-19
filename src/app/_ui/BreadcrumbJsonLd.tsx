/**
 * 麵包屑結構化資料（BreadcrumbList JSON-LD）—— 2026-10-19 第一包補的。
 *
 * 只給 Google 看，畫面上不畫任何東西：搜尋結果標題底下那行原本是「weikaihouse.com › buy」，
 * 有這個之後 Google 可以改顯示成「首頁 › 買房流程與費用」（顯不顯示由 Google 決定，不保證）。
 *
 * 用法：放在子頁最外層的 <div className={styles.page}> 裡面、header 前面：
 *   <BreadcrumbJsonLd items={[{ name: "買房流程與費用", href: "/buy" }]} />
 * 「首頁」那一層會自動補在最前面，不用自己寫。
 * ⚠️ name 要用頁面上看得到的字（h1 或導覽列的標籤）—— Google 的規矩是結構化資料不能寫畫面上沒有的東西。
 *
 * 首頁、/map、單戶物件頁、文章頁、報告書頁各有自己整組的 JSON-LD（Person／ItemList／Article），這支不碰它們。
 */
import { SITE_URL } from "@/config/owner";

export default function BreadcrumbJsonLd({ items }: { items: { name: string; href: string }[] }) {
  const trail = [{ name: "首頁", href: "/" }, ...items];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${SITE_URL}${it.href}`,
    })),
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />;
}

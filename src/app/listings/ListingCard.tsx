/**
 * 精選好案的一張卡 —— 首頁（variant="home"）與 /listings（variant="list"）共用同一份，改一處兩邊都變。
 *
 * 2026-10-20 系統擁有者兩條拍板：
 *   ① 卡片上不再列 ✨ 賣點 —— 單戶頁已經有官網抓來的「物件特色」，卡片只留照片、區域、標題、售價
 *   ② 「不要設定一定要點擊到圖片才會跳出物件資訊，點擊到整個方框都可以」—— 整張卡都是進單戶頁的入口
 *
 * 怎麼做到「整張都能點」又不寫出無效的 HTML（按鈕包在 <a> 裡是無效的，點擊行為也會打架）：
 *   - 照片區：相簿每一格本身就是連結（PhotoCarousel 的 href），左右滑、箭頭、圓點照常
 *   - 文字區：.bodyLink 是一顆連結，用 ::after 鋪滿整個 .body（listings.module.css），
 *     所以標題、售價、周圍空白點到都算；「影片賞析」「預約看屋」在 .cardActions 裡 z-index 墊高，點它們還是它們自己
 *   - ❤️ 收藏、相簿箭頭與圓點是獨立的按鈕，疊在照片上層
 *
 * data-listing-* 是給後台點擊統計用的（見 ListingClickTracker.tsx）；進單戶頁的那顆刻意不掛 ——
 * 單戶頁自己會記「被打開」，這裡再記一次就重複。
 */
import Link from "next/link";
import type { Listing } from "@/config/listings";
import { formatWan } from "@/lib/houseol-price";
import lst from "./listings.module.css";
import PhotoCarousel from "./PhotoCarousel";
import FavButton from "@/app/_ui/favorites/FavButton";
import fav from "@/app/_ui/favorites/FavButton.module.css";
import ShareButton from "@/app/_ui/ShareButton";
import share from "@/app/_ui/ShareButton.module.css";

type Props = {
  item: Listing;
  /** 首屏看得到的卡設 true，封面圖立刻載；其餘 lazy */
  eager: boolean;
  /** home：首頁那三張（h3、沒有動作按鈕）；list：/listings 總覽（h2、有影片賞析與預約看屋，卡片 id＝slug 可直接 #跳） */
  variant: "home" | "list";
};

export default function ListingCard({ item, eager, variant }: Props) {
  const href = `/listings/${item.slug}`;
  const Heading = variant === "home" ? "h3" : "h2";
  return (
    <article id={variant === "list" ? item.slug : undefined} className={lst.card}>
      {/* ❤️ 愛心疊在照片左上角（右上角是相簿的「1/3」） */}
      <div className={fav.photoWrap}>
        <PhotoCarousel photos={item.photos} alt={`${item.area}－${item.title}`} eager={eager} href={href} />
        <FavButton variant="icon" className={fav.onPhoto} kind="listing" id={item.slug} title={item.title} sub={item.area} />
        {/* 📤 分享疊在照片右上角（2026-10-20 他指定「以圖示呈現」）；相簿的「1/8」往左讓位（listings.module.css 的 .counter） */}
        <ShareButton
          className={share.onPhotoRight}
          path={href}
          title={item.title}
          text={`${item.area}｜${item.title}${item.price != null ? `｜售價 ${formatWan(item.price)}` : ""}`}
          data-listing-slug={item.slug}
          data-listing-action="share"
        />
      </div>
      <div className={lst.body}>
        <Link href={href} className={lst.bodyLink}>
          <span className={lst.area}>{item.area}</span>
          <Heading className={lst.title}>{item.title}</Heading>
          {/* 🏷️ 售價：從「物件資訊」那條太平洋連結現抓（lib/houseol-price.ts），不是後台填的；抓不到這行整個不渲染 */}
          {item.price != null ? (
            <span className={lst.price}>
              售價 <b>{formatWan(item.price)}</b>
            </span>
          ) : null}
          <span className={lst.detailLink}>看這戶的完整資訊 →</span>
        </Link>
        {variant === "list" ? (
          <div className={lst.cardActions}>
            {/* 影片賞析（YouTube）是次要動作，後台留空就不出現；實心的「預約看屋」維持視覺重心 */}
            {item.video ? (
              <a
                className={lst.actionLink}
                href={item.video.href}
                target="_blank"
                rel="noopener noreferrer"
                data-listing-slug={item.slug}
                data-listing-action="video"
              >
                {item.video.label} ↗
              </a>
            ) : null}
            {/* 💰 房貸月付金不放卡片上了（2026-10-21 他圈掉）：單戶頁的規格表裡就有「房貸月付金」那一格 */}
            <Link className={lst.actionBtn} href="/card/booking" data-listing-slug={item.slug} data-listing-action="booking">
              預約看屋
            </Link>
          </div>
        ) : null}
      </div>
    </article>
  );
}

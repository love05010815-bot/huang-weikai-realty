/**
 * 單一物件頁的「畫面」。page.tsx 負責查資料與 metadata，這裡只負責渲染 ——
 * 拆開是為了能塞假資料看「已下架」長什麼樣。
 *
 * 2026-10-20 系統擁有者拍板改版：「精選好案裡面的物件，我不想要物件資訊導向外部網站。我想要直接
 * 點擊圖片就可以顯示這個物件的所有資訊，但你一樣是從太平洋房屋官網去抓取資訊」。
 * 所以這一頁現在是客戶看一戶的終點，不再有「物件資訊 ↗」那顆外連。版面：
 *
 *   ① 上半：左相簿（大圖＋縮圖＋燈箱）、右「摘要卡」（桌機黏在畫面上）——
 *      區域／社區標籤、標題、路名、售價（降過價會畫掉舊價）、四格一眼看、預約／LINE／影片、收藏、分享
 *   ② 瑋凱推薦理由：後台填的賣點（✨），這是他自己的話，排在官網資料前面
 *   ③ 物件資料：官網欄位分三組（基本資料／坪數明細／建物與管理），沒有的格不出現
 *   ④ 物件特色：官網特色欄拆成一條一條
 *   ⑤ 生活機能與位置：學校／公園／市場標籤 ＋ Google 地圖、該區實價登錄、建案地圖
 *   ⑥ 預約的收尾色帶；手機另有黏在底部的「售價＋LINE＋預約」列
 *
 * 官網讀不到（detail 為 null）時 ③④⑤ 整段不畫，頁面退回「標題＋賣點＋照片」，跟改版前一樣。
 *
 * status 決定兩種長相：
 *   active → 上面那套
 *   sold   → 「這戶已經下架了」的置中框（2026-09-08 系統擁有者拍板的用字），不放物件內容
 */
import Link from "next/link";
import { OWNER, SITE_URL, SOCIAL } from "@/config/owner";
import type { Listing } from "@/config/listings";
import { formatWan } from "@/lib/houseol-price";
import { resolvePhotoSrc } from "@/lib/photo-src";
import type { ListingDetail } from "@/lib/listing-detail";
import { detailFeatures, factGroups, keyStats, lifeChips, mapsUrl, priceDrop } from "@/lib/listing-facts";
import { stripCity } from "@/lib/prim-share";
import styles from "../../home.module.css";
import lst from "../listings.module.css";
import one from "./listing.module.css";
import SiteNav from "@/app/_ui/SiteNav";
import SocialLinks from "@/app/_ui/SocialLinks";
import SiteFooter from "@/app/_ui/SiteFooter";
import BreadcrumbJsonLd from "@/app/_ui/BreadcrumbJsonLd";
import DetailGallery from "./DetailGallery";
import ListingPageView from "./ListingPageView";
import FavButton from "@/app/_ui/favorites/FavButton";

/** 照片存的是 Blob 網址或 public/listings 底下的檔名；分享預覽（og:image）與 JSON-LD 一定要絕對網址 */
export function absolutePhoto(value: string): string {
  const src = resolvePhotoSrc(value);
  return /^https?:\/\//i.test(src) ? src : `${SITE_URL}${src}`;
}

type Props = {
  item: Listing;
  status: "active" | "sold";
  /** 太平洋官網那一筆（lib/listing-detail.ts）；讀不到就 null，頁面只顯示後台填的東西 */
  detail: ListingDetail | null;
};

export default function ListingView({ item, status, detail }: Props) {
  const sold = status === "sold";
  const shareUrl = `${SITE_URL}/listings/${item.slug}`;
  const displayName = `${item.area} ${item.title}`;
  const bookingHref = `/card/booking?listing=${encodeURIComponent(item.slug)}`;

  const d = detail?.detail ?? null;
  const share = detail?.share ?? null;
  // 後台自己傳的照片優先（他挑過、也存在我們自己的 Blob）；一張都沒傳才用官網的
  const photos = item.photos.length > 0 ? item.photos : (detail?.photos ?? []);
  // 售價跟卡片同一條規則（lib/listings.ts 補的）；卡片抓不到才退回官網欄位
  const price = item.price ?? d?.price ?? null;
  // 「已降價」只在官網現價跟卡片顯示的售價一致時才畫 —— 兩邊對不上就不要畫出矛盾的數字
  const dropRaw = d ? priceDrop(d) : null;
  const drop = dropRaw && price !== null && dropRaw.to === price ? dropRaw : null;
  const stats = d ? keyStats(d, share) : [];
  const groups = d ? factGroups(d, share) : [];
  const features = d ? detailFeatures(d) : [];
  const chips = d ? lifeChips(d) : [];
  const maps = d ? mapsUrl(d.lat, d.lng) : "";
  const district = d?.areaName.trim() ?? "";
  const road = d ? stripCity(d.addressRoad) : "";
  const community = d?.community.trim() ?? "";
  const showLife = chips.length > 0 || Boolean(maps) || Boolean(district);

  // Google 的「房地產物件」結構化資料。只給在售的；已下架那頁不該再被當成商品。
  const jsonLd = sold
    ? null
    : {
        "@context": "https://schema.org",
        "@type": "RealEstateListing",
        name: displayName,
        url: shareUrl,
        image: photos.map(absolutePhoto),
        description: item.points.join("；"),
        ...(price != null
          ? {
              offers: {
                "@type": "Offer",
                price: Math.round(price * 10000),
                priceCurrency: "TWD",
                availability: "https://schema.org/InStock",
                url: shareUrl,
              },
            }
          : {}),
        ...(d
          ? {
              about: {
                "@type": "Accommodation",
                name: item.title,
                ...(d.totalArea !== null ? { floorSize: { "@type": "QuantitativeValue", value: d.totalArea, unitText: "坪" } } : {}),
                ...(d.rooms !== null ? { numberOfRooms: d.rooms } : {}),
                ...(d.baths !== null ? { numberOfBathroomsTotal: d.baths } : {}),
                ...(road
                  ? {
                      address: {
                        "@type": "PostalAddress",
                        addressCountry: "TW",
                        addressRegion: "臺中市",
                        addressLocality: district,
                        streetAddress: road,
                      },
                    }
                  : {}),
                ...(d.lat !== null && d.lng !== null ? { geo: { "@type": "GeoCoordinates", latitude: d.lat, longitude: d.lng } } : {}),
              },
            }
          : {}),
        provider: {
          "@type": "RealEstateAgent",
          name: OWNER.name,
          telephone: `+886-${OWNER.phoneRaw.replace(/^0/, "")}`,
          url: SITE_URL,
        },
      };

  return (
    <div className={styles.page}>
      <BreadcrumbJsonLd
        items={[
          { name: "精選好案", href: "/listings" },
          { name: item.title, href: `/listings/${item.slug}` },
        ]}
      />
      <header className={styles.header}>
        <div className={styles.navWrap}>
          <Link href="/" className={styles.brand}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.brandLogo} src="/kaixing-mark.png" alt="凱心成家" width={40} height={40} />
            <span>
              凱心成家
              <small className={styles.brandSub}>{OWNER.company} 台中海線房仲</small>
            </span>
          </Link>
          <SiteNav variant="sub" />
          <div className={styles.navCta}>
            <Link className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`} href="/card/booking">
              線上預約
            </Link>
          </div>
        </div>
      </header>

      <SocialLinks variant="float" />

      <main>
        <section className={styles.section}>
          <div className={`${styles.container} ${one.wrap}`}>
            <nav className={one.crumbs} aria-label="所在位置">
              <Link href="/">首頁</Link>
              <span aria-hidden="true">›</span>
              <Link href="/listings">精選好案</Link>
              <span aria-hidden="true">›</span>
              <span>{item.area}</span>
            </nav>

            {sold ? (
              /* 下架後的頁面 —— 2026-09-08 系統擁有者拍板用「已下架，看看其他好案」，不能 404。
                 後台狀態只有 active／sold 兩種、分不出「成交」跟「暫時下架」，
                 所以這裡只說「已下架」，不寫「已成交」（暫時下架的對客戶要說「暫停銷售」）。 */
              <div className={one.soldBox}>
                <span className={styles.eyebrow}>OFF MARKET</span>
                <h1>這戶已經下架了</h1>
                <p>
                  {item.area}「{item.title}」目前不在銷售中。台中海線還有其他正在推的物件；
                  也歡迎直接告訴我您的需求，有合適的第一時間通知您。
                </p>
                <div className={one.soldActions}>
                  <Link className={`${styles.btn} ${styles.btnPrimary}`} href="/listings">
                    看看其他好案
                  </Link>
                  <Link className={one.btnAlt} href="/card/booking">
                    告訴我您的需求
                  </Link>
                </div>
              </div>
            ) : (
              <article className={one.detail}>
                {/* ① 相簿 ＋ 摘要卡 */}
                <div className={one.hero}>
                  <DetailGallery photos={photos} alt={`${item.area}－${item.title}`} />

                  <aside className={one.summary}>
                    <div className={one.tagRow}>
                      <span className={`${one.tag} ${one.tagArea}`}>{item.area}</span>
                      {community && !item.area.includes(community) ? <span className={`${one.tag} ${one.tagSoft}`}>{community}</span> : null}
                      {d?.kind.trim() ? <span className={`${one.tag} ${one.tagSoft}`}>{d.kind.trim()}</span> : null}
                    </div>
                    <h1 className={one.title}>{item.title}</h1>
                    {road ? <p className={one.road}>📍 {road}</p> : null}

                    {/* 售價：跟卡片同一條規則，抓不到就整塊不出現；降過價才有畫掉的舊價 */}
                    {price != null ? (
                      <div className={one.priceBox}>
                        <span className={one.priceLabel}>售價</span>
                        <span className={one.priceNum}>{formatWan(price)}</span>
                        {drop ? (
                          <>
                            <s className={one.priceWas}>{formatWan(drop.from)}</s>
                            <span className={one.priceDrop}>已降 {formatWan(drop.diff)}</span>
                          </>
                        ) : null}
                      </div>
                    ) : null}

                    {stats.length > 0 ? (
                      <ul className={one.stats}>
                        {stats.map((s) => (
                          <li key={s.label}>
                            <small>{s.label}</small>
                            <b>{s.value}</b>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    <div className={one.actions}>
                      {/* 帶 slug 進預約表單，表單會顯示「您詢問的物件」並寫進備註 */}
                      <Link className={lst.actionBtn} href={bookingHref} data-listing-slug={item.slug} data-listing-action="booking">
                        預約看這戶
                      </Link>
                      <a className={lst.actionLink} href={SOCIAL.line} target="_blank" rel="noopener noreferrer">
                        LINE 直接問
                      </a>
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
                    </div>

                    {/* ❤️ 收藏（存客戶瀏覽器，收藏頁在 /favorites）＋ 分享（手機系統分享面板／桌機複製網址） */}
                    <div className={one.favRow}>
                      <FavButton kind="listing" id={item.slug} title={item.title} sub={item.area} />
                      <ListingPageView slug={item.slug} shareUrl={shareUrl} title={displayName} listingTitle={item.title} area={item.area} />
                    </div>
                  </aside>
                </div>

                {/* ② 他自己的話 */}
                {item.points.length > 0 ? (
                  <section className={one.block} aria-labelledby="sec-points">
                    <h2 id="sec-points" className={one.blockTitle}>
                      {OWNER.alias}推薦理由
                    </h2>
                    <ul className={`${lst.points} ${one.pointsBig}`}>
                      {item.points.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {/* ③ 官網欄位 */}
                {groups.length > 0 ? (
                  <section className={one.block} aria-labelledby="sec-facts">
                    <h2 id="sec-facts" className={one.blockTitle}>
                      物件資料
                    </h2>
                    <div className={one.factGrid}>
                      {groups.map((g) => (
                        <div key={g.title} className={one.factGroup}>
                          <h3>{g.title}</h3>
                          <dl className={one.factList}>
                            {g.rows.map((r) => (
                              <div key={r.label}>
                                <dt>{r.label}</dt>
                                <dd>{r.value}</dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      ))}
                    </div>
                    <p className={one.source}>
                      資料來源：{OWNER.company}官網（物件編號 {detail?.saleId}）
                      {detail?.fromOfficial ? "，本頁最慢五分鐘同步一次" : "；官網暫時讀不到，以上為分享資料的摘要"}。
                      坪數與格局以不動產說明書及謄本為準。
                    </p>
                  </section>
                ) : null}

                {/* ④ 官網特色 */}
                {features.length > 0 ? (
                  <section className={one.block} aria-labelledby="sec-features">
                    <h2 id="sec-features" className={one.blockTitle}>
                      物件特色
                    </h2>
                    <ul className={one.features}>
                      {features.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {/* ⑤ 生活機能與位置 */}
                {showLife ? (
                  <section className={one.block} aria-labelledby="sec-life">
                    <h2 id="sec-life" className={one.blockTitle}>
                      生活機能與位置
                    </h2>
                    {chips.length > 0 ? (
                      <div className={one.chips}>
                        {chips.map((c) => (
                          <span key={c.label} className={one.chip}>
                            <small>{c.label}</small>
                            {c.value}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className={one.linkRow}>
                      {maps ? (
                        <a className={one.btnAlt} href={maps} target="_blank" rel="noopener noreferrer">
                          在 Google 地圖看位置 ↗
                        </a>
                      ) : null}
                      {district ? (
                        <Link className={one.btnAlt} href={`/lvr?area=${encodeURIComponent(district)}`}>
                          看{district}實價登錄
                        </Link>
                      ) : null}
                      <Link className={one.btnAlt} href="/map">
                        海線建案地圖
                      </Link>
                    </div>
                  </section>
                ) : null}

                {/* ⑥ 收尾 */}
                <section className={one.cta} aria-label="預約看屋">
                  <div>
                    <h2>想親自看這戶？</h2>
                    <p>
                      {OWNER.alias}親自帶看，坪數、格局、屋況現場一次看清楚；也可以先在 LINE 問問題。
                    </p>
                  </div>
                  <div className={one.ctaBtns}>
                    <Link className={one.btnWhite} href={bookingHref} data-listing-slug={item.slug} data-listing-action="booking">
                      預約看這戶
                    </Link>
                    <a className={one.btnGhost} href={SOCIAL.line} target="_blank" rel="noopener noreferrer">
                      LINE 直接問
                    </a>
                  </div>
                </section>
              </article>
            )}

            <p className={lst.note}>
              ⚠️ 物件資訊僅供初步參考。<strong>實際坪數、格局、屋況與產權，以現場勘查及不動產說明書所載為準</strong>。
              物件狀態隨時可能異動，成交後即下架。詳細條件與價格歡迎預約當面說明。
            </p>

            <Link href="/listings" className={lst.backLink}>
              ← 回精選好案
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />

      {/* 手機：黏在底部的售價＋兩顆按鈕。摘要卡在手機上會被捲走，這一列讓「預約」永遠在手邊 */}
      {!sold ? (
        <div className={one.stickyBar}>
          <div className={one.stickyPrice}>
            {price != null ? (
              <>
                <small>售價</small>
                <b>{formatWan(price)}</b>
              </>
            ) : (
              <b className={one.stickyTitle}>{item.title}</b>
            )}
          </div>
          <a className={one.stickyLine} href={SOCIAL.line} target="_blank" rel="noopener noreferrer" aria-label="LINE 直接問">
            LINE
          </a>
          <Link className={one.stickyBook} href={bookingHref} data-listing-slug={item.slug} data-listing-action="booking">
            預約看這戶
          </Link>
        </div>
      ) : null}

      {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} /> : null}
    </div>
  );
}

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
 *   ② 物件特色：官網特色欄拆成一條一條（2026-10-20 下午他拍板排在物件資料上面）
 *   ③ 物件資料：官網欄位分三組（基本資料／坪數明細／建物與管理），沒有的格不出現
 *   ④ 生活機能與位置：學校／公園／市場標籤 ＋ Google 地圖、該區實價登錄、建案地圖
 *   ⑤ 預約的收尾色帶；手機另有黏在底部的「售價＋LINE＋預約」列
 *
 * 🚫 後台填的 ✨ 賣點（item.points）**不再顯示在這一頁、也不在卡片上**（2026-10-20 下午他拍板：有官網的
 *    物件特色就夠了，「這整段所有物件都不要了」）。它們只剩搜尋描述／JSON-LD 的備援與 LINE 機器人在用。
 * 官網讀不到（detail 為 null）時 ②③④ 整段不畫，頁面只剩相簿＋摘要卡。
 *
 * status 決定兩種長相：
 *   active → 上面那套
 *   sold   → 「這戶已經下架了」的置中框（2026-09-08 系統擁有者拍板的用字），不放物件內容
 */
import Link from "next/link";
import { OWNER, SITE_URL, SOCIAL } from "@/config/owner";
import type { Listing } from "@/config/listings";
import { formatWan } from "@/lib/houseol-price";
import { QUICK_LOAN, quickLoanFromPrice } from "@/lib/loan";
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

/**
 * 這一頁被兩種物件共用（2026-10-20 下午起）：精選好案 `/listings/<slug>`（預設）與建案地圖的物件 `/map/listing/<id>`。
 * 兩種只差「網址、麵包屑、回哪裡、預約連結、能不能收藏」，用這組設定帶進來；版面與資料邏輯完全同一份。
 */
export type ListingViewMode = {
  /** 這一頁自己的路徑（分享網址、JSON-LD、麵包屑最後一層） */
  pageHref: string;
  /** 「首頁 › …」中間那幾層（最後一層是物件本身，這裡不用寫） */
  crumbs: { name: string; href: string }[];
  backHref: string;
  backLabel: string;
  /** 「預約看這戶」按去哪（精選好案帶 ?listing=<slug>，表單會顯示那戶；地圖物件表單認不得 id，就不帶） */
  bookingHref: string;
  /** 已下架那頁的主按鈕字 */
  soldCtaLabel: string;
  /** 精選好案才有 ❤️ 收藏與瀏覽足跡（map_listing 刻意不收，見 lib/favorites.ts） */
  collectible: boolean;
};

type Props = {
  item: Listing;
  status: "active" | "sold";
  /** 太平洋官網那一筆（lib/listing-detail.ts）；讀不到就 null，頁面只顯示後台填的東西 */
  detail: ListingDetail | null;
  /** 不給就是精選好案的那一套 */
  mode?: ListingViewMode;
};

export default function ListingView({ item, status, detail, mode }: Props) {
  const sold = status === "sold";
  const m: ListingViewMode = mode ?? {
    pageHref: `/listings/${item.slug}`,
    crumbs: [{ name: "精選好案", href: "/listings" }],
    backHref: "/listings",
    backLabel: "← 回精選好案",
    bookingHref: `/card/booking?listing=${encodeURIComponent(item.slug)}`,
    soldCtaLabel: "看看其他好案",
    collectible: true,
  };
  const shareUrl = `${SITE_URL}${m.pageHref}`;
  const displayName = `${item.area} ${item.title}`;
  const bookingHref = m.bookingHref;

  const d = detail?.detail ?? null;
  const share = detail?.share ?? null;
  // 後台自己傳的照片優先（他挑過、也存在我們自己的 Blob）；一張都沒傳才用官網的
  const photos = item.photos.length > 0 ? item.photos : (detail?.photos ?? []);
  // 售價跟卡片同一條規則（lib/listings.ts 補的）；卡片抓不到才退回官網欄位
  const price = item.price ?? d?.price ?? null;
  /** 🏦 房貸月付金（2026-10-21 他要的「做到物件表裡面」）：售價 × 預設成數，條件跟 /tax 的起始值同一份（lib/loan.ts 的 QUICK_LOAN） */
  const loan = price != null ? quickLoanFromPrice(price) : null;
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
        // 官網特色優先（頁面上看得到的字）；沒有官網資料才退回後台賣點
        description: (features.length > 0 ? features : item.points).join("；"),
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
      <BreadcrumbJsonLd items={[...m.crumbs, { name: item.title, href: m.pageHref }]} />
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
        {/* 2026-10-22 系統擁有者：社群藥丸搬到 logo 下方、固定不隨頁面捲動消失——
            header 本身就是 position:sticky，當第二排會一起固定，見 home.module.css 的說明。
            這支元件同時是 /listings/<slug>、/map/listing/<id>、/map/unit/<saleId> 三種單戶頁。 */}
        <div className={styles.headerSocial}>
          <SocialLinks variant="bar" align="start" compact className={styles.headerSocialBar} />
        </div>
      </header>

      {/* 桌機右側固定的社群直排（1220px 以上一直在，捲動時也看得到）。2026-10-22 這排
          一度被拿掉（header 第二排的藥丸已經「永遠看得到」，兩個一起多餘），同一天系統
          擁有者又說「改移到右側邊下方，隨著頁面滾動」要這個——所以加回來，跟 headerSocial
          用斷點分工：1220px 以上顯示這排、藏起 header 那顆 compact 藥丸；以下相反
          （見 home.module.css／Map.module.css 的 .headerSocial 那條 1220px 規則），
          兩個不會同時出現。⚠️ 一定要放在 <header> 外面——header 的 backdrop-filter
          會把 position:fixed 的子元素關在 header 裡（見 SiteNav.tsx 的說明）。 */}
      <SocialLinks variant="float" />

      <main>
        <section className={styles.section}>
          <div className={`${styles.container} ${one.wrap}`}>
            <nav className={one.crumbs} aria-label="所在位置">
              <Link href="/">首頁</Link>
              {m.crumbs.map((c) => (
                <span key={c.href} className={one.crumb}>
                  <span aria-hidden="true">›</span>
                  <Link href={c.href}>{c.name}</Link>
                </span>
              ))}
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
                  <Link className={`${styles.btn} ${styles.btnPrimary}`} href={m.backHref}>
                    {m.soldCtaLabel}
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

                    {stats.length > 0 || loan ? (
                      <ul className={one.stats}>
                        {stats.map((s) => (
                          <li key={s.label}>
                            <small>{s.label}</small>
                            <b>{s.value}</b>
                          </li>
                        ))}
                        {/* 🏦 房貸月付金：先用常見條件算一個數字給客人看；「換條件算」帶著售價進 /tax 的房貸月付金細調成數、利率、年限 */}
                        {loan && price != null ? (
                          <li className={one.loanCell}>
                            <small>
                              房貸月付金
                              <span className={one.loanTerms}>
                                貸 {QUICK_LOAN.ratio} 成・{QUICK_LOAN.years} 年・利率 {QUICK_LOAN.annualRate}%
                              </span>
                            </small>
                            <b>
                              約 {loan.monthly.toLocaleString("zh-TW")} 元<span className={one.loanUnit}>／月</span>
                            </b>
                            <span className={one.loanFoot}>
                              <span>
                                貸款 {loan.loanWan.toLocaleString("zh-TW")} 萬・自備款約 {loan.downWan.toLocaleString("zh-TW")} 萬
                              </span>
                              <Link
                                className={one.loanLink}
                                href={`/tax?price=${price}&title=${encodeURIComponent(item.title)}#loan`}
                                data-listing-slug={item.slug}
                                data-listing-action="loan"
                              >
                                換條件算 →
                              </Link>
                            </span>
                          </li>
                        ) : null}
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

                    {/* ❤️ 收藏（存客戶瀏覽器，收藏頁在 /favorites；只有精選好案）＋ 分享（手機系統分享面板／桌機複製網址） */}
                    <div className={one.favRow}>
                      {m.collectible ? <FavButton kind="listing" id={item.slug} title={item.title} sub={item.area} /> : null}
                      <ListingPageView
                        slug={item.slug}
                        shareUrl={shareUrl}
                        title={displayName}
                        listingTitle={item.title}
                        area={item.area}
                        trail={m.collectible}
                      />
                    </div>
                  </aside>
                </div>

                {/* ② 官網特色 —— 排在物件資料上面（2026-10-20 下午他指定的順序） */}
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

                {/* ④ 生活機能與位置 */}
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

                {/* ⑤ 收尾 */}
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

            <Link href={m.backHref} className={lst.backLink}>
              {m.backLabel}
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

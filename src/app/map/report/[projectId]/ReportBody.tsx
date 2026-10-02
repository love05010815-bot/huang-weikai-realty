/**
 * 社區銷售報告書的「版面」—— 前台頁與後台預覽共用這一支（所以不能有 server-only 的東西）。
 *
 * 段落照 2026-10-02 系統擁有者給的範本（另一家房仲的「社區銷售企劃書」）改：
 *   01 社區基本資料總覽（建案總表＋ChatGPT 合併，總表優先）
 *   02 區域市場定位
 *   03 四大地段價值（＋他實地整理的周邊機能，有才顯示）
 *   04 社區特色
 *   05 我在這個社區的在售物件（map_listing 的真資料，範本那頁的「本戶競爭力」換成這個）
 *   06 行情說明（不放數字，一顆按鈕連到 /lvr 實價登錄）
 *   07 周邊競品比較（對得上建案總表的帶行政區／屋齡／建商，點名字回地圖）
 *   08 買方輪廓與銷售策略
 *   資料來源＋免責＋經紀業揭露
 * 編號是算出來的：哪一段沒內容整段不出現、後面的號碼自動遞補，不會出現 01 → 03。
 *
 * ⚠️ 樣式只用 report.module.css，色票變數定義在 `.paper` 自己身上 —— 後台深色頁面裡預覽時
 *    一樣是白紙，不會吃到後台的顏色。
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { OWNER, SOCIAL } from "@/config/owner";
import { AREA_LABEL, filledAmenities, houseAge, type Project } from "@/data/port-projects";
import type { PublicMapListing } from "@/lib/map-listings";
import {
  REPORT_LABEL,
  competitorRows,
  lvrHrefFor,
  mergeBasics,
  type ReportData,
} from "@/lib/project-report";
import PhotoCarousel from "@/app/listings/PhotoCarousel";
import s from "./report.module.css";

type Props = {
  project: Project;
  data: ReportData;
  /** 我在這個建案的在售物件（map_listing，上架中的） */
  listings: PublicMapListing[];
  /** 落款，例：「2026 年 10 月」 */
  stamp: string;
  /** 後台預覽：連結一律開新分頁，免得把後台頁面蓋掉 */
  preview?: boolean;
};

/** 空值 → 「待確認」標籤 */
function Value({ value }: { value: string }) {
  return value ? <>{value}</> : <span className={s.todo}>待確認</span>;
}

export default function ReportBody({ project, data, listings, stamp, preview = false }: Props) {
  const basics = mergeBasics(project, data.basics);
  const amenities = filledAmenities(project.area);
  const lvr = lvrHrefFor(project);
  const rows = competitorRows(project, data);
  const newTab = preview ? { target: "_blank", rel: "noopener noreferrer" } : {};

  // 哪幾段有內容就顯示哪幾段，編號照顯示順序遞補
  const sections: Array<{ title: string; body: ReactNode }> = [];

  sections.push({
    title: "社區基本資料總覽",
    body: (
      <dl className={s.facts}>
        {basics.map((row) => (
          <div key={row.key}>
            <dt>{row.label}</dt>
            <dd>
              <Value value={row.value} />
            </dd>
          </div>
        ))}
      </dl>
    ),
  });

  if (data.positioning.body || data.positioning.title) {
    sections.push({
      title: "區域市場定位",
      body: (
        <div className={s.prose}>
          {data.positioning.title && <p className={s.lead}>{data.positioning.title}</p>}
          {data.positioning.body && <p className={s.body}>{data.positioning.body}</p>}
        </div>
      ),
    });
  }

  if (data.locationValues.length > 0 || amenities.length > 0) {
    sections.push({
      title: data.locationValues.length >= 4 ? "四大地段價值" : "地段價值",
      body: (
        <>
          {data.locationValues.length > 0 && (
            <div className={s.cards}>
              {data.locationValues.map((x) => (
                <article key={x.label + x.body.slice(0, 8)} className={s.card}>
                  <h4>{x.label}</h4>
                  <p>{x.body}</p>
                </article>
              ))}
            </div>
          )}
          {amenities.length > 0 && (
            <div className={s.amen}>
              <p className={s.amenTitle}>{`周邊機能（${OWNER.alias}實地整理）`}</p>
              {amenities.map((g) => (
                <p key={g.label}>
                  <b>{g.label}</b>
                  {g.items.join("、")}
                </p>
              ))}
            </div>
          )}
        </>
      ),
    });
  }

  if (data.highlights.length > 0) {
    sections.push({
      title: "社區特色",
      body: (
        <ul className={s.bullets}>
          {data.highlights.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      ),
    });
  }

  sections.push({
    title: `我在 ${project.name} 的在售物件`,
    body:
      listings.length > 0 ? (
        <div className={s.units}>
          {listings.map((item) => (
            <article key={item.id} className={s.unit}>
              <div className={s.unitThumb}>
                <PhotoCarousel photos={item.photos} alt={`${project.name}－${item.title}`} />
              </div>
              <div className={s.unitBody}>
                <h4 className={s.unitTitle}>{item.title}</h4>
                {item.points.length > 0 && (
                  <ul className={s.unitPoints}>
                    {item.points.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                )}
                {/* 兩顆都掛 data-listing-*，全站的 ListingClickTracker 會記一次點擊（slug 用地圖物件 id，跟 /map 一致） */}
                <div className={s.unitBtns}>
                  {item.linkHref && (
                    <a
                      className={s.btnOutline}
                      href={item.linkHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-listing-slug={item.id}
                      data-listing-action="link"
                    >
                      物件介紹 ↗
                    </a>
                  )}
                  <Link className={s.btnSolid} href="/card/booking" data-listing-slug={item.id} data-listing-action="booking" {...newTab}>
                    預約看屋
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className={s.emptyUnits}>
          <p>{`目前我手上沒有 ${project.name} 的物件在售。這一區釋出速度很快，想找這個社區可以先跟我說，有案子我第一時間通知你。`}</p>
          <Link className={s.btnSolid} href="/card/booking" {...newTab}>
            {`想找 ${project.name}？預約諮詢`}
          </Link>
        </div>
      ),
  });

  sections.push({
    title: "行情說明",
    body: (
      <div className={s.lvrBox}>
        <p>
          本報告書刻意不寫價格 —— 房價每個月都在動，寫在網頁上很快就過期。
          {`${lvr.district}的成交行情請直接看內政部實價登錄（每月 1、11、21 日更新一期），`}
          {`下面這顆按鈕已經幫你帶入「${lvr.keyword}」的查詢條件。`}
        </p>
        <div className={s.unitBtns}>
          <Link className={s.btnSolid} href={lvr.href} {...newTab}>
            {`看${lvr.district}實價登錄 →`}
          </Link>
          <Link className={s.btnOutline} href="/card/booking" {...newTab}>
            想知道這個社區逐戶的成交帶？找我
          </Link>
        </div>
        <p className={s.small}>每個社區、每個樓層與坪數的成交帶都不同；針對你看上的那一戶，我會整理近期成交案例後再跟你說明。</p>
      </div>
    ),
  });

  if (rows.length > 1) {
    sections.push({
      title: "周邊競品比較",
      body: (
        <>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th scope="col">社區</th>
                  <th scope="col">行政區</th>
                  <th scope="col">屋齡</th>
                  <th scope="col">建商</th>
                  <th scope="col">備註</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const p = r.project;
                  const age = p ? houseAge(p.completion) : null;
                  return (
                    <tr key={r.name} className={r.self ? s.selfRow : undefined}>
                      <th scope="row">
                        {p && !r.self ? (
                          <Link href={`/map?project=${p.id}`} {...newTab}>
                            {r.name}
                          </Link>
                        ) : (
                          r.name
                        )}
                        {r.self && <span className={s.selfTag}>本案</span>}
                      </th>
                      <td>{p ? AREA_LABEL[p.area] : "—"}</td>
                      <td>{p ? (age ?? (p.status === "presale" ? "預售" : p.completion || "—")) : "—"}</td>
                      <td>{p ? p.builder : "—"}</td>
                      <td>{r.self ? "" : r.note || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className={s.small}>各社區產品規格、屋齡與定位不同，僅供對照；實際比較請依坪數、樓層與車位逐戶細分。對得上建案總表的社區可點名字回地圖看位置。</p>
        </>
      ),
    });
  }

  if (data.buyers.length > 0 || data.sellingPoints.length > 0) {
    sections.push({
      title: "買方輪廓與銷售策略",
      body: (
        <>
          {data.buyers.length > 0 && (
            <>
              <p className={s.subhead}>買方輪廓</p>
              <ul className={s.bullets}>
                {data.buyers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </>
          )}
          {data.sellingPoints.length > 0 && (
            <>
              <p className={s.subhead}>主打賣點</p>
              <div className={s.cards}>
                {data.sellingPoints.map((x, i) => (
                  <article key={x.title + i} className={s.cardAccent}>
                    <h4>{x.title || `賣點 ${i + 1}`}</h4>
                    <p>{x.body}</p>
                  </article>
                ))}
              </div>
            </>
          )}
        </>
      ),
    });
  }

  const street = project.streets || project.street || "";

  return (
    <div className={s.paper}>
      <header className={s.hero}>
        <div className={s.inner}>
          <p className={s.eyebrow}>{`台中市${AREA_LABEL[project.area]}${street ? `・${street}` : ""}`}</p>
          <h1 className={s.heroTitle}>{project.name}</h1>
          <p className={s.heroSub}>{REPORT_LABEL}</p>
          {data.tagline && <p className={s.tagline}>{data.tagline}</p>}
          <p className={s.byline}>{`${OWNER.name}｜台中海線房仲　　${stamp}`}</p>
        </div>
      </header>

      {sections.map((sec, i) => (
        <section key={sec.title} className={s.section}>
          <div className={s.inner}>
            <div className={s.secHead}>
              <span className={s.secNo}>{String(i + 1).padStart(2, "0")}</span>
              <h2 className={s.secTitle}>{sec.title}</h2>
            </div>
            {sec.body}
          </div>
        </section>
      ))}

      <section className={s.section}>
        <div className={s.inner}>
          {data.sources.length > 0 && (
            <p className={s.sources}>
              <b>資料來源：</b>
              {data.sources.join("；")}
            </p>
          )}
          <p className={s.disclaimer}>
            ⚠️ 本報告書整理自建商公告與公開資訊，供初步參考；標示「待確認」者尚未查證。
            <strong>實際坪數、格局、公設比、屋況與產權，以不動產說明書、建物權狀與現場勘查為準。</strong>
            物件狀態隨時可能異動，成交後即下架。
          </p>
        </div>
      </section>

      <footer className={s.agent}>
        <div className={s.inner}>
          <p className={s.agentName}>
            {OWNER.name}
            <span>{OWNER.title}</span>
          </p>
          <p className={s.agentLine}>
            <a href={`tel:${OWNER.phoneRaw}`}>{OWNER.phone}</a>
            {"｜"}
            <a href={SOCIAL.line} target="_blank" rel="noopener noreferrer">
              官方 LINE @a8865
            </a>
          </p>
          <p className={s.agentLegal}>
            {OWNER.brokerage}　不動產經紀人：{OWNER.brokerName}　{OWNER.brokerLicense}
          </p>
        </div>
      </footer>
    </div>
  );
}

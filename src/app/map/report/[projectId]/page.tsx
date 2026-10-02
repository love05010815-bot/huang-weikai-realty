/**
 * /map/report/<建案 id> —— 社區銷售報告書（前台）
 *
 * 2026-10-02 系統擁有者拿另一家房仲的「社區銷售企劃書」當範本：客戶在海線建案一覽（/map）點到建案，
 * 建案資訊底下多一顆入口，點進來看這個社區的完整介紹。
 *
 * 資料哪裡來：後台 /admin/reports 選建案 → 複製指令貼進他自己的 ChatGPT → 把回覆（JSON）貼回後台 → 發佈。
 * 這頁只讀**已發佈**的；草稿或沒有的 → 404（not-found.tsx 會引導回地圖）。
 * 建案本身的資料（建商、完工、戶數…）來自建案總表 port-projects.ts，總表有的以總表為準（mergeBasics）。
 * 在售物件是 map_listing 的真資料，跟 /map 同一份。
 *
 * 這個檔只做「查資料＋metadata」，版面在 ReportBody.tsx（後台預覽共用）。
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { OWNER, SITE_URL } from "@/config/owner";
import { AREA_LABEL, PROJECTS } from "@/data/port-projects";
import { getMapListingsByProject, type PublicMapListing } from "@/lib/map-listings";
import { REPORT_LABEL, stampLabel } from "@/lib/project-report";
import { getPublishedReport } from "@/lib/project-reports";
import { resolvePhotoSrc } from "@/lib/photo-src";
import SiteNav from "@/app/_ui/SiteNav";
import styles from "../../Map.module.css";
import ReportBody from "./ReportBody";

/** 後台存檔／發佈時會 revalidatePath 這一頁；這裡的定時重生只是保險 */
export const revalidate = 300;

type Params = { projectId: string };

function findProject(id: string) {
  return /^[a-z0-9-]{1,64}$/i.test(id) ? (PROJECTS.find((p) => p.id === id) ?? null) : null;
}

/** metadata 與頁面各要讀一次，用 React cache 合成同一次查詢 */
const loadReport = cache(async (projectId: string) => getPublishedReport(projectId));

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { projectId } = await params;
  const project = findProject(projectId);
  const report = project ? await loadReport(project.id) : null;
  if (!project || !report) {
    return { title: `找不到這份${REPORT_LABEL}｜${OWNER.name}`, robots: { index: false, follow: true } };
  }

  const title = `${project.name}｜${REPORT_LABEL}｜${AREA_LABEL[project.area]}｜${OWNER.name}`;
  const description =
    report.data.tagline ||
    report.data.positioning.body.slice(0, 110) ||
    `${project.name}（${project.builder}）的建商、地段、社區特色、買方輪廓與同區競品整理。台中海線房仲${OWNER.name}整理自公開資訊。`;
  const url = `${SITE_URL}/map/report/${project.id}`;

  // 分享預覽圖：我在這棟有照片的在售物件就用它的封面，沒有就用全站那張
  let image = `${SITE_URL}/og-home-2026-09.jpg`;
  try {
    const cover = (await getMapListingsByProject()).get(project.id)?.find((l) => l.photos[0])?.photos[0];
    if (cover) {
      const src = resolvePhotoSrc(cover);
      image = /^https?:\/\//i.test(src) ? src : `${SITE_URL}${src}`;
    }
  } catch {
    // 用預設圖
  }

  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    keywords: [project.name, `${project.name} 社區`, `${project.name} 建商`, project.builder, AREA_LABEL[project.area], "台中海線建案", OWNER.name],
    robots: { index: true, follow: true },
    alternates: { canonical: `/map/report/${project.id}` },
    openGraph: {
      type: "article",
      locale: "zh_TW",
      url,
      title,
      description,
      siteName: `${OWNER.name}｜台中海線房仲`,
      images: [{ url: image, alt: `${project.name} ${REPORT_LABEL}` }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function ReportPage({ params }: { params: Promise<Params> }) {
  const { projectId } = await params;
  const project = findProject(projectId);
  if (!project) notFound();
  const report = await loadReport(project.id);
  if (!report) notFound();

  // 在售物件讀不到就空陣列 —— 那一段會變成「目前沒有在售物件」的 CTA，報告書本身照常
  let listings: PublicMapListing[] = [];
  try {
    listings = (await getMapListingsByProject()).get(project.id) ?? [];
  } catch {
    listings = [];
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${project.name} ${REPORT_LABEL}`,
    description: report.data.tagline || undefined,
    datePublished: report.publishedAt?.toISOString(),
    dateModified: report.updatedAt?.toISOString(),
    author: { "@type": "RealEstateAgent", name: OWNER.name, telephone: OWNER.phone, url: SITE_URL },
    about: {
      "@type": "Place",
      name: project.name,
      address: { "@type": "PostalAddress", addressLocality: AREA_LABEL[project.area], addressRegion: "台中市", addressCountry: "TW" },
    },
    inLanguage: "zh-Hant-TW",
    mainEntityOfPage: `${SITE_URL}/map/report/${project.id}`,
  };

  return (
    <main className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand}>
            {OWNER.name}
            <span>台中海線房仲</span>
          </Link>
          <SiteNav variant="sub" />
          <Link href="/card/booking" className={styles.headerCta}>
            預約諮詢
          </Link>
        </div>
      </header>

      <ReportBody project={project} data={report.data} listings={listings} stamp={stampLabel(report.publishedAt ?? report.updatedAt)} />

      <footer className={styles.footer}>
        <div className={styles.container}>
          {`${OWNER.name}｜${OWNER.title}　`}
          <Link href="/">回首頁</Link>
          {"　"}
          <Link href={`/map?project=${project.id}`}>回建案地圖</Link>
          {"　"}
          <Link href="/card/booking">線上預約</Link>
        </div>
      </footer>
    </main>
  );
}

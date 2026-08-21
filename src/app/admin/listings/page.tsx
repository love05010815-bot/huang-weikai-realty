/**
 * /admin/listings —— 精選好案後台
 *
 * 這一頁改的東西會立刻反映到首頁的「精選好案」區塊與 /listings 總覽（server action 會 revalidate），
 * **不用重新部署**。
 *
 * 照片是例外：只能從 public/listings/ 現有的圖檔挑，新照片仍然要進 repo 部署一次。
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { getAdminCheckArgs, isCurrentUserAdmin } from "@/lib/admin-check";
import { adminEmails } from "@/auth";
import { CIS } from "@/app/admin/_components/cis";
import { Icon } from "@/app/admin/_ui/icons";
import AdminGateNotice from "@/app/admin/appointments/AdminGateNotice";
import { listAllListings, listPhotoFiles, type ListingRecord } from "@/lib/listings";
import { findCopyRisks } from "@/lib/listing-copy-risk";
import ListingsManager from "./ListingsManager";
import styles from "./listings-admin.module.css";

export const dynamic = "force-dynamic";

export default async function ListingsAdminPage() {
  if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) {
    return <AdminGateNotice kind="no_provider" />;
  }
  if (adminEmails().length === 0) return <AdminGateNotice kind="no_whitelist" />;
  const { email } = await getAdminCheckArgs();
  if (!email) redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent("/admin/listings")}`);
  if (!(await isCurrentUserAdmin())) return <AdminGateNotice kind="not_allowed" email={email} />;

  // 資料庫連不上不要丟 500 白畫面 —— 講清楚是資料庫的問題，你才知道要去看哪裡。
  let rows: ListingRecord[] = [];
  let loadError: string | null = null;
  try {
    rows = await listAllListings();
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }
  // 檔案系統列得到就用它；萬一列不到（Vercel 打包沒帶到），至少要保住「現在已經在用的那幾張」，
  // 不然一進編輯畫面下拉是空的，會以為照片全不見了。
  const fromDisk = await listPhotoFiles();
  const inUse = rows.map((row) => row.photo).filter((p): p is string => Boolean(p));
  const photoFiles = [...new Set([...fromDisk, ...inUse])].sort((a, b) => a.localeCompare(b));

  const activeCount = rows.filter((row) => row.status === "active").length;
  const soldCount = rows.length - activeCount;
  const noPhotoCount = rows.filter((row) => row.status === "active" && !row.photo).length;
  const riskCount = rows.filter((row) => findCopyRisks(row.title, ...row.points).length > 0).length;

  return (
    <main className={styles.page} style={{ background: CIS.bg, color: CIS.text, fontFamily: CIS.font }}>
      <div className={styles.shell}>
        <div className={styles.titleRow}>
          <div>
            <h1 className={styles.title}>
              <Icon name="building" size={25} />
              精選好案
            </h1>
            <p className={styles.subtitle} style={{ color: CIS.textMute }}>
              改完立刻生效，不用部署。首頁只取最前面 3 筆，用箭頭調順序就是在調首頁放哪三筆。
            </p>
          </div>
          <Link
            className={styles.btn}
            style={{ borderColor: CIS.cardBorder, color: CIS.textSub }}
            href="/listings"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="externalLink" size={15} />
            看對外的樣子
          </Link>
        </div>

        {loadError ? (
          <div
            className={styles.notice}
            style={{ background: "rgba(244,63,94,.1)", borderColor: "rgba(244,63,94,.35)", color: "#fb7185" }}
          >
            <b>讀不到資料庫，這一頁現在是空的（不是物件被刪光了）。</b>
            <br />
            {loadError}
          </div>
        ) : null}

        <div className={styles.summaryRow}>
          {[
            ["上架中", activeCount, "#4ade80"],
            ["已下架", soldCount, CIS.textMute],
            ["缺照片", noPhotoCount, noPhotoCount > 0 ? "#fbbf24" : CIS.textMute],
            ["文案要注意", riskCount, riskCount > 0 ? "#fbbf24" : CIS.textMute],
          ].map(([label, value, color]) => (
            <div
              key={String(label)}
              className={styles.summary}
              style={{ background: CIS.card, borderColor: CIS.cardBorder }}
            >
              <div className={styles.summaryLabel} style={{ color: CIS.textMute }}>
                {label}
              </div>
              <div className={styles.summaryValue} style={{ color: String(color) }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        <div
          className={styles.notice}
          style={{ background: "rgba(148,163,184,.08)", borderColor: CIS.cardBorder, color: CIS.textSub }}
        >
          <b>成交了就按「成交／下架」，不要按刪除。</b>
          賣掉的物件還掛在網站上是廣告不實，但整筆刪掉之後就查不到你曾經賣過什麼了。
          {fromDisk.length === 0 ? (
            <>
              <br />
              ⚠️ 這次列不出 <code>public/listings/</code> 的檔案，下拉只剩「已經在用的那幾張」。
              要選新照片得手動打檔名。
            </>
          ) : null}
        </div>

        <ListingsManager initial={rows} photoFiles={photoFiles} />
      </div>
    </main>
  );
}

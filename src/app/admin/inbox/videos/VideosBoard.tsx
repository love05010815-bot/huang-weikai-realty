/**
 * 影片觀看數排行的畫面（/admin/inbox/videos）。純畫面：吃一包 snapshot，不擋門、不抓資料。
 * 擋門與抓資料在同資料夾的 page.tsx；為什麼這樣排、規則是什麼，看 page.tsx 檔頭。
 */
import { CIS } from "@/app/admin/_components/cis";
import { Icon } from "@/app/admin/_ui/icons";
import { PLATFORM_COLOR } from "@/lib/inbox-types";
import { TIKTOK_NOTE, type VideoStatsSnapshot } from "@/lib/video-stats";
import { refreshVideoStatsAction } from "@/lib/actions/video-stats";
import {
  VIDEO_PLATFORM_LABEL,
  displayTitle,
  groupVideos,
  withinDays,
  type VideoGroup,
  type VideoPlatform,
  type VideoStat,
} from "@/lib/video-stats-types";
import shell from "../inbox.module.css";
import styles from "./videos.module.css";

const TZ = "Asia/Taipei";
/** 一頁最多列幾支。排行看的是前面，後面的沒有人會捲到 */
const MAX_ROWS = 100;

const COLOR: Record<VideoPlatform, string> = {
  youtube: PLATFORM_COLOR.youtube,
  facebook: PLATFORM_COLOR.facebook,
  instagram: PLATFORM_COLOR.instagram,
  threads: PLATFORM_COLOR.threads,
  tiktok: "var(--adm-text)",
};

const REBIND: Partial<Record<VideoPlatform, string>> = {
  instagram: "/api/admin/meta/auth",
  threads: "/api/admin/threads/auth",
};

const num = (n: number) => n.toLocaleString("zh-TW");

function fmtClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: TZ,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-TW", { timeZone: TZ, year: "numeric", month: "numeric", day: "numeric" }).format(d);
}

function hrefFor(p: VideoPlatform | null, d: number | null): string {
  const q = new URLSearchParams();
  if (p) q.set("p", p);
  if (d) q.set("d", String(d));
  const s = q.toString();
  return s ? `/admin/inbox/videos?${s}` : "/admin/inbox/videos";
}

export default function VideosBoard({
  snapshot,
  platform,
  days,
}: {
  snapshot: VideoStatsSnapshot;
  /** null = 全部平台、同一支影片併成一列 */
  platform: VideoPlatform | null;
  /** 只看最近幾天發的；null = 全部期間 */
  days: number | null;
}) {
  const inRange = withinDays(snapshot.all, days);

  // 「全部」＝同一支影片併成一列；選了平台＝那個平台自己排，一支一列
  const groups: VideoGroup[] = platform
    ? groupVideos(inRange.filter((v) => v.platform === platform), 0)
    : groupVideos(inRange);
  const shown = groups.slice(0, MAX_ROWS);

  const counted = snapshot.sources.filter((s) => s.bound && !s.error && !s.viewsMissing);
  const uncounted = snapshot.sources.filter((s) => !counted.includes(s));

  return (
    <main className={shell.page} style={{ background: CIS.bg, color: CIS.text, fontFamily: CIS.font }}>
      <div className={shell.shell}>
        <h1 className={shell.title}>
          <Icon name="play" size={25} />
          影片觀看數
        </h1>
        <p className={shell.subtitle} style={{ color: CIS.textMute }}>
          五個平台的影片排在一起，看哪一支最多人看。同一支影片發在不同平台會併成一列、觀看數加總。
        </p>

        <div className={shell.filterRow} style={{ marginTop: 14 }}>
          <Tab href="/admin/inbox" active={false} label="留言" />
          <Tab href="/admin/inbox/videos" active label="影片觀看數" />
          <span className={shell.spacer} />
          <span className={styles.muted} style={{ fontSize: 13 }}>
            數字抓於 {fmtClock(snapshot.fetchedAt)}（最多留 30 分鐘）
          </span>
          <form action={refreshVideoStatsAction}>
            <button
              type="submit"
              className={shell.btn}
              style={{ borderColor: CIS.cardBorder, color: CIS.text, minHeight: 30 }}
              title="向五個平台重新抓一次，大約要 10 秒"
            >
              重新抓
            </button>
          </form>
        </div>

        {/* ── 五個平台各自的狀態 ── */}
        <div className={styles.sources}>
          {snapshot.sources.map((s) => {
            const list = withinDays(s.videos, days);
            const total = list.reduce((sum, v) => sum + (v.views ?? 0), 0);
            const hasViews = s.bound && !s.error && !s.viewsMissing;
            return (
              <div key={s.platform} className={styles.source}>
                <div className={styles.sourceName}>
                  <span className={styles.dot} style={{ background: COLOR[s.platform] }} />
                  {VIDEO_PLATFORM_LABEL[s.platform]}
                </div>
                {hasViews ? (
                  <>
                    <div className={styles.sourceBig}>{num(total)}</div>
                    <div className={styles.muted}>
                      {list.length} 支影片的觀看數{s.accountName ? `・${s.accountName}` : ""}
                    </div>
                  </>
                ) : (
                  <div className={styles.muted}>
                    {s.platform === "tiktok"
                      ? "還沒接"
                      : !s.bound
                        ? "還沒綁定（到「留言」分頁綁）"
                        : s.error
                          ? "抓取失敗"
                          : `${list.length} 支影片，觀看數拿不到`}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── 拿不到數字的平台，一家一段講清楚要做什麼 ── */}
        {snapshot.sources.map((s) => {
          const msg =
            s.platform === "tiktok"
              ? TIKTOK_NOTE
              : s.error
                ? `${VIDEO_PLATFORM_LABEL[s.platform]} 抓取失敗：${s.error}`
                : s.viewsMissing;
          if (!msg) return null;
          const rebind = s.viewsMissing ? REBIND[s.platform] : undefined;
          return (
            <div key={s.platform} className={styles.warnBox}>
              {msg}
              {rebind && (
                <>
                  {" "}
                  <a href={rebind}>重新綁定 {VIDEO_PLATFORM_LABEL[s.platform]} →</a>
                </>
              )}
            </div>
          );
        })}

        {/* ── 篩選：平台、期間 ── */}
        <div className={shell.filterRow} style={{ marginTop: 16 }}>
          <Tab href={hrefFor(null, days)} active={!platform} label="全部（同一支併計）" />
          {snapshot.sources
            .filter((s) => s.videos.length > 0)
            .map((s) => (
              <Tab
                key={s.platform}
                href={hrefFor(s.platform, days)}
                active={platform === s.platform}
                label={VIDEO_PLATFORM_LABEL[s.platform]}
                color={COLOR[s.platform]}
              />
            ))}
          <span className={shell.spacer} />
          <Tab href={hrefFor(platform, 30)} active={days === 30} label="近 30 天發的" />
          <Tab href={hrefFor(platform, 90)} active={days === 90} label="近 90 天發的" />
          <Tab href={hrefFor(platform, null)} active={!days} label="全部期間" />
        </div>

        {shown.length === 0 ? (
          <div className={shell.notice} style={{ borderColor: CIS.cardBorder, color: CIS.textMute }}>
            這個條件下沒有影片。
          </div>
        ) : (
          <ol className={styles.list}>
            {shown.map((g, i) => (
              <li key={`${g.key}-${g.publishedAt}-${i}`} className={styles.row}>
                <span className={i < 3 ? `${styles.rank} ${styles.rankTop}` : styles.rank}>{i + 1}</span>
                <div>
                  <div className={styles.rowTitle}>{g.title}</div>
                  <div className={styles.rowMeta}>
                    {fmtDate(g.publishedAt)} 發佈
                    {!platform && `・${g.items.length} 個平台`}
                  </div>
                </div>
                <div className={styles.total}>
                  {g.countedPlatforms > 0 ? num(g.totalViews) : "—"}
                  <span className={styles.totalUnit}>次</span>
                </div>
                <div className={styles.chips}>
                  {g.items.map((v) => (
                    <Chip key={`${v.platform}-${v.id}`} v={v} />
                  ))}
                </div>
              </li>
            ))}
          </ol>
        )}

        <p className={styles.footNote}>
          {groups.length > MAX_ROWS && `共 ${groups.length} 支，只列前 ${MAX_ROWS} 名。`}
          加總只算拿得到觀看數的平台
          {counted.length > 0 && `（目前：${counted.map((s) => VIDEO_PLATFORM_LABEL[s.platform]).join("、")}）`}
          {uncounted.length > 0 && `，${uncounted.map((s) => VIDEO_PLATFORM_LABEL[s.platform]).join("、")} 還沒算進來`}
          。各平台對「看一次」的算法不一樣（短影音滑過就算、YouTube 長片要看一段才算），
          這個數字適合拿來比「哪一支比較多人看」，不適合對外說「共有幾人看過」。
          同一支影片是靠「標題開頭一樣、發佈日相差三天內」併在一起的，各平台標題開頭寫得不一樣就會分成兩列。
          數字抓一次留 30 分鐘，要最新的按上面「重新抓」；YouTube 最多抓最近 300 支、Facebook 300 支、Instagram 200 則貼文、Threads 最近 100 則貼文裡的影片。
        </p>
      </div>
    </main>
  );
}

function Tab({ href, active, label, color }: { href: string; active: boolean; label: string; color?: string }) {
  return (
    <a
      className={shell.filterTab}
      href={href}
      style={
        active
          ? { background: "rgba(var(--adm-ink-rgb), .09)", borderColor: color || CIS.blue, color: CIS.text }
          : { borderColor: CIS.cardBorder, color: CIS.textMute }
      }
    >
      {label}
    </a>
  );
}

function Chip({ v }: { v: VideoStat }) {
  const body = (
    <>
      <span className={styles.dot} style={{ background: COLOR[v.platform] }} />
      {VIDEO_PLATFORM_LABEL[v.platform]}
      <b>{v.views === null ? "—" : num(v.views)}</b>
      {v.likes !== null && <span>👍 {num(v.likes)}</span>}
      {v.comments !== null && <span>💬 {num(v.comments)}</span>}
    </>
  );
  return v.permalink ? (
    <a
      className={styles.chipLink}
      href={v.permalink}
      target="_blank"
      rel="noopener noreferrer"
      title={displayTitle(v.title, 60)}
    >
      {body}
    </a>
  ) : (
    <span className={styles.chipLink}>{body}</span>
  );
}

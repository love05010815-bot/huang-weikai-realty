"use client";
/**
 * 買方配對後台的操作介面：三個分頁（預約看屋／買方／物件同步）。
 *
 * 改狀態走 server action，改完 router.refresh() 重讀 —— 畫面上看到的一律是資料庫真的有的東西。
 * 「立即同步」打 /api/match/sync?force=1（那支的函式上限 60 秒），跑完也 refresh。
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CHIP, CIS, cisCard, type ChipTone } from "@/app/admin/_components/cis";
import { MATCH, VIEWING_STATUS } from "@/config/match";
import { setViewingStatusAction } from "@/lib/actions/match";
import type { SyncSummary } from "@/lib/match/sync";
import styles from "./match-admin.module.css";

export type AdminViewing = {
  id: string;
  code: string;
  listingId: string;
  listingTitle: string;
  listingArea: string;
  listingPrice: number;
  name: string;
  phone: string;
  preferredAt: string;
  note: string;
  status: string;
  agentNote: string;
  lineUserId: string | null;
  buyerDisplayName: string | null;
  createdAt: string | null;
};

export type AdminBuyer = {
  id: string;
  displayName: string | null;
  name: string | null;
  phone: string | null;
  linked: boolean;
  followed: boolean;
  summary: string | null;
  updatedAt: string | null;
};

export type AdminListing = {
  id: string;
  title: string;
  area: string;
  price: number;
  rooms: number;
  size: number;
  type: string;
  status: "available" | "hidden";
  sourceUrl: string;
  syncedAt: string | null;
};

type Tab = "viewings" | "buyers" | "sync";

const STATUS_TONE: Record<string, ChipTone> = {
  pending: "neutral",
  linked: "info",
  confirmed: "success",
  done: "success",
  cancelled: "danger",
};

function fmt(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("zh-TW", { hour12: false, timeZone: "Asia/Taipei", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function Chip({ tone, children }: { tone: ChipTone; children: React.ReactNode }) {
  const c = CHIP[tone];
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 600, background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
      {children}
    </span>
  );
}

export default function MatchAdmin({
  viewings,
  buyers,
  listings,
  counts,
  lastSync,
}: {
  viewings: AdminViewing[];
  buyers: AdminBuyer[];
  listings: AdminListing[];
  counts: { available: number; hidden: number };
  lastSync: SyncSummary | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("viewings");
  const [msg, setMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncSummary | null>(null);

  async function changeStatus(id: string, status: string) {
    setBusyId(id);
    setMsg(null);
    const r = await setViewingStatusAction(id, status);
    setBusyId(null);
    if (!r.ok) {
      setMsg(r.error ?? "更新失敗");
      return;
    }
    if (status === "confirmed" || status === "cancelled") setMsg(r.notified ? "已更新，並已推播通知買方" : "已更新（買方沒綁 LINE 或推播失敗，請自行聯繫）");
    router.refresh();
  }

  async function runSync() {
    setSyncing(true);
    setMsg(null);
    try {
      const res = await fetch("/api/match/sync?force=1", { cache: "no-store" });
      const data = (await res.json()) as SyncSummary;
      setSyncResult(data);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  }

  const tabBtn = (key: Tab, label: string, count: number) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      style={{
        padding: "8px 14px",
        borderRadius: 999,
        border: `1px solid ${tab === key ? CIS.blue : CIS.cardBorder}`,
        background: tab === key ? "rgba(242,102,102,0.16)" : "transparent",
        color: tab === key ? CIS.text : CIS.textSub,
        fontWeight: 600,
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      {label} <span style={{ color: CIS.textMute }}>{count}</span>
    </button>
  );

  const lastShown = syncResult ?? lastSync;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {tabBtn("viewings", "預約看屋", viewings.length)}
        {tabBtn("buyers", "買方", buyers.length)}
        {tabBtn("sync", "物件同步", counts.available)}
      </div>
      {msg && (
        <p style={{ margin: "0 0 12px", padding: "10px 12px", borderRadius: CIS.radiusSm, background: CIS.bgSoft, border: `1px solid ${CIS.cardBorder}`, fontSize: 13 }}>{msg}</p>
      )}

      {tab === "viewings" && (
        <div style={cisCard} className={styles.wrap}>
          <p style={{ margin: 0, padding: "12px 14px", color: CIS.textMute, fontSize: 12 }}>
            狀態改成「已確認」或「已取消」會自動推播通知已綁定 LINE 的買方。新預約會同時通知你的 LINE、Email 與 admin 群。
          </p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>編號</th>
                <th>物件</th>
                <th>希望時間</th>
                <th>姓名／電話</th>
                <th>LINE</th>
                <th>狀態</th>
                <th>備註</th>
                <th>建立</th>
              </tr>
            </thead>
            <tbody>
              {viewings.length === 0 && (
                <tr>
                  <td colSpan={8} className={styles.empty}>
                    還沒有預約。買方在 /match 預約後會出現在這裡。
                  </td>
                </tr>
              )}
              {viewings.map((v) => (
                <tr key={v.id}>
                  <td>
                    <b>{v.code}</b>
                  </td>
                  <td>
                    {v.listingTitle}
                    <div style={{ color: CIS.textMute, fontSize: 12 }}>
                      {v.listingArea}
                      {v.listingPrice ? ` · ${v.listingPrice.toLocaleString("zh-TW")} 萬` : ""}
                    </div>
                  </td>
                  <td>{v.preferredAt}</td>
                  <td>
                    {v.name}
                    <div style={{ color: CIS.textSub, fontSize: 12 }}>
                      <a href={`tel:${v.phone}`} style={{ color: "inherit" }}>
                        {v.phone}
                      </a>
                    </div>
                  </td>
                  <td>{v.lineUserId ? <Chip tone="success">✔ {v.buyerDisplayName ?? "已綁定"}</Chip> : <Chip tone="neutral">未綁定</Chip>}</td>
                  <td>
                    <select className={styles.select} value={v.status} disabled={busyId === v.id} onChange={(e) => changeStatus(v.id, e.target.value)}>
                      {Object.entries(VIEWING_STATUS).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <div style={{ marginTop: 4 }}>
                      <Chip tone={STATUS_TONE[v.status] ?? "neutral"}>{VIEWING_STATUS[v.status] ?? v.status}</Chip>
                    </div>
                  </td>
                  <td style={{ color: CIS.textSub, fontSize: 12, maxWidth: 220 }}>{v.note || "—"}</td>
                  <td style={{ color: CIS.textMute, fontSize: 12, whiteSpace: "nowrap" }}>{fmt(v.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "buyers" && (
        <div style={cisCard} className={styles.wrap}>
          <p style={{ margin: 0, padding: "12px 14px", color: CIS.textMute, fontSize: 12 }}>
            留過條件的買方。有綁 LINE 的，新物件同步進來時會自動收到推播（每次同步最多 {MATCH.maxNotifyBuyersPerSync} 位）。
          </p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>LINE</th>
                <th>姓名／電話</th>
                <th>購屋條件</th>
                <th>更新</th>
              </tr>
            </thead>
            <tbody>
              {buyers.length === 0 && (
                <tr>
                  <td colSpan={4} className={styles.empty}>
                    還沒有買方留條件。
                  </td>
                </tr>
              )}
              {buyers.map((b) => (
                <tr key={b.id}>
                  <td>{b.linked ? <Chip tone={b.followed ? "success" : "warn"}>✔ {b.displayName ?? "已綁定"}{b.followed ? "" : "（已封鎖）"}</Chip> : <Chip tone="neutral">未綁定</Chip>}</td>
                  <td>
                    {b.name ?? "—"}
                    <div style={{ color: CIS.textSub, fontSize: 12 }}>{b.phone ?? ""}</div>
                  </td>
                  <td style={{ color: CIS.textSub, fontSize: 13 }}>{b.summary ?? "—"}</td>
                  <td style={{ color: CIS.textMute, fontSize: 12, whiteSpace: "nowrap" }}>{fmt(b.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "sync" && (
        <div>
          <div style={{ ...cisCard, padding: 16, marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>
                  在售 {counts.available} 戶 · 已下架 {counts.hidden} 戶
                </div>
                <div style={{ color: CIS.textMute, fontSize: 12, marginTop: 4 }}>
                  來源：愛屋店網 storeid {MATCH.houseolStoreId}（店碼 {MATCH.houseolStoreCode || "不限"}），每 {MATCH.syncIntervalMin} 分鐘自動同步一次。
                </div>
                {lastShown && (
                  <div style={{ color: CIS.textSub, fontSize: 13, marginTop: 8 }}>
                    {lastShown.ran
                      ? lastShown.ok
                        ? `上次同步 ${fmt(lastShown.at ?? null)}：店網 ${lastShown.total} 筆，新增 ${lastShown.added}、更新 ${lastShown.updated}、下架 ${lastShown.hidden}${lastShown.complete === false ? "（這次沒抓完整，未做下架判斷）" : ""}${lastShown.notifiedBuyers ? `，推播 ${lastShown.notifiedBuyers} 位買方` : ""}${lastShown.baseline ? "（第一次建立基準，不推播）" : ""}，${Math.round((lastShown.ms ?? 0) / 1000)} 秒`
                        : `上次同步失敗：${lastShown.reason}`
                      : `沒有跑：${lastShown.reason}`}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={runSync}
                disabled={syncing}
                style={{ padding: "10px 18px", borderRadius: CIS.radiusSm, border: 0, background: CIS.blueDeep, color: "#fff", fontWeight: 700, cursor: syncing ? "default" : "pointer", opacity: syncing ? 0.6 : 1 }}
              >
                {syncing ? "同步中（約 30–40 秒）…" : "立即同步"}
              </button>
            </div>
          </div>
          <div style={cisCard} className={styles.wrap}>
            <p style={{ margin: 0, padding: "12px 14px", color: CIS.textMute, fontSize: 12 }}>最近同步的 {listings.length} 戶（全部在售物件請看 /match 的配對結果）。</p>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>編號</th>
                  <th>物件</th>
                  <th>區域</th>
                  <th>總價</th>
                  <th>格局</th>
                  <th>狀態</th>
                  <th>同步</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <a href={l.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: CIS.blueSoft }}>
                        {l.id}
                      </a>
                    </td>
                    <td>{l.title}</td>
                    <td>{l.area}</td>
                    <td>{l.price.toLocaleString("zh-TW")} 萬</td>
                    <td>
                      {l.rooms} 房 {l.size} 坪 {l.type}
                    </td>
                    <td>{l.status === "available" ? <Chip tone="success">在售</Chip> : <Chip tone="neutral">已下架</Chip>}</td>
                    <td style={{ color: CIS.textMute, fontSize: 12, whiteSpace: "nowrap" }}>{fmt(l.syncedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

/**
 * 開發物件追蹤後台的操作介面。
 *
 * 他的用法（2026-10-13 重新講過）：從各處把連結或地址丟進來 → 之後每次查都要能直接點開連結 →
 * 記第一次什麼時候聯繫 → 進度到哪、找到屋主了沒 → 依區域分、能用區域搜尋 → 丟進來的日期要明顯。
 *
 * 所以版面是：最上面一格「丟進來」（貼了就走，區域自動判）；底下區域 pill（網址同步 ?area=）；
 * 卡片正面就是：區域／狀態／找到屋主 三個 chip、地址、一顆大的「開啟連結」、
 * 一排日期（丟入／首次聯繫／最近／下次）、兩排按鈕（今天聯繫了・找到屋主了｜已簽約・編輯・刪除）。
 *
 * 存檔／刪除都是 server action，改完 `router.refresh()` 重讀 —— 畫面上看到的一律是資料庫真的有的東西。
 * 物件「目前狀態」「第一次聯繫」都是後台頁面從紀錄算好才傳進來的，這裡不用管怎麼算。
 */
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CHIP, type ChipTone } from "@/app/admin/_components/cis";
import { Icon } from "@/app/admin/_ui/icons";
import {
  CONTACT_METHODS,
  CONTACT_RESULT_OPTIONS,
  LEAD_AREAS,
  LEAD_AREA_UNSET_LABEL,
  LEAD_SOURCES,
  LEAD_STATUS_LABEL,
  type LeadStatus,
} from "@/config/dev-leads";
import { hostLabel, parseQuickAdd } from "@/lib/dev-leads-text";
import {
  addContactAction,
  deleteContactAction,
  deleteLeadAction,
  saveLeadAction,
  setOwnerFoundAction,
} from "@/lib/actions/dev-leads";
import styles from "./leads-admin.module.css";

export type AdminContact = {
  id: string;
  contactedAt: string;
  contactedTime: string | null;
  method: string;
  feedback: string;
  resultStatus: LeadStatus;
  nextFollowUpAt: string | null;
};

export type AdminLead = {
  id: string;
  address: string;
  area: string;
  ownerFound: boolean;
  source: string;
  sourceUrl: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
  note: string | null;
  createdAt: string | null;
  /** 丟進來那天（台北日曆日 YYYY-MM-DD） */
  createdDay: string | null;
  status: LeadStatus;
  firstContactAt: string | null;
  lastContactAt: string | null;
  nextFollowUpAt: string | null;
  contacts: AdminContact[];
};

const STATUS_TONE: Record<LeadStatus, ChipTone> = {
  new: "neutral",
  contacted: "info",
  following: "warn",
  interested: "warn",
  signed_us: "success",
  signed_other: "danger",
  rejected: "danger",
  unreachable: "neutral",
};

function Chip({ tone, children }: { tone: ChipTone; children: React.ReactNode }) {
  const c = CHIP[tone];
  return (
    <span className={styles.chip} style={{ background: c.bg, color: c.color, borderColor: c.border }}>
      {children}
    </span>
  );
}

function fmtDay(d: string | null): string {
  return d ? d.replaceAll("-", "/") : "";
}

/** 卡片上的日期：同年只印 10/13，跨年才印 2025/12/30 */
function fmtShort(d: string | null, today: string): string {
  if (!d) return "";
  return d.slice(0, 4) === today.slice(0, 4) ? d.slice(5).replace("-", "/") : fmtDay(d);
}

/** 幾天前：0 → 今天、1 → 昨天、n → n 天前（用字串日期算，不碰時區） */
function daysAgo(d: string, today: string): string {
  const a = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  const b = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  const n = Math.round((b - a) / 86400000);
  if (n <= 0) return "今天";
  if (n === 1) return "昨天";
  return `${n} 天前`;
}

type Filter = "all" | "new" | "due" | "owner_unknown" | "owner_found" | "signed_us" | "lost";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "new", label: "還沒聯繫" },
  { key: "due", label: "待追蹤" },
  { key: "owner_unknown", label: "還沒找到屋主" },
  { key: "owner_found", label: "找到屋主" },
  { key: "signed_us", label: "已簽約" },
  { key: "lost", label: "已流失" },
];

/** ?area= 的值：LEAD_AREAS 之一、"none"（未分區）、或空（全部） */
const AREA_NONE = "none";

type LeadDraft = {
  address: string;
  area: string;
  ownerFound: boolean;
  source: string;
  sourceUrl: string;
  ownerName: string;
  ownerPhone: string;
  note: string;
};

const EMPTY_LEAD_DRAFT: LeadDraft = {
  address: "",
  area: "",
  ownerFound: false,
  source: "",
  sourceUrl: "",
  ownerName: "",
  ownerPhone: "",
  note: "",
};

function toDraft(l: AdminLead): LeadDraft {
  return {
    address: l.address,
    area: l.area,
    ownerFound: l.ownerFound,
    source: l.source,
    sourceUrl: l.sourceUrl ?? "",
    ownerName: l.ownerName ?? "",
    ownerPhone: l.ownerPhone ?? "",
    note: l.note ?? "",
  };
}

type ContactDraft = {
  contactedAt: string;
  contactedTime: string;
  method: string;
  feedback: string;
  resultStatus: LeadStatus;
  nextFollowUpAt: string;
};

function emptyContactDraft(today: string): ContactDraft {
  return { contactedAt: today, contactedTime: "", method: CONTACT_METHODS[0], feedback: "", resultStatus: "contacted", nextFollowUpAt: "" };
}

export default function LeadsManager({
  leads,
  today,
  dueSoonBy,
}: {
  leads: AdminLead[];
  /** 台北時間今天，YYYY-MM-DD */
  today: string;
  /** 「本週待追蹤」篩選的上限日（today + FOLLOW_UP_SOON_DAYS） */
  dueSoonBy: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // 區域篩選放在網址（?area=清水區），他可以把某一區的網址存到手機桌面或丟到 LINE 自己
  const areaParam = searchParams.get("area") ?? "";
  const areaFilter = areaParam === AREA_NONE || (LEAD_AREAS as readonly string[]).includes(areaParam) ? areaParam : "";

  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [quickText, setQuickText] = useState("");
  const [quickArea, setQuickArea] = useState<string | null>(null); // null＝跟著自動判定走
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<LeadDraft>(EMPTY_LEAD_DRAFT);
  const [contactDraft, setContactDraft] = useState<ContactDraft>(() => emptyContactDraft(today));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [confirmDeleteLead, setConfirmDeleteLead] = useState<string | null>(null);
  const [confirmDeleteContact, setConfirmDeleteContact] = useState<string | null>(null);

  const quickParsed = useMemo(() => parseQuickAdd(quickText), [quickText]);
  const quickAreaValue = quickArea ?? quickParsed.area ?? "";

  function setAreaFilter(next: string) {
    const sp = new URLSearchParams(searchParams.toString());
    if (next) sp.set("area", next);
    else sp.delete("area");
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  // 區域 pill 從資料算出來：只列真的有物件的區（＋目前選中的那個，免得選了之後消失）
  const areaCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of leads) {
      const k = l.area || AREA_NONE;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [leads]);
  const areaPills = useMemo(() => {
    const list: { key: string; label: string; count: number }[] = [];
    for (const a of LEAD_AREAS) {
      const n = areaCounts.get(a) ?? 0;
      if (n > 0 || areaFilter === a) list.push({ key: a, label: a, count: n });
    }
    const none = areaCounts.get(AREA_NONE) ?? 0;
    if (none > 0 || areaFilter === AREA_NONE) list.push({ key: AREA_NONE, label: LEAD_AREA_UNSET_LABEL, count: none });
    return list;
  }, [areaCounts, areaFilter]);

  const filtered = useMemo(() => {
    let list = leads;
    if (areaFilter === AREA_NONE) list = list.filter((l) => !l.area);
    else if (areaFilter) list = list.filter((l) => l.area === areaFilter);

    if (filter === "new") list = list.filter((l) => l.status === "new");
    else if (filter === "due") list = list.filter((l) => l.nextFollowUpAt && l.nextFollowUpAt <= dueSoonBy);
    else if (filter === "owner_unknown") list = list.filter((l) => !l.ownerFound && l.status !== "signed_us");
    else if (filter === "owner_found") list = list.filter((l) => l.ownerFound);
    else if (filter === "signed_us") list = list.filter((l) => l.status === "signed_us");
    else if (filter === "lost") list = list.filter((l) => l.status === "signed_other" || l.status === "rejected");

    const q = query.trim();
    if (q) {
      list = list.filter((l) =>
        `${l.address} ${l.area} ${l.source} ${l.sourceUrl ?? ""} ${l.ownerName ?? ""} ${l.ownerPhone ?? ""} ${l.note ?? ""}`.includes(q),
      );
    }

    // 有排下次追蹤日的排前面（愈快到愈前面）；其餘照丟進來的時間新到舊 —— 他最在意「丟進來的日期」。
    return [...list].sort((a, b) => {
      const aKey = a.nextFollowUpAt ?? "9999-99-99";
      const bKey = b.nextFollowUpAt ?? "9999-99-99";
      if (aKey !== bKey) return aKey < bKey ? -1 : 1;
      const aC = a.createdAt ?? "";
      const bC = b.createdAt ?? "";
      if (aC !== bC) return aC > bC ? -1 : 1;
      return 0;
    });
  }, [leads, areaFilter, filter, query, dueSoonBy]);

  // 沒選區域時依區分組顯示（他要「依照區域做區分」）；選了某一區就是一條清單
  const groups = useMemo(() => {
    if (areaFilter) return [{ key: areaFilter, label: areaFilter === AREA_NONE ? LEAD_AREA_UNSET_LABEL : areaFilter, items: filtered }];
    const order: string[] = [...LEAD_AREAS, AREA_NONE];
    const by = new Map<string, AdminLead[]>();
    for (const l of filtered) {
      const k = l.area || AREA_NONE;
      const b = by.get(k);
      if (b) b.push(l);
      else by.set(k, [l]);
    }
    return order
      .filter((k) => by.has(k))
      .map((k) => ({ key: k, label: k === AREA_NONE ? LEAD_AREA_UNSET_LABEL : k, items: by.get(k)! }));
  }, [filtered, areaFilter]);

  function setLeadField<K extends keyof LeadDraft>(key: K, value: LeadDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function setContactField<K extends keyof ContactDraft>(key: K, value: ContactDraft[K]) {
    setContactDraft((d) => ({ ...d, [key]: value }));
  }

  /** 最上面那格：貼了就存。區域自動判，判不出來要他選一下（連結要依區分，沒區的連結之後找不到）。 */
  async function quickAdd() {
    const p = quickParsed;
    if (!p.sourceUrl && !p.address) {
      setMsg({ kind: "err", text: "貼一條連結或打一個地址" });
      return;
    }
    if (!quickAreaValue) {
      setMsg({ kind: "err", text: "這筆認不出是哪一區，選一下區域再丟" });
      return;
    }
    setBusy(true);
    setMsg(null);
    const r = await saveLeadAction(null, {
      address: p.address,
      area: quickAreaValue,
      ownerFound: false,
      source: p.source,
      sourceUrl: p.sourceUrl,
      ownerName: "",
      ownerPhone: "",
      note: "",
    });
    setBusy(false);
    if (!r.ok) {
      setMsg({ kind: "err", text: r.error ?? "存檔失敗" });
      return;
    }
    setQuickText("");
    setQuickArea(null);
    setMsg({ kind: "ok", text: `已丟進「${quickAreaValue}」` });
    // 丟到別區去了就把篩選拿掉，不然他看不到剛丟的那筆
    if (areaFilter && areaFilter !== quickAreaValue) setAreaFilter("");
    router.refresh();
  }

  function startEdit(lead: AdminLead) {
    setEditingId(lead.id);
    setDraft(toDraft(lead));
    setMsg(null);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveLead() {
    if (!editingId) return;
    setBusy(true);
    setMsg(null);
    const r = await saveLeadAction(editingId, draft);
    setBusy(false);
    if (!r.ok) {
      setMsg({ kind: "err", text: r.error ?? "存檔失敗" });
      return;
    }
    setEditingId(null);
    setMsg({ kind: "ok", text: "已存檔" });
    router.refresh();
  }

  async function removeLead(id: string) {
    if (confirmDeleteLead !== id) {
      setConfirmDeleteLead(id);
      return;
    }
    setBusy(true);
    const r = await deleteLeadAction(id);
    setBusy(false);
    setConfirmDeleteLead(null);
    if (!r.ok) {
      setMsg({ kind: "err", text: r.error ?? "刪除失敗" });
      return;
    }
    if (expandedId === id) setExpandedId(null);
    router.refresh();
  }

  function toggleExpand(lead: AdminLead) {
    if (expandedId === lead.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(lead.id);
    setContactDraft(emptyContactDraft(today));
    setConfirmDeleteContact(null);
  }

  async function submitContact(leadId: string) {
    setBusy(true);
    setMsg(null);
    const r = await addContactAction({ leadId, ...contactDraft });
    setBusy(false);
    if (!r.ok) {
      setMsg({ kind: "err", text: r.error ?? "新增失敗" });
      return;
    }
    setContactDraft(emptyContactDraft(today));
    setMsg({ kind: "ok", text: "已新增追蹤紀錄" });
    router.refresh();
  }

  /**
   * 卡片上的快速鍵：「今天聯繫了」「已簽約」—— 不開表單，直接補一筆今天的紀錄。
   * 還是走 addContactAction，狀態一樣是「算出來的」；只是幫他把預設值先填好。
   * 「今天聯繫了」的結果：還沒聯繫過就是「已接洽」，已經進到追蹤中／有意願的就維持原狀態不倒退。
   */
  async function quickContact(lead: AdminLead, resultStatus: LeadStatus, okText: string) {
    setBusy(true);
    setMsg(null);
    const r = await addContactAction({
      leadId: lead.id,
      contactedAt: today,
      contactedTime: "",
      method: "",
      feedback: "",
      resultStatus,
      nextFollowUpAt: "",
    });
    setBusy(false);
    if (!r.ok) {
      setMsg({ kind: "err", text: r.error ?? "標記失敗" });
      return;
    }
    setMsg({ kind: "ok", text: okText });
    router.refresh();
  }

  async function toggleOwnerFound(lead: AdminLead) {
    setBusy(true);
    setMsg(null);
    const r = await setOwnerFoundAction(lead.id, !lead.ownerFound);
    setBusy(false);
    if (!r.ok) {
      setMsg({ kind: "err", text: r.error ?? "更新失敗" });
      return;
    }
    setMsg({ kind: "ok", text: lead.ownerFound ? "改回「還沒找到屋主」" : "已標記找到屋主" });
    router.refresh();
  }

  async function removeContact(id: string) {
    if (confirmDeleteContact !== id) {
      setConfirmDeleteContact(id);
      return;
    }
    setBusy(true);
    const r = await deleteContactAction(id);
    setBusy(false);
    setConfirmDeleteContact(null);
    if (!r.ok) {
      setMsg({ kind: "err", text: r.error ?? "刪除失敗" });
      return;
    }
    router.refresh();
  }

  function renderLeadForm() {
    return (
      <div className={styles.form}>
        <div className={styles.formGrid}>
          <label style={{ gridColumn: "1 / -1" }}>
            <span>地址</span>
            <input
              type="text"
              value={draft.address}
              onChange={(e) => setLeadField("address", e.target.value)}
              placeholder="例：台中市清水區中山路 123 號（只有連結的可先留空）"
            />
          </label>
          <label>
            <span>
              區域<em>必選</em>
            </span>
            <select value={draft.area} onChange={(e) => setLeadField("area", e.target.value)}>
              <option value="">（{LEAD_AREA_UNSET_LABEL}）</option>
              {LEAD_AREAS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>來源</span>
            <select value={draft.source} onChange={(e) => setLeadField("source", e.target.value)}>
              <option value="">未分類</option>
              {LEAD_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            <span>連結</span>
            <input
              type="url"
              value={draft.sourceUrl}
              onChange={(e) => setLeadField("sourceUrl", e.target.value)}
              placeholder="591／樂屋／FB 網址，沒有可留空"
            />
          </label>
          <label>
            <span>屋主姓名</span>
            <input type="text" value={draft.ownerName} onChange={(e) => setLeadField("ownerName", e.target.value)} />
          </label>
          <label>
            <span>屋主電話</span>
            <input type="tel" value={draft.ownerPhone} onChange={(e) => setLeadField("ownerPhone", e.target.value)} />
          </label>
          <label className={styles.checkRow} style={{ gridColumn: "1 / -1" }}>
            <input type="checkbox" checked={draft.ownerFound} onChange={(e) => setLeadField("ownerFound", e.target.checked)} />
            <span>找到屋主了</span>
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            <span>物件描述</span>
            <textarea
              rows={2}
              value={draft.note}
              onChange={(e) => setLeadField("note", e.target.value)}
              placeholder="坪數、型態、樓層…後台自己看的備註"
            />
          </label>
        </div>
        <div className={styles.formBtns}>
          <button type="button" className={styles.primaryBtn} disabled={busy} onClick={saveLead}>
            {busy ? "存檔中…" : "儲存"}
          </button>
          <button type="button" className={styles.plainBtn} disabled={busy} onClick={cancelEdit}>
            取消
          </button>
        </div>
      </div>
    );
  }

  function renderContactForm(leadId: string) {
    return (
      <div className={styles.form}>
        <div className={styles.formGrid}>
          <label>
            <span>
              接洽日期<em>必填</em>
            </span>
            <input type="date" value={contactDraft.contactedAt} onChange={(e) => setContactField("contactedAt", e.target.value)} />
          </label>
          <label>
            <span>時間</span>
            <input type="time" value={contactDraft.contactedTime} onChange={(e) => setContactField("contactedTime", e.target.value)} />
          </label>
          <label>
            <span>方式</span>
            <select value={contactDraft.method} onChange={(e) => setContactField("method", e.target.value)}>
              {CONTACT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>這次結果</span>
            <select value={contactDraft.resultStatus} onChange={(e) => setContactField("resultStatus", e.target.value as LeadStatus)}>
              {CONTACT_RESULT_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {LEAD_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>下次追蹤日期</span>
            <input type="date" value={contactDraft.nextFollowUpAt} onChange={(e) => setContactField("nextFollowUpAt", e.target.value)} />
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            <span>屋主回饋</span>
            <textarea
              rows={2}
              value={contactDraft.feedback}
              onChange={(e) => setContactField("feedback", e.target.value)}
              placeholder="例：下週再約、已找別家房仲簽專約…"
            />
          </label>
        </div>
        <div className={styles.formBtns}>
          <button type="button" className={styles.primaryBtn} disabled={busy} onClick={() => submitContact(leadId)}>
            {busy ? "存檔中…" : "新增紀錄"}
          </button>
        </div>
      </div>
    );
  }

  function renderCard(lead: AdminLead) {
    const closed = lead.status === "signed_us" || lead.status === "signed_other" || lead.status === "rejected";
    return (
      <li key={lead.id} className={styles.card}>
        {editingId === lead.id ? (
          renderLeadForm()
        ) : (
          <>
            <div className={styles.cardHead} onClick={() => toggleExpand(lead)}>
              <div className={styles.chipRow}>
                <Chip tone={lead.area ? "info" : "neutral"}>
                  <Icon name="location" size={11} /> {lead.area || LEAD_AREA_UNSET_LABEL}
                </Chip>
                <Chip tone={STATUS_TONE[lead.status]}>{LEAD_STATUS_LABEL[lead.status]}</Chip>
                {lead.ownerFound ? (
                  <Chip tone="success">
                    <Icon name="check" size={11} /> 找到屋主
                  </Chip>
                ) : (
                  <Chip tone="neutral">還沒找到屋主</Chip>
                )}
              </div>

              <div className={styles.address}>
                {lead.address || <span className={styles.noAddress}>（還沒填地址，點開連結看到再補）</span>}
              </div>

              <div className={styles.metaRow}>
                {lead.source && <span>{lead.source}</span>}
                {lead.ownerName && <span>{lead.ownerName}</span>}
                {lead.ownerPhone && (
                  <a href={`tel:${lead.ownerPhone}`} onClick={(e) => e.stopPropagation()}>
                    <Icon name="mobile" size={11} /> {lead.ownerPhone}
                  </a>
                )}
              </div>

              {lead.sourceUrl && (
                <a
                  className={styles.linkBtn}
                  href={lead.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Icon name="externalLink" size={15} /> 開啟連結
                  <span className={styles.linkHost}>{hostLabel(lead.sourceUrl)}</span>
                </a>
              )}

              {/* 他最在意的四個日期，一排擺好、丟入與首次聯繫放最前面 */}
              <dl className={styles.dates}>
                <div>
                  <dt>丟入</dt>
                  <dd>
                    {lead.createdDay ? (
                      <>
                        <b>{fmtShort(lead.createdDay, today)}</b>
                        <small>{daysAgo(lead.createdDay, today)}</small>
                      </>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div>
                  <dt>首次聯繫</dt>
                  <dd>
                    {lead.firstContactAt ? (
                      <>
                        <b>{fmtShort(lead.firstContactAt, today)}</b>
                        <small>{daysAgo(lead.firstContactAt, today)}</small>
                      </>
                    ) : (
                      <span className={styles.notYet}>還沒聯繫</span>
                    )}
                  </dd>
                </div>
                {lead.lastContactAt && lead.lastContactAt !== lead.firstContactAt && (
                  <div>
                    <dt>最近</dt>
                    <dd>
                      <b>{fmtShort(lead.lastContactAt, today)}</b>
                      <small>{lead.contacts.length} 次</small>
                    </dd>
                  </div>
                )}
                {lead.nextFollowUpAt && (
                  <div>
                    <dt>下次</dt>
                    <dd>
                      {lead.nextFollowUpAt < today ? (
                        <b className={styles.overdue}>{fmtShort(lead.nextFollowUpAt, today)} 逾期</b>
                      ) : lead.nextFollowUpAt === today ? (
                        <b className={styles.dueToday}>今天</b>
                      ) : (
                        <b>{fmtShort(lead.nextFollowUpAt, today)}</b>
                      )}
                    </dd>
                  </div>
                )}
              </dl>

              {lead.contacts[0]?.feedback && <div className={styles.feedbackPreview}>最新回饋：{lead.contacts[0].feedback}</div>}
            </div>

            <div className={styles.cardBtns}>
              {!closed && (
                <button
                  type="button"
                  className={`${styles.iconBtn} ${styles.accent}`}
                  disabled={busy}
                  onClick={() => quickContact(lead, lead.status === "new" ? "contacted" : lead.status, "已記下今天聯繫過")}
                >
                  <Icon name="mobile" size={13} /> 今天聯繫了
                </button>
              )}
              <button
                type="button"
                className={`${styles.iconBtn} ${lead.ownerFound ? "" : styles.success}`}
                disabled={busy}
                onClick={() => toggleOwnerFound(lead)}
              >
                <Icon name={lead.ownerFound ? "undo" : "user"} size={13} /> {lead.ownerFound ? "改回還沒找到" : "找到屋主了"}
              </button>
            </div>
            <div className={styles.cardBtns}>
              {lead.status !== "signed_us" && (
                <button
                  type="button"
                  className={`${styles.iconBtn} ${styles.success}`}
                  disabled={busy}
                  onClick={() => quickContact(lead, "signed_us", "已標記為已簽約")}
                >
                  <Icon name="handshake" size={13} /> 已簽約
                </button>
              )}
              <button type="button" className={styles.iconBtn} onClick={() => startEdit(lead)}>
                <Icon name="edit" size={13} /> 編輯
              </button>
              <button
                type="button"
                className={`${styles.iconBtn} ${confirmDeleteLead === lead.id ? styles.dangerOn : styles.danger}`}
                disabled={busy}
                onClick={() => removeLead(lead.id)}
              >
                <Icon name="trash" size={13} /> {confirmDeleteLead === lead.id ? "再按一次刪除" : "刪除"}
              </button>
              <button type="button" className={styles.iconBtn} onClick={() => toggleExpand(lead)}>
                <Icon name={expandedId === lead.id ? "chevronUp" : "chevronDown"} size={13} /> 紀錄
                {lead.contacts.length > 0 ? `（${lead.contacts.length}）` : ""}
              </button>
            </div>

            {expandedId === lead.id && (
              <div className={styles.cardBody}>
                {lead.note && <p className={styles.note}>{lead.note}</p>}

                <div>
                  <p className={styles.sectionTitle}>追蹤紀錄（{lead.contacts.length}）</p>
                  {lead.contacts.length === 0 ? (
                    <p className={styles.empty} style={{ padding: "8px 4px" }}>
                      還沒有接洽紀錄，下面新增第一筆。
                    </p>
                  ) : (
                    <ul className={styles.timeline}>
                      {lead.contacts.map((c) => (
                        <li key={c.id} className={styles.timelineItem}>
                          <div className={styles.timelineDate}>
                            {fmtDay(c.contactedAt)}
                            {c.contactedTime && (
                              <>
                                <br />
                                {c.contactedTime}
                              </>
                            )}
                          </div>
                          <div className={styles.timelineBody}>
                            <div className={styles.timelineTop}>
                              <Chip tone={STATUS_TONE[c.resultStatus]}>{LEAD_STATUS_LABEL[c.resultStatus]}</Chip>
                              {c.method && <span className={styles.timelineMethod}>{c.method}</span>}
                            </div>
                            {c.feedback && <p className={styles.timelineFeedback}>{c.feedback}</p>}
                            {c.nextFollowUpAt && <div className={styles.timelineNext}>下次追蹤：{fmtDay(c.nextFollowUpAt)}</div>}
                          </div>
                          <button type="button" className={styles.timelineDel} disabled={busy} onClick={() => removeContact(c.id)}>
                            {confirmDeleteContact === c.id ? "確定？" : "刪除"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className={styles.addContactCard}>
                  <p className={styles.sectionTitle}>新增追蹤紀錄</p>
                  {renderContactForm(lead.id)}
                </div>
              </div>
            )}
          </>
        )}
      </li>
    );
  }

  return (
    <div className={styles.wrap}>
      {msg && <p className={`${styles.msg} ${msg.kind === "ok" ? styles.msgOk : styles.msgErr}`}>{msg.text}</p>}

      {/* ── 丟進來 ── */}
      <section className={styles.quickCard}>
        <p className={styles.sectionTitle}>丟進來（今天 {fmtDay(today)}）</p>
        <textarea
          className={styles.quickInput}
          rows={2}
          value={quickText}
          onChange={(e) => {
            setQuickText(e.target.value);
            setQuickArea(null);
          }}
          placeholder="貼 591／樂屋／FB 的連結，或直接打地址（例：清水區中山路 44-1 號）。連結跟地址可以一起貼。"
        />
        <div className={styles.quickRow}>
          <label className={styles.quickArea}>
            <span>區域</span>
            <select value={quickAreaValue} onChange={(e) => setQuickArea(e.target.value)}>
              <option value="">{quickText.trim() ? "認不出來，請選" : "（自動判定）"}</option>
              {LEAD_AREAS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.quickHint}>
            {quickParsed.sourceUrl && <span>連結：{hostLabel(quickParsed.sourceUrl)}（{quickParsed.source}）</span>}
            {quickParsed.address && <span>地址：{quickParsed.address}</span>}
          </div>
          <button type="button" className={styles.primaryBtn} disabled={busy || !quickText.trim()} onClick={quickAdd}>
            <Icon name="add" size={14} /> {busy ? "存檔中…" : "丟進來"}
          </button>
        </div>
      </section>

      {/* ── 區域 ── */}
      <div className={styles.areaBar}>
        <button
          type="button"
          className={`${styles.pill} ${styles.areaPill} ${areaFilter === "" ? styles.pillOn : ""}`}
          onClick={() => setAreaFilter("")}
        >
          全部區域 <small>{leads.length}</small>
        </button>
        {areaPills.map((a) => (
          <button
            key={a.key}
            type="button"
            className={`${styles.pill} ${styles.areaPill} ${areaFilter === a.key ? styles.pillOn : ""}`}
            onClick={() => setAreaFilter(a.key)}
          >
            {a.label} <small>{a.count}</small>
          </button>
        ))}
      </div>

      <div className={styles.toolbar}>
        <div className={styles.pills}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`${styles.pill} ${filter === f.key ? styles.pillOn : ""}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
          <input
            className={styles.search}
            type="text"
            placeholder="搜尋地址／區域／屋主／電話／連結"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className={styles.empty}>
          {leads.length === 0 ? "還沒有任何物件。上面貼一條連結或地址就開始了。" : "這個條件下沒有物件。"}
        </p>
      ) : (
        groups.map((g) => (
          <section key={g.key} className={styles.group}>
            {!areaFilter && (
              <h2 className={styles.groupTitle}>
                <Icon name="location" size={14} /> {g.label}
                <small>{g.items.length}</small>
                <button type="button" className={styles.groupLink} onClick={() => setAreaFilter(g.key)}>
                  只看這區
                </button>
              </h2>
            )}
            <ul className={styles.list}>{g.items.map(renderCard)}</ul>
          </section>
        ))
      )}
    </div>
  );
}

"use client";

/**
 * 開發物件追蹤後台的操作介面。
 *
 * 一筆卡片＝一個地址／591／樂屋案件。點卡片展開看追蹤紀錄時間線、
 * 加新的一筆。存檔／刪除都是 server action，改完 `router.refresh()`
 * 重讀 —— 畫面上看到的一律是資料庫真的有的東西（跟 /admin/match 同一套）。
 *
 * 物件「目前狀態」不是存出來的欄位，是清單資料裡 `status`（後台頁面算好才傳進來，
 * 見 lib/dev-leads.ts 檔頭）——這裡不用管怎麼算，拿到就是對的。
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CHIP, type ChipTone } from "@/app/admin/_components/cis";
import { Icon } from "@/app/admin/_ui/icons";
import {
  CONTACT_METHODS,
  CONTACT_RESULT_OPTIONS,
  LEAD_SOURCES,
  LEAD_STATUS_LABEL,
  type LeadStatus,
} from "@/config/dev-leads";
import { addContactAction, deleteContactAction, deleteLeadAction, saveLeadAction } from "@/lib/actions/dev-leads";
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
  source: string;
  sourceUrl: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
  note: string | null;
  createdAt: string | null;
  status: LeadStatus;
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

function FollowUpBadge({ date, today }: { date: string | null; today: string }) {
  if (!date) return null;
  if (date < today) return <span className={styles.overdue}>逾期未追蹤（{fmtDay(date)}）</span>;
  if (date === today) return <span className={styles.dueToday}>今天要追蹤</span>;
  return <span>下次追蹤 {fmtDay(date)}</span>;
}

type Filter = "all" | "new" | "due" | "interested" | "signed_us" | "lost";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "new", label: "待開發" },
  { key: "due", label: "待追蹤" },
  { key: "interested", label: "有意願" },
  { key: "signed_us", label: "已簽約" },
  { key: "lost", label: "已流失" },
];

type LeadDraft = {
  address: string;
  source: string;
  sourceUrl: string;
  ownerName: string;
  ownerPhone: string;
  note: string;
};

const EMPTY_LEAD_DRAFT: LeadDraft = { address: "", source: "", sourceUrl: "", ownerName: "", ownerPhone: "", note: "" };

function toDraft(l: AdminLead): LeadDraft {
  return {
    address: l.address,
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
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<LeadDraft>(EMPTY_LEAD_DRAFT);
  const [contactDraft, setContactDraft] = useState<ContactDraft>(() => emptyContactDraft(today));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [confirmDeleteLead, setConfirmDeleteLead] = useState<string | null>(null);
  const [confirmDeleteContact, setConfirmDeleteContact] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = leads;
    if (filter === "new") list = list.filter((l) => l.status === "new");
    else if (filter === "due") list = list.filter((l) => l.nextFollowUpAt && l.nextFollowUpAt <= dueSoonBy);
    else if (filter === "interested") list = list.filter((l) => l.status === "interested");
    else if (filter === "signed_us") list = list.filter((l) => l.status === "signed_us");
    else if (filter === "lost") list = list.filter((l) => l.status === "signed_other" || l.status === "rejected");

    const q = query.trim();
    if (q) list = list.filter((l) => `${l.address} ${l.ownerName ?? ""} ${l.ownerPhone ?? ""}`.includes(q));

    // 有排下次追蹤日的排前面（愈快到愈前面）；都沒有的話，最近有動作的排前面。
    // 兩種資料格式不同（YYYY-MM-DD vs ISO 時間戳）當字串比也只是同一天內的順序會抖動，不影響誰先誰後。
    return [...list].sort((a, b) => {
      const aKey = a.nextFollowUpAt ?? "9999-99-99";
      const bKey = b.nextFollowUpAt ?? "9999-99-99";
      if (aKey !== bKey) return aKey < bKey ? -1 : 1;
      const aAct = a.lastContactAt ?? a.createdAt ?? "";
      const bAct = b.lastContactAt ?? b.createdAt ?? "";
      if (aAct !== bAct) return aAct > bAct ? -1 : 1;
      return 0;
    });
  }, [leads, filter, query, dueSoonBy]);

  function setLeadField<K extends keyof LeadDraft>(key: K, value: LeadDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function setContactField<K extends keyof ContactDraft>(key: K, value: ContactDraft[K]) {
    setContactDraft((d) => ({ ...d, [key]: value }));
  }

  function startAdd() {
    setEditingId("new");
    setDraft(EMPTY_LEAD_DRAFT);
    setMsg(null);
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
    setBusy(true);
    setMsg(null);
    const wasNew = editingId === "new";
    const r = await saveLeadAction(wasNew ? null : editingId, draft);
    setBusy(false);
    if (!r.ok) {
      setMsg({ kind: "err", text: r.error ?? "存檔失敗" });
      return;
    }
    setEditingId(null);
    setMsg({ kind: "ok", text: "已存檔" });
    // 新增完直接展開，剛去談過的話可以馬上補第一筆追蹤紀錄
    if (wasNew && r.id) {
      setExpandedId(r.id);
      setContactDraft(emptyContactDraft(today));
    }
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
   * 卡片上的快速「已簽約」——不用開表單，直接補一筆結果是 signed_us 的紀錄。
   * 還是走 addContactAction，狀態一樣是「算出來的」，不會跟正常流程兜不起來；
   * 只是把「日期＝今天、其餘留空」這組預設值幫他先填好。
   */
  async function markSigned(leadId: string) {
    setBusy(true);
    setMsg(null);
    const r = await addContactAction({
      leadId,
      contactedAt: today,
      contactedTime: "",
      method: "",
      feedback: "",
      resultStatus: "signed_us",
      nextFollowUpAt: "",
    });
    setBusy(false);
    if (!r.ok) {
      setMsg({ kind: "err", text: r.error ?? "標記失敗" });
      return;
    }
    setMsg({ kind: "ok", text: "已標記為已簽約" });
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

  function renderLeadForm(isNew: boolean) {
    return (
      <div className={styles.form}>
        <div className={styles.formGrid}>
          <label style={{ gridColumn: "1 / -1" }}>
            <span>
              地址<em>必填</em>
            </span>
            <input
              type="text"
              value={draft.address}
              onChange={(e) => setLeadField("address", e.target.value)}
              placeholder="例：台中市清水區中山路 123 號"
            />
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
          <label>
            <span>來源連結</span>
            <input
              type="url"
              value={draft.sourceUrl}
              onChange={(e) => setLeadField("sourceUrl", e.target.value)}
              placeholder="591／樂屋網址，沒有可留空"
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
            {busy ? "存檔中…" : isNew ? "新增" : "儲存"}
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

  return (
    <div className={styles.wrap}>
      {msg && <p className={`${styles.msg} ${msg.kind === "ok" ? styles.msgOk : styles.msgErr}`}>{msg.text}</p>}

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
            placeholder="搜尋地址／屋主／電話"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {editingId !== "new" && (
          <button type="button" className={styles.primaryBtn} onClick={startAdd}>
            <Icon name="add" size={14} /> 新增開發物件
          </button>
        )}
      </div>

      {editingId === "new" && <div className={styles.formCard}>{renderLeadForm(true)}</div>}

      {filtered.length === 0 ? (
        <p className={styles.empty}>
          {leads.length === 0 ? "還沒有任何開發物件。按上面的「新增開發物件」開始記錄。" : "這個篩選條件下沒有物件。"}
        </p>
      ) : (
        <ul className={styles.list}>
          {filtered.map((lead) => (
            <li key={lead.id} className={styles.card}>
              {editingId === lead.id ? (
                renderLeadForm(false)
              ) : (
                <>
                  <div className={styles.cardHead} onClick={() => toggleExpand(lead)}>
                    <div className={styles.cardMain}>
                      <div className={styles.address}>
                        {lead.address}
                        <Chip tone={STATUS_TONE[lead.status]}>{LEAD_STATUS_LABEL[lead.status]}</Chip>
                      </div>
                      <div className={styles.metaRow}>
                        {lead.source && <span>{lead.source}</span>}
                        {lead.sourceUrl && (
                          <a href={lead.sourceUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                            物件連結 <Icon name="externalLink" size={11} />
                          </a>
                        )}
                        {lead.ownerName && <span>{lead.ownerName}</span>}
                        {lead.ownerPhone && (
                          <a href={`tel:${lead.ownerPhone}`} onClick={(e) => e.stopPropagation()}>
                            {lead.ownerPhone}
                          </a>
                        )}
                        <FollowUpBadge date={lead.nextFollowUpAt} today={today} />
                      </div>
                      {lead.contacts[0]?.feedback && (
                        <div className={styles.feedbackPreview}>最新回饋：{lead.contacts[0].feedback}</div>
                      )}
                    </div>
                    <div className={styles.cardBtns}>
                      {lead.status !== "signed_us" && (
                        <button
                          type="button"
                          className={`${styles.iconBtn} ${styles.success}`}
                          disabled={busy}
                          onClick={(e) => {
                            e.stopPropagation();
                            markSigned(lead.id);
                          }}
                        >
                          <Icon name="handshake" size={13} /> 已簽約
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.iconBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          startEdit(lead);
                        }}
                      >
                        <Icon name="edit" size={13} /> 編輯
                      </button>
                      <button
                        type="button"
                        className={`${styles.iconBtn} ${confirmDeleteLead === lead.id ? styles.dangerOn : styles.danger}`}
                        disabled={busy}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeLead(lead.id);
                        }}
                      >
                        <Icon name="trash" size={13} /> {confirmDeleteLead === lead.id ? "再按一次刪除" : "刪除"}
                      </button>
                    </div>
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
                                  {c.nextFollowUpAt && (
                                    <div className={styles.timelineNext}>下次追蹤：{fmtDay(c.nextFollowUpAt)}</div>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  className={styles.timelineDel}
                                  disabled={busy}
                                  onClick={() => removeContact(c.id)}
                                >
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
          ))}
        </ul>
      )}
    </div>
  );
}

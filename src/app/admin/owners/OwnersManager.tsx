"use client";

/**
 * 屋主建檔後台的操作介面（手機優先）。
 *
 * 一張卡片＝一位屋主。卡片上直接看到姓名、電話（一顆可以直接撥的大按鈕）、
 * 他的房子；點卡片展開看完整資料、房子清單、聯絡紀錄，並在卡片裡新增／編輯。
 *
 * 存檔／刪除都是 server action，改完 `router.refresh()` 重讀 —— 畫面上看到的
 * 一律是資料庫真的有的東西（跟 /admin/leads 同一套）。
 *
 * 操作結果的訊息印在**那一張卡片裡**，不是整頁最上面一行（長清單時整頁一行等於沒訊息）。
 * 只有「新增屋主」「整批匯入」這兩個不屬於任何卡片的動作，訊息才放在最上面。
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CHIP, type ChipTone } from "@/app/admin/_components/cis";
import { Icon } from "@/app/admin/_ui/icons";
import {
  OWNER_CONTACT_METHODS,
  OWNER_SOURCES,
  PROPERTY_KINDS,
  PROPERTY_STATUSES,
  PROPERTY_STATUS_LABEL,
  STALE_CONTACT_DAYS,
  type PropertyStatus,
} from "@/config/owners";
import {
  addContactLogAction,
  deleteContactLogAction,
  deleteOwnerAction,
  deletePropertyAction,
  importOwnersAction,
  saveOwnerAction,
  savePropertyAction,
} from "@/lib/actions/owners";
import { parseImportText } from "@/lib/owners-import";
import { phoneDigits } from "@/lib/owners-text";
import styles from "./owners-admin.module.css";

export type AdminProperty = {
  id: string;
  address: string;
  community: string | null;
  kind: string;
  layout: string | null;
  area: string | null;
  floor: string | null;
  status: PropertyStatus;
  dealDate: string | null;
  price: string | null;
  note: string | null;
};

export type AdminContactLog = {
  id: string;
  contactedAt: string;
  method: string;
  content: string;
};

export type AdminOwner = {
  id: string;
  name: string;
  phone: string | null;
  phone2: string | null;
  lineId: string | null;
  address: string | null;
  source: string;
  birthday: string | null;
  tags: string[];
  note: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastContactAt: string | null;
  properties: AdminProperty[];
  contacts: AdminContactLog[];
};

const STATUS_TONE: Record<PropertyStatus, ChipTone> = {
  listing: "warn",
  sold: "success",
  rented: "info",
  self_use: "neutral",
  expired: "danger",
  other: "neutral",
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

type Filter = "all" | "listing" | "sold" | "rented" | "stale" | "birthday";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "listing", label: "委託中" },
  { key: "sold", label: "已售出" },
  { key: "rented", label: "已出租" },
  { key: "stale", label: `${STALE_CONTACT_DAYS} 天沒聯絡` },
  { key: "birthday", label: "本月生日" },
];

type OwnerDraft = {
  name: string;
  phone: string;
  phone2: string;
  lineId: string;
  address: string;
  source: string;
  birthday: string;
  tags: string;
  note: string;
};

const EMPTY_OWNER: OwnerDraft = {
  name: "",
  phone: "",
  phone2: "",
  lineId: "",
  address: "",
  source: "",
  birthday: "",
  tags: "",
  note: "",
};

function toOwnerDraft(o: AdminOwner): OwnerDraft {
  return {
    name: o.name,
    phone: o.phone ?? "",
    phone2: o.phone2 ?? "",
    lineId: o.lineId ?? "",
    address: o.address ?? "",
    source: o.source,
    birthday: o.birthday ?? "",
    tags: o.tags.join(", "),
    note: o.note ?? "",
  };
}

type PropertyDraft = {
  address: string;
  community: string;
  kind: string;
  layout: string;
  area: string;
  floor: string;
  status: PropertyStatus;
  dealDate: string;
  price: string;
  note: string;
};

const EMPTY_PROPERTY: PropertyDraft = {
  address: "",
  community: "",
  kind: "",
  layout: "",
  area: "",
  floor: "",
  status: "listing",
  dealDate: "",
  price: "",
  note: "",
};

function toPropertyDraft(p: AdminProperty): PropertyDraft {
  return {
    address: p.address,
    community: p.community ?? "",
    kind: p.kind,
    layout: p.layout ?? "",
    area: p.area ?? "",
    floor: p.floor ?? "",
    status: p.status,
    dealDate: p.dealDate ?? "",
    price: p.price ?? "",
    note: p.note ?? "",
  };
}

type ContactDraft = { contactedAt: string; method: string; content: string };

function emptyContactDraft(today: string): ContactDraft {
  return { contactedAt: today, method: OWNER_CONTACT_METHODS[0], content: "" };
}

type Msg = { kind: "ok" | "err"; text: string };

/** 哪一張卡片正在編輯哪個東西 */
type PropertyEditing = { ownerId: string; propertyId: string | "new" } | null;

export default function OwnersManager({
  owners,
  today,
  staleBefore,
}: {
  owners: AdminOwner[];
  /** 台北時間今天，YYYY-MM-DD */
  today: string;
  /** 最近聯絡日早於這天就算「久未聯絡」 */
  staleBefore: string;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [ownerEditing, setOwnerEditing] = useState<string | "new" | null>(null);
  const [ownerDraft, setOwnerDraft] = useState<OwnerDraft>(EMPTY_OWNER);
  const [propEditing, setPropEditing] = useState<PropertyEditing>(null);
  const [propDraft, setPropDraft] = useState<PropertyDraft>(EMPTY_PROPERTY);
  const [contactDraft, setContactDraft] = useState<ContactDraft>(() => emptyContactDraft(today));
  const [contactOpenFor, setContactOpenFor] = useState<string | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");

  const [busy, setBusy] = useState(false);
  const [topMsg, setTopMsg] = useState<Msg | null>(null);
  const [cardMsg, setCardMsg] = useState<{ ownerId: string; msg: Msg } | null>(null);
  const [confirmDelOwner, setConfirmDelOwner] = useState<string | null>(null);
  const [confirmDelProp, setConfirmDelProp] = useState<string | null>(null);
  const [confirmDelContact, setConfirmDelContact] = useState<string | null>(null);

  const thisMonth = today.slice(5, 7);

  const filtered = useMemo(() => {
    let list = owners;
    if (filter === "listing") list = list.filter((o) => o.properties.some((p) => p.status === "listing"));
    else if (filter === "sold") list = list.filter((o) => o.properties.some((p) => p.status === "sold"));
    else if (filter === "rented") list = list.filter((o) => o.properties.some((p) => p.status === "rented"));
    else if (filter === "stale") list = list.filter((o) => !o.lastContactAt || o.lastContactAt < staleBefore);
    else if (filter === "birthday") list = list.filter((o) => o.birthday && o.birthday.slice(5, 7) === thisMonth);

    const q = query.trim();
    if (q) {
      const qDigits = phoneDigits(q);
      const qLower = q.toLowerCase();
      list = list.filter((o) => {
        // 電話：只要查詢字串本身有 3 碼以上數字，就拿「只留數字」的版本比，
        // 「0912345678」打得出「0912-345-678」，打「345678」也找得到。
        if (qDigits.length >= 3 && (phoneDigits(o.phone).includes(qDigits) || phoneDigits(o.phone2).includes(qDigits))) {
          return true;
        }
        const hay = [
          o.name,
          o.lineId ?? "",
          o.address ?? "",
          o.source,
          o.tags.join(" "),
          o.note ?? "",
          ...o.properties.flatMap((p) => [p.address, p.community ?? "", p.note ?? ""]),
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(qLower);
      });
    }
    return list;
  }, [owners, filter, query, staleBefore, thisMonth]);

  // ---------------------------------------------------------------- 共用

  function setOwnerField<K extends keyof OwnerDraft>(key: K, value: OwnerDraft[K]) {
    setOwnerDraft((d) => ({ ...d, [key]: value }));
  }
  function setPropField<K extends keyof PropertyDraft>(key: K, value: PropertyDraft[K]) {
    setPropDraft((d) => ({ ...d, [key]: value }));
  }
  function setContactField<K extends keyof ContactDraft>(key: K, value: ContactDraft[K]) {
    setContactDraft((d) => ({ ...d, [key]: value }));
  }

  function say(ownerId: string | null, msg: Msg) {
    if (ownerId) {
      setCardMsg({ ownerId, msg });
      setTopMsg(null);
    } else {
      setTopMsg(msg);
      setCardMsg(null);
    }
  }

  function toggleExpand(ownerId: string) {
    if (expandedId === ownerId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(ownerId);
    setPropEditing(null);
    setContactOpenFor(null);
    setConfirmDelProp(null);
    setConfirmDelContact(null);
    setConfirmDelOwner(null);
  }

  // ---------------------------------------------------------------- 屋主

  function startAddOwner() {
    setOwnerEditing("new");
    setOwnerDraft(EMPTY_OWNER);
    setImportOpen(false);
    setTopMsg(null);
  }

  function startEditOwner(o: AdminOwner) {
    setOwnerEditing(o.id);
    setOwnerDraft(toOwnerDraft(o));
    setCardMsg(null);
  }

  async function saveOwner() {
    const wasNew = ownerEditing === "new";
    const targetId = wasNew ? null : ownerEditing;
    setBusy(true);
    const r = await saveOwnerAction(targetId, ownerDraft);
    setBusy(false);
    if (!r.ok) {
      say(targetId, { kind: "err", text: r.error ?? "存檔失敗" });
      return;
    }
    setOwnerEditing(null);
    if (wasNew && r.id) {
      say(null, { kind: "ok", text: `已建檔「${ownerDraft.name.trim()}」，下面可以直接加他的房子。` });
      setExpandedId(r.id);
      setPropEditing({ ownerId: r.id, propertyId: "new" });
      setPropDraft(EMPTY_PROPERTY);
    } else {
      say(targetId, { kind: "ok", text: "已存檔" });
    }
    router.refresh();
  }

  async function removeOwner(id: string) {
    if (confirmDelOwner !== id) {
      setConfirmDelOwner(id);
      return;
    }
    setBusy(true);
    const r = await deleteOwnerAction(id);
    setBusy(false);
    setConfirmDelOwner(null);
    if (!r.ok) {
      say(id, { kind: "err", text: r.error ?? "刪除失敗" });
      return;
    }
    if (expandedId === id) setExpandedId(null);
    say(null, { kind: "ok", text: "已刪除這位屋主與他底下的房子、聯絡紀錄" });
    router.refresh();
  }

  // ---------------------------------------------------------------- 房子

  function startAddProperty(ownerId: string) {
    setPropEditing({ ownerId, propertyId: "new" });
    setPropDraft(EMPTY_PROPERTY);
    setCardMsg(null);
  }

  function startEditProperty(ownerId: string, p: AdminProperty) {
    setPropEditing({ ownerId, propertyId: p.id });
    setPropDraft(toPropertyDraft(p));
    setCardMsg(null);
  }

  async function saveProperty() {
    if (!propEditing) return;
    const { ownerId, propertyId } = propEditing;
    setBusy(true);
    const r = await savePropertyAction(propertyId === "new" ? null : propertyId, { ownerId, ...propDraft });
    setBusy(false);
    if (!r.ok) {
      say(ownerId, { kind: "err", text: r.error ?? "存檔失敗" });
      return;
    }
    setPropEditing(null);
    say(ownerId, { kind: "ok", text: propertyId === "new" ? "已加一間房子" : "房子資料已更新" });
    router.refresh();
  }

  async function removeProperty(ownerId: string, id: string) {
    if (confirmDelProp !== id) {
      setConfirmDelProp(id);
      return;
    }
    setBusy(true);
    const r = await deletePropertyAction(id);
    setBusy(false);
    setConfirmDelProp(null);
    if (!r.ok) {
      say(ownerId, { kind: "err", text: r.error ?? "刪除失敗" });
      return;
    }
    say(ownerId, { kind: "ok", text: "已刪除這間房子" });
    router.refresh();
  }

  // ---------------------------------------------------------------- 聯絡紀錄

  function startAddContact(ownerId: string) {
    setContactOpenFor(ownerId);
    setContactDraft(emptyContactDraft(today));
    setCardMsg(null);
  }

  async function submitContact(ownerId: string) {
    setBusy(true);
    const r = await addContactLogAction({ ownerId, ...contactDraft });
    setBusy(false);
    if (!r.ok) {
      say(ownerId, { kind: "err", text: r.error ?? "新增失敗" });
      return;
    }
    setContactOpenFor(null);
    setContactDraft(emptyContactDraft(today));
    say(ownerId, { kind: "ok", text: "已新增聯絡紀錄" });
    router.refresh();
  }

  async function removeContact(ownerId: string, id: string) {
    if (confirmDelContact !== id) {
      setConfirmDelContact(id);
      return;
    }
    setBusy(true);
    const r = await deleteContactLogAction(id);
    setBusy(false);
    setConfirmDelContact(null);
    if (!r.ok) {
      say(ownerId, { kind: "err", text: r.error ?? "刪除失敗" });
      return;
    }
    router.refresh();
  }

  // ---------------------------------------------------------------- 整批匯入

  const importPreview = useMemo(() => (importOpen ? parseImportText(importText) : []), [importOpen, importText]);
  const importBad = importPreview.filter((r) => r.error).length;

  async function runImport() {
    setBusy(true);
    const r = await importOwnersAction(importText);
    setBusy(false);
    if (!r.ok) {
      say(null, { kind: "err", text: r.error ?? "匯入失敗" });
      if (r.done) router.refresh();
      return;
    }
    setImportText("");
    setImportOpen(false);
    say(null, { kind: "ok", text: `已匯入 ${r.done ?? 0} 位屋主` });
    router.refresh();
  }

  // ---------------------------------------------------------------- 畫面片段

  function renderOwnerForm(isNew: boolean) {
    return (
      <div className={styles.form}>
        <div className={styles.formGrid}>
          <label>
            <span>
              屋主姓名<em>必填</em>
            </span>
            <input type="text" value={ownerDraft.name} onChange={(e) => setOwnerField("name", e.target.value)} placeholder="例：王先生、陳小姐" />
          </label>
          <label>
            <span>電話</span>
            <input type="tel" value={ownerDraft.phone} onChange={(e) => setOwnerField("phone", e.target.value)} placeholder="0912-345-678" />
          </label>
          <label>
            <span>第二電話</span>
            <input type="tel" value={ownerDraft.phone2} onChange={(e) => setOwnerField("phone2", e.target.value)} placeholder="市話／家人電話" />
          </label>
          <label>
            <span>LINE ID</span>
            <input type="text" value={ownerDraft.lineId} onChange={(e) => setOwnerField("lineId", e.target.value)} />
          </label>
          <label>
            <span>認識管道</span>
            <select value={ownerDraft.source} onChange={(e) => setOwnerField("source", e.target.value)}>
              <option value="">未分類</option>
              {OWNER_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>生日</span>
            <input type="date" value={ownerDraft.birthday} onChange={(e) => setOwnerField("birthday", e.target.value)} />
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            <span>聯絡地址</span>
            <input
              type="text"
              value={ownerDraft.address}
              onChange={(e) => setOwnerField("address", e.target.value)}
              placeholder="屋主本人住哪（房子的地址在下面「房子」另外加）"
            />
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            <span>標籤</span>
            <input
              type="text"
              value={ownerDraft.tags}
              onChange={(e) => setOwnerField("tags", e.target.value)}
              placeholder="逗號分開，例：投資客, 海線, 想換屋"
            />
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            <span>備註</span>
            <textarea
              rows={3}
              value={ownerDraft.note}
              onChange={(e) => setOwnerField("note", e.target.value)}
              placeholder="個性、喜好、家庭狀況、談價習慣…自己看的"
            />
          </label>
        </div>
        <div className={styles.formBtns}>
          <button type="button" className={styles.primaryBtn} disabled={busy} onClick={saveOwner}>
            {busy ? "存檔中…" : isNew ? "建檔" : "儲存"}
          </button>
          <button type="button" className={styles.plainBtn} disabled={busy} onClick={() => setOwnerEditing(null)}>
            取消
          </button>
        </div>
      </div>
    );
  }

  function renderPropertyForm(isNew: boolean) {
    return (
      <div className={styles.subCard}>
        <p className={styles.subCardTitle}>{isNew ? "加一間房子" : "編輯房子"}</p>
        <div className={styles.form}>
          <div className={styles.formGrid}>
            <label style={{ gridColumn: "1 / -1" }}>
              <span>
                地址<em>必填</em>
              </span>
              <input type="text" value={propDraft.address} onChange={(e) => setPropField("address", e.target.value)} placeholder="例：台中市沙鹿區中山路 123 號 5 樓" />
            </label>
            <label>
              <span>社區／建案名</span>
              <input type="text" value={propDraft.community} onChange={(e) => setPropField("community", e.target.value)} />
            </label>
            <label>
              <span>型態</span>
              <select value={propDraft.kind} onChange={(e) => setPropField("kind", e.target.value)}>
                <option value="">未分類</option>
                {PROPERTY_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>狀態</span>
              <select value={propDraft.status} onChange={(e) => setPropField("status", e.target.value as PropertyStatus)}>
                {PROPERTY_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {PROPERTY_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>委託／成交日</span>
              <input type="date" value={propDraft.dealDate} onChange={(e) => setPropField("dealDate", e.target.value)} />
            </label>
            <label>
              <span>格局</span>
              <input type="text" value={propDraft.layout} onChange={(e) => setPropField("layout", e.target.value)} placeholder="3房2廳2衛" />
            </label>
            <label>
              <span>坪數</span>
              <input type="text" value={propDraft.area} onChange={(e) => setPropField("area", e.target.value)} placeholder="登記 45.2 坪（含車位）" />
            </label>
            <label>
              <span>樓層</span>
              <input type="text" value={propDraft.floor} onChange={(e) => setPropField("floor", e.target.value)} placeholder="5F / 12F" />
            </label>
            <label>
              <span>價格</span>
              <input type="text" value={propDraft.price} onChange={(e) => setPropField("price", e.target.value)} placeholder="開價 1,280 萬／成交 1,180 萬" />
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              <span>備註</span>
              <textarea rows={2} value={propDraft.note} onChange={(e) => setPropField("note", e.target.value)} placeholder="屋況、鑰匙在哪、貸款銀行、買方是誰…" />
            </label>
          </div>
          <div className={styles.formBtns}>
            <button type="button" className={styles.primaryBtn} disabled={busy} onClick={saveProperty}>
              {busy ? "存檔中…" : isNew ? "新增房子" : "儲存"}
            </button>
            <button type="button" className={styles.plainBtn} disabled={busy} onClick={() => setPropEditing(null)}>
              取消
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderContactForm(ownerId: string) {
    return (
      <div className={styles.subCard}>
        <p className={styles.subCardTitle}>新增聯絡紀錄</p>
        <div className={styles.form}>
          <div className={styles.formGrid}>
            <label>
              <span>
                日期<em>必填</em>
              </span>
              <input type="date" value={contactDraft.contactedAt} onChange={(e) => setContactField("contactedAt", e.target.value)} />
            </label>
            <label>
              <span>方式</span>
              <select value={contactDraft.method} onChange={(e) => setContactField("method", e.target.value)}>
                {OWNER_CONTACT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              <span>
                聊了什麼<em>必填</em>
              </span>
              <textarea
                rows={2}
                value={contactDraft.content}
                onChange={(e) => setContactField("content", e.target.value)}
                placeholder="例：問他隔壁那戶要不要一起賣、說年底再看"
              />
            </label>
          </div>
          <div className={styles.formBtns}>
            <button type="button" className={styles.primaryBtn} disabled={busy} onClick={() => submitContact(ownerId)}>
              {busy ? "存檔中…" : "新增紀錄"}
            </button>
            <button type="button" className={styles.plainBtn} disabled={busy} onClick={() => setContactOpenFor(null)}>
              取消
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderImport() {
    return (
      <div className={styles.formCard}>
        <p className={styles.subCardTitle}>整批貼上建檔</p>
        <p className={styles.importHelp}>
          從 Excel、LINE 或筆記複製過來，<b>一行一位屋主</b>，欄位用 Tab、逗號或頓號分開，順序固定：
          <br />
          <code>姓名</code>　<code>電話</code>　<code>房子地址</code>　<code>社區名</code>　<code>備註</code>
          <br />
          只有姓名必填，後面缺幾欄都可以；有房子地址的會順便建一筆房子（狀態先標「其他」，之後再改）。
          電話跟地址放反會自動調回來。
        </p>
        <div className={styles.form}>
          <label>
            <span>貼在這裡</span>
            <textarea
              rows={8}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={"王先生\t0912-345-678\t沙鹿區中山路 123 號\t某某社區\t2024 年成交\n陳小姐\t0922-333-444"}
              spellCheck={false}
            />
          </label>

          {importPreview.length > 0 && (
            <>
              <p className={styles.count}>
                解析出 {importPreview.length} 筆
                {importBad > 0 ? `，其中 ${importBad} 筆有問題（紅字），要全部修好才會匯入` : "，看一下對不對再按匯入"}
              </p>
              <div className={styles.importTable}>
                <table>
                  <colgroup>
                    <col style={{ width: 40 }} />
                    <col style={{ width: 100 }} />
                    <col style={{ width: 120 }} />
                    <col />
                    <col style={{ width: 110 }} />
                    <col style={{ width: 120 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>行</th>
                      <th>姓名</th>
                      <th>電話</th>
                      <th>房子地址</th>
                      <th>社區</th>
                      <th>備註／問題</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.slice(0, 200).map((r) => (
                      <tr key={r.line} className={r.error ? styles.importBad : undefined} title={r.raw}>
                        <td>{r.line}</td>
                        <td>{r.owner.name || "—"}</td>
                        <td>{r.owner.phone || "—"}</td>
                        <td>{r.property?.address || "—"}</td>
                        <td>{r.property?.community || "—"}</td>
                        <td>{r.error ?? r.owner.note ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className={styles.formBtns}>
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={busy || importPreview.length === 0 || importBad > 0}
              onClick={runImport}
            >
              {busy ? "匯入中…" : `匯入 ${importPreview.length} 筆`}
            </button>
            <button type="button" className={styles.plainBtn} disabled={busy} onClick={() => setImportOpen(false)}>
              取消
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderCard(o: AdminOwner) {
    const open = expandedId === o.id;
    const stale = !o.lastContactAt || o.lastContactAt < staleBefore;
    const msg = cardMsg?.ownerId === o.id ? cardMsg.msg : null;

    if (ownerEditing === o.id) {
      return (
        <li key={o.id} className={`${styles.card} ${styles.cardOpen}`}>
          <p className={styles.subCardTitle}>編輯屋主</p>
          {renderOwnerForm(false)}
          {msg && <p className={`${styles.msg} ${styles.cardMsg} ${msg.kind === "ok" ? styles.msgOk : styles.msgErr}`}>{msg.text}</p>}
        </li>
      );
    }

    return (
      <li key={o.id} className={`${styles.card} ${open ? styles.cardOpen : ""}`}>
        <div className={styles.cardHead} onClick={() => toggleExpand(o.id)}>
          <div className={styles.cardMain}>
            <div className={styles.nameRow}>
              {o.name}
              {o.source && <Chip tone="neutral">{o.source}</Chip>}
              {o.tags.map((t) => (
                <span key={t} className={styles.tag}>
                  {t}
                </span>
              ))}
            </div>
            <div className={styles.metaRow}>
              <span>{o.properties.length} 間房子</span>
              {o.lineId && <span>LINE：{o.lineId}</span>}
              {o.lastContactAt ? (
                <span className={stale ? styles.stale : undefined}>最近聯絡 {fmtDay(o.lastContactAt)}</span>
              ) : (
                <span className={styles.stale}>還沒有聯絡紀錄</span>
              )}
            </div>
            {o.properties.length > 0 && (
              <div className={styles.propPreview}>
                {o.properties.slice(0, open ? 0 : 2).map((p) => (
                  <div key={p.id}>
                    <Chip tone={STATUS_TONE[p.status]}>{PROPERTY_STATUS_LABEL[p.status]}</Chip>
                    <span>{p.community ? `${p.community}｜` : ""}{p.address}</span>
                  </div>
                ))}
                {!open && o.properties.length > 2 && <div style={{ color: "#a69a97" }}>…還有 {o.properties.length - 2} 間，點開看</div>}
              </div>
            )}
          </div>
          {o.phone ? (
            <a className={styles.callBtn} href={`tel:${phoneDigits(o.phone)}`} onClick={(e) => e.stopPropagation()}>
              <Icon name="mobile" size={15} /> {o.phone}
            </a>
          ) : (
            <span className={styles.expandHint}>
              <Icon name={open ? "close" : "eye"} size={16} />
            </span>
          )}
        </div>

        {msg && <p className={`${styles.msg} ${styles.cardMsg} ${msg.kind === "ok" ? styles.msgOk : styles.msgErr}`}>{msg.text}</p>}

        {open && (
          <div className={styles.cardBody}>
            <div className={styles.detailGrid}>
              {o.phone && (
                <div>
                  <span>電話</span>
                  <a href={`tel:${phoneDigits(o.phone)}`}>{o.phone}</a>
                </div>
              )}
              {o.phone2 && (
                <div>
                  <span>第二電話</span>
                  <a href={`tel:${phoneDigits(o.phone2)}`}>{o.phone2}</a>
                </div>
              )}
              {o.lineId && (
                <div>
                  <span>LINE ID</span>
                  {o.lineId}
                </div>
              )}
              {o.address && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <span>聯絡地址</span>
                  {o.address}
                </div>
              )}
              {o.birthday && (
                <div>
                  <span>生日</span>
                  {fmtDay(o.birthday)}
                </div>
              )}
              {o.createdAt && (
                <div>
                  <span>建檔</span>
                  {o.createdAt.slice(0, 10).replaceAll("-", "/")}
                </div>
              )}
            </div>
            {o.note && <p className={styles.note}>{o.note}</p>}

            <div>
              <div className={styles.sectionHead}>
                <p className={styles.sectionTitle}>房子（{o.properties.length}）</p>
                {!(propEditing?.ownerId === o.id && propEditing.propertyId === "new") && (
                  <button type="button" className={styles.smallBtn} disabled={busy} onClick={() => startAddProperty(o.id)}>
                    <Icon name="add" size={13} /> 加一間房子
                  </button>
                )}
              </div>
              {propEditing?.ownerId === o.id && propEditing.propertyId === "new" && renderPropertyForm(true)}
              {o.properties.length === 0 && !(propEditing?.ownerId === o.id) ? (
                <p className={styles.empty} style={{ padding: "8px 4px" }}>
                  還沒有登記房子。
                </p>
              ) : (
                <ul className={styles.props} style={{ marginTop: propEditing?.ownerId === o.id ? 8 : 0 }}>
                  {o.properties.map((p) =>
                    propEditing?.ownerId === o.id && propEditing.propertyId === p.id ? (
                      <li key={p.id}>{renderPropertyForm(false)}</li>
                    ) : (
                      <li key={p.id} className={styles.prop}>
                        <div className={styles.propTop}>
                          <Chip tone={STATUS_TONE[p.status]}>{PROPERTY_STATUS_LABEL[p.status]}</Chip>
                          <span>{p.address}</span>
                        </div>
                        <div className={styles.propMeta}>
                          {p.community && <span>{p.community}</span>}
                          {p.kind && <span>{p.kind}</span>}
                          {p.layout && <span>{p.layout}</span>}
                          {p.area && <span>{p.area}</span>}
                          {p.floor && <span>{p.floor}</span>}
                          {p.price && (
                            <span>
                              <b>{p.price}</b>
                            </span>
                          )}
                          {p.dealDate && <span>{fmtDay(p.dealDate)}</span>}
                        </div>
                        {p.note && <p className={styles.propNote}>{p.note}</p>}
                        <div className={styles.propBtns}>
                          <button type="button" className={styles.textBtn} disabled={busy} onClick={() => startEditProperty(o.id, p)}>
                            編輯
                          </button>
                          <button
                            type="button"
                            className={`${styles.textBtn} ${confirmDelProp === p.id ? styles.textBtnDangerOn : styles.textBtnDanger}`}
                            disabled={busy}
                            onClick={() => removeProperty(o.id, p.id)}
                          >
                            {confirmDelProp === p.id ? "再按一次確定刪除" : "刪除"}
                          </button>
                        </div>
                      </li>
                    ),
                  )}
                </ul>
              )}
            </div>

            <div>
              <div className={styles.sectionHead}>
                <p className={styles.sectionTitle}>聯絡紀錄（{o.contacts.length}）</p>
                {contactOpenFor !== o.id && (
                  <button type="button" className={styles.smallBtn} disabled={busy} onClick={() => startAddContact(o.id)}>
                    <Icon name="add" size={13} /> 記一筆
                  </button>
                )}
              </div>
              {contactOpenFor === o.id && renderContactForm(o.id)}
              {o.contacts.length === 0 ? (
                contactOpenFor !== o.id && (
                  <p className={styles.empty} style={{ padding: "8px 4px" }}>
                    還沒有聯絡紀錄。打過電話、見過面就記一筆，下次翻出來才知道上次聊到哪。
                  </p>
                )
              ) : (
                <ul className={styles.timeline} style={{ marginTop: contactOpenFor === o.id ? 8 : 0 }}>
                  {o.contacts.map((c) => (
                    <li key={c.id} className={styles.timelineItem}>
                      <div className={styles.timelineDate}>{fmtDay(c.contactedAt)}</div>
                      <div className={styles.timelineBody}>
                        {c.method && <span className={styles.timelineMethod}>{c.method}</span>}
                        <p className={styles.timelineContent}>{c.content}</p>
                      </div>
                      <button
                        type="button"
                        className={`${styles.textBtn} ${confirmDelContact === c.id ? styles.textBtnDangerOn : styles.textBtnDanger}`}
                        disabled={busy}
                        onClick={() => removeContact(o.id, c.id)}
                      >
                        {confirmDelContact === c.id ? "確定？" : "刪除"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className={styles.cardBtns}>
              <button type="button" className={styles.iconBtn} disabled={busy} onClick={() => startEditOwner(o)}>
                <Icon name="edit" size={13} /> 編輯屋主資料
              </button>
              {o.phone && (
                <a className={styles.iconBtn} href={`sms:${phoneDigits(o.phone)}`}>
                  <Icon name="chat" size={13} /> 傳簡訊
                </a>
              )}
              <button
                type="button"
                className={`${styles.iconBtn} ${confirmDelOwner === o.id ? styles.dangerOn : styles.danger}`}
                disabled={busy}
                onClick={() => removeOwner(o.id)}
              >
                <Icon name="trash" size={13} /> {confirmDelOwner === o.id ? "再按一次：連房子、紀錄一起刪" : "刪除屋主"}
              </button>
              <button type="button" className={styles.iconBtn} onClick={() => setExpandedId(null)}>
                收合
              </button>
            </div>
          </div>
        )}
      </li>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <div className={styles.searchRow}>
          <input
            className={styles.search}
            type="search"
            inputMode="search"
            placeholder="搜姓名／電話／地址／社區／標籤"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className={styles.toolbarBtns}>
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
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.plainBtn} disabled={importOpen} onClick={() => { setImportOpen(true); setOwnerEditing(null); setTopMsg(null); }}>
              <Icon name="upload" size={14} /> 整批貼上
            </button>
            <button type="button" className={styles.primaryBtn} disabled={ownerEditing === "new"} onClick={startAddOwner}>
              <Icon name="add" size={14} /> 新增屋主
            </button>
          </div>
        </div>
      </div>

      {topMsg && <p className={`${styles.msg} ${topMsg.kind === "ok" ? styles.msgOk : styles.msgErr}`}>{topMsg.text}</p>}

      {importOpen && renderImport()}

      {ownerEditing === "new" && (
        <div className={styles.formCard}>
          <p className={styles.subCardTitle}>新增屋主</p>
          {renderOwnerForm(true)}
        </div>
      )}

      {owners.length > 0 && (
        <p className={styles.count}>
          {query.trim() || filter !== "all" ? `符合的 ${filtered.length} 位（共 ${owners.length} 位）` : `共 ${owners.length} 位屋主`}
        </p>
      )}

      {filtered.length === 0 ? (
        <p className={styles.empty}>
          {owners.length === 0
            ? "還沒有任何屋主。按「新增屋主」一筆一筆建，或按「整批貼上」把現有的名單一次倒進來。"
            : "這個條件下沒有屋主。"}
        </p>
      ) : (
        <ul className={styles.list}>{filtered.map((o) => renderCard(o))}</ul>
      )}
    </div>
  );
}

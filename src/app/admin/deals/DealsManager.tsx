"use client";

/**
 * 「成交紀錄」分頁：搜尋／篩選、新增表單、一筆一張卡。
 *
 * 卡片排法照他原本的 Excel：上排日期／方式／社區／地址，下排五個數字
 * （成交金額／服務費總額／％數／分得點數／達成業績），客戶資料展開才看。
 *
 * - 訊息印在那一張卡片上（learning_silent_failure_pattern：整頁一行訊息等於沒訊息）。
 * - 服務費％數、達成業績「空白＝自動算」，框裡的灰字就是會存進去的數字。
 * - 客戶端只能 import deals-text／owners-text（lib/deals.ts 有 Prisma）。
 */
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CHIP, type ChipTone } from "@/app/admin/_components/cis";
import { DEAL_METHODS, DEAL_METHOD_LABEL, type DealMethod } from "@/config/deals";
import { deleteDealAction, saveDealAction } from "@/lib/actions/deals";
import { calcFeePct, calcPerf, dealYears, fmtNum, fmtWan, parseNum, sumDeals } from "@/lib/deals-text";
import { parseDateInput, phoneDigits, toRoc } from "@/lib/owners-text";
import styles from "./deals-admin.module.css";

export type AdminParty = { name: string | null; phone: string | null; birthday: string | null; idNo: string | null; address: string | null };

export type AdminDeal = {
  id: string;
  dealDate: string;
  method: DealMethod;
  partner: string | null;
  objectNo: string | null;
  address: string | null;
  community: string | null;
  priceWan: number | null;
  feeWan: number | null;
  feePct: number | null;
  points: number | null;
  perfWan: number | null;
  buyer: AdminParty;
  seller: AdminParty;
  note: string | null;
};

type PartyDraft = { name: string; phone: string; birthday: string; idNo: string; address: string };

type Draft = {
  dealDate: string;
  method: DealMethod;
  partner: string;
  objectNo: string;
  address: string;
  community: string;
  priceWan: string;
  feeWan: string;
  feePct: string;
  points: string;
  perfWan: string;
  buyer: PartyDraft;
  seller: PartyDraft;
  note: string;
};

const METHOD_TONE: Record<DealMethod, ChipTone> = { dev: "info", sale: "warn", both: "success" };

const emptyParty = (): PartyDraft => ({ name: "", phone: "", birthday: "", idNo: "", address: "" });

function emptyDraft(today: string): Draft {
  return {
    dealDate: today,
    method: "dev",
    partner: "",
    objectNo: "",
    address: "",
    community: "",
    priceWan: "",
    feeWan: "",
    feePct: "",
    points: "",
    perfWan: "",
    buyer: emptyParty(),
    seller: emptyParty(),
    note: "",
  };
}

const s = (n: number | null) => (n == null ? "" : String(n));

function partyDraft(p: AdminParty): PartyDraft {
  return { name: p.name ?? "", phone: p.phone ?? "", birthday: p.birthday ?? "", idNo: p.idNo ?? "", address: p.address ?? "" };
}

/** 存的數字跟自動算的一樣 → 帶進表單時留空（之後他改服務費，％數與業績才會跟著動） */
function draftFrom(d: AdminDeal): Draft {
  const autoPct = calcFeePct(d.priceWan, d.feeWan);
  const autoPerf = calcPerf(d.feeWan, d.points);
  return {
    dealDate: d.dealDate,
    method: d.method,
    partner: d.partner ?? "",
    objectNo: d.objectNo ?? "",
    address: d.address ?? "",
    community: d.community ?? "",
    priceWan: s(d.priceWan),
    feeWan: s(d.feeWan),
    feePct: d.feePct === autoPct ? "" : s(d.feePct),
    points: s(d.points),
    perfWan: d.perfWan === autoPerf ? "" : s(d.perfWan),
    buyer: partyDraft(d.buyer),
    seller: partyDraft(d.seller),
    note: d.note ?? "",
  };
}

function Chip({ tone, children }: { tone: ChipTone; children: React.ReactNode }) {
  const c = CHIP[tone];
  return (
    <span className={styles.chip} style={{ background: c.bg, color: c.color, borderColor: c.border }}>
      {children}
    </span>
  );
}

/**
 * 民國年日期欄（跟屋主建檔同一套行為）：外面拿到的永遠是 ISO，框裡顯示與手打都是民國，
 * 打西元也收；打到一半不合法只標紅、不清掉他打的字。
 */
function RocDateInput({ value, onChange, placeholder = "115/11/02" }: { value: string; onChange: (iso: string) => void; placeholder?: string }) {
  const [text, setText] = useState(() => toRoc(value));
  const [bad, setBad] = useState(false);
  useEffect(() => {
    if (parseDateInput(text) !== value) {
      setText(toRoc(value));
      setBad(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      type="text"
      inputMode="numeric"
      value={text}
      placeholder={placeholder}
      className={bad ? styles.inputBad : undefined}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        const iso = parseDateInput(t);
        if (iso === null) {
          setBad(t.trim() !== "");
        } else {
          setBad(false);
          onChange(iso);
        }
      }}
      onBlur={() => {
        const iso = parseDateInput(text);
        if (iso) setText(toRoc(iso));
      }}
    />
  );
}

type Msg = { kind: "ok" | "err"; text: string };

function DealForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  pending,
  msg,
  isNew,
}: {
  draft: Draft;
  setDraft: (fn: (d: Draft) => Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  pending: boolean;
  msg: Msg | null;
  isNew: boolean;
}) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setParty = (who: "buyer" | "seller", key: keyof PartyDraft, value: string) =>
    setDraft((d) => ({ ...d, [who]: { ...d[who], [key]: value } }));

  const price = parseNum(draft.priceWan);
  const fee = parseNum(draft.feeWan);
  const points = parseNum(draft.points);
  const ok = (n: number | null) => (n != null && !Number.isNaN(n) ? n : null);
  const autoPct = calcFeePct(ok(price), ok(fee));
  const autoPerf = calcPerf(ok(fee), ok(points));
  const perfShown = draft.perfWan.trim() ? ok(parseNum(draft.perfWan)) : autoPerf;

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <p className={styles.formTitle}>{isNew ? "新增一筆成交" : "修改這筆成交"}</p>

      <div className={styles.grid4}>
        <label>
          <span>成交日期（民國）＊</span>
          <RocDateInput value={draft.dealDate} onChange={(iso) => set("dealDate", iso)} />
        </label>
        <label>
          <span>成交方式＊</span>
          <select value={draft.method} onChange={(e) => set("method", e.target.value as DealMethod)}>
            {DEAL_METHODS.map((m) => (
              <option key={m} value={m}>
                {DEAL_METHOD_LABEL[m]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>合作業務</span>
          <input type="text" value={draft.partner} onChange={(e) => set("partner", e.target.value)} />
        </label>
        <label>
          <span>物件編號</span>
          <input type="text" value={draft.objectNo} onChange={(e) => set("objectNo", e.target.value)} />
        </label>
      </div>

      <div className={styles.grid2}>
        <label>
          <span>物件地址</span>
          <input type="text" value={draft.address} onChange={(e) => set("address", e.target.value)} />
        </label>
        <label>
          <span>社區</span>
          <input type="text" value={draft.community} onChange={(e) => set("community", e.target.value)} />
        </label>
      </div>

      <div className={styles.grid5}>
        <label>
          <span>成交金額（萬）＊</span>
          <input type="text" inputMode="decimal" value={draft.priceWan} placeholder="1288" onChange={(e) => set("priceWan", e.target.value)} />
        </label>
        <label>
          <span>服務費總額（萬）</span>
          <input type="text" inputMode="decimal" value={draft.feeWan} placeholder="59.32" onChange={(e) => set("feeWan", e.target.value)} />
        </label>
        <label>
          <span>服務費％數</span>
          <input
            type="text"
            inputMode="decimal"
            value={draft.feePct}
            placeholder={autoPct != null ? `${fmtNum(autoPct, 3)}（自動算）` : "空白＝自動算"}
            onChange={(e) => set("feePct", e.target.value)}
          />
        </label>
        <label>
          <span>分得點數</span>
          <input type="text" inputMode="decimal" value={draft.points} placeholder="3" onChange={(e) => set("points", e.target.value)} />
        </label>
        <label>
          <span>達成業績（萬）</span>
          <input
            type="text"
            inputMode="decimal"
            value={draft.perfWan}
            placeholder={autoPerf != null ? `${fmtNum(autoPerf)}（自動算）` : "空白＝自動算"}
            onChange={(e) => set("perfWan", e.target.value)}
          />
        </label>
      </div>
      <p className={styles.hint}>
        達成業績：<b>{perfShown != null ? fmtWan(perfShown) : "—"}</b>
        　％數與達成業績空白就自動算（％數＝服務費 ÷ 成交金額；業績＝服務費 × 點數 ÷ 10），要自己填也可以。
      </p>

      {(["seller", "buyer"] as const).map((who) => (
        <fieldset key={who} className={styles.party}>
          <legend>{who === "seller" ? "賣方" : "買方"}</legend>
          <div className={styles.grid4}>
            <label>
              <span>姓名</span>
              <input type="text" value={draft[who].name} onChange={(e) => setParty(who, "name", e.target.value)} />
            </label>
            <label>
              <span>電話</span>
              <input type="tel" value={draft[who].phone} onChange={(e) => setParty(who, "phone", e.target.value)} />
            </label>
            <label>
              <span>生日（民國）</span>
              <RocDateInput value={draft[who].birthday} onChange={(iso) => setParty(who, "birthday", iso)} placeholder="71/07/18" />
            </label>
            <label>
              <span>身分證字號</span>
              <input type="text" autoCapitalize="characters" value={draft[who].idNo} onChange={(e) => setParty(who, "idNo", e.target.value)} />
            </label>
          </div>
          <label>
            <span>住址</span>
            <input type="text" value={draft[who].address} onChange={(e) => setParty(who, "address", e.target.value)} />
          </label>
        </fieldset>
      ))}

      <label>
        <span>備註</span>
        <textarea rows={2} value={draft.note} onChange={(e) => set("note", e.target.value)} />
      </label>

      {msg && <p className={`${styles.msg} ${msg.kind === "ok" ? styles.msgOk : styles.msgErr}`}>{msg.text}</p>}

      <div className={styles.formActions}>
        <button type="submit" className={styles.primaryBtn} disabled={pending}>
          {pending ? "儲存中…" : isNew ? "儲存這筆成交" : "儲存修改"}
        </button>
        <button type="button" className={styles.ghostBtn} onClick={onCancel} disabled={pending}>
          取消
        </button>
      </div>
    </form>
  );
}

function PartyBlock({ label, p }: { label: string; p: AdminParty }) {
  const empty = !p.name && !p.phone && !p.birthday && !p.idNo && !p.address;
  return (
    <div className={styles.partyView}>
      <b>{label}</b>
      {empty ? (
        <span className={styles.mute}>沒填</span>
      ) : (
        <dl>
          <dt>姓名</dt>
          <dd>{p.name ?? "—"}</dd>
          <dt>電話</dt>
          <dd>{p.phone ? <a href={`tel:${phoneDigits(p.phone)}`}>{p.phone}</a> : "—"}</dd>
          <dt>生日</dt>
          <dd>{p.birthday ? `民國 ${toRoc(p.birthday)}` : "—"}</dd>
          <dt>身分證字號</dt>
          <dd>{p.idNo ?? "—"}</dd>
          <dt>住址</dt>
          <dd>{p.address ?? "—"}</dd>
        </dl>
      )}
    </div>
  );
}

export default function DealsManager({ deals, today }: { deals: AdminDeal[]; today: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [year, setYear] = useState<string>("all");
  const [method, setMethod] = useState<DealMethod | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  /** "new"＝最上面的新增表單；其他＝正在改的那筆 id */
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(today));
  const [formMsg, setFormMsg] = useState<Msg | null>(null);
  const [cardMsg, setCardMsg] = useState<{ id: string; msg: Msg } | null>(null);
  const [topMsg, setTopMsg] = useState<Msg | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const statRows = useMemo(
    () => deals.map((d) => ({ day: d.dealDate, method: d.method, priceWan: d.priceWan, feeWan: d.feeWan, perfWan: d.perfWan })),
    [deals],
  );
  const years = useMemo(() => dealYears(statRows, today), [statRows, today]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qDigits = phoneDigits(q);
    return deals.filter((d) => {
      if (year !== "all" && d.dealDate.slice(0, 4) !== year) return false;
      if (method !== "all" && d.method !== method) return false;
      if (!q) return true;
      const hay = [d.address, d.community, d.objectNo, d.partner, d.buyer.name, d.seller.name, d.note, toRoc(d.dealDate)]
        .filter(Boolean)
        .join("\n")
        .toLowerCase();
      if (hay.includes(q)) return true;
      // 電話比對先去掉非數字：打 0912345678 找得到 0912-345-678
      return qDigits.length >= 4 && [d.buyer.phone, d.seller.phone].some((p) => phoneDigits(p).includes(qDigits));
    });
  }, [deals, query, year, method]);

  const shownSum = useMemo(
    () => sumDeals(shown.map((d) => ({ day: d.dealDate, method: d.method, priceWan: d.priceWan, feeWan: d.feeWan, perfWan: d.perfWan }))),
    [shown],
  );

  function startNew() {
    setDraft(emptyDraft(today));
    setEditing("new");
    setFormMsg(null);
    setTopMsg(null);
  }

  function startEdit(d: AdminDeal) {
    setDraft(draftFrom(d));
    setEditing(d.id);
    setExpandedId(d.id);
    setFormMsg(null);
    setCardMsg(null);
  }

  function save() {
    if (!draft.dealDate) {
      setFormMsg({ kind: "err", text: "成交日期看不懂，請打像 115/11/2 這樣" });
      return;
    }
    const id = editing === "new" ? null : editing;
    startTransition(async () => {
      const r = await saveDealAction(id, draft);
      if (!r.ok) {
        setFormMsg({ kind: "err", text: r.error ?? "儲存失敗" });
        return;
      }
      setEditing(null);
      setFormMsg(null);
      if (id) setCardMsg({ id, msg: { kind: "ok", text: "已儲存修改" } });
      else {
        setTopMsg({ kind: "ok", text: `已新增：${toRoc(draft.dealDate)} ${draft.community || draft.address}` });
        // 新的那筆要看得到：篩選擋住就等於「存了但不見了」
        setQuery("");
        setYear("all");
        setMethod("all");
        if (r.id) setExpandedId(r.id);
      }
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const r = await deleteDealAction(id);
      setConfirmDelete(null);
      if (!r.ok) {
        setCardMsg({ id, msg: { kind: "err", text: r.error ?? "刪除失敗" } });
        return;
      }
      setTopMsg({ kind: "ok", text: "已刪除那筆成交" });
      router.refresh();
    });
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <div className={styles.searchRow}>
          <input
            type="search"
            className={styles.search}
            value={query}
            placeholder="搜尋地址、社區、物件編號、買賣方姓名或電話、合作業務"
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" className={styles.primaryBtn} onClick={startNew} disabled={editing === "new"}>
            ＋ 新增成交
          </button>
        </div>
        <div className={styles.filterRow}>
          <select className={styles.yearSelect} value={year} onChange={(e) => setYear(e.target.value)} aria-label="年度">
            <option value="all">全部年度</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {Number(y) - 1911} 年
              </option>
            ))}
          </select>
          {(["all", ...DEAL_METHODS] as const).map((m) => (
            <button key={m} type="button" className={`${styles.pill} ${method === m ? styles.pillOn : ""}`} onClick={() => setMethod(m)}>
              {m === "all" ? "全部" : DEAL_METHOD_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      {topMsg && <p className={`${styles.msg} ${topMsg.kind === "ok" ? styles.msgOk : styles.msgErr}`}>{topMsg.text}</p>}

      {editing === "new" && (
        <DealForm draft={draft} setDraft={setDraft} onSave={save} onCancel={() => setEditing(null)} pending={pending} msg={formMsg} isNew />
      )}

      <p className={styles.count}>
        {shown.length} 件{shown.length !== deals.length ? `（共 ${deals.length} 件）` : ""}
        ｜成交金額 <b>{fmtWan(shownSum.priceWan)}</b>｜服務費 <b>{fmtWan(shownSum.feeWan)}</b>｜達成業績 <b>{fmtWan(shownSum.perfWan)}</b>
      </p>

      {deals.length === 0 && editing !== "new" ? (
        <p className={styles.empty}>還沒有成交紀錄。按右上角「＋ 新增成交」建第一筆。</p>
      ) : shown.length === 0 ? (
        <p className={styles.empty}>沒有符合的成交。換個關鍵字，或把年度／成交方式改回「全部」。</p>
      ) : (
        <ul className={styles.list}>
          {shown.map((d) => {
            const open = expandedId === d.id;
            const isEditing = editing === d.id;
            return (
              <li key={d.id} className={styles.card}>
                <div className={styles.cardHead}>
                  <span className={styles.date}>{toRoc(d.dealDate)}</span>
                  <Chip tone={METHOD_TONE[d.method]}>{DEAL_METHOD_LABEL[d.method]}</Chip>
                  {d.community && <b className={styles.community}>{d.community}</b>}
                  {d.address && <span className={styles.address}>{d.address}</span>}
                  {d.objectNo && <span className={styles.objectNo}>{d.objectNo}</span>}
                </div>

                <dl className={styles.nums}>
                  <div>
                    <dt>成交金額</dt>
                    <dd>{fmtWan(d.priceWan)}</dd>
                  </div>
                  <div>
                    <dt>服務費總額</dt>
                    <dd>{fmtWan(d.feeWan)}</dd>
                  </div>
                  <div>
                    <dt>服務費％數</dt>
                    <dd>{d.feePct != null ? `${fmtNum(d.feePct, 3)}%` : "—"}</dd>
                  </div>
                  <div>
                    <dt>分得點數</dt>
                    <dd>{fmtNum(d.points)}</dd>
                  </div>
                  <div className={styles.perf}>
                    <dt>達成業績</dt>
                    <dd>{fmtWan(d.perfWan)}</dd>
                  </div>
                </dl>

                <div className={styles.cardFoot}>
                  <span className={styles.people}>
                    賣方 {d.seller.name ?? "—"}｜買方 {d.buyer.name ?? "—"}
                    {d.partner ? `｜合作業務 ${d.partner}` : ""}
                  </span>
                  <span className={styles.actions}>
                    <button type="button" className={styles.textBtn} onClick={() => setExpandedId(open ? null : d.id)}>
                      {open ? "收起" : "客戶資料"}
                    </button>
                    <button type="button" className={styles.textBtn} onClick={() => startEdit(d)} disabled={pending}>
                      編輯
                    </button>
                    {confirmDelete === d.id ? (
                      <>
                        <button type="button" className={`${styles.textBtn} ${styles.dangerBtn}`} onClick={() => remove(d.id)} disabled={pending}>
                          確定刪除
                        </button>
                        <button type="button" className={styles.textBtn} onClick={() => setConfirmDelete(null)}>
                          不刪
                        </button>
                      </>
                    ) : (
                      <button type="button" className={styles.textBtn} onClick={() => setConfirmDelete(d.id)} disabled={pending}>
                        刪除
                      </button>
                    )}
                  </span>
                </div>

                {cardMsg?.id === d.id && (
                  <p className={`${styles.msg} ${styles.cardMsg} ${cardMsg.msg.kind === "ok" ? styles.msgOk : styles.msgErr}`}>{cardMsg.msg.text}</p>
                )}

                {isEditing ? (
                  <DealForm
                    draft={draft}
                    setDraft={setDraft}
                    onSave={save}
                    onCancel={() => setEditing(null)}
                    pending={pending}
                    msg={formMsg}
                    isNew={false}
                  />
                ) : (
                  open && (
                    <div className={styles.detail}>
                      <PartyBlock label="賣方" p={d.seller} />
                      <PartyBlock label="買方" p={d.buyer} />
                      {d.note && (
                        <p className={styles.note}>
                          <b>備註</b>
                          {d.note}
                        </p>
                      )}
                    </div>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

"use client";
/**
 * 同事授權碼的清單與操作。動作都是 server action（每個都先擋權限），做完 router.refresh() 重抓清單。
 * 2026-10-05 起一人一組、綁一台（外掛 1.6.4 起，他拍板）：新增＝一位同事（名字＋到期日，上限固定 1 台）；
 * 清單看每個人綁了沒、上架幾次；「解除綁定」給換電腦用。
 * 舊的共用碼（上限 > 1，9/11～10/04 發的）標「舊的共用碼」、保留原本的上限欄與「重設電腦清單」，跑到到期或他按停用。
 * 2026-10-13 他說「同一天產出的授權碼統一列一條，不然後台一大長串」：清單先依建立日（台灣）分組，同一天 2 組以上就先收成一條
 * （幾組、綁了幾個、到期日、上架幾次、前幾個名字），點那條才展開每個人；只有 1 組的那天直接顯示那一列。
 * 新增成功後把「私訊給那位同事的 LINE 訊息」整段組好，他按一顆複製就能貼。
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  createLicenseAction,
  deleteLicenseAction,
  resetInstallsAction,
  revokeLicenseAction,
  setLicenseExpiresAction,
  setLicenseMaxInstallsAction,
} from "@/lib/actions/ext-license";
import { isPersonalLicense } from "@/lib/ext-license-core";
import styles from "../post591.module.css";
import k from "./keys.module.css";

export type LicenseView = {
  id: string;
  key: string;
  /** 一人一組：同事名字（舊的共用碼是批次名稱） */
  name: string;
  /** 登記過的 Chrome 台數（一人一組的碼：0＝還沒綁、1＝已綁定）／其中上架過的台數／上限（1＝一人一組） */
  installs: number;
  launchedInstalls: number;
  maxInstalls: number;
  lastSeenAt: string | null;
  lastVersion: string | null;
  /** 按「上架」的總次數（外掛按上架時回報一次）與最近一次 */
  launchCount: number;
  lastLaunchAt: string | null;
  /** 台灣日期 YYYY-MM-DD */
  expiresDate: string;
  expired: boolean;
  revoked: boolean;
  createdAt: string;
};

/** 一台登記過的 Chrome（明細用；沒有名字，只有時間與次數） */
export type InstallView = {
  id: string;
  firstSeenAt: string;
  lastSeenAt: string;
  lastVersion: string | null;
  launchCount: number;
  lastLaunchAt: string | null;
};

type Result = { ok: boolean; error?: string };

/** ISO 時刻 → 台灣時間 YYYY-MM-DD HH:mm */
function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16).replace("T", " ");
}
/** ISO 時刻 → 台灣日期 YYYY-MM-DD（分組用） */
const twDate = (iso: string) => fmt(iso).slice(0, 10);

/** 私訊給那位同事的訊息（他複製貼 LINE 就好）。一人一組，所以是私訊、不是群組 */
function colleagueMessage(name: string, key: string, expiresDate: string): string {
  return [
    `${name}，這是你自己的 591／樂屋刊登助手授權碼（一人一組，只能在一台電腦用）：`,
    key,
    "打開外掛 → 右上「⚙ 我的資料」→ 貼在最上面「授權碼」那格 → 按儲存，出現綠色「✅ 授權有效」就能用。",
    `有效到 ${expiresDate}。第一台貼了就綁定那台電腦；要換電腦先跟我說，我在後台解除綁定。不要給別人用，別人貼了你自己就不能用。`,
  ].join("\n");
}

function statusOf(r: LicenseView): { text: string; cls: string } {
  if (r.revoked) return { text: "⛔ 已停用", cls: k.bad };
  if (r.expired) return { text: "⌛ 已到期", cls: k.bad };
  if (isPersonalLicense(r)) return r.installs > 0 ? { text: "🔗 已綁定", cls: k.ok } : { text: "🕓 還沒綁", cls: k.mute };
  if (r.installs > 0) return { text: "✅ 使用中（共用碼）", cls: k.ok };
  return { text: "🕓 還沒有人啟用", cls: k.mute };
}

type DayGroup = { date: string; rows: LicenseView[] };

/** 依建立日（台灣）分組；rows 從伺服器來已是新→舊，組內維持那個順序，組也新→舊 */
function groupByDay(rows: LicenseView[]): DayGroup[] {
  const map = new Map<string, LicenseView[]>();
  for (const r of rows) {
    const d = twDate(r.createdAt);
    const list = map.get(d);
    if (list) list.push(r);
    else map.set(d, [r]);
  }
  return [...map.entries()].map(([date, list]) => ({ date, rows: list })).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** 群組那一條的摘要文字：幾組、綁了幾個、停用／到期幾個、到期日、上架幾次 */
function groupSummary(g: DayGroup): string {
  const live = g.rows.filter((r) => !r.revoked && !r.expired);
  const parts: string[] = [];
  const bound = live.filter((r) => isPersonalLicense(r) && r.installs > 0).length;
  const unbound = live.filter((r) => isPersonalLicense(r) && r.installs === 0).length;
  const shared = live.filter((r) => !isPersonalLicense(r)).length;
  const revoked = g.rows.filter((r) => r.revoked).length;
  const expired = g.rows.filter((r) => !r.revoked && r.expired).length;
  if (bound) parts.push(`🔗 已綁定 ${bound}`);
  if (unbound) parts.push(`🕓 還沒綁 ${unbound}`);
  if (shared) parts.push(`共用碼 ${shared}`);
  if (expired) parts.push(`⌛ 已到期 ${expired}`);
  if (revoked) parts.push(`⛔ 已停用 ${revoked}`);
  const dates = [...new Set(g.rows.map((r) => r.expiresDate))].sort();
  parts.push(dates.length === 1 ? `到期 ${dates[0]}` : `到期 ${dates.slice(0, 2).join("、")}${dates.length > 2 ? "…" : ""}（${dates.length} 種）`);
  const launches = g.rows.reduce((s, r) => s + r.launchCount, 0);
  parts.push(`上架 ${launches} 次`);
  return parts.join(" ｜ ");
}

/** 群組那一條後面帶幾個名字，讓他不用點開就認得出是哪一批 */
function namesPreview(g: DayGroup): string {
  const short = (s: string) => (s.length > 10 ? s.slice(0, 10) + "…" : s);
  const names = g.rows.slice(0, 6).map((r) => short(r.name));
  return names.join("、") + (g.rows.length > 6 ? `…等 ${g.rows.length} 組` : "");
}

export default function KeysManager({
  rows,
  installs,
  loadError,
  defaultExpires,
  defaultMax,
}: {
  rows: LicenseView[];
  installs: Record<string, InstallView[]>;
  loadError: string | null;
  defaultExpires: string;
  /** 新碼的電腦數上限：LICENSE_DEFAULT_MAX_INSTALLS（2026-10-05 起 1） */
  defaultMax: number;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [expires, setExpires] = useState(defaultExpires);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [created, setCreated] = useState<{ name: string; key: string; expires: string } | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [maxEdits, setMaxEdits] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  /** 哪幾天的群組是展開的（預設全收起） */
  const [openDays, setOpenDays] = useState<Record<string, boolean>>({});

  const live = rows.filter((r) => !r.revoked && !r.expired);
  const bound = live.filter((r) => isPersonalLicense(r) && r.installs > 0).length;
  const launched = rows.filter((r) => r.launchedInstalls > 0).length;
  const totalLaunches = rows.reduce((sum, r) => sum + r.launchCount, 0);
  /** 還在跑的舊共用碼：一人一組之後要提醒他收回 */
  const legacy = live.filter((r) => !isPersonalLicense(r));
  const groups = groupByDay(rows);

  async function act(label: string, run: () => Promise<Result>): Promise<Result> {
    setBusy(label);
    setMsg(null);
    const r = await run();
    setBusy(null);
    setMsg(r.ok ? { text: `${label}完成`, ok: true } : { text: `${label}失敗：${r.error || "未知錯誤"}`, ok: false });
    if (r.ok) router.refresh();
    return r;
  }

  async function create() {
    const n = name.trim();
    if (!n) {
      setMsg({ text: "先填同事的名字（一人一組，名字就是這組碼的名稱）", ok: false });
      return;
    }
    setBusy("新增");
    setMsg(null);
    const r = await createLicenseAction(n, expires, defaultMax);
    setBusy(null);
    if (!r.ok || !r.key) {
      setMsg({ text: `新增失敗：${r.error || "未知錯誤"}`, ok: false });
      return;
    }
    setCreated({ name: n, key: r.key, expires });
    setName("");
    // 剛新增的那一天展開，他看得到自己剛建的那一列
    setOpenDays((prev) => ({ ...prev, [twDate(new Date().toISOString())]: true }));
    router.refresh();
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMsg({ text: `已複製${what}`, ok: true });
    } catch {
      setMsg({ text: "複製失敗，請自己選起來複製", ok: false });
    }
  }

  function dropEdit(setter: typeof setEdits, id: string) {
    setter((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function saveExpires(r: LicenseView, value: string) {
    void act("改到期日", () => setLicenseExpiresAction(r.id, value)).then((x) => x.ok && dropEdit(setEdits, r.id));
  }

  function saveMax(r: LicenseView, value: string) {
    void act("改電腦數上限", () => setLicenseMaxInstallsAction(r.id, Number(value))).then((x) => x.ok && dropEdit(setMaxEdits, r.id));
  }

  /** 一個人（一組碼）那一列＋展開的明細列；inGroup＝在群組底下（縮排） */
  function renderRow(r: LicenseView, inGroup: boolean) {
    const s = statusOf(r);
    const personal = isPersonalLicense(r);
    const edit = edits[r.id] ?? r.expiresDate;
    const maxEdit = maxEdits[r.id] ?? String(r.maxInstalls);
    const list = installs[r.id] || [];
    const first = list[0];
    return [
      <tr key={r.id} className={[r.revoked ? k.rowOff : "", inGroup ? k.childRow : ""].filter(Boolean).join(" ") || undefined}>
        <td>
          {r.name}
          {!personal && <span className={k.tag}>舊的共用碼</span>}
          <div className={styles.note}>建立 {fmt(r.createdAt)}</div>
        </td>
        <td>
          <code className={k.key}>{r.key}</code>{" "}
          {personal && (
            <button className={styles.cp} type="button" onClick={() => copy(colleagueMessage(r.name, r.key, r.expiresDate), "整段訊息")}>
              複製訊息
            </button>
          )}
        </td>
        <td className={s.cls}>{s.text}</td>
        <td>
          <div className={k.dateRow}>
            <input className={styles.input} type="date" value={edit} onChange={(e) => setEdits({ ...edits, [r.id]: e.target.value })} />
            {edit !== r.expiresDate && (
              <button className={styles.cp} type="button" disabled={busy !== null} onClick={() => saveExpires(r, edit)}>
                存
              </button>
            )}
          </div>
        </td>
        <td>
          {personal ? (
            r.installs > 0 ? (
              <>
                <b>已綁 1 台</b>
                {first && <div className={styles.note}>首次啟用 {fmt(first.firstSeenAt)}</div>}
                {r.installs > 1 && <div className={styles.badText}>登記到 {r.installs} 台（兩台同時搶到），按「解除綁定」重來</div>}
              </>
            ) : (
              <span className={styles.note}>還沒綁（他貼碼的那台就是）</span>
            )
          ) : (
            <>
              <b>{r.installs}</b> 台在用
              <div className={styles.note}>其中上架過 {r.launchedInstalls} 台</div>
              <div className={`${k.dateRow} ${k.numRow}`}>
                <span className={styles.note}>上限</span>
                <input className={styles.input} type="number" min={1} max={999} value={maxEdit} onChange={(e) => setMaxEdits({ ...maxEdits, [r.id]: e.target.value })} />
                {maxEdit !== String(r.maxInstalls) && (
                  <button className={styles.cp} type="button" disabled={busy !== null} onClick={() => saveMax(r, maxEdit)}>
                    存
                  </button>
                )}
              </div>
            </>
          )}
        </td>
        <td>
          <b>{r.launchCount}</b> 次
          {r.lastLaunchAt && <div className={styles.note}>最近 {fmt(r.lastLaunchAt)}</div>}
        </td>
        <td>
          {fmt(r.lastSeenAt)}
          {r.lastVersion && <div className={styles.note}>外掛 {r.lastVersion}</div>}
        </td>
        <td className={k.actions}>
          <button className={styles.cp} type="button" disabled={list.length === 0} onClick={() => setOpen({ ...open, [r.id]: !open[r.id] })}>
            {open[r.id] ? "收起明細" : "明細"}
          </button>
          <button className={styles.cp} type="button" disabled={busy !== null} onClick={() => act(r.revoked ? "恢復" : "停用", () => revokeLicenseAction(r.id, !r.revoked))}>
            {r.revoked ? "恢復" : "停用"}
          </button>
          {personal ? (
            <button
              className={styles.cp}
              type="button"
              disabled={busy !== null || r.installs === 0}
              onClick={() => {
                if (window.confirm(`解除「${r.name}」綁定的電腦？他在新電腦貼同一組碼就會綁到新的那台（上架次數會從頭算）。`))
                  void act("解除綁定", () => resetInstallsAction(r.id));
              }}
            >
              解除綁定
            </button>
          ) : (
            <button
              className={styles.cp}
              type="button"
              disabled={busy !== null || r.installs === 0}
              onClick={() => {
                if (window.confirm(`把「${r.name}」登記過的 ${r.installs} 台電腦清掉？名額歸零，大家下次打開外掛會重新登記（上架次數會從頭算）。`))
                  void act("重設電腦清單", () => resetInstallsAction(r.id));
              }}
            >
              重設電腦清單
            </button>
          )}
          <button
            className={styles.cp}
            type="button"
            disabled={busy !== null}
            onClick={() => {
              if (window.confirm(`確定刪除「${r.name}」這組授權碼？用這組碼的外掛會立刻不能用。`)) void act("刪除", () => deleteLicenseAction(r.id));
            }}
          >
            刪除
          </button>
        </td>
      </tr>,
      open[r.id] && list.length > 0 ? (
        <tr key={`${r.id}-detail`} className={k.detailRow}>
          <td colSpan={8}>
            <ol className={k.detailList}>
              {list.map((i, idx) => (
                <li key={i.id}>
                  電腦 {idx + 1}：首次啟用 {fmt(i.firstSeenAt)}、最近連線 {fmt(i.lastSeenAt)}、上架 <b>{i.launchCount}</b> 次
                  {i.lastLaunchAt ? `（最近 ${fmt(i.lastLaunchAt)}）` : ""}
                  {i.lastVersion ? `、外掛 ${i.lastVersion}` : ""}
                </li>
              ))}
            </ol>
          </td>
        </tr>
      ) : null,
    ];
  }

  return (
    <div className={styles.wrap}>
      <section className={styles.card}>
        <h2 className={styles.h2}>新增一組（一位同事）</h2>
        <p className={styles.hint}>
          一人一組：填同事名字 → 新增 → 把下面那段訊息<b>私訊</b>給他（不要貼群組）。他第一台貼碼的電腦就是綁定的那台。
          到期日預設 {defaultExpires}，可以改成任何日期。FB 社團廣告助手的碼也在這裡發，名字後面加「（FB）」就分得開。
        </p>
        <div className={k.formRow}>
          <label className={k.field}>
            同事名字
            <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="例：王小明" />
          </label>
          <label className={k.field}>
            到期日（台灣）
            <input className={styles.input} type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </label>
          <button className={styles.run} type="button" onClick={create} disabled={busy !== null}>
            {busy === "新增" ? "新增中…" : "＋ 新增授權碼"}
          </button>
        </div>
        {created && (
          <div className={k.createdBox}>
            <div className={k.createdKey}>{created.key}</div>
            <p className={styles.hint}>
              「<b>{created.name}</b>」的授權碼，有效到 {created.expires}，只能綁一台電腦。
            </p>
            <pre className={k.msgPre}>{colleagueMessage(created.name, created.key, created.expires)}</pre>
            <div className={styles.btnrow}>
              <button className={styles.cp} type="button" onClick={() => copy(colleagueMessage(created.name, created.key, created.expires), "整段訊息")}>
                複製整段訊息（私訊給他）
              </button>
              <button className={styles.cp} type="button" onClick={() => copy(created.key, "授權碼")}>
                只複製授權碼
              </button>
            </div>
          </div>
        )}
        {msg && <p className={msg.ok ? styles.okText : styles.badText}>{msg.text}</p>}
      </section>

      <section className={styles.card}>
        <h2 className={styles.h2}>已發出的授權碼（{rows.length}）</h2>
        <p className={k.summary}>
          發出 <b>{rows.length}</b> 組 ｜ 已綁定 <b>{bound}</b> 位同事（一人一組的碼） ｜ 上架過 <b>{launched}</b> 組 ｜ 上架總計 <b>{totalLaunches}</b> 次
        </p>
        {legacy.length > 0 && (
          <p className={styles.badText}>
            還有 {legacy.length} 組舊的共用碼在跑：{legacy.map((r) => `「${r.name}」${r.installs} 台、${r.expiresDate} 到期`).join("；")}。
            一人一組之後，同事都拿到自己的碼就按那一列的「停用」收回（或放著讓它到期）。
          </p>
        )}
        <p className={styles.hint}>
          同一天發的碼收成一條，點那條展開才看每個人。一人一組：每組碼只認<b>第一台貼它的電腦</b>（同一台電腦的同一個 Chrome 設定檔）。同事換電腦、重灌 Chrome、或把外掛載入成另一個資料夾，都會變成「另一台」而被擋——
          按那一列的「解除綁定」，他在新電腦重貼就好。「下載次數」沒得算（壓縮檔是你用 LINE 傳的）；上架次數從外掛 1.5.1 起才會記。
        </p>
        {loadError && <p className={styles.badText}>清單讀不到：{loadError}</p>}
        {!loadError && rows.length === 0 && <p className={styles.hint}>還沒有任何授權碼。</p>}
        {rows.length > 0 && (
          <div className={k.tableWrap}>
            <table className={k.table}>
              <thead>
                <tr>
                  <th>同事</th>
                  <th>授權碼</th>
                  <th>狀態</th>
                  <th>到期日（台灣）</th>
                  <th>電腦</th>
                  <th>上架</th>
                  <th>最近連線</th>
                  <th>動作</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  // 那天只有 1 組：直接顯示那一列，不用多一條群組列
                  if (g.rows.length === 1) return renderRow(g.rows[0], false);
                  const isOpen = !!openDays[g.date];
                  return [
                    <tr key={`day-${g.date}`} className={k.groupRow} onClick={() => setOpenDays({ ...openDays, [g.date]: !isOpen })}>
                      <td colSpan={8}>
                        <button className={k.groupBtn} type="button" aria-expanded={isOpen}>
                          {isOpen ? "▾" : "▸"}
                        </button>
                        <b>{g.date}</b> 發了 <b>{g.rows.length}</b> 組 ｜ {groupSummary(g)}
                        <div className={styles.note}>{namesPreview(g)}（點這條{isOpen ? "收起" : "展開"}）</div>
                      </td>
                    </tr>,
                    ...(isOpen ? g.rows.map((r) => renderRow(r, true)) : []),
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

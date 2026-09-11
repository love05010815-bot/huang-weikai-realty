"use client";
/**
 * 同事授權碼的清單與操作。動作都是 server action（每個都先擋權限），做完 router.refresh() 重抓清單。
 * 一組碼一批人共用（2026-09-11 下午他改的）：這裡看每組碼幾台電腦在用、幾台上架過、上架幾次，不記名字。
 * 新增成功後把「貼給同事的 LINE 訊息」整段組好，他按一顆複製就能貼。
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
import styles from "../post591.module.css";
import k from "./keys.module.css";

export type LicenseView = {
  id: string;
  key: string;
  /** 這組碼的名稱（批次），不是人名 */
  name: string;
  /** 登記過的 Chrome 台數／其中上架過的台數／上限 */
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

/** 貼給同事的訊息（他複製貼 LINE 就好） */
function colleagueMessage(key: string, expiresDate: string): string {
  return [
    "591／樂屋刊登助手的授權碼（我們這批同事共用）：",
    key,
    "打開外掛 → 右上「⚙ 我的資料」→ 貼在最上面「授權碼」那格 → 按儲存，出現綠色「✅ 授權有效」就能用。",
    `有效到 ${expiresDate}。這組碼只給店內同事用，不要轉傳給別人。`,
  ].join("\n");
}

function statusOf(r: LicenseView): { text: string; cls: string } {
  if (r.revoked) return { text: "⛔ 已停用", cls: k.bad };
  if (r.expired) return { text: "⌛ 已到期", cls: k.bad };
  if (r.installs > 0) return { text: "✅ 使用中", cls: k.ok };
  return { text: "🕓 還沒有人啟用", cls: k.mute };
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
  defaultMax: number;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [expires, setExpires] = useState(defaultExpires);
  const [max, setMax] = useState(String(defaultMax));
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [created, setCreated] = useState<{ name: string; key: string; expires: string } | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [maxEdits, setMaxEdits] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const totalInstalls = rows.reduce((sum, r) => sum + r.installs, 0);
  const totalLaunched = rows.reduce((sum, r) => sum + r.launchedInstalls, 0);
  const totalLaunches = rows.reduce((sum, r) => sum + r.launchCount, 0);

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
      setMsg({ text: "先給這組碼一個名稱（例：9 月第一批）", ok: false });
      return;
    }
    setBusy("新增");
    setMsg(null);
    const r = await createLicenseAction(n, expires, Number(max));
    setBusy(null);
    if (!r.ok || !r.key) {
      setMsg({ text: `新增失敗：${r.error || "未知錯誤"}`, ok: false });
      return;
    }
    setCreated({ name: n, key: r.key, expires });
    setName("");
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

  return (
    <div className={styles.wrap}>
      <section className={styles.card}>
        <h2 className={styles.h2}>新增一組</h2>
        <p className={styles.hint}>
          一組碼給這一批同事共用：取個名稱 → 新增 → 把下面那段訊息貼到群組。到期日預設 {defaultExpires}；
          「電腦數上限」是防外流的閘（預設 {defaultMax} 台），同事比這多就先調高。
        </p>
        <div className={k.formRow}>
          <label className={k.field}>
            這組碼的名稱
            <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="例：9 月第一批" />
          </label>
          <label className={k.field}>
            到期日（台灣）
            <input className={styles.input} type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </label>
          <label className={`${k.field} ${k.numField}`}>
            電腦數上限
            <input className={styles.input} type="number" min={1} max={999} value={max} onChange={(e) => setMax(e.target.value)} />
          </label>
          <button className={styles.run} type="button" onClick={create} disabled={busy !== null}>
            {busy === "新增" ? "新增中…" : "＋ 新增授權碼"}
          </button>
        </div>
        {created && (
          <div className={k.createdBox}>
            <div className={k.createdKey}>{created.key}</div>
            <p className={styles.hint}>
              「<b>{created.name}</b>」這批的授權碼，有效到 {created.expires}。
            </p>
            <pre className={k.msgPre}>{colleagueMessage(created.key, created.expires)}</pre>
            <div className={styles.btnrow}>
              <button className={styles.cp} type="button" onClick={() => copy(colleagueMessage(created.key, created.expires), "整段訊息")}>
                複製整段訊息（貼 LINE 群組）
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
          發出 <b>{rows.length}</b> 組 ｜ 使用中 <b>{totalInstalls}</b> 台電腦 ｜ 其中上架過 <b>{totalLaunched}</b> 台 ｜ 上架總計 <b>{totalLaunches}</b> 次
        </p>
        <p className={styles.hint}>
          「下載次數」沒得算（壓縮檔是你用 LINE 傳的，沒經過網站）。這裡算的是<b>貼了授權碼的電腦台數</b>（一人一台的話就是人數）和<b>按過上架的次數</b>；
          不記名字。上架次數從外掛 1.5.1 起才會記。
        </p>
        {loadError && <p className={styles.badText}>清單讀不到：{loadError}</p>}
        {!loadError && rows.length === 0 && <p className={styles.hint}>還沒有任何授權碼。</p>}
        {rows.length > 0 && (
          <div className={k.tableWrap}>
            <table className={k.table}>
              <thead>
                <tr>
                  <th>名稱</th>
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
                {rows.map((r) => {
                  const s = statusOf(r);
                  const edit = edits[r.id] ?? r.expiresDate;
                  const maxEdit = maxEdits[r.id] ?? String(r.maxInstalls);
                  const list = installs[r.id] || [];
                  return [
                    <tr key={r.id} className={r.revoked ? k.rowOff : undefined}>
                      <td>
                        {r.name}
                        <div className={styles.note}>建立 {fmt(r.createdAt)}</div>
                      </td>
                      <td>
                        <code className={k.key}>{r.key}</code>{" "}
                        <button className={styles.cp} type="button" onClick={() => copy(colleagueMessage(r.key, r.expiresDate), "整段訊息")}>
                          複製訊息
                        </button>
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
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

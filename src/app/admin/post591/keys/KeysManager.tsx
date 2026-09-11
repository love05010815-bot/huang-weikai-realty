"use client";
/**
 * 同事授權碼的清單與操作。動作都是 server action（每個都先擋權限），做完 router.refresh() 重抓清單。
 * 新增成功後把「貼給同事的 LINE 訊息」整段組好，他按一顆複製就能貼。
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  createLicenseAction,
  deleteLicenseAction,
  revokeLicenseAction,
  setLicenseExpiresAction,
  unbindLicenseAction,
} from "@/lib/actions/ext-license";
import styles from "../post591.module.css";
import k from "./keys.module.css";

export type LicenseView = {
  id: string;
  key: string;
  name: string;
  bound: boolean;
  boundAt: string | null;
  lastSeenAt: string | null;
  lastVersion: string | null;
  /** 台灣日期 YYYY-MM-DD */
  expiresDate: string;
  expired: boolean;
  revoked: boolean;
  createdAt: string;
};

type Result = { ok: boolean; error?: string };

/** ISO 時刻 → 台灣時間 YYYY-MM-DD HH:mm */
function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16).replace("T", " ");
}

/** 貼給同事的訊息（他複製貼 LINE 就好） */
function colleagueMessage(name: string, key: string, expiresDate: string): string {
  return [
    `${name} 你好，591／樂屋刊登助手的授權碼：`,
    key,
    "打開外掛 → 右上「⚙ 我的資料」→ 貼在最上面「授權碼」那格 → 按儲存，出現綠色「✅ 授權有效」就能用。",
    `有效到 ${expiresDate}。這組碼只認你第一台啟用的 Chrome，不要轉給別人；換電腦跟我說一聲。`,
  ].join("\n");
}

function statusOf(r: LicenseView): { text: string; cls: string } {
  if (r.revoked) return { text: "⛔ 已停用", cls: k.bad };
  if (r.expired) return { text: "⌛ 已到期", cls: k.bad };
  if (r.bound) return { text: "✅ 已綁定", cls: k.ok };
  return { text: "🕓 還沒啟用", cls: k.mute };
}

export default function KeysManager({ rows, loadError, defaultExpires }: { rows: LicenseView[]; loadError: string | null; defaultExpires: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [expires, setExpires] = useState(defaultExpires);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [created, setCreated] = useState<{ name: string; key: string; expires: string } | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});

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
      setMsg({ text: "先填同事姓名", ok: false });
      return;
    }
    setBusy("新增");
    setMsg(null);
    const r = await createLicenseAction(n, expires);
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

  function saveExpires(r: LicenseView, value: string) {
    void act("改到期日", () => setLicenseExpiresAction(r.id, value)).then((x) => {
      if (!x.ok) return;
      setEdits((prev) => {
        const next = { ...prev };
        delete next[r.id];
        return next;
      });
    });
  }

  return (
    <div className={styles.wrap}>
      <section className={styles.card}>
        <h2 className={styles.h2}>新增一組</h2>
        <p className={styles.hint}>
          填同事姓名 → 新增 → 把下面那段訊息貼給他。到期日預設 {defaultExpires}，要給更久就先改再新增。
        </p>
        <div className={k.formRow}>
          <label className={k.field}>
            同事姓名
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
              給 <b>{created.name}</b> 的授權碼，有效到 {created.expires}。
            </p>
            <pre className={k.msgPre}>{colleagueMessage(created.name, created.key, created.expires)}</pre>
            <div className={styles.btnrow}>
              <button className={styles.cp} type="button" onClick={() => copy(colleagueMessage(created.name, created.key, created.expires), "整段訊息")}>
                複製整段訊息（貼 LINE 給他）
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
                  <th>上次使用</th>
                  <th>動作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const s = statusOf(r);
                  const edit = edits[r.id] ?? r.expiresDate;
                  return (
                    <tr key={r.id} className={r.revoked ? k.rowOff : undefined}>
                      <td>
                        {r.name}
                        <div className={styles.note}>建立 {fmt(r.createdAt)}</div>
                      </td>
                      <td>
                        <code className={k.key}>{r.key}</code>{" "}
                        <button className={styles.cp} type="button" onClick={() => copy(colleagueMessage(r.name, r.key, r.expiresDate), "整段訊息")}>
                          複製訊息
                        </button>
                      </td>
                      <td className={s.cls}>
                        {s.text}
                        {r.bound && <div className={styles.note}>綁定 {fmt(r.boundAt)}</div>}
                      </td>
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
                        {fmt(r.lastSeenAt)}
                        {r.lastVersion && <div className={styles.note}>外掛 {r.lastVersion}</div>}
                      </td>
                      <td className={k.actions}>
                        <button className={styles.cp} type="button" disabled={busy !== null} onClick={() => act(r.revoked ? "恢復" : "停用", () => revokeLicenseAction(r.id, !r.revoked))}>
                          {r.revoked ? "恢復" : "停用"}
                        </button>
                        <button className={styles.cp} type="button" disabled={busy !== null || !r.bound} onClick={() => act("解除綁定", () => unbindLicenseAction(r.id))}>
                          解除綁定
                        </button>
                        <button
                          className={styles.cp}
                          type="button"
                          disabled={busy !== null}
                          onClick={() => {
                            if (window.confirm(`確定刪除 ${r.name} 的授權碼？他的外掛會立刻不能用。`)) void act("刪除", () => deleteLicenseAction(r.id));
                          }}
                        >
                          刪除
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

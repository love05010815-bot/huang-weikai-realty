"use client";
/**
 * 後台「買方資料建檔 → 同事」分頁（2026-10-20 他說「建立同事的這個連結一併同步到這裡」）。
 * 跟本人建檔頁的「同事」頁同一份資料、同一套動作（lib/match/colleague-ops.ts）：新增、編輯、停用／重新啟用、重新產生連結、刪除。
 * 在哪一邊改，另一邊重新整理就看得到。
 */
import { useState } from "react";
import { CHIP, CIS, cisCard } from "@/app/admin/_components/cis";
import { adminAddColleagueAction, adminDeleteColleagueAction, adminRotateColleagueKeyAction, adminSetColleagueAction } from "@/lib/actions/colleagues-admin";
import type { IntakeColleagueRow } from "@/lib/match/intake";

const fmtDay = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric" }) : "");
const fmtWhen = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "";

const btn: React.CSSProperties = { padding: "7px 12px", borderRadius: 10, border: `1px solid ${CIS.cardBorder}`, background: "transparent", color: CIS.text, fontSize: 13, cursor: "pointer" };
const btnPrimary: React.CSSProperties = { ...btn, background: CIS.blue, borderColor: CIS.blue, color: "#fff", fontWeight: 700 };
const input: React.CSSProperties = { display: "block", width: "100%", boxSizing: "border-box", marginTop: 4, padding: "8px 10px", borderRadius: 8, border: `1px solid ${CIS.cardBorder}`, background: "rgba(var(--adm-ink-rgb), 0.04)", color: CIS.text, fontSize: 14 };
const label: React.CSSProperties = { display: "block", fontSize: 12, color: CIS.textSub, marginBottom: 10 };

function Tag({ tone, children }: { tone: keyof typeof CHIP; children: React.ReactNode }) {
  const c = CHIP[tone];
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 600, background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
      {children}
    </span>
  );
}

type EditState = { id: string; name: string; phone: string; line: string };

export default function ColleaguesAdmin({ initial }: { initial: IntakeColleagueRow[] }) {
  const [rows, setRows] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", line: "" });
  const [edit, setEdit] = useState<EditState | null>(null);

  async function run<T extends { ok: boolean; error?: string; rows?: IntakeColleagueRow[] }>(p: Promise<T>, okMsg: (r: T) => string): Promise<T | null> {
    setBusy(true);
    setMsg(null);
    const r = await p;
    setBusy(false);
    if (!r.ok) {
      setMsg(r.error ?? "失敗");
      return null;
    }
    if (r.rows) setRows(r.rows);
    setMsg(okMsg(r));
    return r;
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const r = await run(adminAddColleagueAction(form), (x) => `已新增「${"created" in x ? x.created.name : form.name}」。把他的連結用 LINE 私訊傳給他，請他照手冊「第一次設定」做。`);
    if (r) setForm({ name: "", phone: "", line: "" });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    const r = await run(adminSetColleagueAction(edit.id, { name: edit.name, phone: edit.phone, line: edit.line }), () => `「${edit.name.trim()}」的資料已更新。`);
    if (r) setEdit(null);
  }

  async function toggle(c: IntakeColleagueRow) {
    if (c.active && !window.confirm(`停用「${c.name}」（離職）？他的連結立刻失效、手機通知也停；他名下 ${c.buyers} 位客人留在他那裡。`)) return;
    await run(adminSetColleagueAction(c.id, { active: !c.active }), () => (c.active ? `「${c.name}」已停用，舊連結不能用了。` : `「${c.name}」重新啟用了，這是新的連結，記得傳給他。`));
  }

  async function rotate(c: IntakeColleagueRow) {
    if (!window.confirm(`重新產生「${c.name}」的連結？舊的立刻失效，他要重新加到主畫面。`)) return;
    await run(adminRotateColleagueKeyAction(c.id), () => `「${c.name}」的連結已重新產生，記得傳新的給他。`);
  }

  async function remove(c: IntakeColleagueRow) {
    const warn = c.active ? `刪掉「${c.name}」？` : `刪掉「${c.name}」？名下 ${c.buyers} 位客人和他們的預約會一起從系統刪掉（他已經帶走名單再按）。`;
    if (!window.confirm(`${warn}這個動作不能復原。`)) return;
    await run(adminDeleteColleagueAction(c.id), (x) => `已刪掉「${c.name}」${"buyers" in x && x.buyers ? `，連同 ${x.buyers} 位客人、${x.viewings} 筆預約` : ""}。`);
  }

  async function copy(c: IntakeColleagueRow) {
    try {
      await navigator.clipboard.writeText(c.url);
      setMsg(`${c.name}的連結已複製，用 LINE 私訊傳給他本人，不要貼群組。`);
    } catch {
      setMsg("這個瀏覽器不讓我複製，請自己選取連結文字複製。");
    }
  }

  return (
    <div>
      <p style={{ margin: "0 0 12px", color: CIS.textMute, fontSize: 12 }}>
        每位同事一條自己的連結（等同密碼，只私訊給本人）。這裡跟你手機建檔頁的「同事」是同一份資料，兩邊改都會同步。
      </p>
      {msg && <p style={{ margin: "0 0 12px", padding: "10px 12px", borderRadius: 10, background: "rgba(var(--adm-brand-rgb), 0.12)", border: `1px solid ${CIS.cardBorder}`, fontSize: 13 }}>{msg}</p>}

      <form onSubmit={add} noValidate style={{ ...cisCard, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>新增同事</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          <label style={label}>
            稱呼
            <input style={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如：王小明" autoComplete="off" />
          </label>
          <label style={label}>
            電話（客人看得到）
            <input style={input} type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0912345678" autoComplete="off" />
          </label>
          <label style={label}>
            LINE ID 或加好友連結（客人看得到）
            <input style={input} value={form.line} onChange={(e) => setForm({ ...form, line: e.target.value })} placeholder="例如：abc123，或 https://line.me/ti/p/…" autoComplete="off" />
          </label>
        </div>
        <button type="submit" style={btnPrimary} disabled={busy}>
          {busy ? "處理中…" : "新增，產生他的連結"}
        </button>
      </form>

      {rows.length === 0 ? (
        <p style={{ color: CIS.textMute, fontSize: 13 }}>還沒有同事。</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {rows.map((c) => (
            <div key={c.id} style={{ ...cisCard, padding: 14, opacity: c.active ? 1 : 0.7 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 16, fontWeight: 700 }}>{c.name}</span>
                <Tag tone={c.active ? "success" : "neutral"}>{c.active ? "啟用中" : "已停用"}</Tag>
                <Tag tone={c.pushDevices > 0 ? "success" : "warn"}>{c.pushDevices > 0 ? `🔔 手機通知 ${c.pushDevices} 支` : "🔕 還沒開手機通知"}</Tag>
                <Tag tone={c.firstUsedAt ? "info" : "neutral"}>{c.firstUsedAt ? `✅ 開過連結 · 最近 ${fmtWhen(c.lastUsedAt)} · 共 ${c.useCount} 次` : "⏳ 還沒開過連結"}</Tag>
              </div>
              <div style={{ color: CIS.textSub, fontSize: 13, marginTop: 6, display: "flex", gap: 12, flexWrap: "wrap" }}>
                <span>{c.phone || "沒填電話"}</span>
                <span>{c.lineUrl ? `LINE ✔ ${c.lineUrl}` : "沒填 LINE"}</span>
                <span>{c.buyers} 位客人</span>
                <span>{fmtDay(c.createdAt)} 加入</span>
              </div>
              {c.active ? (
                <p style={{ margin: "8px 0", fontSize: 12, color: CIS.textMute, wordBreak: "break-all" }}>{c.url}</p>
              ) : (
                <p style={{ margin: "8px 0", fontSize: 12, color: CIS.textMute }}>（已停用：舊連結已失效；重新啟用會給一條新連結）</p>
              )}
              {edit?.id === c.id ? (
                <form onSubmit={saveEdit} noValidate style={{ marginTop: 6 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
                    <label style={label}>
                      稱呼
                      <input style={input} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoComplete="off" />
                    </label>
                    <label style={label}>
                      電話（客人看得到）
                      <input style={input} type="tel" inputMode="tel" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} autoComplete="off" />
                    </label>
                    <label style={label}>
                      LINE ID 或加好友連結（客人看得到）
                      <input style={input} value={edit.line} onChange={(e) => setEdit({ ...edit, line: e.target.value })} placeholder="例如：abc123，或 https://line.me/ti/p/…" autoComplete="off" />
                    </label>
                  </div>
                  <p style={{ margin: "0 0 10px", fontSize: 12, color: CIS.textMute }}>連結不會變，改完他不用重新加到主畫面。清空 LINE 就是拿掉那顆按鈕。</p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="submit" style={btnPrimary} disabled={busy}>
                      {busy ? "儲存中…" : "儲存"}
                    </button>
                    <button type="button" style={btn} onClick={() => setEdit(null)} disabled={busy}>
                      取消
                    </button>
                  </div>
                </form>
              ) : (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                  <button type="button" style={btn} onClick={() => setEdit({ id: c.id, name: c.name, phone: c.phone, line: c.lineUrl })} disabled={busy}>
                    編輯
                  </button>
                  {c.active && (
                    <button type="button" style={btnPrimary} onClick={() => copy(c)} disabled={busy}>
                      複製連結
                    </button>
                  )}
                  <button type="button" style={btn} onClick={() => toggle(c)} disabled={busy}>
                    {c.active ? "停用（離職）" : "重新啟用"}
                  </button>
                  {c.active && (
                    <button type="button" style={btn} onClick={() => rotate(c)} disabled={busy}>
                      重新產生連結
                    </button>
                  )}
                  {(!c.active || c.buyers === 0) && (
                    <button type="button" style={{ ...btn, color: "#ff8a80" }} onClick={() => remove(c)} disabled={busy}>
                      刪除
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

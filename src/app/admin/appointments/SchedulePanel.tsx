"use client";
/**
 * 後台「可預約時間」設定面板（2026-09-08 系統擁有者：「我後臺要從哪邊控制可以選擇的時間」→「要做」）。
 *
 * 能調的：每週開放日、一天的開始／結束時間、開放未來幾天、各見面方式至少提前幾小時、休假日。
 * 改完按儲存立刻生效（前台下一次查時段就照新的算），不用部署。
 *
 * 沒放進來的：15 分鐘網格、前後緩衝、可選時長 —— 跟併發鎖與日曆事件長度綁在一起，改錯會撞單。
 * 版面照 RateLimitPanel（同一頁的另一塊）。
 */
import { useMemo, useState } from "react";
import {
  DEFAULT_SCHEDULE_SETTINGS,
  SCHEDULE_MEET_TYPE_LABELS,
  WEEKDAY_LABELS,
  describeScheduleSettings,
  minuteLabel,
  normalizeClosedEntry,
  normalizeScheduleSettings,
  type AppointmentScheduleSettings,
  type ScheduleMeetType,
} from "@/lib/appointment-schedule-settings";

const field: React.CSSProperties = {
  width: "100%", background: "#141414", border: "1px solid #2a2a2a", borderRadius: 8,
  color: "#ededed", padding: "8px 10px", fontSize: 16,
};
const lbl: React.CSSProperties = { display: "block", color: "#9aa0a6", fontSize: 14, marginBottom: 5 };

/** 06:00 ～ 23:00，每 15 分一個選項（開始時間用到 22:45、結束時間用到 23:00） */
const TIME_OPTIONS: number[] = [];
for (let m = 6 * 60; m <= 23 * 60; m += 15) TIME_OPTIONS.push(m);

export default function SchedulePanel({
  initial,
  borderColor,
}: {
  initial: AppointmentScheduleSettings;
  borderColor: string;
}) {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState<AppointmentScheduleSettings>(initial);
  const [closedText, setClosedText] = useState(initial.closedDates.join("\n"));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // 休假日文字框逐行檢查：合法的整理成標準寫法，壞掉的列出來，不擋其他行
  const closedParsed = useMemo(() => {
    const good: string[] = [];
    const bad: string[] = [];
    for (const line of closedText.split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      const n = normalizeClosedEntry(t);
      if (n) {
        if (!good.includes(n)) good.push(n);
      } else bad.push(t);
    }
    return { good: good.sort(), bad };
  }, [closedText]);

  const draft: AppointmentScheduleSettings = { ...s, closedDates: closedParsed.good };
  const normalized = normalizeScheduleSettings(draft);
  const dirty = JSON.stringify(normalized) !== JSON.stringify(initial);
  const preview = describeScheduleSettings(normalized);

  const toggleDay = (d: number) =>
    setS((prev) => ({
      ...prev,
      workDays: prev.workDays.includes(d) ? prev.workDays.filter((x) => x !== d) : [...prev.workDays, d].sort((a, b) => a - b),
    }));

  const setLead = (k: ScheduleMeetType, v: string) =>
    setS((prev) => ({ ...prev, leadHours: { ...prev.leadHours, [k]: v === "" ? 0 : Math.max(0, Math.floor(Number(v) || 0)) } }));

  const save = async () => {
    if (busy) return;
    if (closedParsed.bad.length) {
      setMsg({ ok: false, text: `❌ 休假日有 ${closedParsed.bad.length} 行看不懂：${closedParsed.bad.slice(0, 3).join("、")}。格式是 2027-02-15 或 2027-02-15~2027-02-20，一行一個。` });
      return;
    }
    if (s.workDays.length === 0) {
      setMsg({ ok: false, text: "❌ 至少要勾一天，不然前台永遠沒有時段。" });
      return;
    }
    setBusy(true);
    setMsg(null);
    const { saveScheduleSettingsAction } = await import("@/lib/actions/appointment-schedule");
    const r = await saveScheduleSettingsAction(draft);
    setBusy(false);
    if (r.ok && r.settings) {
      setS(r.settings);
      setClosedText(r.settings.closedDates.join("\n"));
      setMsg({ ok: true, text: "✅ 已儲存，立刻生效（前台下一次查時段就照新的算）。" });
    } else {
      setMsg({ ok: false, text: "❌ " + (r.error || "儲存失敗") });
    }
  };

  const resetDefault = () => {
    setS({ ...DEFAULT_SCHEDULE_SETTINGS, workDays: [...DEFAULT_SCHEDULE_SETTINGS.workDays], leadHours: { ...DEFAULT_SCHEDULE_SETTINGS.leadHours }, closedDates: [] });
    setClosedText("");
  };

  return (
    <section
      className="rounded-xl"
      style={{ background: "#0e0e0e", border: `1px solid ${borderColor}`, padding: open ? "14px 16px" : "10px 16px", marginBottom: 14 }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ background: "none", border: 0, color: "#7dd3fc", fontWeight: 800, fontSize: 16, cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
      >
        🕘 可預約時間（開放日、時段、休假日）
        <span style={{ color: "#5b6675", fontWeight: 400, fontSize: 14 }}>
          {initial.workDays.map((d) => WEEKDAY_LABELS[d]).join("")}　{minuteLabel(initial.startMin)}–{minuteLabel(initial.endMin)}　未來 {initial.daysAhead} 天
          {initial.closedDates.length ? `　休假 ${initial.closedDates.length} 條` : ""}
          {open ? "　▲ 收起" : "　▼ 展開設定"}
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
          <div
            style={{ background: "rgba(125,211,252,.06)", border: "1px solid #23303f", borderRadius: 8, padding: "9px 11px", color: "#9fc7e8", fontSize: 14.5, lineHeight: 1.9 }}
          >
            {preview.map((line, i) => <div key={i}>・{line}</div>)}
            <div style={{ color: "#6b7684", marginTop: 4 }}>
              15 分鐘一格、前後緩衝、可選時長不在這裡調（跟撞單保護綁在一起）。臨時某天不接，直接在 Google 日曆放一個事件也可以。
            </div>
          </div>

          <div>
            <span style={lbl}>每週開放</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                const on = s.workDays.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    aria-pressed={on}
                    style={{
                      minWidth: 52, padding: "8px 12px", borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: "pointer",
                      background: on ? "#16a34a" : "#141414", color: on ? "#fff" : "#6b7684", border: `1px solid ${on ? "#16a34a" : "#2a2a2a"}`,
                    }}
                  >
                    週{WEEKDAY_LABELS[d]}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
            <div>
              <span style={lbl}>開始時間</span>
              <select style={field} value={s.startMin} onChange={(e) => setS((p) => ({ ...p, startMin: Number(e.target.value) }))}>
                {TIME_OPTIONS.filter((m) => m < 23 * 60).map((m) => <option key={m} value={m}>{minuteLabel(m)}</option>)}
              </select>
            </div>
            <div>
              <span style={lbl}>最後一格結束</span>
              <select style={field} value={s.endMin} onChange={(e) => setS((p) => ({ ...p, endMin: Number(e.target.value) }))}>
                {TIME_OPTIONS.filter((m) => m > 6 * 60).map((m) => <option key={m} value={m}>{minuteLabel(m)}</option>)}
              </select>
            </div>
            <div>
              <span style={lbl}>開放未來幾天</span>
              <input style={field} inputMode="numeric" value={String(s.daysAhead)} onChange={(e) => setS((p) => ({ ...p, daysAhead: Math.max(0, Math.floor(Number(e.target.value.replace(/\D/g, "")) || 0)) }))} />
            </div>
          </div>

          <div>
            <span style={lbl}>至少提前幾小時（依見面方式）</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 12 }}>
              {(Object.keys(SCHEDULE_MEET_TYPE_LABELS) as ScheduleMeetType[]).map((k) => (
                <div key={k}>
                  <span style={{ ...lbl, fontSize: 13 }}>{SCHEDULE_MEET_TYPE_LABELS[k]}</span>
                  <input style={field} inputMode="numeric" value={String(s.leadHours[k])} onChange={(e) => setLead(k, e.target.value.replace(/\D/g, ""))} />
                </div>
              ))}
            </div>
          </div>

          <div>
            <span style={lbl}>休假日（整天不開放；一行一個，可寫區間）</span>
            <textarea
              style={{ ...field, minHeight: 96, fontFamily: "inherit", lineHeight: 1.6 }}
              placeholder={"2027-02-15\n2027-02-16~2027-02-20"}
              value={closedText}
              onChange={(e) => setClosedText(e.target.value)}
            />
            {closedParsed.bad.length > 0 && (
              <div style={{ color: "#fbbf24", fontSize: 14, marginTop: 6 }}>看不懂的行：{closedParsed.bad.join("、")}</div>
            )}
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              onClick={save}
              disabled={busy || !dirty}
              style={{
                background: dirty ? "#16a34a" : "#333", border: 0, borderRadius: 8, color: "#fff",
                padding: "9px 20px", fontSize: 15.5, fontWeight: 700,
                cursor: busy ? "wait" : dirty ? "pointer" : "not-allowed",
              }}
            >
              {busy ? "儲存中⋯" : dirty ? "儲存設定" : "沒有變更"}
            </button>
            <button
              type="button"
              onClick={resetDefault}
              style={{ background: "none", border: "1px solid #2a2a2a", borderRadius: 7, color: "#6b7684", fontSize: 14.5, padding: "6px 12px", cursor: "pointer" }}
            >
              回到預設（週一～五 10:00–18:00・未來 14 天）
            </button>
          </div>

          {msg && <div style={{ color: msg.ok ? "#86efac" : "#f0705c", fontSize: 14.5, lineHeight: 1.8 }}>{msg.text}</div>}
        </div>
      )}
    </section>
  );
}

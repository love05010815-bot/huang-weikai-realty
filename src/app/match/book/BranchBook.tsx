"use client";
/**
 * /match/book 的表單那一半：物件清單（可移除）→ 姓名電話日期時段 → 送出 → 完成頁。
 * 送出打 /api/match/viewing（跟 /match 同一支）：帶 token 認人，預約就寫進那位業務的清單、推他的手機。
 */
import { useEffect, useState } from "react";
import type { ColleagueContact } from "@/lib/match/colleague-link";
import type { PublicListing } from "@/lib/match/public";
import styles from "./book.module.css";

const SLOTS = ["上午 10:00–12:00", "下午 14:00–17:00", "晚上 18:00–20:00"];

type Booking = {
  viewing: { code: string; preferredAt: string; name: string; phone: string };
  listings: { id: string; title: string }[];
  dropped: number;
  colleague: ColleagueContact | null;
};

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const money = (n: number) => `${Number(n).toLocaleString("zh-TW")} 萬`;

function metaLine(l: PublicListing): string {
  const parts: string[] = [];
  if (l.city || l.district) parts.push(`${l.city ?? ""}${l.district ?? ""}`);
  if (l.size) parts.push(`${l.size} 坪`);
  if (l.rooms) parts.push(`${l.rooms} 房`);
  if (l.type) parts.push(l.type);
  if (l.age != null && l.age > 0) parts.push(`屋齡 ${l.age} 年`);
  return parts.join(" · ");
}

export default function BranchBook({
  token,
  name,
  phone,
  listings,
  missing,
  colleague,
  backUrl,
}: {
  token: string;
  name: string;
  phone: string;
  listings: PublicListing[];
  /** 客人勾的裡面有幾間已經下架（伺服器端剔掉的） */
  missing: number;
  colleague: ColleagueContact | null;
  backUrl: string;
}) {
  const [picked, setPicked] = useState(listings);
  // 日期在掛載後才填：伺服器與手機的「明天」可能差一天，先空著免得 hydration 對不上
  const [form, setForm] = useState({ name, phone, date: "", slot: SLOTS[0], note: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  useEffect(() => {
    setForm((f) => (f.date ? f : { ...f, date: tomorrow() }));
  }, []);

  const who = colleague?.name ?? "專員";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!picked.length) return;
    const n = form.name.trim();
    const p = form.phone.trim();
    if (!n) return setError("請填寫姓名");
    if (!/^[\d+\-\s()]{8,}$/.test(p)) return setError("請填寫正確的手機號碼");
    if (!form.date) return setError("請選擇日期");
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/match/viewing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingIds: picked.map((l) => l.id),
          name: n,
          phone: p,
          preferredAt: `${form.date} ${form.slot}`,
          note: form.note.trim(),
          token,
          website: form.website,
        }),
      });
      const data = (await r.json().catch(() => ({}))) as Booking & { error?: string };
      if (!r.ok) throw new Error(data.error || "送出失敗，請稍後再試");
      setBooking(data);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "送出失敗，請稍後再試");
    } finally {
      setBusy(false);
    }
  }

  if (booking) {
    return (
      <div className={`${styles.card} ${styles.center}`}>
        <div className={styles.big}>✅</div>
        <h1 className={styles.h1}>預約已送出</h1>
        <p className={styles.muted}>
          預約編號 <b className={styles.code}>{booking.viewing.code}</b>
        </p>
        <div className={styles.box}>
          {booking.listings.length > 1 ? (
            <ol className={styles.list}>
              {booking.listings.map((l) => (
                <li key={l.id}>{l.title}</li>
              ))}
            </ol>
          ) : (
            <b>{booking.listings[0]?.title ?? "物件"}</b>
          )}
          <div>{booking.viewing.preferredAt}</div>
          <div>
            {booking.viewing.name}｜{booking.viewing.phone}
          </div>
        </div>
        {booking.dropped > 0 && <p className={styles.hint}>其中 {booking.dropped} 間在送出時已經下架，沒有列入這次預約。</p>}
        <p className={styles.muted}>
          {who}已經收到通知，會盡快與您聯繫確認時間。有急事可以直接聯絡，說預約編號 {booking.viewing.code} 就可以。
        </p>
        {colleague?.lineUrl && (
          <a className={`${styles.btn} ${styles.btnLine}`} href={colleague.lineUrl} target="_blank" rel="noopener noreferrer">
            LINE 聯絡{colleague.name}
          </a>
        )}
        {colleague?.phone && (
          <a className={`${styles.btn} ${styles.btnPrimary}`} href={`tel:${colleague.phone.replace(/\D/g, "")}`}>
            撥電話 {colleague.phone}
          </a>
        )}
        <a className={`${styles.btn} ${styles.btnGhost}`} href={backUrl}>
          回店官網再找其他物件
        </a>
      </div>
    );
  }

  if (!picked.length) {
    return (
      <div className={styles.card}>
        <h1 className={styles.h1}>{missing > 0 ? "您選的物件已經下架或成交了" : "還沒有選物件"}</h1>
        <p className={styles.muted}>請回店官網重新挑選，勾好再按「前往預約看屋」。</p>
        <a className={`${styles.btn} ${styles.btnPrimary}`} href={backUrl}>
          回店官網挑物件
        </a>
      </div>
    );
  }

  return (
    <>
      <a className={styles.back} href={backUrl}>
        ← 回店官網再挑物件
      </a>
      {missing > 0 && <p className={styles.hint}>您選的物件裡有 {missing} 間已經下架或成交了，其餘照常預約。</p>}
      <h1 className={styles.h1}>預約看屋</h1>
      {picked.length > 1 && <p className={styles.muted}>這 {picked.length} 間會一起送出，只會有一個預約編號。</p>}
      <ul className={styles.listings}>
        {picked.map((l) => (
          <li key={l.id} className={styles.listing}>
            {l.images[0] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={styles.thumb} src={l.images[0]} alt="" />
            )}
            <div className={styles.body}>
              <div className={styles.title}>{l.title}</div>
              <div className={styles.price}>{money(l.price)}</div>
              <div className={styles.meta}>{metaLine(l)}</div>
              {picked.length > 1 && (
                <button type="button" className={styles.linkBtn} onClick={() => setPicked((p) => p.filter((x) => x.id !== l.id))}>
                  移除這間
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <form className={styles.card} onSubmit={submit} noValidate>
        <label className={styles.field}>
          姓名
          <input className={styles.input} autoComplete="name" placeholder="怎麼稱呼您" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </label>
        <label className={styles.field}>
          手機
          <input className={styles.input} type="tel" autoComplete="tel" inputMode="tel" placeholder="0912-345-678" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
        </label>
        <div className={styles.two}>
          <label className={styles.field}>
            希望日期
            <input className={styles.input} type="date" min={form.date || undefined} value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          </label>
          <label className={styles.field}>
            時段
            <select className={styles.input} value={form.slot} onChange={(e) => setForm((f) => ({ ...f, slot: e.target.value }))}>
              {SLOTS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
        <label className={styles.field}>
          備註（選填）
          <textarea className={styles.input} rows={2} placeholder="例如：想同時看附近其他物件" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
        </label>
        {/* honeypot：人看不到、機器人會填 */}
        <input className={styles.hp} tabIndex={-1} autoComplete="off" name="website" value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} />
        {error && <p className={styles.error}>{error}</p>}
        <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy}>
          {busy ? "送出中…" : "送出預約"}
        </button>
        <p className={styles.fine}>送出後{who}會跟您確認時間；您的資料只用於安排這次看屋。</p>
      </form>
    </>
  );
}

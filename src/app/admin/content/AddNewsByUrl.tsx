"use client";

/**
 * 待產文案最上面的「貼一條新聞連結」。
 *
 * 在外面（LINE 群、FB、Google 新聞）看到一則想寫的新聞，把網址貼進來按一下，
 * 系統去把標題與內文抓回來、存進資料庫、直接排進待產文案，然後跳到那一題。
 * **手動貼的不過房產相關性那一關** —— 他都特地貼了，就是他要的。
 *
 * 抓不到的時候（那個網站擋程式、或要登入）會自動把下面的「自己貼內文」打開，
 * 讓他把標題與內文貼進來，結果跟抓到的一模一樣。沒有這條備援，遇到擋抓取的站就是死路。
 */

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CHIP, CIS, type ChipTone } from "@/app/admin/_components/cis";
import { Icon } from "@/app/admin/_ui/icons";
import { isShortVideoUrl } from "@/config/news";
import { addNewsByTextAction, addNewsByUrlAction } from "@/lib/actions/news";
import { NEWS_LINES, NEWS_LINE_LABEL, type NewsLine } from "@/lib/news";
import styles from "@/app/admin/listings/listings-admin.module.css";

export default function AddNewsByUrl() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [url, setUrl] = useState("");
  const [line, setLine] = useState<NewsLine>("article");
  /** 貼的是抖音／TikTok 嗎 —— 用字、預設那條線、提醒都跟著它變 */
  const video = isShortVideoUrl(url.trim());
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ tone: ChipTone; text: string } | null>(null);

  const fieldStyle: React.CSSProperties = { background: CIS.bgSoft, borderColor: CIS.cardBorder, color: CIS.text };
  const btnBase: React.CSSProperties = { borderColor: CIS.cardBorder, color: CIS.textSub };
  const btnPrimary: React.CSSProperties = { borderColor: CIS.blue, color: CIS.blue };

  function done(taskId: string, note: string) {
    setUrl("");
    setTitle("");
    setText("");
    setManual(false);
    setMsg({ tone: "success", text: note });
    startTransition(() => {
      router.push(`/admin/content?focus=${encodeURIComponent(taskId)}`);
      router.refresh();
    });
  }

  async function grab() {
    if (!url.trim()) return;
    setBusy(true);
    setMsg({ tone: "info", text: "抓取中… 大約 5 到 15 秒。" });
    const r = await addNewsByUrlAction(url.trim(), line);
    setBusy(false);
    if (!r.ok || !r.taskId) {
      setMsg({ tone: "danger", text: `${r.error || "抓不到"}　→ 可以用下面的「自己貼內文」把文字貼進來。` });
      setManual(true);
      return;
    }
    const notes = [
      r.taskCreated ? `已排進待產文案（${NEWS_LINE_LABEL[line]}）` : `這則的${NEWS_LINE_LABEL[line]}本來就排過了`,
      r.newsExisted ? "這則新聞資料庫裡本來就有" : "",
      r.hasContent ? "" : "⚠️ 沒抓到內文，只有標題 —— 用下面的「自己貼內文」補一次會比較好寫",
    ].filter(Boolean);
    done(r.taskId, `${r.title}｜${notes.join("；")}`);
  }

  async function saveManual() {
    setBusy(true);
    // 短影音的文案常常沒有「標題」這種東西，標題空著就拿文案第一行當辨識用的名字，
    // 不要為了一個欄位把他擋在外面（他要的是趕快把題材丟進去）
    const finalTitle =
      title.trim() ||
      (video ? (text.trim().split(/\r?\n/).find((l) => l.trim())?.trim() ?? "").slice(0, 60) : "");
    const r = await addNewsByTextAction(url.trim(), finalTitle, text, line);
    setBusy(false);
    if (!r.ok || !r.taskId) {
      setMsg({ tone: "danger", text: r.error || "存檔失敗" });
      return;
    }
    done(r.taskId, `${r.title}｜已存進待產文案（${NEWS_LINE_LABEL[line]}）`);
  }

  return (
    <div style={{ marginTop: 14, padding: "14px 16px", border: `1px solid ${CIS.cardBorder}`, borderRadius: 10, background: CIS.card }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Icon name="link" size={16} />
        <b style={{ fontSize: 15 }}>看到想寫的新聞、或想翻拍的抖音／TikTok？把連結貼進來</b>
      </div>
      <p className={styles.msg} style={{ color: CIS.textMute, margin: "0 0 10px" }}>
        不用等明天早上自動抓，也不管它算不算房產新聞 —— 你貼了就收。抓回來會直接排進下面的清單。
        貼抖音／TikTok 會自動走「翻拍」那套指令（10 字標題、黃金三秒鉤子、三版、法規自我檢查）。
      </p>

      {/* 🔴 這段一定要在他按之前就看得到，不能只在失敗時才說。
          短影音的口播在聲音軌裡，讀網頁讀不到 —— 他如果以為連結能把影片裡講的話抓回來，
          抓回來只有一行說明欄文字時就會回報「系統壞了」。先講清楚就不會。 */}
      {video && (
        <p className={styles.msg} style={{ color: CHIP.warn.color, margin: "0 0 10px", lineHeight: 1.9 }}>
          ⚠️ 連結只抓得到<b>說明欄那段文字</b>，抓不到影片裡講的話 —— 口播在聲音軌裡，程式讀網頁讀不到。
          <br />
          要拿「他講的那段口播」當題材，請在 App 裡複製文案（或照字幕打下來），用下面的
          <b>「自己貼影片文案」</b>貼進來，結果一模一樣。抖音常常擋程式讀取，擋了也是走這條。
        </p>
      )}

      <div className={styles.actions} style={{ marginTop: 0 }}>
        <input
          className={styles.input}
          style={{ ...fieldStyle, flex: "1 1 360px", minWidth: 240, minHeight: 38 }}
          placeholder="https://… 新聞網址，或抖音／TikTok 影片連結"
          value={url}
          onChange={(e) => {
            const next = e.target.value;
            setUrl(next);
            // 貼短影音連結就自動切到「短影音」那條線（他還是可以自己改回去）
            if (isShortVideoUrl(next.trim())) setLine("video");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) void grab();
          }}
        />
        <select
          className={styles.select}
          style={{ ...fieldStyle, width: "auto", minHeight: 38 }}
          value={line}
          onChange={(e) => setLine(e.target.value as NewsLine)}
        >
          {NEWS_LINES.map((l) => (
            <option key={l} value={l}>
              做成{NEWS_LINE_LABEL[l]}
            </option>
          ))}
        </select>
        <button type="button" className={styles.btn} style={btnPrimary} disabled={busy || !url.trim()} onClick={grab}>
          <Icon name="download" size={14} />
          {busy ? "抓取中…" : "抓進來"}
        </button>
        <button type="button" className={styles.btn} style={btnBase} disabled={busy} onClick={() => setManual((s) => !s)}>
          {manual ? "收起" : video ? "自己貼影片文案" : "自己貼內文"}
        </button>
      </div>

      {msg && (
        <p className={styles.msg} style={{ color: CHIP[msg.tone].color, marginTop: 8 }}>
          {msg.text}
        </p>
      )}

      {manual && (
        <div style={{ marginTop: 10, padding: "12px 14px", border: `1px solid ${CIS.divider}`, borderRadius: 8, background: CIS.bgSoft }}>
          <p className={styles.msg} style={{ color: CIS.textSub, margin: "0 0 8px" }}>
            {video ? (
              <>
                <b>這條才是拿得到口播內容的路。</b>在抖音／TikTok 把那支影片的文案複製起來（字幕也行，自己打也行），
                整段貼在下面。<b>上面的影片連結還是要填</b>（之後回去看原片、去重都靠它）。
                標題空著的話，會自動用你貼的第一行。
              </>
            ) : (
              <>
                那個網站擋程式抓取或要登入時用這個。<b>上面的網址還是要填</b>（之後回去看原文、去重都靠它），
                標題與內文從網頁上自己複製貼過來。
              </>
            )}
          </p>
          <input
            className={styles.input}
            style={{ ...fieldStyle, width: "100%", minHeight: 38, marginBottom: 8 }}
            placeholder={video ? "影片標題（空著就用文案第一行）" : "新聞標題"}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className={styles.textarea}
            style={{ ...fieldStyle, width: "100%", minHeight: 160 }}
            placeholder={video ? "把影片的文案／字幕整段貼在這裡…" : "把新聞內文整段貼在這裡…"}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.btn}
              style={btnPrimary}
              disabled={busy || !url.trim() || (!video && !title.trim()) || text.trim().length < (video ? 10 : 50)}
              onClick={saveManual}
            >
              <Icon name="save" size={14} />
              存進待產文案
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

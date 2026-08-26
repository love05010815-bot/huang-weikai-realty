"use client";
/**
 * 一則留言的回覆框（四個平台共用）。
 *
 * 預設收起來只有一顆「回覆」鈕 —— 一次展開 30 個輸入框，畫面會變成一片文字田。
 *
 * 🔴 **公開留言與私訊混在同一份清單，回覆框一定要長得不一樣。**
 *    YouTube／FB／IG 送出的是**任何人都看得到的公開回覆**；
 *    LINE 送出的是**只有對方看得到的私訊**，而且走推播、會吃每月免費額度。
 *    把兩者的按鈕文字寫成一樣，遲早會有人把私事公開回出去。
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CIS } from "@/app/admin/_components/cis";
import { Icon } from "@/app/admin/_ui/icons";
import { PLATFORM_LABEL, isPrivatePlatform, type InboxPlatform } from "@/lib/inbox-types";
import styles from "./inbox.module.css";

const MAX = 4000;

export default function CommentReply({
  platform,
  commentId,
  author,
  alreadyAnswered,
}: {
  platform: InboxPlatform;
  commentId: string;
  author: string;
  /** 你已經回過這串了 —— 還是可以再回，但預設收起來並且講清楚 */
  alreadyAnswered: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // 私訊 vs 公開留言 —— 底下所有文案都跟著這個變數走。
  const priv = isPrivatePlatform(platform);

  const trimmed = text.trim();
  const tooLong = text.length > MAX;
  const canSend = Boolean(trimmed) && !tooLong && !busy;

  const send = async () => {
    if (!canSend) return;
    setBusy(true);
    setMsg(null);
    const { replyInboxCommentAction } = await import("@/lib/actions/inbox");
    const r = await replyInboxCommentAction(platform, commentId, trimmed);
    setBusy(false);

    if (r.ok) {
      // 送出去了才清空並收起來。失敗時留著你打的字，不要逼你重打。
      setText("");
      setOpen(false);
      setMsg({
        ok: true,
        text: priv
          ? `已送出私訊，${author} 立刻收得到。`
          : `已回覆，${PLATFORM_LABEL[platform]} 上立刻看得到。`,
      });
      router.refresh();
    } else {
      setMsg({ ok: false, text: r.error || "送出失敗，原因不明" });
    }
  };

  if (!open) {
    return (
      <div className={styles.replyRow}>
        <button
          type="button"
          className={styles.btn}
          style={{ borderColor: CIS.cardBorder, color: alreadyAnswered ? CIS.textMute : CIS.blue }}
          onClick={() => {
            setOpen(true);
            setMsg(null);
          }}
        >
          <Icon name="reply" size={15} />
          {alreadyAnswered ? "再回一則" : "回覆"}
        </button>
        {msg ? (
          <span className={styles.replyMsg} style={{ color: msg.ok ? "#4ade80" : "#fb7185" }}>
            {msg.text}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.replyOpen}>
      <textarea
        className={styles.replyInput}
        style={{ background: "#141414", borderColor: CIS.cardBorder, color: CIS.text }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Ctrl/Cmd+Enter 送出。單獨 Enter 留給換行。
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            void send();
          }
        }}
        placeholder={`${priv ? "私訊" : "公開回覆"} ${author}…（Ctrl+Enter 送出）`}
        rows={3}
        autoFocus
      />
      <div className={styles.replyRow}>
        <span className={styles.replyHint} style={{ color: tooLong ? "#fb7185" : CIS.textMute }}>
          {tooLong
            ? `太長了 ${text.length}／${MAX} 字`
            : priv
              ? `這是一對一私訊，只有 ${author} 看得到。用推播送出，會計入 LINE 每月免費訊息額度。`
              : `這是公開回覆，${PLATFORM_LABEL[platform]} 上任何人都看得到。以你的官方身分送出。`}
        </span>
        <button
          type="button"
          className={styles.btn}
          style={
            canSend
              ? { background: CIS.blueDeep, color: "#fff", borderColor: CIS.blueDeep }
              : { background: "transparent", color: CIS.textMute, borderColor: CIS.cardBorder }
          }
          onClick={send}
          disabled={!canSend}
        >
          <Icon name="send" size={15} />
          {busy ? "送出中…" : priv ? "送出私訊" : "公開回覆"}
        </button>
        <button
          type="button"
          className={styles.btn}
          style={{ borderColor: CIS.cardBorder, color: CIS.textSub }}
          onClick={() => {
            setOpen(false);
            setMsg(null);
          }}
          disabled={busy}
        >
          取消
        </button>
      </div>
      {msg ? (
        <div className={styles.replyMsg} style={{ color: msg.ok ? "#4ade80" : "#fb7185" }}>
          {msg.text}
        </div>
      ) : null}
    </div>
  );
}

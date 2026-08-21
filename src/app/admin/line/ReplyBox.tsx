"use client";
/**
 * 後台直接回客戶的輸入框。
 *
 * 為什麼是 client component：要有「送出中」狀態、要能 Ctrl+Enter、送失敗要留住
 * 你打的字（server action 的 form 送失敗會把 textarea 清空，那等於叫你重打一次）。
 *
 * ⚠️ 這裡送出的是 push 訊息，會吃官方帳號的免費額度。額度資訊由上層傳進來顯示。
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CIS } from "@/app/admin/_components/cis";
import { Icon } from "@/app/admin/_ui/icons";
import styles from "./line.module.css";

const MAX = 4800;

export default function ReplyBox({
  lineUserId,
  displayName,
  quotaExhausted,
}: {
  lineUserId: string;
  displayName: string | null;
  /** 免費額度已用完 —— 送了也是白送，先擋住並講清楚 */
  quotaExhausted: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const trimmed = text.trim();
  const tooLong = text.length > MAX;
  const canSend = Boolean(trimmed) && !tooLong && !busy && !quotaExhausted;

  const send = async () => {
    if (!canSend) return;
    setBusy(true);
    setMsg(null);
    const { sendLineReplyAction } = await import("@/lib/actions/line-bot");
    const r = await sendLineReplyAction(lineUserId, trimmed);
    setBusy(false);

    if (r.ok) {
      // 送出去了才清空。失敗時留著你打的字，不要逼你重打。
      setText("");
      setMsg({ ok: true, text: r.error || "已送出，客戶的 LINE 立刻會收到。" });
      router.refresh();
    } else {
      setMsg({ ok: false, text: r.error || "送出失敗，原因不明" });
    }
  };

  return (
    <div className={styles.replyBox} style={{ borderColor: CIS.divider }}>
      <textarea
        className={styles.replyInput}
        style={{ background: "#141414", borderColor: CIS.cardBorder, color: CIS.text }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Ctrl/Cmd+Enter 送出。單獨的 Enter 留給換行 —— 房仲回話常常要分段，
          // Enter 直接送會變成一句一則轟炸客戶，而且每則都吃額度。
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            void send();
          }
        }}
        placeholder={
          quotaExhausted
            ? "本月免費訊息額度已用完，送不出去"
            : `直接回覆${displayName || "這位客戶"}…（Ctrl+Enter 送出）`
        }
        rows={3}
        disabled={quotaExhausted}
      />

      <div className={styles.replyBar}>
        <span
          className={styles.replyHint}
          style={{ color: tooLong ? "#fb7185" : CIS.textMute }}
        >
          {tooLong
            ? `太長了 ${text.length}／${MAX} 字，分兩則送`
            : "送出後會自動接手這位客戶，機器人不再插話。這則會用掉一則免費訊息額度。"}
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
          {busy ? "送出中…" : "送出"}
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

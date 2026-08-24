"use client";
/**
 * 解除平台綁定（YouTube／Meta 共用）。
 *
 * 會再問一次 —— 解綁本身不痛（重綁就好），但重綁要再跑一次授權同意頁，誤按很煩。
 * 解某一個平台不會動到其他平台，也不會動到 Google 日曆，確認框裡有講。
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CIS } from "@/app/admin/_components/cis";
import { Icon } from "@/app/admin/_ui/icons";
import styles from "./inbox.module.css";

export default function UnbindButton({ target }: { target: "youtube" | "meta" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const label = target === "youtube" ? "YouTube" : "Facebook／Instagram";

  const run = async () => {
    if (busy) return;
    if (
      !window.confirm(
        `解除 ${label} 綁定？\n\n收件匣會看不到這個平台的留言，要重綁得再跑一次授權。\n（不會影響其他平台，也不會影響 Google 日曆。）`,
      )
    ) {
      return;
    }
    setBusy(true);
    if (target === "youtube") {
      const { unbindYoutubeAction } = await import("@/lib/actions/youtube");
      await unbindYoutubeAction();
    } else {
      const { unbindMetaAction } = await import("@/lib/actions/inbox");
      await unbindMetaAction();
    }
    setBusy(false);
    router.refresh();
  };

  return (
    <button
      type="button"
      className={styles.btn}
      style={{ borderColor: CIS.cardBorder, color: CIS.textMute }}
      onClick={run}
      disabled={busy}
    >
      <Icon name="close" size={14} />
      {busy ? "解除中…" : "解除綁定"}
    </button>
  );
}

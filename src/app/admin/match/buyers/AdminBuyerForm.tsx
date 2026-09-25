"use client";
/**
 * 後台版的買方表單：BuyerEditor 接上「看登入」的 saveBuyerAction、套深色樣式。
 * 新建存好跳到那位買方的詳情頁；編輯存好 refresh、把表單收起來。
 */
import { useRouter } from "next/navigation";
import type { MatchMeta } from "@/app/match/preference-state";
import { saveBuyerAction } from "@/lib/actions/match";
import BuyerEditor, { type EditableBuyer } from "./BuyerEditor";
import styles from "./buyer-form.module.css";

export default function AdminBuyerForm({ meta, buyer, onDone }: { meta: MatchMeta; buyer?: EditableBuyer | null; onDone?: () => void }) {
  const router = useRouter();
  return (
    <BuyerEditor
      meta={meta}
      buyer={buyer}
      styles={styles}
      onSave={(id, values) => saveBuyerAction(id, values)}
      afterSave={(r) => {
        if (buyer) {
          router.refresh();
          onDone?.();
        } else if (r.id) {
          router.push(`/admin/match/buyers/${r.id}${r.merged ? "?merged=1" : ""}`);
        }
      }}
      onCancel={onDone}
    />
  );
}

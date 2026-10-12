/**
 * 📄 委託合約到期提醒 —— 到期前 7 天推 LINE 給專員（他的官方帳號 @a8865 推給他自己的 LINE）
 *
 * 誰收：跟「新預約通知」同一份名單（`getAgentLineIds()`，後台 /admin/match 勾的那幾支 LINE）。
 * 怎麼推：`pushMessage()`（官方帳號 push API）。輕用量方案每月只有 200 則，所以一天最多一則、
 * 好幾件合在同一則裡；名單上有幾支就幾則。
 *
 * 什麼時候推：迄日落在 [今天, 今天+7] 而且 `contract_reminded_for` 不等於這個迄日。
 * 推成功（至少一支收到）才標記。迄日之後被改掉，updateProperty 會把標記清掉，新迄日會再推。
 * 迄日已過的不推（已經來不及了，清單上有「已過期」標籤）。
 *
 * 觸發：vercel.json 的 cron（每天 01:30 UTC ＝ 台北 09:30）打 /api/owners/contract-reminder。
 * 端點公開但冪等：沒有該推的就什麼都不做；同一件推過就不會再推。
 */
import { CONTRACT_REMIND_DAYS } from "@/config/owners";
import { getAgentLineIds } from "@/lib/match/agents";
import { pushMessage } from "@/lib/line-bot/client";
import { listContractsDue, markContractReminded } from "@/lib/owners";
import { addDays, buildContractReminderText } from "@/lib/owners-text";
import { taipeiDay } from "@/lib/site-visits";

export type ContractReminderResult = {
  today: string;
  until: string;
  /** 落在視窗內的全部（含已提醒過的） */
  due: number;
  /** 這次真的要推的 */
  pending: number;
  recipients: number;
  delivered: number;
  marked: number;
  dryRun: boolean;
  /** 給 dry-run 看的訊息內容 */
  preview: string | null;
  reason?: string;
};

export async function runContractReminders(opts: { dryRun?: boolean; today?: string } = {}): Promise<ContractReminderResult> {
  const today = opts.today ?? taipeiDay();
  const until = addDays(today, CONTRACT_REMIND_DAYS);
  const dryRun = Boolean(opts.dryRun);

  const all = await listContractsDue(today, until);
  const pending = all.filter((r) => r.contractRemindedFor !== r.contractEnd);

  const base: ContractReminderResult = {
    today,
    until,
    due: all.length,
    pending: pending.length,
    recipients: 0,
    delivered: 0,
    marked: 0,
    dryRun,
    preview: null,
  };
  if (pending.length === 0) return { ...base, reason: "nothing_due" };

  // 本機 APPOINTMENT_BASE_URL 是 localhost，推到 LINE 上點不開；不是 https 的一律用正式網址
  const envUrl = process.env.APPOINTMENT_BASE_URL || "";
  const siteUrl = envUrl.startsWith("https://") ? envUrl : "https://weikaihouse.com";
  const text = buildContractReminderText(today, pending, siteUrl);
  base.preview = text;

  const ids = await getAgentLineIds();
  base.recipients = ids.length;
  if (dryRun) return base;
  if (ids.length === 0) return { ...base, reason: "no_recipients" };

  let delivered = 0;
  for (const id of ids) {
    // 循序推，連線池只有 3 條、名單也只有兩三支
    if (await pushMessage(id, text)) delivered++;
  }
  base.delivered = delivered;
  if (delivered === 0) return { ...base, reason: "push_failed" };

  await markContractReminded(pending.map((r) => r.propertyId));
  base.marked = pending.length;
  return base;
}

/**
 * 對話記錄與節流 —— 機器人的記憶體
 *
 * 為什麼一定要存 DB：Vercel 是無狀態的，每則訊息都是一次全新的函式執行。
 * 不存起來的話，客戶說「那間多少錢」時機器人完全不知道「那間」是哪間，
 * 每一句都像第一次見面。這是 AI 客服好用與難用的分界線。
 *
 * 沿用這個專案既有的做法：表在第一次用到時自己 CREATE TABLE IF NOT EXISTS，
 * 不進 prisma/schema.prisma、不需要 migration、不會動到既有的預約資料。
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";

let tablesEnsured = false;

async function ensureTables(): Promise<void> {
  if (tablesEnsured) return;

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS line_bot_message (
      id           CHAR(32)     NOT NULL,
      line_user_id VARCHAR(64)  NOT NULL,
      role         VARCHAR(16)  NOT NULL,
      content      TEXT         NOT NULL,
      created_at   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      KEY line_bot_message_user_idx (line_user_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 2026-08-21 後台可以直接回客戶了，所以要分得出「這句是機器人講的」還是
  // 「這句是本人在後台打的」。兩者在 AI 眼中都是 assistant（客戶看到的都是官方帳號），
  // 差別只在畫面上要標對，不然你回頭看對話會以為是機器人講的。
  //
  // 先查再加，不用 try/catch 吞錯 —— 那樣每次啟動都印一行 prisma:error，
  // 久了就會習慣性忽略 log。
  const hasSentBy = await db.$queryRawUnsafe<unknown[]>(
    `SHOW COLUMNS FROM line_bot_message LIKE 'sent_by'`,
  );
  if (hasSentBy.length === 0) {
    await db.$executeRawUnsafe(
      `ALTER TABLE line_bot_message ADD COLUMN sent_by VARCHAR(16) NULL AFTER role`,
    );
  }

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS line_bot_user (
      line_user_id VARCHAR(64)  NOT NULL,
      display_name VARCHAR(160) NULL,
      muted        TINYINT(1)   NOT NULL DEFAULT 0,
      message_count INT         NOT NULL DEFAULT 0,
      first_seen_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      last_seen_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (line_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 2026-08-25 收件匣要顯示「LINE 有幾則還沒回」，需要一個能「清掉」的標記。
  //
  // ⚠️ 為什麼不能只看「最後一則是不是客戶傳的」就算未回：
  //    LINE 的 webhook **只收得到客戶傳進來的訊息**。系統擁有者在手機 LINE App
  //    或官方帳號管理後台回的，這裡完全看不到。所以純靠訊息推斷，數字會永遠偏高，
  //    紅點清不掉 → 兩天後就變成沒人看的裝飾。那比不做還糟。
  //
  //    handled_at 就是給人手動清的：按「標記已回」寫入當下時間，
  //    之後客戶又傳新訊息（created_at > handled_at）就自動重新亮起來。
  const hasHandledAt = await db.$queryRawUnsafe<unknown[]>(
    `SHOW COLUMNS FROM line_bot_user LIKE 'handled_at'`,
  );
  if (hasHandledAt.length === 0) {
    await db.$executeRawUnsafe(
      `ALTER TABLE line_bot_user ADD COLUMN handled_at TIMESTAMP(3) NULL AFTER last_seen_at`,
    );
  }

  tablesEnsured = true;
}

export type StoredMessage = {
  role: "user" | "assistant";
  content: string;
};

/** 誰送的。null／"bot" = 機器人；"human" = 本人在後台打的。客戶端看起來都一樣。 */
export type SentBy = "bot" | "human";

/** 寫一則訊息進對話記錄。 */
export async function saveMessage(
  lineUserId: string,
  role: "user" | "assistant",
  content: string,
  sentBy: SentBy | null = null,
): Promise<void> {
  await ensureTables();
  await db.$executeRawUnsafe(
    `INSERT INTO line_bot_message (id, line_user_id, role, sent_by, content) VALUES (?, ?, ?, ?, ?)`,
    randomUUID().replace(/-/g, ""),
    lineUserId,
    role,
    sentBy,
    content.slice(0, 8000),
  );
}

/**
 * 取最近的對話歷史，由舊到新排好給 AI 用。
 * 注意 SQL 是先 DESC 取最新 N 筆再反轉 —— 直接 ASC LIMIT 會拿到最古老的那幾則。
 */
export async function getHistory(lineUserId: string, limit: number): Promise<StoredMessage[]> {
  await ensureTables();

  // LIMIT 直接寫進 SQL 而不用 ? 綁定：MySQL 家族對「LIMIT ?」的 prepared statement
  // 支援不一致，綁定會踩到型別錯誤。這裡先夾成安全的整數再內插，
  // 值來自我們自己的設定檔不是使用者輸入，沒有注入風險。
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));

  const rows = await db.$queryRawUnsafe<{ role: string; content: string }[]>(
    `SELECT role, content FROM line_bot_message
     WHERE line_user_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT ${safeLimit}`,
    lineUserId,
  );

  return rows
    .reverse()
    .map((r) => ({
      role: r.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: r.content,
    }))
    .filter((m) => m.content.trim().length > 0);
}

/**
 * 節流：這個客戶最近 60 秒送了幾則。
 * 直接數 message 表就好，不必另外開一張 rate limit 表。
 */
export async function countRecentUserMessages(lineUserId: string): Promise<number> {
  await ensureTables();
  const rows = await db.$queryRawUnsafe<{ c: bigint | number }[]>(
    `SELECT COUNT(*) AS c FROM line_bot_message
     WHERE line_user_id = ? AND role = 'user'
       AND created_at > DATE_SUB(NOW(3), INTERVAL 60 SECOND)`,
    lineUserId,
  );
  const raw = rows[0]?.c ?? 0;
  return typeof raw === "bigint" ? Number(raw) : raw;
}

export type BotUser = {
  muted: boolean;
  displayName: string | null;
  isNew: boolean;
};

/**
 * 記下這個客戶並回傳他的狀態。
 * muted = 你已在後台接手這個客戶，機器人就閉嘴不要插話。
 */
export async function touchUser(lineUserId: string, displayName: string | null): Promise<BotUser> {
  await ensureTables();

  const existing = await db.$queryRawUnsafe<{ muted: number; display_name: string | null }[]>(
    `SELECT muted, display_name FROM line_bot_user WHERE line_user_id = ? LIMIT 1`,
    lineUserId,
  );

  const isNew = existing.length === 0;

  await db.$executeRawUnsafe(
    `INSERT INTO line_bot_user (line_user_id, display_name, message_count)
     VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE
       display_name  = COALESCE(VALUES(display_name), display_name),
       message_count = message_count + 1,
       last_seen_at  = CURRENT_TIMESTAMP(3)`,
    lineUserId,
    displayName,
  );

  return {
    muted: existing[0]?.muted === 1,
    displayName: existing[0]?.display_name ?? displayName,
    isNew,
  };
}

/**
 * 手動接手／放手某個客戶。
 * muted = true 之後機器人就不再回這個人，直到你把它改回 false。
 */
export async function setMuted(lineUserId: string, muted: boolean): Promise<void> {
  await ensureTables();
  await db.$executeRawUnsafe(
    `UPDATE line_bot_user SET muted = ? WHERE line_user_id = ?`,
    muted ? 1 : 0,
    lineUserId,
  );
}

/* ────────────────────────────────────────────────────────────
   以下是「後台 /admin/line」用的查詢，機器人本身不會用到。
   刻意跟上面的 bot 執行路徑分開，改這裡不會影響客戶對話。
   ──────────────────────────────────────────────────────────── */

export type BotUserSummary = {
  lineUserId: string;
  displayName: string | null;
  muted: boolean;
  messageCount: number;
  lastSeenAt: Date;
  /** 最後一則訊息（不分你我），用來在清單上一眼看出聊到哪 */
  lastMessage: string | null;
  lastMessageAt: Date | null;
  /** 最後一則是客戶傳的、而且還沒被標記已回 —— 清單上要標出來 */
  awaitingReply: boolean;
};

/** 後台清單：跟機器人講過話的人，最近講話的排前面。 */
export async function listBotUsers(limit = 100): Promise<BotUserSummary[]> {
  await ensureTables();
  const safeLimit = Math.min(300, Math.max(1, Math.floor(limit)));

  const rows = await db.$queryRawUnsafe<
    {
      line_user_id: string;
      display_name: string | null;
      muted: number;
      message_count: number;
      last_seen_at: Date;
      last_message: string | null;
      last_message_at: Date | null;
      last_role: string | null;
      handled_at: Date | null;
    }[]
  >(
    // last_role／handled_at 是順手在同一句撈出來的 —— 連線池只有 3 條，
    // 為了一個布林值再開一次查詢不划算。
    `SELECT u.line_user_id, u.display_name, u.muted, u.message_count, u.last_seen_at, u.handled_at,
       (SELECT m.content    FROM line_bot_message m
         WHERE m.line_user_id = u.line_user_id
         ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_message,
       (SELECT m.created_at FROM line_bot_message m
         WHERE m.line_user_id = u.line_user_id
         ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_message_at,
       (SELECT m.role       FROM line_bot_message m
         WHERE m.line_user_id = u.line_user_id
         ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_role
     FROM line_bot_user u
     ORDER BY u.last_seen_at DESC
     LIMIT ${safeLimit}`,
  );

  return rows.map((r) => ({
    lineUserId: r.line_user_id,
    displayName: r.display_name,
    muted: r.muted === 1,
    messageCount: Number(r.message_count ?? 0),
    lastSeenAt: r.last_seen_at,
    lastMessage: r.last_message,
    lastMessageAt: r.last_message_at,
    awaitingReply:
      r.last_role === "user" &&
      (r.handled_at == null ||
        (r.last_message_at != null && r.handled_at < r.last_message_at)),
  }));
}

export type ConversationTurn = {
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
  /** assistant 的訊息才有意義：是機器人講的還是你本人在後台回的 */
  sentBy: SentBy | null;
};

/** 後台看單一客戶的完整對話，由舊到新（跟聊天視窗一樣的順序）。 */
export async function getConversation(
  lineUserId: string,
  limit = 200,
): Promise<ConversationTurn[]> {
  await ensureTables();
  const safeLimit = Math.min(500, Math.max(1, Math.floor(limit)));

  const rows = await db.$queryRawUnsafe<
    { role: string; sent_by: string | null; content: string; created_at: Date }[]
  >(
    `SELECT role, sent_by, content, created_at FROM line_bot_message
     WHERE line_user_id = ?
     ORDER BY created_at ASC, id ASC
     LIMIT ${safeLimit}`,
    lineUserId,
  );

  return rows.map((r) => ({
    role: r.role === "assistant" ? ("assistant" as const) : ("user" as const),
    content: r.content,
    createdAt: r.created_at,
    sentBy: r.sent_by === "human" ? ("human" as const) : r.sent_by === "bot" ? ("bot" as const) : null,
  }));
}

/** 後台首頁的小計：講過話的人數、今天的訊息數。 */
export async function getBotStats(): Promise<{ users: number; messagesToday: number }> {
  await ensureTables();
  const [u] = await db.$queryRawUnsafe<{ c: bigint | number }[]>(
    `SELECT COUNT(*) AS c FROM line_bot_user`,
  );
  const [m] = await db.$queryRawUnsafe<{ c: bigint | number }[]>(
    `SELECT COUNT(*) AS c FROM line_bot_message WHERE created_at >= CURDATE()`,
  );
  const toNum = (v: bigint | number | undefined) =>
    typeof v === "bigint" ? Number(v) : Number(v ?? 0);
  return { users: toNum(u?.c), messagesToday: toNum(m?.c) };
}

/**
 * 「LINE 還有幾個人在等你回」—— 給留言收件匣頂端那張提醒卡用的。
 *
 * 定義：這個人的**最後一則訊息是他自己傳的**，而且你還沒按過「標記已回」
 * （或按完之後他又傳了新的）。
 *
 * ⚠️ 這是「等你看一眼」不是「你沒回」。手機 LINE App 回的訊息不會進這個資料庫
 *    （webhook 收不到），所以回過的請按「標記已回」把它清掉，數字才有意義。
 *
 * 刻意壓成**一句 SQL**：這個專案的連線池只有 3 條，分成多句去撈是自己跟自己搶。
 */
export async function countAwaitingReply(): Promise<{ count: number; oldestAt: Date | null }> {
  await ensureTables();
  const [row] = await db.$queryRawUnsafe<{ c: unknown; oldest: Date | null }[]>(
    `SELECT COUNT(*) AS c, MIN(t.last_at) AS oldest FROM (
       SELECT u.handled_at,
         (SELECT m.role       FROM line_bot_message m
           WHERE m.line_user_id = u.line_user_id
           ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_role,
         (SELECT m.created_at FROM line_bot_message m
           WHERE m.line_user_id = u.line_user_id
           ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_at
       FROM line_bot_user u
     ) t
     WHERE t.last_role = 'user'
       AND (t.handled_at IS NULL OR t.handled_at < t.last_at)`,
  );
  // COUNT() 經 $queryRawUnsafe 回來是**字串**，直接拿去算會變字串黏接。
  return { count: Number(String(row?.c ?? 0)), oldestAt: row?.oldest ?? null };
}

/** 按「標記已回」：把這個人從待回名單清掉。他再傳新訊息就會自己亮回來。 */
export async function markHandled(lineUserId: string, handled: boolean): Promise<void> {
  await ensureTables();
  await db.$executeRawUnsafe(
    `UPDATE line_bot_user SET handled_at = ${handled ? "CURRENT_TIMESTAMP(3)" : "NULL"}
      WHERE line_user_id = ?`,
    lineUserId,
  );
}

# 黃瑋凱｜台中海線房仲個人官網 ＋ 線上預約系統

太平洋房屋資深不動產經紀人黃瑋凱的個人官網，整合線上預約系統。
客戶自己挑時間 → 預約直接成立 → 雙方都收到通知。

## 頁面

| 路徑 | 內容 |
|---|---|
| `/` | 個人官網首頁：形象照、服務區域、戰績、服務項目、預約入口 |
| `/card` | 數位名片（掃 QR 用） |
| `/card/booking` | 線上預約：選主題 → 選時段 → 填資料 → 成立 |
| `/card/booking/manage` | 客戶自助改期／取消 |
| `/admin/appointments` | 後台預約管理（需登入） |

## 服務內容

- **資產配置**：依財務狀況與人生階段規劃房產配置策略
- **稅務諮詢**：房地合一稅、重購退稅、持有稅務試算
- **簡易裝潢**：交屋前後的裝潢建議與資源媒合

服務區域：台中市海線（沙鹿、梧棲、清水、龍井）

## 技術

Next.js 16 ＋ TypeScript ＋ Prisma ＋ MySQL。
選配整合：Google 日曆、Resend 寄信、LINE 通知、Cloudflare Turnstile。

## 本機開發

```bash
npm install
cp .env.example .env.local   # 填入設定，見下方
npx prisma db push
npm run dev
```

`.env.local` 必填四項：

```env
DATABASE_URL="mysql://..."          # MySQL 或 TiDB Cloud
APPOINTMENT_BASE_URL="http://localhost:3000"
APPOINTMENT_TOKEN_SECRET=""         # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
APPOINTMENT_ADMIN_EMAIL=""          # 收預約通知的信箱
```

其餘（Google 日曆、寄信、防機器人）不填也能跑，只是對應功能關閉。

## 上線前必補

1. **Turnstile 防機器人**（`TURNSTILE_SECRET_KEY`）— 不設會收到灌爆的假預約
2. **後台登入**（`AUTH_*`）— 不設 `/admin/appointments` 沒有保護
3. `APPOINTMENT_BASE_URL` 改成正式網址

## 設定

個人資料集中在 [`src/config/owner.ts`](src/config/owner.ts)。
預約規則（營業時間、時段長度、可選地點）在 [`src/lib/appointment-constants.ts`](src/lib/appointment-constants.ts)。

## 授權

預約系統原始碼採 MIT 授權。
網站文案、形象照與品牌識別為黃瑋凱所有，請勿直接取用。

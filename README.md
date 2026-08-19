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
git clone https://github.com/love05010815-bot/huang-weikai-realty.git
cd huang-weikai-realty
npm install
npm run dev
```

開 http://localhost:3000 即可。

### 設定檔

專案需要 `.env.local` 才跑得起來（`src/lib/db.ts` 在載入時就會建立資料庫連線，
沒有 `DATABASE_URL` 會直接拋錯，不是只有預約頁受影響）。

**協作者**：跟專案負責人索取 `.env.designer`，改名成 `.env.local` 放在專案根目錄即可。
裡面接的是**開發專用資料庫**，與正式站完全隔離——不同 cluster、不同帳號、不同資料庫名稱，
你建立的測試預約不會進正式後台，也讀不到任何真實客戶資料。

**自行架設**：複製 `.env.example` 成 `.env.local`，必填四項：

```env
DATABASE_URL="mysql://..."          # MySQL 或 TiDB Cloud
APPOINTMENT_BASE_URL="http://localhost:3000"
APPOINTMENT_TOKEN_SECRET=""         # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
APPOINTMENT_ADMIN_EMAIL=""          # 收預約通知的信箱
```

然後 `npx prisma db push` 建資料表。
其餘（Google 日曆、寄信、防機器人）不填也能跑，只是對應功能關閉。

### 改樣式改哪裡

| 想改什麼 | 檔案 |
|---|---|
| 首頁版面與文案 | [`src/app/page.tsx`](src/app/page.tsx) ／ [`src/app/home.module.css`](src/app/home.module.css) |
| 首頁配色變數 | `home.module.css` 最上方的 `.page { --red / --brown / --pink … }` |
| 數位名片 | [`src/app/card/`](src/app/card/)，配色在 [`_cis.ts`](src/app/card/_cis.ts) |
| 預約表單 | [`src/app/card/booking/`](src/app/card/booking/)，配色在 [`Booking.module.css`](src/app/card/booking/Booking.module.css) |
| 後台（深色） | [`src/app/admin/`](src/app/admin/)，配色在 [`_components/cis.ts`](src/app/admin/_components/cis.ts) |

⚠️ 改配色時請保留**語意色**：錯誤紅 `#c9473e`、成功綠 `#176a43`、警告黃 `#e7c47d`。
這幾個顏色是用來傳達狀態的，換成品牌色客戶就看不出哪裡出錯了。

### 部署

部署權限目前只在專案負責人手上（Vercel 免費方案只有一個席位）。
推 code 到 `main` 後，請通知負責人部署。

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

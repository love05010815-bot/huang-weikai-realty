# 愛屋庫存池

把愛屋「委託中」物件列表抓成 `src/config/houseol-inventory.json`，
給 `/admin/map-listings` 後台「從愛屋庫存挑一筆」用（省得手打坪數格局）。

⚠️ **2026-08-25 重建版**。原本 2026-08-21 那套做完測過但沒 commit，本機檔案後來
不見了，這套是照同樣的想法重寫的，架構不完全一樣。

## 四步驟

1. **抓資料**：打開 `tools/houseol/install.html`，照上面說明把書籤拖進瀏覽器書籤列。
   登入愛屋、切到「委託中」列表，每頁按一次書籤，翻頁再按，直到抓完全部頁數
   （目前約 12 頁，愛屋一頁固定顯示 10 筆）。每按一次會下載一個
   `houseol-page-*.json`，存在瀏覽器的「下載項目」資料夾。

2. **合併匯入**：把下載下來的一堆 `houseol-page-*.json` 挪到同一個資料夾，
   然後：

   ```bash
   node tools/houseol/import.js <那個資料夾的路徑>
   ```

   會產生／覆蓋兩個檔案：

   | 檔案 | 內容 | 進版控？ |
   |---|---|---|
   | `src/config/houseol-inventory.json` | 案名、坪數、價格、行政區 | ✅ 會（**沒有門牌**） |
   | `tools/houseol/addresses.local.json` | 只有「編號 → 門牌地址」 | ❌ 不會（gitignore） |

   庫存檔重跑會整個重新產生 —— 物件下架或委託到期了，重抓一次自動從清單
   消失，不用手動刪。地址檔則是**合併**不是覆蓋（書籤一次只抓一頁，
   覆蓋的話最後一次匯入會把前幾頁的地址洗掉）。

3. **把地址送進資料庫**：

   ```bash
   node tools/houseol/push-addresses.js
   ```

   ⚠️ **忘了跑這步不會報錯**，只是後台挑案清單看不到地址、按「帶入」時
   地址欄是空的。第 2 步跑完會提醒你。

4. **在後台挑案**：`/admin/map-listings` 新增物件時可以從庫存池挑一筆，
   帶入標題、坪數、型式、價格，以及**門牌地址**（跑過第 3 步的話）。
   **屬於哪個建案還是要自己選**，系統不會拿地址去猜是哪一棟 ——
   猜錯會把物件掛到別的建案底下，比留白更糟。

## 門牌地址走哪條路（重要）

**這個 repo 是公開的**，一百多位屋主的門牌一個字都不准進版控。
所以地址跟其他欄位是分開走的：

```
愛屋列表 ──┬─ sanitizeRow() 剔掉地址 ─→ houseol-inventory.json  ✅ 進版控
           └─ 只取地址 ─→ addresses.local.json ─→ 資料庫 houseol_address  ❌ 不進版控
```

⚠️ **2026-08-25 改動**：書籤下載的 `houseol-page-*.json` 現在**含完整門牌**
（以前是抓的當下就砍掉）。那些檔案在你的「下載項目」資料夾，不要外傳、
不要丟進任何 repo。`tools/houseol/**/houseol-page-*.json` 已經 gitignore。

⚠️ 為什麼地址不乾脆留在庫存檔然後把庫存檔移出版控：助理那顆 Deploy Hook
是從 GitHub main 建置的，那樣做會讓用 Hook 部署的版本**整份庫存池消失**，
而且不報錯。放資料庫兩條部署路徑拿到的東西才一樣。

`sanitize.js` 是唯一負責剔除的地方，`test-roundtrip.js` 是防線測試，
改動前先跑：

```bash
node tools/houseol/test-roundtrip.js
```

## 檔案說明

| 檔案 | 做什麼 |
|---|---|
| `bookmarklet.js` | 抓取邏輯的原始碼（可讀版），改這個檔案 |
| `build.js` | 把 `bookmarklet.js` 包成書籤網址，重新產生 `install.html` |
| `install.template.html` | `install.html` 的樣板 |
| `install.html` | **實際打開來用的頁面**，`build.js` 自動產生，不要手改 |
| `sanitize.js` | **把門牌從庫存資料剔掉**的邏輯，`import.js`、`auto-scrape.js` 跟測試共用 |
| `import.js` | 合併抓下來的檔案，寫出庫存檔＋地址暫存檔 |
| `addresses.js` | 地址暫存檔的讀寫（合併不覆蓋），`import.js` 跟 `auto-scrape.js` 共用 |
| `push-addresses.js` | 把地址暫存檔送進資料庫 `houseol_address` 表 |
| `addresses.local.json` | 🔒 地址暫存檔本體。**不進版控、不要外傳** |
| `test-roundtrip.js` | 防線測試 |

改了 `bookmarklet.js` 之後要重跑 `node tools/houseol/build.js` 才會反映到
`install.html`。

## 已知限制（v1，2026-08-25）

- 只抓列表頁看得到的欄位，**沒有格局**（幾房幾廳）——愛屋列表本身沒這欄，
  要看格局得點進物件明細頁，這版沒做。後台挑案帶入的文字沒有格局，
  自己手動補一下。
- 沒有「哪些是同事的案」的過濾——之前那版有做，這版沒有欄位可以判斷
  承辦人是誰。都是自己熟悉的案子，先靠自己認。

## 自動化（選用，2026-08-25 新增）

上面三步驟也可以排程自動跑，不用每次自己登入愛屋按書籤。**這是瑋凱在知道
下面兩個風險之後決定要做的，不是預設行為**：

1. **帳號安全**：愛屋帳密要存在 GitHub Actions 的 Secrets 裡，外洩風險比
   Deploy Hook 高很多——Deploy Hook 外洩頂多是有人亂觸發部署，愛屋帳密外
   洩等於**任何人都能登入看到全店委託資料**（含同事的案子）。
2. **服務條款風險**：愛屋服務條款可能不允許自動化登入，帳號有被判定機器人
   行為、被停權的風險，這件事沒辦法事先保證不會發生。

**要停用**：把 `.github/workflows/houseol-sync.yml` 裡 `schedule` 那三行
刪掉（或整個檔案刪掉），或是去 repo 的 Settings → Secrets 把 `HOUSEOL_*`
三把刪掉。手動的書籤流程完全不受影響，兩套是各自獨立的。

### 設定步驟

去 repo 的 **Settings → Secrets and variables → Actions → New repository
secret**，新增這四把（**帳密直接貼在 GitHub 的欄位裡，不要貼進跟 AI 助理
的對話**）：

| Secret 名稱 | 值 |
|---|---|
| `HOUSEOL_STORE_CODE` | 愛屋登入頁的「店代號」 |
| `HOUSEOL_USERNAME` | 愛屋登入頁的「帳號」 |
| `HOUSEOL_PASSWORD` | 愛屋登入頁的「密碼」 |
| `VERCEL_DEPLOY_HOOK` | 跟 `.env.local` 裡 `VERCEL_DEPLOY_HOOK` 那組一樣的網址 |

設定完，去 repo 的 **Actions** 分頁 → 左邊選 `houseol-sync` → 右上角
**Run workflow** 手動跑一次，確認真的會通（愛屋的登入頁面結構、換頁方式
都是照畫面截圖寫的，**沒辦法在沒有帳密的情況下事先測過**，第一次跑務必
自己看一下 Actions 的執行紀錄有沒有成功）。跑成功之後才會照排程（**每天
台灣時間凌晨 3 點**）自動執行。

### 如果自動跑失敗了

腳本有安全閥：**抓到 0 筆絕對不會覆蓋現有的庫存池**，失敗頂多是 Actions
那次執行標紅色、`src/config/houseol-inventory.json` 維持原樣，不會把後台
挑案功能弄壞。失敗常見原因：

- 愛屋密碼改了、帳號被鎖 —— 去 Secrets 更新
- 愛屋改版，登入頁欄位或列表結構跟寫死的不一樣 —— 要回來請人重寫
  `auto-scrape.js` 裡對應的部分
- 連續失敗好幾天沒空處理，**手動書籤流程隨時可以接手**，兩套不互相依賴

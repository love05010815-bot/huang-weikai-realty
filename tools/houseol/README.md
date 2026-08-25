# 愛屋庫存池

把愛屋「委託中」物件列表抓成 `src/config/houseol-inventory.json`，
給 `/admin/map-listings` 後台「從愛屋庫存挑一筆」用（省得手打坪數格局）。

⚠️ **2026-08-25 重建版**。原本 2026-08-21 那套做完測過但沒 commit，本機檔案後來
不見了，這套是照同樣的想法重寫的，架構不完全一樣。

## 三步驟

1. **抓資料**：打開 `tools/houseol/install.html`，照上面說明把書籤拖進瀏覽器書籤列。
   登入愛屋、切到「委託中」列表，每頁按一次書籤，翻頁再按，直到抓完全部頁數
   （目前約 12 頁，愛屋一頁固定顯示 10 筆）。每按一次會下載一個
   `houseol-page-*.json`，存在瀏覽器的「下載項目」資料夾。

2. **合併匯入**：把下載下來的一堆 `houseol-page-*.json` 挪到同一個資料夾，
   然後：

   ```bash
   node tools/houseol/import.js <那個資料夾的路徑>
   ```

   會產生／覆蓋 `src/config/houseol-inventory.json`。重跑會整個重新產生 ——
   物件下架或委託到期了，重抓一次自動從清單消失，不用手動刪。

3. **在後台挑案**：`/admin/map-listings` 新增物件時可以從庫存池挑一筆，
   帶入標題、坪數、型式、價格這些文字欄位。**屬於哪個建案還是要自己選**，
   系統不會自動比對——地址只留到行政區等級，沒辦法自動判斷是哪一棟。

## 為什麼地址只留行政區

這個 repo 是公開的。書籤小工具抓資料的當下，門牌地址就立刻砍到只剩
「梧棲區」這種等級，完整地址不會出現在下載的 json、也不會進
`src/config/houseol-inventory.json`。`sanitize.js` 是唯一做這件事的地方，
`test-roundtrip.js` 是防線測試，改動前先跑：

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
| `sanitize.js` | 地址砍到行政區等級的邏輯，`import.js` 跟測試共用 |
| `import.js` | 合併抓下來的檔案，寫出 `src/config/houseol-inventory.json` |
| `test-roundtrip.js` | 防線測試 |

改了 `bookmarklet.js` 之後要重跑 `node tools/houseol/build.js` 才會反映到
`install.html`。

## 已知限制（v1，2026-08-25）

- 只抓列表頁看得到的欄位，**沒有格局**（幾房幾廳）——愛屋列表本身沒這欄，
  要看格局得點進物件明細頁，這版沒做。後台挑案帶入的文字沒有格局，
  自己手動補一下。
- 沒有「哪些是同事的案」的過濾——之前那版有做，這版沒有欄位可以判斷
  承辦人是誰。都是自己熟悉的案子，先靠自己認。
- 翻頁是手動的，一頁按一次書籤，工具不會自動幫你翻頁。

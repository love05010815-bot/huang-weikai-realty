/**
 * 自動登入愛屋、抓「委託中」全部頁數，寫出 src/config/houseol-inventory.json。
 *
 * ⚠️ 這是瑋凱在知道風險之後決定要做的自動化，風險寫在 README「自動化」那節，
 *    不要在沒讀過那節的情況下改這支或排更頻繁的排程。
 *
 * 用法（本機測試）：
 *   cd tools/houseol
 *   npm install
 *   npx playwright install --with-deps chromium   # 第一次要裝瀏覽器核心
 *   HOUSEOL_STORE_CODE=xxx HOUSEOL_USERNAME=xxx HOUSEOL_PASSWORD=xxx node auto-scrape.js
 *
 * 正式運作是排程跑（.github/workflows/houseol-sync.yml），帳密放在 GitHub Actions
 * 的 Secrets，不會出現在任何 log 或 commit 裡。
 *
 * ## 安全閥
 * 抓到 0 筆的話**絕對不會**覆蓋掉現有的 houseol-inventory.json —— 抓到 0 筆通常代表
 * 登入失敗、被擋、或愛屋改版，寫 0 筆進去只會讓後台的挑案功能無聲無息壞掉，
 * 比整支腳本直接噴錯更糟。
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { sanitizeRow } = require("./sanitize");

const LOGIN_URL = "https://es.houseol.com.tw/login.aspx";
const LIST_URL = "https://es.houseol.com.tw/index.aspx?module=manage&file=main&unit=2&ObjState=2";
const OUT_PATH = path.join(__dirname, "..", "..", "src", "config", "houseol-inventory.json");

// 跟 bookmarklet.js 是同一套邏輯，故意重複一份 —— 這段要在瀏覽器頁面裡執行
// （page.evaluate 送進去的函式跑在頁面的 JS 環境，不能 require 外部檔案），
// 改一邊記得另一邊也要改。
const EXTRACT_PAGE_FN = () => {
  const FIELD_HEADERS = [
    ["title", "案名"],
    ["community", "社區名稱"],
    ["totalPrice", "總價"],
    ["unitPrice", "單價"],
    ["buildingType", "型式"],
    ["caseId", "編號"],
    ["listedFrom", "委託起日"],
    ["listedTo", "委託迄日"],
    ["registeredPing", "登記坪"],
    ["landPing", "地坪"],
    ["parkingPing", "車位坪"],
    ["buildingPing", "建物坪"],
    ["address", "門牌地址"],
  ];

  function cellText(cell) {
    return (cell.innerText || cell.textContent || "").replace(/\s+/g, " ").trim();
  }

  function findTableAndColumns() {
    const tables = document.querySelectorAll("table");
    let best = null;
    for (const table of tables) {
      if (!table.rows || table.rows.length < 2) continue;
      const headerRow = table.rows[0];
      if (!headerRow.cells || headerRow.cells.length < 5) continue;

      const colMap = {};
      let hitCount = 0;
      for (let c = 0; c < headerRow.cells.length; c++) {
        const text = cellText(headerRow.cells[c]);
        for (const [key, label] of FIELD_HEADERS) {
          if (colMap[key] === undefined && text.indexOf(label) === 0) {
            colMap[key] = c;
            hitCount++;
            break;
          }
        }
      }
      if (hitCount >= 8 && (!best || hitCount > best.hitCount)) {
        best = { table, colMap, hitCount };
      }
    }
    return best;
  }

  const found = findTableAndColumns();
  if (!found) return [];

  const { table, colMap } = found;
  const rows = [];
  for (let r = 1; r < table.rows.length; r++) {
    const row = table.rows[r];
    if (!row.cells || row.cells.length < 3) continue;
    const rec = {};
    for (const key in colMap) rec[key] = cellText(row.cells[colMap[key]]);
    if (!rec.title && !rec.caseId) continue;
    rows.push(rec);
  }
  return rows;
};

/** 找「純數字選項」的 select —— 那是換頁用的，不是「物件狀」那個文字選項的下拉選單 */
async function findPagerSelect(page) {
  return page.evaluateHandle(() => {
    const selects = Array.from(document.querySelectorAll("select"));
    for (const sel of selects) {
      const opts = Array.from(sel.options).map((o) => o.value.trim());
      const isSequentialNumbers = opts.length > 0 && opts.every((v, i) => v === String(i + 1));
      if (isSequentialNumbers) return sel;
    }
    return null;
  });
}

async function readTotalPages(page) {
  const text = await page.evaluate(() => document.body.innerText);
  const m = text.match(/(\d+)\s*\/\s*(\d+)/);
  return m ? Number(m[2]) : 1;
}

async function login(page) {
  const storeCode = process.env.HOUSEOL_STORE_CODE;
  const username = process.env.HOUSEOL_USERNAME;
  const password = process.env.HOUSEOL_PASSWORD;
  if (!storeCode || !username || !password) {
    throw new Error("缺少 HOUSEOL_STORE_CODE / HOUSEOL_USERNAME / HOUSEOL_PASSWORD 環境變數");
  }

  await page.goto(LOGIN_URL, { waitUntil: "networkidle" });
  await page.fill("#HouseID", storeCode);
  await page.fill("#MemberID", username);
  await page.fill("#MemberPW", password);

  let postbackStatus = null;
  let postbackHeaders = null;
  const onResponse = (res) => {
    if (res.url().includes("login.aspx")) {
      postbackStatus = res.status();
      postbackHeaders = res.headers();
    }
  };
  page.on("response", onResponse);

  // 不用 click() 點那顆 <a href="javascript:__doPostBack(...)">——第一次實跑時
  // postback 完全沒發生（狀態是 null），懷疑無頭瀏覽器點 javascript: 連結不可靠。
  // 直接呼叫頁面自己的 __doPostBack，跟按鈕邏輯完全一樣，繞過點擊這一層。
  await Promise.all([
    page.waitForLoadState("networkidle"),
    page.evaluate(() => {
      // eslint-disable-next-line no-undef
      __doPostBack("LinkButton1", "");
    }),
  ]);
  page.off("response", onResponse);

  if (page.url().includes("login.aspx")) {
    const bodyText = await page.evaluate(() => document.body.innerText);
    // 抓所有含「錯誤/失敗/驗證/鎖定/robot」這類字的行，這種訊息通常藏在某個
    // span/div 裡，第一次失敗時還不知道確切的 id，先用關鍵字撈出來看
    const suspectLines = bodyText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && /錯誤|失敗|鎖定|驗證碼|robot|captcha|封鎖|異常/i.test(l));
    // 標頭裡常常留有防護系統的痕跡（cf-ray 是 Cloudflare、x-akamai 開頭是
    // Akamai 之類），204 這種「處理了但不回內容」的回應很少是網站自己的邏輯，
    // 比較像前面擋了一層
    const headerHints = postbackHeaders
      ? Object.entries(postbackHeaders)
          .filter(([k]) => /cf-|akamai|imperva|waf|challenge|bot|shield|firewall|x-sucuri|x-cache/i.test(k))
          .map(([k, v]) => `${k}: ${v}`)
      : [];
    throw new Error(
      `登入失敗，還停在登入頁。postback HTTP 狀態：${postbackStatus}。` +
        `回應標頭：${postbackHeaders ? JSON.stringify(postbackHeaders) : "（無）"}。` +
        `防護系統痕跡：${headerHints.length ? headerHints.join(" / ") : "沒看到常見的 WAF 標頭"}。` +
        `可疑訊息：${suspectLines.length ? suspectLines.join(" / ") : "（沒找到，可能是帳密錯誤或愛屋擋了自動化）"}。` +
        `頁面文字前 1500 字：${bodyText.slice(0, 1500)}`
    );
  }
}

async function scrapeAllPages(page) {
  await page.goto(LIST_URL, { waitUntil: "networkidle" });

  const totalPages = await readTotalPages(page);
  console.log(`共 ${totalPages} 頁`);

  const allRows = [];
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    if (pageNum > 1) {
      const pagerHandle = await findPagerSelect(page);
      const pagerElement = pagerHandle.asElement();
      if (!pagerElement) {
        throw new Error(`第 ${pageNum} 頁找不到換頁的下拉選單，換頁邏輯可能失效了`);
      }
      await Promise.all([
        page.waitForLoadState("networkidle"),
        pagerElement.selectOption(String(pageNum)),
      ]);
    }

    const rows = await page.evaluate(EXTRACT_PAGE_FN);
    console.log(`第 ${pageNum}/${totalPages} 頁：${rows.length} 筆`);
    allRows.push(...rows);
  }

  return allRows;
}

function buildOutput(rawRows) {
  const byId = new Map();
  for (const raw of rawRows) {
    let clean;
    try {
      clean = sanitizeRow(raw);
    } catch (e) {
      console.error(`跳過一筆資料：${e.message}`);
      continue;
    }
    const key = clean.caseId || clean.title;
    if (!key) continue;
    byId.set(key, clean);
  }

  const items = [...byId.values()].sort((a, b) => (a.district || "").localeCompare(b.district || "", "zh-Hant"));
  const byDistrict = {};
  for (const item of items) {
    const d = item.district || "（未知行政區）";
    byDistrict[d] = (byDistrict[d] || 0) + 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    sourceFiles: 1,
    generatedBy: "auto-scrape",
    count: items.length,
    byDistrict,
    items,
  };
}

async function main() {
  const browser = await chromium.launch();
  try {
    // 用比較接近真人瀏覽器的設定，降低被當成自動化流量擋下來的機會
    // （GitHub Actions 的 IP 是國外機房，這點本來就比本機操作容易被懷疑）
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      locale: "zh-TW",
      timezoneId: "Asia/Taipei",
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    await login(page);
    console.log("登入成功");

    const rawRows = await scrapeAllPages(page);
    console.log(`總共抓到 ${rawRows.length} 筆原始資料`);

    if (rawRows.length === 0) {
      throw new Error("抓到 0 筆，不寫檔——愛屋可能改版了，或列表結構跟預期不同，需要人工檢查");
    }

    const output = buildOutput(rawRows);
    fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf8");
    console.log(`已寫入 ${path.relative(path.join(__dirname, "..", ".."), OUT_PATH)}：${output.count} 筆`);
    for (const [d, c] of Object.entries(output.byDistrict)) console.log(`  ${d}：${c} 筆`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error("抓取失敗：", e.message);
  process.exit(1);
});

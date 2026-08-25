/**
 * 愛屋抓取小工具的原始碼（可讀版）。
 *
 * install.html 會把這份程式碼壓成一行、包成 `javascript:...` 網址，
 * 那個才是真正拖進書籤列的東西。這份檔案只是給人看、給人改的。
 *
 * ## 這支程式做什麼
 * 在愛屋「委託中」列表頁按一下書籤，會：
 *   1. 在頁面上找出委託物件那張表格（用表頭文字辨認，不依賴 id/class ——
 *      那些愛屋自己改版就會變，表頭文字比較穩定）
 *   2. 把目前這一頁的每一列轉成一筆資料
 *   3. 門牌地址立刻砍到只剩行政區（例如「梧棲區」），完整地址不會離開這支程式
 *   4. 下載成一個 json 檔（瀏覽器的「下載項目」資料夾）
 *
 * 111 筆分 12 頁，所以要「翻頁 → 點書籤 → 翻頁 → 點書籤…」重複 12 次，
 * 抓完把所有下載下來的 json 檔丟給 import.js 合併。
 *
 * ⚠️ 這支工具不碰帳號密碼，只讀「你已經登入後看到的畫面」上的文字，
 *    跟登入流程完全無關。
 */

(function () {
  "use strict";

  // 表頭文字 → 資料欄位名稱。順序沒關係，用文字比對找欄位。
  var FIELD_HEADERS = [
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
    ["address", "門牌地址"]
  ];

  function cellText(cell) {
    return (cell.innerText || cell.textContent || "").replace(/\s+/g, " ").trim();
  }

  // "台中市梧棲區建國北街315巷7弄7號" → "梧棲區"
  function districtOf(address) {
    var m = String(address || "").match(/(?:市|縣)([一-鿿]{1,3}區)/);
    return m ? m[1] : "";
  }

  // 在整頁的表格裡，找表頭文字命中最多已知欄位的那一張
  function findTableAndColumns() {
    var tables = document.querySelectorAll("table");
    var best = null;
    for (var i = 0; i < tables.length; i++) {
      var table = tables[i];
      if (!table.rows || table.rows.length < 2) continue;
      var headerRow = table.rows[0];
      if (!headerRow.cells || headerRow.cells.length < 5) continue;

      var colMap = {};
      var hitCount = 0;
      for (var c = 0; c < headerRow.cells.length; c++) {
        var text = cellText(headerRow.cells[c]);
        for (var f = 0; f < FIELD_HEADERS.length; f++) {
          var key = FIELD_HEADERS[f][0];
          var label = FIELD_HEADERS[f][1];
          if (colMap[key] === undefined && text.indexOf(label) === 0) {
            colMap[key] = c;
            hitCount++;
            break;
          }
        }
      }
      if (hitCount >= 8 && (!best || hitCount > best.hitCount)) {
        best = { table: table, colMap: colMap, hitCount: hitCount };
      }
    }
    return best;
  }

  function download(filename, text) {
    var blob = new Blob([text], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 2000);
  }

  var found = findTableAndColumns();
  if (!found) {
    alert(
      "愛屋抓取小工具：這頁找不到委託物件列表的表格。\n" +
        "確認一下現在是不是在「委託中」列表頁，不是物件明細頁。\n" +
        "如果確定在對的頁面卻抓不到，畫面可能改版了，截圖給小凱看一下。"
    );
    return;
  }

  var table = found.table;
  var colMap = found.colMap;
  var rows = [];

  for (var r = 1; r < table.rows.length; r++) {
    var row = table.rows[r];
    if (!row.cells || row.cells.length < 3) continue;

    var rec = {};
    for (var key in colMap) {
      rec[key] = cellText(row.cells[colMap[key]]);
    }
    if (!rec.title && !rec.caseId) continue; // 空列、合併列跳過

    rec.district = districtOf(rec.address);
    delete rec.address; // 完整門牌地址到這裡就丟掉，不會進下載的檔案

    rows.push(rec);
  }

  if (rows.length === 0) {
    alert("愛屋抓取小工具：表格找到了，但一筆資料都沒抓到。可能是頁面還沒載完，等一下再點一次。");
    return;
  }

  var payload = {
    scrapedAt: new Date().toISOString(),
    pageUrl: location.href,
    count: rows.length,
    rows: rows
  };

  download("houseol-page-" + new Date().getTime() + ".json", JSON.stringify(payload, null, 2));

  alert(
    "抓到 " + rows.length + " 筆，已下載成一個 json 檔（在瀏覽器的「下載項目」資料夾）。\n\n" +
      "翻到下一頁，再點一次這個書籤，重複到最後一頁。\n" +
      "抓完全部頁數後，把「下載項目」裡所有 houseol-page-*.json 丟給小凱。"
  );
})();

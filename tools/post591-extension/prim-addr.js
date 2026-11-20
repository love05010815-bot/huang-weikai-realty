/**
 * 把 prim-capture.js 在 PRIM 物件頁記下來的門牌，對回帶入的那一戶（純函式，scripts/check-post591.mjs 直接 import 來測）。
 *
 * 對法：先比委託編號（AA／AK／AD…），沒有編號再比案名（去空白後一模一樣）。
 * 對到之後還要過一關：**帶入資料的路名要出現在那條門牌裡** —— 案名撞名（同社區兩戶都叫「三房平車」）時寧可不填，
 * 填錯門牌比沒填嚴重（廣告地址跟委託書不符）。
 * 已經有門牌號的不動（型錄 Ctrl+A 貼進來、或後台門牌表帶到的，那個比較準）。
 */

const norm = (s) => String(s ?? "").replace(/\s+/g, "");
const tw = (s) => norm(s).replace(/臺/g, "台");

export function findPrimAddr(listing, list) {
  const rows = Array.isArray(list) ? list.filter((x) => x && x.addr) : [];
  const id = norm(listing && listing.no).toUpperCase();
  const title = norm(listing && listing.rawTitle);
  return (id && rows.find((x) => norm(x.id).toUpperCase() === id)) || (title && rows.find((x) => norm(x.title) === title)) || null;
}

/**
 * 對得到就把門牌（到「號」）、樓層、樓之幾填進 listing，回傳用了哪一筆；沒對到或不該填回 null。會直接改 listing。
 */
export function applyPrimAddr(listing, list) {
  if (!listing) return null;
  if (/\d+\s*號/.test(listing.addr || "")) return null;
  const hit = findPrimAddr(listing, list);
  if (!hit) return null;
  const full = tw(hit.addr);
  // 帶入資料的路名（去掉縣市）要對得上
  const road = tw(listing.addr).replace(/^[一-龥]{2}[縣市]/, "");
  if (road && !full.includes(road)) return null;
  const m = full.match(/^(.*?\d+號(?:之\d+)?)(?:(\d+)樓(?:之(\d+))?)?/);
  if (!m) return null;
  listing.addr = m[1];
  if (m[2] && listing.floor == null) {
    listing.floor = Number(m[2]);
    if (!listing.floorRaw) listing.floorRaw = `${m[2]}樓`;
  }
  if (m[3] && !listing.floorSub) listing.floorSub = m[3];
  listing.warnings = (listing.warnings || []).filter((w) => !/門牌|地址只到路名/.test(w));
  listing.warnings.unshift(`門牌是你在 PRIM 看這一戶時記下的（${m[1]}${m[2] ? `${m[2]}樓` : ""}${m[3] ? `之${m[3]}` : ""}），請核對一遍。`);
  return hit;
}

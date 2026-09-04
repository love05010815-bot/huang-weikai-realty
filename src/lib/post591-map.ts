/**
 * 把辨識出來的物件（post591-parser 的 Listing）對成 591 刊登表單的每一格。
 *
 * 這裡的規則全部是 2026-09-02～04 在 591 表單上實際跑過兩戶（透天＋電梯大樓）驗出來的：
 *   - 第 ① 頁四連點：刊登類型 → 法定用途（照謄本）→ 房屋現況 → 房屋型態
 *   - 透天／別墅整棟賣，出售樓層填 0（591 規定 0 = 整棟）
 *   - 有沒有車位坪決定「權狀坪數／售價」要點含還是不含
 *   - 民國年 = 西元 − 1911；只知道屋齡就用今年反推，月日留白（591 只用年算屋齡）
 *   - 生活機能只認型錄明寫的「鄰近OO」，不從描述文字猜 —— 猜出來的勾選是不實廣告，風險在他身上
 *
 * ⚠️ 這支不碰 DOM、不碰 node，client 與測試腳本共用。
 */

import { DESC_HEAD, DESC_TAIL, POST591_DEFAULTS } from "@/config/post591-template";
import { findCopyRisks, type CopyRisk } from "@/lib/listing-copy-risk";
import type { Listing } from "@/lib/post591-parser";

export interface AddressParts {
  city: string;
  town: string;
  road: string;
  lane: string;
  alley: string;
  no: string;
  sub: string;
}

export interface Derived {
  /** 第 ① 頁四連點 */
  adType: "出售";
  legal: string;
  status: string;
  type: string;
  /** 謄本用途（判斷依據，要攤給人看） */
  tengben: string;
  facing: string;
  rocY: number | null;
  /** 民國年是從屋齡反推的（不是竣工日），要標出來 */
  rocYEstimated: boolean;
  sellFloor: number | "";
  sellFloorNote: string;
  hasPark: boolean;
  areaOpt: string;
  priceOpt: string;
  parkSel: string;
  down: number | null;
  life: string[];
  fullAddr: string;
  parts: AddressParts;
}

export interface Row {
  /** 分組標題列 */
  group?: string;
  label: string;
  value: string;
  /** 591 必填 */
  req?: boolean;
  /** 資料裡沒有、要人補（畫面標紅） */
  need?: boolean;
  /** 591 是選項，用點的不是用貼的 */
  pick?: boolean;
  /** 純參考，591 沒這格 */
  ref?: boolean;
  note?: string;
}

/* ───────── 地址 ───────── */

/**
 * 「台中市大肚區沙田路三段734巷56之2號」→ 縣市／鄉鎮／街道／巷／弄／號／之。
 * 591 的地址區有兩種長相：一格一格選，或上面多一個「填寫地址」框貼整串再按匯入 —— 兩種都要給。
 */
export function splitAddress(a: string): AddressParts {
  const r: AddressParts = { city: "", town: "", road: "", lane: "", alley: "", no: "", sub: "" };
  if (!a) return r;
  let s = a;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(.{2}[縣市])/))) {
    r.city = m[1];
    s = s.slice(m[1].length);
  }
  if ((m = s.match(/^(.{1,4}?[區鄉鎮市])/))) {
    r.town = m[1];
    s = s.slice(m[1].length);
  }
  if ((m = s.match(/(\d+)\s*巷/))) r.lane = m[1];
  if ((m = s.match(/(\d+)\s*弄/))) r.alley = m[1];
  if ((m = s.match(/(\d+)\s*之\s*(\d+)\s*號/))) {
    r.no = m[1];
    r.sub = m[2];
  } else if ((m = s.match(/(\d+)\s*號\s*之\s*(\d+)/))) {
    r.no = m[1];
    r.sub = m[2];
  } else if ((m = s.match(/(\d+)\s*號/))) {
    r.no = m[1];
  }
  r.road = s.replace(/\d+\s*[巷弄號之].*$/, "").trim();
  return r;
}

/* ───────── 推導 ───────── */

export function derive(d: Listing, nowYear: number = new Date().getFullYear()): Derived {
  const k = d.kind || "";
  let type: string;
  if (/透天/.test(k)) type = "透天厝";
  else if (/別墅/.test(k)) type = "別墅";
  else if (/公寓/.test(k)) type = "公寓";
  else if (/華廈/.test(k)) type = "華廈";
  else if (/大樓/.test(k)) type = d.total && d.total <= 10 ? "華廈" : "電梯大樓";
  else type = "電梯大樓";

  /*
    房屋法定用途 = 謄本上的主要用途，不是「住宅就一律住家用」。
    型錄「類別/謄本用途」斜線後面那個才是謄本用途（「住家/住商用」→ 591 要選「住商用」）。
    選錯等於廣告跟謄本不符，罰的是他，所以照謄本直接對應；沒謄本資料時預設住家用並標出來。
  */
  const tengben = (d.usage || "").split("/").pop()!.trim();
  let legal: string;
  if (/住商/.test(tengben)) legal = "住商用";
  else if (/住工/.test(tengben)) legal = "住工用";
  else if (/商業|店鋪|店面/.test(tengben)) legal = "商業用";
  else if (/工業|廠/.test(tengben)) legal = "工業用";
  else if (/農業/.test(tengben)) legal = "農業用";
  else if (/事務所/.test(tengben)) legal = "一般事務所";
  else legal = "住家用";

  const fc = (d.facing || "").match(/朝\s*([東西南北]{1,2})/);
  /* 591 的朝向選項是「坐X朝Y」，型錄只給「座西 朝東」→ 對到「坐西朝東」 */
  const sit = (d.facing || "").match(/[座坐]\s*([東西南北]{1,2})/);
  const facing = fc ? (sit ? `坐${sit[1]}朝${fc[1]}` : `朝${fc[1]}`) : "";

  let rocY: number | null = null;
  let rocYEstimated = false;
  if (d.y) rocY = d.y - 1911;
  else if (d.ageYears != null) {
    rocY = nowYear - Math.floor(d.ageYears) - 1911;
    rocYEstimated = true;
  }

  let sellFloor: number | "" = "";
  let sellFloorNote: string;
  if (/透天厝|別墅/.test(type)) {
    sellFloor = 0;
    sellFloorNote = "整棟（591 規定 0 = 整棟）";
  } else if (d.floor != null) {
    sellFloor = d.floor;
    sellFloorNote = d.floorSub ? `單層，之 ${d.floorSub}` : "單層";
  } else {
    sellFloorNote = `資料寫「${d.floorRaw || "—"}」，要自己判斷`;
  }

  const p = (d.parkType || "").replace(/[\s/／]/g, "");
  const hasPark = !!(d.parkPing || (p && !/^無$|^無車位/.test(p)));
  /*
    591 電梯大樓表單「車位面積」旁的型式下拉，2026-09-04 實際只有四個選項：
    平面式停車位／機械式停車位／平面式+機械式／其他（不是坡道／升降那套）。
    型錄寫「坡道/平面」「升降/機械」，看的是後半那個字。
  */
  let parkSel = "";
  if (!hasPark) parkSel = "";
  else if (/平面/.test(p) && /機械/.test(p)) parkSel = "平面式+機械式";
  else if (/平面/.test(p)) parkSel = "平面式停車位";
  else if (/機械|塔式|升降/.test(p)) parkSel = "機械式停車位";
  else parkSel = "其他";

  const life: string[] = [];
  if (d.school) life.push("近學校");
  if (d.park) life.push("近公園綠地");
  if (d.market) life.push("近傳統市場");

  const parts = splitAddress(d.addr);
  const fullAddr = (/^[一-龥]{2}[縣市]/.test(d.addr) ? "" : POST591_DEFAULTS.defaultCity) + (d.addr || "");
  if (!parts.city) parts.city = POST591_DEFAULTS.defaultCity;

  return {
    adType: "出售",
    legal,
    status: /套房/.test(k) ? "套房" : "住宅",
    type,
    tengben,
    facing,
    rocY,
    rocYEstimated,
    sellFloor,
    sellFloorNote,
    hasPark,
    areaOpt: hasPark ? "含車位面積" : "不含車位面積",
    priceOpt: hasPark ? "含車位價格" : "不含車位價格",
    parkSel,
    down: d.price ? Math.round(d.price * POST591_DEFAULTS.downPaymentRatio) : null,
    life,
    fullAddr,
    parts,
  };
}

/* ───────── 確認表 ───────── */

const s = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

export function buildRows(d: Listing, o: Derived): Row[] {
  const rows: Row[] = [];
  const grp = (title: string) => rows.push({ group: title, label: "", value: "" });
  const f = (label: string, value: unknown, opt: Omit<Row, "label" | "value"> = {}) =>
    rows.push({ label, value: s(value), ...opt });

  grp("出售地址（前三格是下拉，用選的；號旁邊的「隱藏門號」勾不勾你決定）");
  f("縣市", o.parts.city, { pick: true, req: true, note: d.addr && !/^[一-龥]{2}[縣市]/.test(d.addr) ? "資料沒寫縣市，先給台中市" : "" });
  f("鄉鎮", o.parts.town, { pick: true, req: true, need: !o.parts.town });
  f("街道", o.parts.road, { pick: true, req: true, need: !o.parts.road, note: "下拉裡找一模一樣的" });
  f("巷", o.parts.lane, { note: o.parts.lane ? "" : "沒有就留空" });
  f("弄", o.parts.alley, { note: o.parts.alley ? "" : "沒有就留空" });
  f("號", o.parts.no, { req: true, need: !o.parts.no, note: o.parts.no ? "" : "門牌被藏起來了，要自己打" });
  f("之", o.parts.sub, { note: o.parts.sub ? "" : "沒有就留空" });
  f("整串地址", o.fullAddr, { note: "表單上方有「填寫地址」框時貼這串按「匯入地址」" });
  f("出售樓層", o.sellFloor, { req: true, need: o.sellFloor === "", note: o.sellFloorNote });
  if (d.floorSub) f("樓 之", d.floorSub, { note: "樓層旁邊的「之」" });

  grp("基礎資料");
  f("出售總樓層", d.total, { req: true, need: !d.total, note: "層" });
  const needCommunity = /電梯大樓|華廈/.test(o.type);
  f("社區名稱", d.community, {
    req: needCommunity,
    need: needCommunity && !d.community,
    note: d.communityGuessed ? "⚠ 猜的，請核對" : d.community ? "" : needCommunity ? "必填，資料沒給" : "透天沒社區，留空",
  });
  f("格局 房", d.room, { req: true, need: !d.room });
  f("格局 廳", d.hall);
  f("格局 衛", d.bath);
  f("完工 民國年", o.rocY, {
    req: true,
    need: o.rocY == null,
    note: d.y ? `西元 ${d.y}/${d.m}/${d.dd}` : o.rocYEstimated ? `⚠ 只知道屋齡 ${d.ageYears} 年，反推的；月日留白` : "",
  });
  if (d.y) {
    f("完工 月", d.m);
    f("完工 日", d.dd);
  }
  if (o.facing) f("朝向", o.facing, { pick: true, note: `資料寫「${d.facing}」` });
  f("權狀坪數", d.regPing, { req: true, need: !d.regPing });
  f("　└ 面積選項", o.areaOpt, { pick: true, note: o.hasPark ? "有車位坪，點「含」" : "沒車位，點「不含」" });
  if (o.hasPark) {
    f("車位面積", d.parkPing, { note: "坪" });
    f("　└ 車位型式", o.parkSel, { pick: true, note: `資料寫「${d.parkType || "—"}」` });
  }
  f("主建物", d.mainPing);
  f("附屬建物", d.attPing);
  f("共有部分", d.pubPing, { note: "型錄的「公設建坪」" });
  f("土地坪數", d.landPing);

  grp("房屋價格");
  f("售價", d.price, { req: true, need: !d.price, note: "萬元" });
  f("　└ 價格選項", o.priceOpt, { pick: true });
  f("自備款", o.down, { req: true, note: `萬元（售價 ${Math.round(POST591_DEFAULTS.downPaymentRatio * 100)}%）` });
  f("　└ 管理費有無", d.fee != null ? "有" : d.source === "houseol" ? "無" : "？", {
    pick: true,
    need: d.fee == null && d.source === "freeform",
    note: d.fee == null && d.source === "freeform" ? "文字沒寫，要問" : "",
  });
  if (d.fee != null) {
    f("管理費", d.fee, { note: "元" });
    f("　└ 繳費週期", d.feeCycle, { pick: true });
  }
  f("帶租約", "否", { pick: true });
  f("裝潢程度", "？", { pick: true, need: true, note: "591 預設「簡易裝潢」，這格一定要你自己看過屋況再選" });

  grp("生活機能（用勾的）");
  f("勾選這些", o.life.join("、") || "（資料沒明寫，不勾）", { pick: true, note: "只列資料明寫的「鄰近OO」，其他自己勾" });
  if (d.school) f("（參考）鄰近學校", d.school, { ref: true });
  if (d.park) f("（參考）鄰近公園", d.park, { ref: true });

  grp("聯絡資料");
  f("聯絡人", "黃瑋凱", { note: "591 名片預設會帶「黃先生」，要改" });
  f("委託書", POST591_DEFAULTS.contract, { pick: true, req: true, note: "專任約的話自己改" });
  f("服務費", "收取服務費", { pick: true, req: true });
  f("經紀人資料", "☑ 打勾", { pick: true, req: true });

  const refs: [string, string, string?][] = [
    ["物件編號", d.no],
    ["類型／現況", d.kind],
    ["類別／謄本用途", d.usage, `法定用途照這個選「${o.legal}」`],
    ["車位／編號", d.parkNo],
    ["屋齡", d.age || (d.ageYears != null ? `${d.ageYears} 年` : ""), "591 自己從完工年算"],
    ["使用分區", d.zone],
    ["建物結構", d.struct],
    ["生活圈", d.lifeArea, "只是分類名，別拿來勾生活機能"],
    ["面寬／深度", [d.width, d.depth].filter(Boolean).join(" × ")],
    ["總戶數", d.households == null ? "" : `${d.households} 戶`],
  ];
  const refRows = refs.filter(([, v]) => v);
  if (refRows.length) {
    grp("資料有、但 591 沒這格（不用填，給你對照）");
    for (const [label, value, note] of refRows) f(label, value, { ref: true, note });
  }
  return rows;
}

/* ───────── 標題／描述／風險 ───────── */

export function titleCheck(title: string): { ok: boolean; len: number; msg: string } {
  const len = [...title.trim()].length;
  if (!len) return { ok: false, len, msg: "標題是空的" };
  if (len < POST591_DEFAULTS.titleMin) return { ok: false, len, msg: `太短，591 要 ${POST591_DEFAULTS.titleMin} 字以上` };
  if (len > POST591_DEFAULTS.titleMax) return { ok: false, len, msg: `太長，591 上限 ${POST591_DEFAULTS.titleMax} 字，超出 ${len - POST591_DEFAULTS.titleMax} 字` };
  return { ok: true, len, msg: `${len} 字，在 ${POST591_DEFAULTS.titleMin}～${POST591_DEFAULTS.titleMax} 之間` };
}

/** 他的固定版型：頭 + ✨ 行 + 尾。features 是純文字行，這裡負責加 ✨ */
export function buildDescription(features: string[]): string {
  const lines = features.map((l) => l.replace(/^✨\s*/, "")).filter(Boolean).map((l) => `✨${l}`);
  return `${DESC_HEAD}\n\n${lines.join("\n")}\n\n${DESC_TAIL}`;
}

/**
 * 風險字：站上共用的 findCopyRisks（保證／最／未通車捷運／增值）之外，
 * 補兩條 591 刊登特別會踩的。標出來不擋 —— 說得出根據就能寫，決定在他。
 */
export function post591Risks(...texts: string[]): CopyRisk[] {
  const hits = findCopyRisks(...texts);
  const hay = texts.join("\n");
  const extra: { pattern: RegExp; word: string; why: string }[] = [
    { pattern: /投報\s*\d|投資報酬率|報酬率|收益率/, word: "投報率", why: "投資報酬宣稱要能證明（租約、實收），否則是誘使交易的不實廣告。" },
    { pattern: /明星學區|明星學校|名校|第一志願/, word: "明星學區", why: "主觀評價，591「明星學區」標籤也建議別勾。" },
    { pattern: /住辦合一/, word: "住辦合一", why: "法定用途若是「住家用」，寫住辦要能對得上謄本，買方會拿謄本問。" },
  ];
  for (const r of extra) {
    if (r.pattern.test(hay) && !hits.some((h) => h.word === r.word)) hits.push({ word: r.word, why: r.why });
  }
  return hits;
}

/* ───────── 照片／交接 ───────── */

/** 型錄照片一鍵下載：貼到 PowerShell 跑，存到 591-poster\photos_<物件編號>\ */
export function photoCommand(photos: string[], id: string): string {
  if (!photos.length) return "";
  const folder = `D:\\Agent-os\\591-poster\\photos_${id || "listing"}`;
  const urls = photos.map((u) => `"${u}"`).join(",");
  return `$d="${folder}"; New-Item -ItemType Directory -Force $d | Out-Null; $i=1; foreach($u in ${urls}){ Invoke-WebRequest $u -OutFile ("$d\\{0:d2}.jpg" -f $i); $i++ }; "已下載 $($i-1) 張到 $d"`;
}

/**
 * 給 Claude 填 591 用的交接摘要 —— 把他要貼給對話視窗的東西縫成一段。
 * 只放結論（每格填什麼），不放推理過程；缺的欄位列在最上面，Claude 一開始就會先問。
 */
export function buildHandoff(d: Listing, o: Derived, rows: Row[], title: string, desc: string, photoFolder: string): string {
  const missing = rows.filter((r) => r.need && !r.group).map((r) => r.label);
  const out: string[] = [];
  out.push("【591 刊登交接】請用 Claude in Chrome 填到第③步「確認刊登方案」停下來，「立即支付」我自己按。");
  if (missing.length) out.push(`⚠ 我還沒給的必填：${missing.join("、")}（開始前先問我）`);
  out.push(`第①頁：${o.adType} → ${o.legal} → ${o.status} → ${o.type}（謄本用途「${o.tengben || "未知"}」）`);
  for (const r of rows) {
    if (r.group) {
      out.push(`—— ${r.group}`);
      continue;
    }
    if (r.ref) continue;
    const tag = r.pick ? "（點選）" : "";
    out.push(`${r.label}${tag}：${r.value || "（空）"}${r.note ? `　※${r.note}` : ""}`);
  }
  out.push(`廣告標題：${title}`);
  out.push(`現況特色描述（整段照貼）：\n${desc}`);
  out.push(d.photos.length ? `照片：${d.photos.length} 張，已下載到 ${photoFolder}` : `照片：資料夾 ${photoFolder || "（我再告訴你）"}`);
  return out.join("\n");
}

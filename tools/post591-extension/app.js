/**
 * 外掛自己的頁面（app.html）：貼資料 → 解析 → 每一格 → 文案 → 照片 → 上架。
 *
 * 這一頁不需要任何後台、不連任何伺服器：辨識與對應規則是把官網後台用的同一套 TypeScript
 * （src/lib/post591-parser.ts、post591-map.ts、config/post591-template.ts）用 tsc 編成 lib/ 底下的 ES module，
 * 由 app.html 的 importmap 把「@/…」對到 lib/。**規則改了要重新編：`npm run build:post591-ext`。**
 *
 * 個人資料（姓名／手機／LINE／版型尾段）存在 chrome.storage.local，只在使用者自己的 Chrome 裡。
 * 版型預設是黃瑋凱那份把個人字眼換成 {{name}} {{phone}} {{line}} 的版本，每個人可以自己改。
 */
import { parseListing } from "@/lib/post591-parser";
import { derive, buildRows, titleCheck, post591Risks, buildPayload } from "@/lib/post591-map";
import { DESC_HEAD, DESC_TAIL, POST591_DEFAULTS } from "@/config/post591-template";

const $ = (id) => document.getElementById(id);
const hasChrome = typeof chrome !== "undefined" && !!(chrome.runtime && chrome.runtime.sendMessage);
const SETTINGS_KEY = "p591:settings";

/* ───────── 個人設定 ───────── */
function defaultTail() {
  return DESC_TAIL.replace(/0909-787-865/g, "{{phone}}")
    .replace(/【黃瑋凱】[^\n]*/g, "【{{name}}】") // 「瑋你把關，凱心成家。」是他個人的口號，換成只留姓名
    .replace(/@a8865/g, "{{line}}")
    .replace(/小凱專營/g, "{{name}}專營")
    .replace(/委託小凱/g, "委託{{name}}")
    .split("\n")
    .filter((l) => !/YouTube/.test(l)) // 他個人的影音頻道那行拿掉
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}
const DEFAULT_SETTINGS = { name: "", phone: "", line: "", contract: POST591_DEFAULTS.contract, tail: defaultTail() };
let settings = { ...DEFAULT_SETTINGS };

async function loadSettings() {
  try {
    if (hasChrome && chrome.storage && chrome.storage.local) {
      const o = await chrome.storage.local.get(SETTINGS_KEY);
      if (o[SETTINGS_KEY]) settings = { ...DEFAULT_SETTINGS, ...o[SETTINGS_KEY] };
    } else {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch {
    /* 讀不到就用預設 */
  }
  $("s-name").value = settings.name;
  $("s-phone").value = settings.phone;
  $("s-line").value = settings.line;
  $("s-contract").value = settings.contract;
  $("s-tail").value = settings.tail;
}
async function saveSettings() {
  settings = {
    name: $("s-name").value.trim(),
    phone: $("s-phone").value.trim(),
    line: $("s-line").value.trim(),
    contract: $("s-contract").value,
    tail: $("s-tail").value,
  };
  try {
    if (hasChrome && chrome.storage && chrome.storage.local) await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
    else localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    flash($("s-msg"), "已儲存 ✓", "ok");
  } catch (e) {
    flash($("s-msg"), `存不進去：${e.message}`, "bad");
  }
  if (listing) {
    // 聯絡人／委託書／文案跟著新設定變
    const c = rows.find((r) => r.label === "聯絡人");
    if (c) c.value = settings.name;
    const k = rows.find((r) => r.label === "委託書");
    if (k) k.value = settings.contract;
    renderRows();
    $("desc").value = buildDesc(listing.features);
    refreshDesc();
  }
}
const settingsReady = () => settings.name && settings.phone;
function fillTail(tail) {
  return tail.replace(/\{\{name\}\}/g, settings.name || "（姓名）").replace(/\{\{phone\}\}/g, settings.phone || "（手機）").replace(/\{\{line\}\}/g, settings.line || "（LINE ID）");
}
function buildDesc(features) {
  const lines = features.map((l) => l.replace(/^✨\s*/, "")).filter(Boolean).map((l) => `✨${l}`);
  return `${DESC_HEAD}\n\n${lines.join("\n")}\n\n${fillTail(settings.tail)}`;
}
function flash(el, text, cls) {
  el.textContent = text;
  el.className = `msg ${cls || ""}`;
  if (cls === "ok") setTimeout(() => (el.textContent === text ? (el.textContent = "") : 0), 2500);
}

/* ───────── 解析結果 ───────── */
let listing = null, derived = null, rows = [];

function run() {
  listing = parseListing($("raw").value);
  derived = derive(listing);
  rows = buildRows(listing, derived);
  const c = rows.find((r) => r.label === "聯絡人");
  if (c) c.value = settings.name || c.value;
  const k = rows.find((r) => r.label === "委託書");
  if (k) k.value = settings.contract;

  $("result").hidden = false;
  $("warn-card").hidden = !listing.warnings.length;
  $("warns").innerHTML = listing.warnings.map((w) => `<li>${esc(w)}</li>`).join("");

  $("steps").innerHTML = [derived.adType, derived.legal, derived.status, derived.type]
    .map((s, i) => `${i ? '<span class="arrow">→</span>' : ""}<span class="step">${esc(s)}</span>`)
    .join("");
  $("steps-note").textContent = `依據：謄本用途「${derived.tengben || "資料沒有，先當住家用"}」→ 法定用途「${derived.legal}」；類型「${listing.kind || "—"}」＋樓高 ${listing.total ?? "—"} 層 → 型態「${derived.type}」。認得的組合會直接開 591 第②頁，不認得的外掛會在第①頁幫你點。`;

  renderRows();
  $("title").value = listing.rawTitle || "";
  refreshTitle();
  $("desc").value = buildDesc(listing.features);
  refreshDesc();
  $("photos-msg").textContent = listing.photos.length ? `型錄裡有 ${listing.photos.length} 張照片，上架時會一起上傳。` : "這份資料沒有照片網址（LINE 文字、或型錄複製時沒帶到「更多照片」）。";
  $("photo-link").value = "";
  refreshPhotoLink();
  $("launch-msg").textContent = "";
  refreshNeed();
  setTimeout(() => $("result").scrollIntoView({ behavior: "smooth", block: "start" }), 50);
}

function renderRows() {
  const box = $("rows");
  box.innerHTML = "";
  rows.forEach((r, i) => {
    if (r.group) {
      const g = document.createElement("div");
      g.className = "grp";
      g.textContent = r.group;
      box.appendChild(g);
      return;
    }
    const row = document.createElement("div");
    row.className = `row${r.need ? " need" : ""}${r.pick ? " pick" : ""}`;
    const lab = document.createElement("span");
    lab.className = "lab";
    lab.innerHTML = `${r.req ? "<i>*</i>" : ""}${esc(r.label)}`;
    const input = document.createElement("input");
    input.value = r.value;
    input.readOnly = !!r.ref;
    input.addEventListener("input", () => {
      rows[i].value = input.value;
      if (rows[i].need && input.value.trim()) {
        rows[i].need = false;
        row.classList.remove("need");
        refreshNeed();
      }
    });
    const note = document.createElement("span");
    note.className = "note";
    note.textContent = r.note || "";
    row.append(lab, input, note);
    box.appendChild(row);
  });
}
function refreshNeed() {
  const n = rows.filter((r) => r.need).length;
  $("need-msg").textContent = n ? `還有 ${n} 格紅底沒補（外掛會把它們列在面板上）` : "";
}
function refreshTitle() {
  const t = titleCheck($("title").value);
  flash($("title-msg"), t.msg, t.ok ? "ok" : "bad");
  refreshRisks();
}
function refreshDesc() {
  const len = [...$("desc").value].length;
  flash($("desc-msg"), `${len} 字／上限 ${POST591_DEFAULTS.descMax}`, len > POST591_DEFAULTS.descMax ? "bad" : "");
  refreshRisks();
}
function refreshRisks() {
  const risks = post591Risks($("title").value, $("desc").value);
  const box = $("risks");
  box.hidden = !risks.length;
  box.innerHTML = risks.length ? `<b>⚠ 法規敏感字（只標不刪，留不留你決定）</b><ul>${risks.map((r) => `<li><b>${esc(r.word)}</b>：${esc(r.why)}</li>`).join("")}</ul>` : "";
}
function extraPhotos() {
  const m = $("photo-link").value.match(/picstr=([^&)\s\]]+)/);
  return m ? m[1].split(",").map((s) => s.trim()).filter((s) => /^https?:\/\//.test(s)) : [];
}
function refreshPhotoLink() {
  const n = extraPhotos().length;
  const v = $("photo-link").value.trim();
  flash($("photo-link-msg"), n ? `抓到 ${n} 張照片網址，會一起上傳。` : v ? "這個連結裡沒有照片網址（要的是「更多照片」那個連結）" : "", n ? "ok" : v ? "bad" : "");
}

/* ───────── 上架 ───────── */
async function launch() {
  if (!listing || !derived) return;
  if (!settingsReady()) {
    $("settings").hidden = false;
    $("settings").scrollIntoView({ behavior: "smooth" });
    flash($("launch-msg"), "先到上面「⚙ 我的資料」填姓名和手機（591 聯絡人、文案都會用到），再按一次。", "bad");
    return;
  }
  const payload = buildPayload(listing, derived, rows, $("title").value.trim(), $("desc").value);
  payload.contact.name = settings.name;
  const extra = extraPhotos();
  if (!payload.photos.length && extra.length) payload.photos = extra;
  if (!hasChrome) {
    flash($("launch-msg"), "這一頁要從 Chrome 外掛圖示打開才能上架（現在只是預覽）。", "bad");
    return;
  }
  flash($("launch-msg"), "正在開 591 分頁…", "");
  chrome.runtime.sendMessage({ type: "p591:launch", payload }, (r) => {
    const err = chrome.runtime.lastError;
    if (err || !r || !r.ok) flash($("launch-msg"), `外掛沒回應：${(err && err.message) || (r && r.error) || "未知錯誤"}。到 chrome://extensions 按這個外掛的 ↻ 再試。`, "bad");
    else flash($("launch-msg"), "591 分頁已開好，外掛正在填。到那個分頁等右下角「✅ 填完」，從上往下核對，再自己按「保存資料，下一步」。", "ok");
  });
}

/* ───────── 綁事件 ───────── */
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
$("toggle-settings").onclick = () => ($("settings").hidden = !$("settings").hidden);
$("s-save").onclick = saveSettings;
$("s-reset").onclick = () => {
  $("s-tail").value = defaultTail();
  flash($("s-msg"), "已還原成預設版型，記得按儲存", "");
};
$("raw").addEventListener("input", () => ($("parse").disabled = !$("raw").value.trim()));
$("parse").onclick = run;
$("clear").onclick = () => {
  $("raw").value = "";
  $("parse").disabled = true;
  $("result").hidden = true;
  listing = null;
};
$("title").addEventListener("input", refreshTitle);
$("desc").addEventListener("input", refreshDesc);
$("photo-link").addEventListener("input", refreshPhotoLink);
$("launch").onclick = launch;

loadSettings().then(() => {
  if (!settingsReady()) $("settings").hidden = false; // 第一次用：先填自己的資料
});

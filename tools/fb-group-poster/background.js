/**
 * FB 社團廣告助手 —— 背景程式（任務佇列）。
 *
 * 做的事：
 *   ① 點工具列圖示 → 開後台的『社團廣告發佈』分頁（沒有後台就到官網）。
 *   ② 收後台 bridge.js 來的 fbq:launch（一版廣告＋勾好的社團清單）→ 存起來、開第一個社團分頁。
 *   ③ 社團頁的 content.js 來要資料（fbq:current）就給它；填完使用者按「下一個社團」（fbq:next）
 *      → 記結果、換下一個社團的網址（同一個分頁），到底了就結束。
 *   ④ 進度寫進 chrome.storage.local 的 fbq:progress，bridge.js 監聽變化、回報給後台畫面。
 *
 * 🔴 這支只開分頁、填表由 content.js 做；**永遠不替使用者按「發佈」**。
 * 🔴 不抓 Facebook 任何資料、不送任何東西到別的地方。
 *
 * MV3 的 service worker 會被閒置回收，所以不在背景裡做「等 N 秒」這種長時間等待 ——
 * 社團之間的節奏由使用者自己按「下一個社團」控制（半自動）。每日上限則用日期計數擋。
 */
const JOB_KEY = "fbq:job"; // chrome.storage.session：關瀏覽器就沒了（含廣告內容）
const PROGRESS_KEY = "fbq:progress"; // chrome.storage.local：後台畫面讀這個
const DAILY_KEY = "fbq:daily"; // chrome.storage.local：{ date, count } 每日已成功幾個社團

const ADMIN_URLS = [
  "https://weikaihouse.com/admin/fb",
  "https://www.weikaihouse.com/admin/fb",
  "http://localhost:3000/admin/fb",
];

chrome.action.onClicked.addListener(async () => {
  // 已經開著後台就跳過去，否則開一個
  const tabs = await chrome.tabs.query({ url: ["https://weikaihouse.com/admin/fb*", "https://www.weikaihouse.com/admin/fb*", "http://localhost:3000/admin/fb*"] });
  if (tabs[0]) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    if (tabs[0].windowId != null) await chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: ADMIN_URLS[0] });
  }
});

const todayStr = () => new Date().toISOString().slice(0, 10);

/**
 * 每日上限「每個發文身分分開算」——他可能有兩三個粉專／帳號輪流發，
 * 一個身分發滿 10 個社團，不該害另一個身分今天不能發。
 * 存成 { date, counts: { 身分名稱: 次數 } }；舊格式（只有 count）自動搬過來。
 */
async function getDaily(who) {
  const o = await chrome.storage.local.get(DAILY_KEY);
  const d = o[DAILY_KEY];
  const key = String(who || "");
  if (!d || d.date !== todayStr()) return { date: todayStr(), counts: {}, count: 0, key };
  const counts = d.counts || (typeof d.count === "number" ? { "": d.count } : {});
  return { date: d.date, counts, count: counts[key] || 0, key };
}
async function bumpDaily(who) {
  const d = await getDaily(who);
  d.counts[d.key] = (d.counts[d.key] || 0) + 1;
  await chrome.storage.local.set({ [DAILY_KEY]: { date: d.date, counts: d.counts } });
  return d.counts[d.key];
}

async function setProgress(patch) {
  const o = await chrome.storage.local.get(PROGRESS_KEY);
  const cur = o[PROGRESS_KEY] || {};
  const next = { ...cur, ...patch, at: Date.now() };
  await chrome.storage.local.set({ [PROGRESS_KEY]: next });
  return next;
}

async function getJob() {
  const o = await chrome.storage.session.get(JOB_KEY);
  return o[JOB_KEY] || null;
}
async function saveJob(job) {
  await chrome.storage.session.set({ [JOB_KEY]: job });
}

async function openGroup(job) {
  const g = job.groups[job.index];
  if (job.tabId != null) {
    try {
      await chrome.tabs.update(job.tabId, { url: g.url, active: true });
      return;
    } catch {
      /* 分頁被關了，改開新的 */
    }
  }
  const tab = await chrome.tabs.create({ url: g.url, active: true });
  job.tabId = tab.id;
  await saveJob(job);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return false;
  const reply = (fn) => {
    fn()
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message ? e.message : e) }));
    return true;
  };

  // 後台 → 開工
  if (msg.type === "fbq:launch") {
    return reply(async () => {
      const p = msg.payload;
      if (!p || p.v !== 1 || !Array.isArray(p.groups) || !p.groups.length) throw new Error("資料格式不對");
      // 發文身分：新版後台送 identity，舊版只送 pageName
      const identity = {
        name: String((p.identity && p.identity.name) || p.pageName || ""),
        kind: p.identity && p.identity.kind === "account" ? "account" : "page",
      };
      const daily = await getDaily(identity.name);
      const job = {
        v: 1,
        identity,
        pageName: identity.name,
        locale: p.locale === "en" ? "en" : "zh-TW",
        dailyLimit: Math.max(0, Number(p.dailyLimit) || 0),
        requirePageIdentity: p.requirePageIdentity !== false,
        ad: { text: String(p.ad && p.ad.text ? p.ad.text : ""), images: Array.isArray(p.ad && p.ad.images) ? p.ad.images.slice(0, 10) : [] },
        groups: p.groups.map((g) => ({ id: String(g.id || ""), name: String(g.name || ""), url: String(g.url || "") })),
        index: 0,
        tabId: null,
        startedAt: Date.now(),
      };
      await saveJob(job);
      await setProgress({
        status: "running",
        total: job.groups.length,
        index: 0,
        results: [],
        today: daily.count,
        dailyLimit: job.dailyLimit,
        identityName: identity.name,
        groupNames: Object.fromEntries(job.groups.map((g) => [g.id, g.name])),
        groupIds: job.groups.map((g) => g.id),
      });
      await openGroup(job);
      return { ok: true };
    });
  }

  // 社團頁 content.js → 要目前該填的資料
  if (msg.type === "fbq:current") {
    return reply(async () => {
      const job = await getJob();
      if (!job) return { ok: true, job: null };
      if (sender.tab && job.tabId != null && sender.tab.id !== job.tabId) return { ok: true, job: null }; // 別的 FB 分頁不理它
      const daily = await getDaily(job.identity ? job.identity.name : job.pageName);
      return {
        ok: true,
        job: {
          identity: job.identity || { name: job.pageName, kind: "page" },
          pageName: job.pageName,
          locale: job.locale,
          requirePageIdentity: job.requirePageIdentity,
          ad: job.ad,
          index: job.index,
          total: job.groups.length,
          group: job.groups[job.index] || null,
          today: daily.count,
          dailyLimit: job.dailyLimit,
        },
      };
    });
  }

  // content.js 回報「這個社團的即時狀態」（填表中／已填好／要你手動切身分…）
  if (msg.type === "fbq:report") {
    return reply(async () => {
      const job = await getJob();
      if (!job) return { ok: true };
      const results = (await chrome.storage.local.get(PROGRESS_KEY))[PROGRESS_KEY]?.results || [];
      const g = job.groups[job.index];
      results[job.index] = { groupId: g.id, groupName: g.name, status: msg.status || "filling", message: msg.message || "", at: new Date().toISOString() };
      await setProgress({ results, index: job.index });
      return { ok: true };
    });
  }

  // 使用者在社團頁按「下一個社團」或「跳過」→ 記結果、換下一個
  if (msg.type === "fbq:next" || msg.type === "fbq:skip") {
    return reply(async () => {
      const job = await getJob();
      if (!job) return { ok: true, done: true };
      const g = job.groups[job.index];
      const prog = (await chrome.storage.local.get(PROGRESS_KEY))[PROGRESS_KEY] || {};
      const results = prog.results || [];
      const status = msg.type === "fbq:skip" ? "skipped" : String(msg.status || "posted");
      results[job.index] = { groupId: g.id, groupName: g.name, status, message: String(msg.message || (status === "skipped" ? "已跳過" : "已由你按下發佈")), at: new Date().toISOString() };
      let today = prog.today || 0;
      if (status === "posted" || status === "pending") today = await bumpDaily(job.identity ? job.identity.name : job.pageName);

      // 到每日上限就停
      if (job.dailyLimit > 0 && today >= job.dailyLimit && job.index + 1 < job.groups.length) {
        for (let i = job.index + 1; i < job.groups.length; i++) {
          const rg = job.groups[i];
          results[i] = { groupId: rg.id, groupName: rg.name, status: "skipped", message: "已達每日上限", at: new Date().toISOString() };
        }
        await setProgress({ results, status: "done", today, finishedAt: Date.now() });
        await chrome.storage.session.remove(JOB_KEY);
        return { ok: true, done: true, reason: "daily-limit" };
      }

      job.index += 1;
      if (job.index >= job.groups.length) {
        await setProgress({ results, status: "done", index: job.groups.length, today, finishedAt: Date.now() });
        await chrome.storage.session.remove(JOB_KEY);
        return { ok: true, done: true };
      }
      await saveJob(job);
      await setProgress({ results, index: job.index, today });
      await openGroup(job);
      return { ok: true, done: false, next: job.groups[job.index].name };
    });
  }

  // 後台按「停止」
  if (msg.type === "fbq:stop") {
    return reply(async () => {
      const job = await getJob();
      const prog = (await chrome.storage.local.get(PROGRESS_KEY))[PROGRESS_KEY] || {};
      await setProgress({ status: "stopped", finishedAt: Date.now() });
      await chrome.storage.session.remove(JOB_KEY);
      return { ok: true, hadJob: !!job };
    });
  }

  // 後台重新整理後要目前進度
  if (msg.type === "fbq:progress-get") {
    return reply(async () => {
      const prog = (await chrome.storage.local.get(PROGRESS_KEY))[PROGRESS_KEY] || null;
      const job = await getJob();
      return { ok: true, progress: prog, running: !!job };
    });
  }

  return false;
});

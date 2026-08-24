#!/usr/bin/env node
/**
 * 一行指令觸發 Vercel 部署 —— npm run deploy
 *
 * 讀 .env.local 裡的 VERCEL_DEPLOY_HOOK，POST 給它，觸發正式站重新建置。
 * 這個檔案本身不含任何密鑰、可以安全進版控 —— 密鑰只存在 .env.local
 * （已被 .gitignore 擋著，不會進版控）。
 *
 * ⚠️ hook 部署的是「main 分支目前的最新狀態」，不是這次跑指令當下的
 *    本機檔案。跑這個之前要先 commit 並 push 到 GitHub 的 main。
 */

const fs = require("fs");
const path = require("path");

const ENV_PATH = path.join(__dirname, "..", ".env.local");

function readDeployHook() {
  if (!fs.existsSync(ENV_PATH)) {
    console.error("找不到 .env.local，沒有 VERCEL_DEPLOY_HOOK 可以用。");
    process.exit(1);
  }
  const lines = fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const m = /^VERCEL_DEPLOY_HOOK\s*=\s*(.+)$/.exec(line);
    if (m) return m[1].trim();
  }
  console.error(
    "「.env.local」裡沒有 VERCEL_DEPLOY_HOOK。\n" +
      "跟負責人要一個（Vercel 專案 Settings → Git → Deploy Hooks，分支選 main），\n" +
      "拿到後加一行進 .env.local：VERCEL_DEPLOY_HOOK=<網址>"
  );
  process.exit(1);
}

async function main() {
  const hook = readDeployHook();

  console.log("記得先確認程式碼已經 push 到 GitHub 的 main —— hook 部署的是遠端最新狀態。");
  console.log("觸發部署中…");

  let res;
  try {
    res = await fetch(hook, { method: "POST" });
  } catch (err) {
    console.error("連不上 Vercel，檢查一下網路連線：" + (err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    console.error(`部署觸發失敗（HTTP ${res.status}）。`);
    if (body) console.error(JSON.stringify(body, null, 2));
    console.error("這組 hook 網址可能被撤銷了，跟負責人要一個新的。");
    process.exit(1);
  }

  console.log(`已觸發。job id：${body?.job?.id ?? "(未知)"}　狀態：${body?.job?.state ?? "(未知)"}`);
  console.log("通常 1～3 分鐘後正式站會更新：https://huang-weikai-realty.vercel.app/");
}

main();

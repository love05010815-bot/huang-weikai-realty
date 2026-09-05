"use client";

/**
 * /admin/post591 —— 591 刊登助手的操作介面。
 *
 * 流程：貼上 → 解析 → 第①頁四連點 → 確認表（每格可改、可複製）→ 標題／描述（可改）
 *       → 照片下載指令 → 「複製交接摘要」貼給 Claude。
 *
 * 🔴 **確認表可以改，改了交接摘要就跟著變。** 辨識器不可能 100% 對，差別在「它猜錯了你知不知道」：
 *    紅底 = 資料裡沒有、要你補；綠字 = 591 是選項用點的。
 *
 * ⚠️ 描述用他的固定版型（config/post591-template.ts），只換 ✨ 行；他改過的內容不會被重算蓋掉 ——
 *    只有重新按「解析」才會重建。
 */

import { useMemo, useState } from "react";
import { Icon } from "@/app/admin/_ui/icons";
import { parseListing, type Listing } from "@/lib/post591-parser";
import {
  POST591_LAUNCH_URL,
  buildDescription,
  buildHandoff,
  buildPayload,
  buildRows,
  derive,
  encodePayload,
  photoCommand,
  post591Risks,
  titleCheck,
  type Row,
} from "@/lib/post591-map";
import { POST591_DEFAULTS } from "@/config/post591-template";
import styles from "./post591.module.css";

export default function Post591Manager() {
  const [text, setText] = useState("");
  const [listing, setListing] = useState<Listing | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [photoFolder, setPhotoFolder] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const derived = useMemo(() => (listing ? derive(listing) : null), [listing]);

  function run() {
    const d = parseListing(text);
    const o = derive(d);
    setListing(d);
    setRows(buildRows(d, o));
    setTitle(d.rawTitle);
    setDesc(buildDescription(d.features));
    setPhotoFolder(d.photos.length ? `D:\\Agent-os\\591-poster\\photos_${d.no || "listing"}` : "");
    setTimeout(() => document.getElementById("p591-result")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 1500);
    } catch {
      setCopied(null);
    }
  }

  function setRow(i: number, value: string) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, value } : r)));
  }

  const tc = titleCheck(title);
  const risks = useMemo(() => post591Risks(title, desc), [title, desc]);
  const descLen = [...desc].length;
  const handoff = listing && derived ? buildHandoff(listing, derived, rows, title, desc, photoFolder) : "";
  const cmd = listing ? photoCommand(listing.photos, listing.no) : "";

  return (
    <div className={styles.wrap}>
      <section className={styles.card}>
        <h2 className={styles.h2}>① 貼上資料</h2>
        <p className={styles.hint}>
          愛屋型錄：打開型錄頁先把地址旁的「<b>顯示</b>」點開（門牌才會帶進來）→ Ctrl+A → Ctrl+C。
          LINE 文字：照你平常的格式（「標題」／地址：／售價：／格局：／總建坪…／✨ 特色行）貼進來就好。
        </p>
        <textarea
          className={styles.ta}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="貼在這裡…"
          spellCheck={false}
        />
        <div className={styles.runbar}>
          <button className={styles.run} onClick={run} disabled={!text.trim()}>
            <Icon name="edit" size={18} aria-label="解析" /> 解析
          </button>
          <button className={styles.ghost} onClick={() => { setText(""); setListing(null); setRows([]); }}>
            清空
          </button>
        </div>
      </section>

      {listing && derived && (
        <div id="p591-result">
          {listing.warnings.length > 0 && (
            <section className={`${styles.card} ${styles.warnCard}`}>
              <h2 className={styles.h2}>⚠ 辨識時的提醒</h2>
              <ul className={styles.ul}>
                {listing.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </section>
          )}

          <section className={styles.card}>
            <h2 className={styles.h2}>② 591 第①頁：照這樣點四下</h2>
            <div className={styles.steps}>
              {[derived.adType, derived.legal, derived.status, derived.type].map((st, i) => (
                <span key={st} className={styles.stepWrap}>
                  {i > 0 && <span className={styles.arrow}>→</span>}
                  <span className={styles.step}>{st}</span>
                </span>
              ))}
            </div>
            <p className={styles.hint}>
              依據：謄本用途「<b>{derived.tengben || "資料沒有，先當住家用"}</b>」→ 法定用途「{derived.legal}」；
              類型「<b>{listing.kind || "—"}</b>」＋樓高 {listing.total ?? "—"} 層 → 型態「{derived.type}」。
              {derived.tengben === "集合住宅" && " 591 清單裡也有「集合住宅」，住宅大樓一般選住家用，你要改也可以。"}
            </p>
          </section>

          <section className={styles.card}>
            <h2 className={styles.h2}>③ 第②頁：每一格</h2>
            <p className={styles.hint}>
              <span className={styles.legendNeed}>紅底</span> = 資料裡沒有、你要補；
              <span className={styles.legendPick}>綠字</span> = 591 是選項，用點的不用貼。每格都能改，改了交接摘要跟著變。
            </p>
            <div className={styles.rows}>
              {rows.map((r, i) =>
                r.group ? (
                  <div key={`g${i}`} className={styles.grp}>{r.group}</div>
                ) : (
                  <div key={`${r.label}${i}`} className={`${styles.row} ${r.need ? styles.need : ""} ${r.pick ? styles.pick : ""}`}>
                    <span className={styles.lab}>
                      {r.req && <i className={styles.req}>*</i>} {r.label}
                    </span>
                    <input
                      className={styles.input}
                      value={r.value}
                      readOnly={!!r.ref}
                      onChange={(e) => setRow(i, e.target.value)}
                    />
                    <span className={styles.note}>{r.note || ""}</span>
                    {r.ref || r.pick ? (
                      <span />
                    ) : (
                      <button className={styles.cp} onClick={() => copy(r.value, `r${i}`)}>
                        {copied === `r${i}` ? "已複製 ✓" : "複製"}
                      </button>
                    )}
                  </div>
                ),
              )}
            </div>
          </section>

          <section className={styles.card}>
            <h2 className={styles.h2}>④ 廣告標題與現況特色描述</h2>
            <label className={styles.lbl}>廣告標題（{POST591_DEFAULTS.titleMin}～{POST591_DEFAULTS.titleMax} 字）</label>
            <div className={styles.titleRow}>
              <input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} />
              <button className={styles.cp} onClick={() => copy(title, "title")}>
                {copied === "title" ? "已複製 ✓" : "複製"}
              </button>
            </div>
            <p className={tc.ok ? styles.okText : styles.badText}>{tc.msg}</p>

            <label className={styles.lbl}>現況特色描述（你的固定版型，只有 ✨ 那幾行是這戶的）</label>
            <textarea className={`${styles.ta} ${styles.taDesc}`} value={desc} onChange={(e) => setDesc(e.target.value)} spellCheck={false} />
            <div className={styles.btnrow}>
              <button className={styles.cp} onClick={() => copy(desc, "desc")}>
                {copied === "desc" ? "已複製 ✓" : "複製整段"}
              </button>
              <span className={descLen > POST591_DEFAULTS.descMax ? styles.badText : styles.hintInline}>
                {descLen} 字／上限 {POST591_DEFAULTS.descMax}
              </span>
            </div>

            {risks.length > 0 && (
              <div className={styles.riskBox}>
                <b>⚠ 法規敏感字（只標不刪，留不留你決定）</b>
                <ul className={styles.ul}>
                  {risks.map((r) => (
                    <li key={r.word}>
                      <b>{r.word}</b>：{r.why}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className={styles.card}>
            <h2 className={styles.h2}>⑤ 照片</h2>
            {listing.photos.length ? (
              <>
                <p className={styles.hint}>
                  型錄裡有 <b>{listing.photos.length} 張</b>。複製下面這行 → 開 PowerShell → 貼上 → Enter，
                  會存到 <code>{photoFolder}</code>。
                </p>
                <div className={styles.btnrow}>
                  <button className={styles.cp} onClick={() => copy(cmd, "cmd")}>
                    {copied === "cmd" ? "已複製 ✓" : "複製下載指令"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className={styles.hint}>這份資料沒有照片網址。照片放在哪個資料夾，填在這裡，會一起進交接摘要：</p>
                <input
                  className={styles.input}
                  value={photoFolder}
                  onChange={(e) => setPhotoFolder(e.target.value)}
                  placeholder="例如 D:\Agent-os\591-poster\領袖天下"
                />
              </>
            )}
          </section>

          <section className={`${styles.card} ${styles.handoffCard}`}>
            <h2 className={styles.h2}>⑥ 上架到 591</h2>
            <p className={styles.hint}>
              紅底的格子先補完，再按這顆。會開一個 591 刊登分頁，<b>你 Chrome 裡的「591 刊登助手」外掛</b>
              會把四連點、每一格、文案、照片全部填好，右下角面板列出還缺什麼。
              填完你自己核對，再按 591 的「保存資料，下一步」和「立即支付」——那兩顆永遠是你按。
            </p>
            <div className={styles.btnrow}>
              <button
                className={styles.run}
                onClick={() => {
                  const payload = buildPayload(listing, derived, rows, title, desc);
                  window.open(`${POST591_LAUNCH_URL}#p591=${encodePayload(payload)}`, "_blank", "noopener");
                }}
              >
                🚀 上架到 591
              </button>
              {rows.some((r) => r.need) && (
                <span className={styles.badText}>還有 {rows.filter((r) => r.need).length} 格紅底沒補（外掛會把它們列在面板上）</span>
              )}
            </div>
            <p className={styles.hint} style={{ marginTop: 10 }}>
              沒裝外掛？裝法在 <code>booking-system\tools\post591-extension\README.md</code>（chrome://extensions → 開發人員模式 → 載入未封裝項目 → 選那個資料夾）。
              裝不了或想交給 Claude 填，就用下面的交接摘要。
            </p>
            <details>
              <summary className={styles.hintInline}>備用：複製交接摘要給 Claude</summary>
              <div className={styles.btnrow}>
                <button className={styles.cp} onClick={() => copy(handoff, "handoff")}>
                  {copied === "handoff" ? "已複製 ✓" : "複製交接摘要"}
                </button>
              </div>
              <textarea className={`${styles.ta} ${styles.taHandoff}`} value={handoff} readOnly spellCheck={false} />
            </details>
          </section>
        </div>
      )}
    </div>
  );
}

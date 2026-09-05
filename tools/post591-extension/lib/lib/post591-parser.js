/**
 * 591 刊登助手的辨識器 —— 給 /admin/post591 用。
 *
 * 輸入兩種：
 *   1. 愛屋「不動產電子型錄」整頁 Ctrl+A / Ctrl+C 的文字（列印頁）
 *   2. 他在 LINE 上打的物件文字（「標題」／地址：／售價：／格局：／總建坪…／✨ 特色行）
 *
 * 🔴 **這裡不會、也不准去愛屋或 591 抓資料。** 文字一律由使用者自己複製貼進來。
 *    591 服務條款禁止爬蟲（每筆求償 3,000 元），愛屋是公司內部系統也不該用程式碰。
 *
 * ⚠️ **設計原則：一律用「標籤關鍵字」定位，不准用「值在第幾行」。**
 *    剪貼簿會把值和標籤黏成一行或拆成兩行，靠行號抓的欄位整批會錯（rival-parser 踩過）。
 *
 * ⚠️ 這支檔案刻意只 import 型別、不 import 任何會碰 node 的東西 —— client component 要直接用。
 */
/* ───────── 工具 ───────── */
export const toNum = (s) => {
    if (s == null || s === "")
        return null;
    const n = parseFloat(String(s).replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
};
/**
 * 統一排版：全形英數與斜線冒號括號轉半形，中文標點（，。、）一律不動 ——
 * 否則廣告文案會被改成半形逗號，貼出去很難看。
 */
export function normalize(t) {
    return t
        .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
        .replace(/／/g, "/")
        .replace(/：/g, ":")
        .replace(/（/g, "(")
        .replace(/）/g, ")")
        .replace(/　/g, " ")
        .replace(/\r\n?/g, "\n")
        .replace(/[ \t]+/g, " ");
}
/**
 * 取欄位值：標籤和值之間最多只准隔「一個換行」。
 * 不能寫成 [\s]* —— 遇到空欄位（型錄「鄰近市場」沒填）會一路吃到下一個欄位的標籤，
 * 抓回一個看起來有值、其實是隔壁欄位名稱的假資料。這種錯不會報錯，只會靜靜地填錯。
 */
function pick(text, label, valueRe) {
    const gap = "[ \\t]*[:：|]?[ \\t]*\\n?[ \\t]*";
    const re = new RegExp(label + gap + valueRe.source, valueRe.flags.replace("g", ""));
    const m = text.match(re);
    return m ? m.slice(1) : null;
}
const one = (t, l, r) => {
    const v = pick(t, l, r);
    return v ? v[0].trim() : "";
};
/** 型錄上所有欄位標籤。用來擋「值抓到隔壁欄位標籤」 */
const LABELS = [
    "委託總價", "登記坪數", "含車位坪", "建物面積", "主 \\+附屬", "主建物坪", "附屬建物",
    "公設建坪", "公設比", "每坪單價", "土地登記", "主地坪", "公設地坪", "使用分區", "總基地坪", "樓別",
    "房 ?/ ?廳", "車位型式", "車位 ?/ ?編號", "類別", "類型", "物件座向", "面臨路寬", "社區", "管理費",
    "竣工日期", "屋 ?齡", "建物外觀", "建物結構", "鄰近公園", "鄰近市場", "鄰近學校", "生 ?活 ?圈",
    "物件編號", "鑰匙", "物件面寬", "物件深度", "邊 ?間", "電梯總數", "環境特色", "經紀人員", "電話",
];
const LABEL_RE = new RegExp("^(?:" + LABELS.join("|") + ")");
/** 文字欄位專用：抓到的值如果本身就是個標籤，那這格其實是空的 */
function oneText(t, l, r) {
    const v = one(t, l, r);
    return LABEL_RE.test(v) ? "" : v;
}
function empty(source) {
    return {
        source, rawTitle: "", addr: "", no: "", price: null, regPing: null, parkPing: null,
        mainPing: null, attPing: null, pubPing: null, landPing: null, floorRaw: "", floor: null,
        floorSub: "", total: null, room: null, hall: null, bath: null, parkType: "", parkNo: "",
        usage: "", kind: "", community: "", communityGuessed: false, fee: null, feeCycle: "月繳",
        y: null, m: null, dd: null, ageYears: null, school: "", park: "", market: "", facing: "",
        zone: "", lifeArea: "", age: "", struct: "", width: "", depth: "", households: null,
        features: [], photos: [], warnings: [],
    };
}
/** 貼進來的是型錄還是 LINE 文字 */
export function detectSource(raw) {
    return /不動產電子型錄|委託總價|登記坪數|樓別\s*[\/／]\s*樓高/.test(raw) ? "houseol" : "freeform";
}
/* ───────── 愛屋型錄 ───────── */
export function parseHouseol(raw) {
    const d = empty("houseol");
    let t = normalize(raw);
    /* 砍掉列印頁最上面那一大串同事名單（個資，不留） */
    const head = t.indexOf("不動產電子型錄");
    if (head > -1)
        t = t.slice(head + 7);
    /* 砍掉尾巴的註腳雜訊，但要留住「環境特色」 */
    const tail = t.search(/\n\s*(僅供參考詳細內容以謄本記載為準|經紀證照:)/);
    const body = tail > -1 ? t.slice(0, tail) : t;
    /* 標題：緊接在「不動產電子型錄」後面的第一行有字的內容 */
    d.rawTitle = (body.match(/^\s*\n?\s*([^\n]{4,40})/) || [, ""])[1].trim();
    /*
      地址行。⚠️ 不能只認「含區/鄉/鎮」—— 標題常常也中（「大肚學區、公園旁大透天」的「學區」）。
      真地址一定還帶著 路/街/道/段/巷/弄/號，而且一定落在型錄最前面幾行。
      行尾的「顯示 / 隱藏」是型錄上的按鈕文字，不是地址的一部分。
    */
    const addrLine = body
        .split("\n")
        .slice(0, 12)
        .find((L) => /[區鄉鎮]/.test(L) && /[路街道段巷弄號]/.test(L) && L.replace(/\s/g, "").length <= 40) || "";
    d.addr = addrLine.replace(/(顯示|隱藏門牌|隱藏)\s*$/, "").trim();
    d.no = one(body, "物件編號", /([A-Z]{1,3}\d{5,})/);
    d.price = toNum(one(body, "委託總價", /([\d,]+(?:\.\d+)?)\s*萬/));
    d.regPing = toNum(one(body, "登記坪數", /([\d.]+)\s*坪/));
    d.parkPing = toNum(one(body, "含車位坪", /([\d.]+)\s*坪/));
    d.mainPing = toNum(one(body, "主建物坪", /([\d.]+)\s*坪/));
    d.attPing = toNum(one(body, "附屬建物", /([\d.]+)\s*坪/));
    d.pubPing = toNum(one(body, "公設建坪", /([\d.]+)\s*坪/));
    d.landPing = toNum(one(body, "土地登記", /([\d.]+)\s*坪/));
    /*
      樓層。一定要有「/」當標記，只認「數字/數字」會誤抓日期與單價。
      左邊不保證是數字 —— 透天／別墅的型錄常寫「全棟/4」或「1-2/2」。右邊（總樓高）才一定是數字。
    */
    const fl = pick(body, "樓別\\s*/\\s*樓高", /(\d{1,3}(?:\s*[-~]\s*\d{1,3})?|全棟|整棟|全)\s*\/\s*(\d{1,3})/);
    d.floorRaw = fl ? fl[0].replace(/\s/g, "") : "";
    d.floor = /^\d+$/.test(d.floorRaw) ? +d.floorRaw : null;
    d.total = fl ? +fl[1] : null;
    /* 房廳衛必須三個成對出現，避免抓到標題行銷字（例如「可3房」） */
    const rm = pick(body, "房\\s*/\\s*廳\\s*/\\s*衛", /(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)/);
    d.room = rm ? +rm[0] : null;
    d.hall = rm ? +rm[1] : null;
    d.bath = rm ? +rm[2] : null;
    d.parkType = oneText(body, "車位型式", /([^\n]{1,20})/);
    d.parkNo = oneText(body, "車位\\s*/\\s*編號", /([^\n]{1,24})/);
    d.usage = oneText(body, "類別\\s*/\\s*謄本用途", /([^\n]{1,24})/);
    d.kind = oneText(body, "類型\\s*/\\s*現況", /([^\n]{1,24})/);
    /*
      社區欄位。⚠️ 標題也常以「社區」開頭（「社區最便宜全新美兩房平車」），從頭找會把標題當社區名。
      型錄的欄位順序固定是 …類型/現況 → 社區 → 管理費…，所以只在「類型」之後找，
      而且「社區」要在行首（值可能黏在同一行或在下一行，pick 兩種都接）。
    */
    const kindAt = body.indexOf("類型");
    const scope = kindAt > -1 ? body.slice(kindAt) : body;
    d.community = oneText(scope, "(?:^|\\n)社區", /([^\n]{1,24})/);
    /* 標籤用非貪婪 —— 貪婪的話「管理費|車位管理費2342元/月繳」會回溯到只抓一個「2」 */
    const mf = pick(body, "管理費[^\\n]*?", /([\d,]+)\s*元\s*\/\s*(月繳|季繳|半年繳|年繳)/);
    d.fee = mf ? toNum(mf[0]) : null;
    d.feeCycle = mf ? mf[1] : "月繳";
    const dt = pick(body, "竣工日期", /(\d{4})\s*[\/\-.年]\s*(\d{1,2})\s*[\/\-.月]\s*(\d{1,2})/);
    if (dt) {
        d.y = +dt[0];
        d.m = +dt[1];
        d.dd = +dt[2];
    }
    d.school = oneText(body, "鄰近學校", /([^\n]{0,40})/);
    d.park = oneText(body, "鄰近公園", /([^\n]{0,40})/);
    d.market = oneText(body, "鄰近市場", /([^\n]{0,40})/);
    /* 透天型錄才有的欄位（大樓型錄沒這些，抓不到就是空的） */
    d.facing = oneText(body, "物件座向", /([^\n]{0,14})/);
    d.zone = oneText(body, "使用分區", /([^\n]{0,20})/);
    d.lifeArea = oneText(body, "生 ?活 ?圈", /([^\n]{0,24})/);
    d.age = oneText(body, "屋 ?齡", /([^\n]{0,12})/);
    d.struct = oneText(body, "建物結構", /([^\n]{0,16})/);
    d.width = oneText(body, "物件面寬", /([^\n]{0,12})/);
    d.depth = oneText(body, "物件深度", /([^\n]{0,12})/);
    /* 環境特色：抓到下一個已知區塊為止，逐行去掉 ✨①② 這類開頭符號 */
    const fm = body.match(/環境特色[\s:：]*\n?([\s\S]*?)(?=\n\s*(?:\[地圖\]|經紀人員|\*\s*$)|$)/);
    d.features = splitFeatureLines(fm ? fm[1] : "");
    /* 照片網址就藏在「更多照片」連結的 picstr 參數裡（型錄可能有不只一條這種連結） */
    d.photos = extractPhotoUrls(raw);
    if (!d.total)
        d.warnings.push("樓別/樓高沒抓到，出售總樓層要自己填");
    if (!d.price)
        d.warnings.push("委託總價沒抓到");
    if (!d.regPing)
        d.warnings.push("登記坪數沒抓到");
    if (!d.room)
        d.warnings.push("房/廳/衛沒抓到");
    if (!d.y)
        d.warnings.push("竣工日期沒抓到，完工年要自己填");
    return d;
}
/**
 * 特色文字逐行拆開，去掉 ✨ ① ▪ • 這類開頭符號與空行。
 * ⚠️ 型錄「環境特色」下面緊接著「地圖 街景 更多照片 成交行情」那排連結，複製時沒帶括號就會混進來，
 *    2026-09-04 就這樣進了一則廣告的 ✨ 第六行。那排是按鈕文字，不是特色，整行丟掉。
 */
/**
 * 從任何文字（整頁型錄、或使用者貼進來的一串連結）撈出所有 `picstr=` 裡的照片網址。
 * 2026-09-05 踩到：型錄可能有兩條「更多照片」連結（各帶一組 picstr），使用者把兩條連結直接接在一起貼，
 * 只認第一個 picstr 就少了三張。所以：每個 picstr 都吃、逗號分開、去重、保持順序；值若是 URL 編碼過的先解碼。
 */
export function extractPhotoUrls(text) {
    const out = [];
    for (const m of text.matchAll(/picstr=([^&)\s\]]+)/g)) {
        let v = m[1];
        if (/%[0-9A-Fa-f]{2}/.test(v)) {
            try {
                v = decodeURIComponent(v);
            }
            catch {
                /* 解不開就用原字串 */
            }
        }
        for (const u of v.split(",")) {
            const s = u.trim();
            if (/^https?:\/\//.test(s) && !out.includes(s))
                out.push(s);
        }
    }
    return out;
}
/** 把貼進來的一串文字切成一條條頂層連結；picstr 裡的照片網址前面一定是 = 或 ,，不算一條連結 */
export function splitLinks(text) {
    return text
        .split(/(?<![=,])(?=https?:\/\/)/)
        .map((s) => s.trim())
        .filter((s) => /^https?:\/\//.test(s));
}
/** 直接貼進來的照片檔網址（在型錄照片上按右鍵 → 複製圖片網址） */
export function directImageUrls(text) {
    return text.match(/https?:\/\/hq\.houseol\.com\.tw\/images\/pictures\/[^\s,"'<>)]+?\.(?:jpe?g|png)/gi) || [];
}
/**
 * 愛屋型錄頁（Ecatalog.aspx）本身的網址沒有照片清單 —— 頁面上嵌的那幾張要把網頁抓回來才看得到。
 * 這裡只判斷「這條是不是該去掃的型錄頁」；抓網頁由外掛 background 做（只抓使用者自己貼進來的那一頁）。
 */
export function isHouseolPage(url) {
    return /^https?:\/\/[^/]*houseol\.com\.tw\/[^?#]*\.aspx/i.test(url) && !/picstr=/i.test(url);
}
/** 型錄頁網址裡的物件編號（No=AA6334850），拿來過濾頁面上的照片、排掉 logo */
export function listingNoFromUrl(url) {
    const m = url.match(/[?&]No=([A-Za-z]{1,3}\d{5,})/i);
    return m ? m[1].toUpperCase() : null;
}
/**
 * 從型錄頁的 HTML 撈出這一戶的照片：hq.houseol.com.tw/images/pictures/ 底下、檔名含物件編號的圖。
 * 2026-09-05 實測：型錄頁嵌 3 張（H229AA6334850a/d/e.jpg）＋公司 logo（4817_3.jpg），「更多照片」另外 6 張（f 之後）。
 */
export function extractPhotosFromHtml(html, listingNo) {
    const out = [];
    for (const m of html.matchAll(/(?:https?:)?\/\/hq\.houseol\.com\.tw\/images\/pictures\/[^"'\s<>)]+?\.(?:jpe?g|png)/gi)) {
        const u = m[0].startsWith("//") ? `https:${m[0]}` : m[0];
        const file = u.slice(u.lastIndexOf("/") + 1).toUpperCase();
        if (listingNo ? !file.includes(listingNo.toUpperCase()) : /_/.test(file))
            continue; // logo 長得像 4817_3.jpg
        if (!out.some((x) => x.toLowerCase() === u.toLowerCase()))
            out.push(u);
    }
    return out;
}
/**
 * 把貼進來的每條連結變成照片清單，照貼的順序、去重（大小寫不分）。
 * `scanned` 是外掛把型錄頁抓回來後算出的照片（key = 那條連結）；還沒掃到的型錄頁先算 0 張。
 */
export function combinePhotos(text, scanned = {}) {
    const out = [];
    const push = (u) => {
        if (!out.some((x) => x.toLowerCase() === u.toLowerCase()))
            out.push(u);
    };
    for (const l of splitLinks(text)) {
        if (isHouseolPage(l))
            (scanned[l] || []).forEach(push);
        else {
            extractPhotoUrls(l).forEach(push);
            directImageUrls(l).forEach(push);
        }
    }
    return out;
}
/** 使用者貼了幾條連結、每條各抓到幾張、哪幾條是要去掃的型錄頁 —— 給介面顯示，讓「貼了兩條只吃到一條」自己看得出來 */
export function photoLinkReport(text, scanned = {}) {
    const links = splitLinks(text);
    const perLink = links.map((l) => (isHouseolPage(l) ? (scanned[l] || []).length : combinePhotos(l).length));
    return { links, perLink, pages: links.filter(isHouseolPage), photos: combinePhotos(text, scanned) };
}
export function splitFeatureLines(text) {
    return text
        .split("\n")
        .map((L) => L.replace(/^[\s✨★☆▪•●◆◇①-⑳\-–—]+/, "").trim())
        .filter((L) => L.length > 0)
        .filter((L) => !/^\[?(?:地圖|街景|更多照片|成交行情)\]?(?:[\s\[\]()（）]|$)/.test(L) && !/^地圖\s+街景/.test(L));
}
/* ───────── LINE 文字 ───────── */
/**
 * 他 LINE 上的寫法（2026-09-04 領袖天廈那則的格式）：
 *   新接🌟社區名
 *   「廣告標題」
 *   地址：梧棲區四維路７１巷２號１２樓之１
 *   售價：８６８萬
 *   格局：４房/２廳/４衛
 *   總建坪：51.16坪／主建：40.08坪／附屬：0.895坪／公設：10.183坪／屋齡：33年
 *   ✨ 六行特色
 * 沒有的欄位就是沒有，交給人補；這裡不猜數字。
 */
export function parseFreeform(raw) {
    const d = empty("freeform");
    const t = normalize(raw);
    const q = t.match(/[「『"]([^」』"\n]{4,40})[」』"]/);
    d.rawTitle = q ? q[1].trim() : "";
    /* 地址：可能帶樓層「12樓之1」，拆出來後地址只留到號 */
    const ad = t.match(/地址[:\s]*([^\n]+)/);
    if (ad) {
        let a = ad[1].trim();
        const fl = a.match(/(\d+)\s*樓(?:\s*之\s*(\d+))?/);
        if (fl) {
            d.floor = +fl[1];
            d.floorRaw = fl[1];
            d.floorSub = fl[2] || "";
            a = a.slice(0, fl.index).trim();
        }
        d.addr = a.replace(/[,，]\s*$/, "");
    }
    d.price = toNum(one(t, "(?:售價|開價|總價)", /([\d,]+(?:\.\d+)?)\s*萬/));
    const lay = t.match(/(\d+)\s*房\s*[\/、,]\s*(\d+)\s*廳\s*[\/、,]\s*(\d+)\s*衛/);
    if (lay) {
        d.room = +lay[1];
        d.hall = +lay[2];
        d.bath = +lay[3];
    }
    d.regPing = toNum(one(t, "(?:總建坪|權狀坪?數?|登記坪數|建坪)", /([\d.]+)\s*坪/));
    d.mainPing = toNum(one(t, "主建(?:物)?(?:坪)?", /([\d.]+)\s*坪/));
    d.attPing = toNum(one(t, "附屬(?:建物)?", /([\d.]+)\s*坪/));
    d.pubPing = toNum(one(t, "公設(?:建坪|坪)?", /([\d.]+)\s*坪/));
    d.landPing = toNum(one(t, "(?:土地|地坪)", /([\d.]+)\s*坪/));
    d.parkPing = toNum(one(t, "車位(?:坪|面積)", /([\d.]+)\s*坪/));
    d.ageYears = toNum(one(t, "屋齡", /([\d.]+)\s*年/));
    d.total = toNum(one(t, "(?:總樓層|樓高|總樓高)", /(\d{1,3})/));
    const mf = t.match(/管理費[^\n]*?([\d,]+)\s*元/);
    d.fee = mf ? toNum(mf[1]) : null;
    const hh = t.match(/總戶數\s*([\d,]+)\s*戶/);
    d.households = hh ? toNum(hh[1]) : null;
    d.features = t
        .split("\n")
        .filter((L) => /^\s*[✨★☆▪•●◆◇]/.test(L))
        .map((L) => L.replace(/^[\s✨★☆▪•●◆◇]+/, "").trim())
        .filter(Boolean);
    /* 社區名：從第一行 ✨ 的「XXX，」猜；標成猜的，畫面上要人核對 */
    const first = d.features[0] || "";
    const cg = first.match(/^([一-龥A-Za-z0-9]{2,8})[，,、]/);
    if (cg) {
        d.community = cg[1];
        d.communityGuessed = true;
    }
    if (/透天/.test(t))
        d.kind = "透天";
    else if (/別墅/.test(t))
        d.kind = "別墅";
    else if (/公寓/.test(t))
        d.kind = "公寓";
    else if (/華廈/.test(t))
        d.kind = "華廈";
    else if (d.floor != null || /大樓|社區/.test(t))
        d.kind = "大樓";
    const pk = t.match(/(坡道|升降|機械|平面|塔式)[^\n]{0,6}車位|車位[^\n]{0,6}(坡道|升降|機械|平面|塔式)/);
    if (pk)
        d.parkType = pk[0];
    else if (/無車位|沒有車位|不含車位/.test(t))
        d.parkType = "無";
    if (!d.rawTitle)
        d.warnings.push("沒看到「」包起來的標題，要自己打");
    if (!d.addr)
        d.warnings.push("沒看到「地址：」");
    if (!d.total)
        d.warnings.push("文字沒寫總樓層，出售總樓層要自己填");
    if (!d.price)
        d.warnings.push("沒看到售價");
    if (!d.regPing)
        d.warnings.push("沒看到總建坪/權狀坪數");
    if (d.ageYears == null && !d.y)
        d.warnings.push("沒寫屋齡也沒竣工日，完工年要自己填");
    if (d.fee == null)
        d.warnings.push("沒寫管理費，591 必選有/無");
    if (!d.usage)
        d.warnings.push("文字裡沒有謄本用途，法定用途要照謄本自己選");
    if (d.communityGuessed)
        d.warnings.push(`社區名「${d.community}」是從第一行 ✨ 猜的，請核對`);
    return d;
}
/** 自動判斷來源後解析 */
export function parseListing(raw) {
    return detectSource(raw) === "houseol" ? parseHouseol(raw) : parseFreeform(raw);
}

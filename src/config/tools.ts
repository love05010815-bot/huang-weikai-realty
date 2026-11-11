/**
 * 免費小工具的清單 —— 首頁入口區塊（page.tsx 的 #tools）跟 /tools 分頁共用這一份。
 *
 * 2026-11-11 系統擁有者：「把免費小工具另外單獨一個分頁」。之前整塊（七張卡＋免責＋五個政府網站）
 * 都長在首頁，清單也寫在 page.tsx；做成分頁後兩邊都要用，搬到這裡。
 * 首頁只剩標題＋七顆工具連結＋「看全部」；完整的卡片說明、免責、政府網站都在 /tools。
 * 同日再加「買房常用／賣房常用」兩組（TOOL_GROUPS），/tools 最前面先讓客戶選身分。
 *
 * ⚠️ 導覽列的下拉選單（_ui/SiteNav.tsx 的 TOOLS_MENU）跟 /owner、/buyer 的兩顆按鈕（config/roles.ts）
 *    是各自一份、手動同步：新增或改工具時，這裡改完記得去那兩處對一下。
 *
 * 稅費試算那四項：2026-08-23 系統擁有者拍板改成自己站上算，不再把客戶丟到外部網站。
 * 原本的顧慮是「自己算等於給稅務意見，而且稅率一改就會過期」——
 * 處理方式：算法抽到 src/lib/land-tax.ts，每個數字都註明官方出處；
 * /tax 頁把計算過程整個攤開、標明法規核對日期，並保留免責聲明。稅率變動時只要改 land-tax.ts 一個檔。
 */

export type Tool = {
  icon: string;
  title: string;
  /** 卡片上的完整說明（/tools 的七張卡用） */
  desc: string;
  /** 一句話版（買房常用／賣房常用那種一列一個工具的地方用），十幾個字 */
  brief: string;
  /** 「依據：…」那行，明確標出是誰的規定，避免看起來像我們自己算的 */
  source: string;
  href: string;
  /** 卡底的按鈕字，沒給就是「開始試算 →」 */
  cta?: string;
};

export const TOOLS: readonly Tool[] = [
  {
    icon: "🏠",
    title: "房地合一稅試算",
    desc: "賣房前先算清楚要繳多少稅。填入取得與出售的日期與價格，馬上算出持有期間、適用稅率與應納稅額，還會把每一步怎麼來的攤開給你看。",
    brief: "賣之前先算要繳多少稅、怎麼算的",
    source: "所得稅法第 14 條之 4 與財政部規定",
    href: "/tax#land-tax",
  },
  {
    icon: "🏦",
    title: "房貸月付金試算",
    desc: "先抓出每個月要還多少。填入貸款金額、利率、年限與寬限期，算出月付金與總利息，買房的預算才抓得準。",
    brief: "買之前先抓每個月要還多少",
    source: "本息平均攤還公式",
    href: "/tax#loan",
  },
  {
    icon: "🔑",
    title: "租金補貼試算",
    desc: "租屋族先算算看能領多少。填入所在縣市、行政區與家庭狀況，就算出每月可領補貼，海線各行政區金額不一樣，選錯區會差很多。",
    brief: "租屋族算每個月能領多少補貼",
    source: "內政部 300 億元中央擴大租金補貼分級表",
    href: "/tax#rent",
  },
  {
    icon: "🏡",
    title: "新青安 3.0 資格檢測",
    desc: "115 年 8 月上路的新制多了年齡、所得、總價三道門檻。點 7 題，30 秒看你能不能辦、能貸多少、月付大概多少，連補貼退場後的月付也一起算。",
    brief: "30 秒看能不能辦、能貸多少",
    source: "財政部青安 3.0 方案與國庫署問答集",
    href: "/tax#youth-loan",
  },
  // 2026-09-24 系統擁有者：客戶問學區都得去翻教育局網頁，要一個自己站上的版本（/school）。
  {
    icon: "🏫",
    title: "國中小學區查詢",
    desc: "買房前先看讀哪間學校。選行政區和里、在地圖上點一下，或直接用手機定位，馬上列出對應的國小與國中；只有幾個鄰、共同學區這些細節都照教育局公告標出來。",
    brief: "打地址就知道讀哪間國小國中",
    source: "臺中市政府教育局學區公告、內政部村里界圖",
    href: "/school",
    cta: "開始查詢 →",
  },
  // 2026-10-01 系統擁有者：加一項地籍面積單位換算，七種單位互通、打哪一格其他格自動對應（/area）。
  {
    icon: "📐",
    title: "坪數與地籍面積換算",
    desc: "謄本寫平方公尺、廣告講坪、農地論甲論分。在任何一格打數字，平方公尺、坪、公畝、公頃、平方公里、甲、分七種單位同時換好，一甲幾坪、一分地幾坪不用再查。",
    brief: "坪、平方公尺、甲、分一次換好",
    source: "1 坪＝3.3058 平方公尺、1 甲＝2,934 坪、1 公頃＝3,025 坪",
    href: "/area",
    cta: "開始換算 →",
  },
  // 2026-10-26 系統擁有者：客戶填行政區、型態、坪數、屋齡就看到自己房子的行情區間（/estimate）。
  //   資料就是 /lvr 那套內政部實價登錄，不另外抓；比對邏輯在 lib/lvr-estimate.ts。
  {
    icon: "💰",
    title: "我的房子行情多少",
    desc: "填行政區、大樓或透天、權狀坪數、屋齡，從內政部實價登錄裡挑出跟您條件相近的成交，算出每坪最低、中價位、最高，再換成您這間的總價區間，連那幾筆成交的門牌都列給您看。",
    brief: "用實價登錄看你這間值多少",
    source: "內政部不動產交易實價登錄開放資料（每天同步）",
    href: "/estimate",
    cta: "查我的房子 →",
  },
  // 實價登錄（/lvr）不在這裡：2026-09-30 系統擁有者「把這個單獨列出在首頁」，它有自己一區（首頁 #lvr）。
];

export type ToolGroup = {
  key: "buy" | "sell";
  icon: string;
  title: string;
  desc: string;
  /** 照這個順序從 TOOLS 挑；寫的 href 一定要在 TOOLS 裡（下面有檢查，寫錯 build 會直接停） */
  hrefs: readonly string[];
};

/**
 * 買房常用／賣房常用 —— /tools 最前面的兩組，客戶先選身分再點工具。
 * 2026-11-11 系統擁有者：「免費小工具再多增加一區是買房常用/賣房常用。
 *   買房常用有 房貸月付金試算/新青安3.0資格檢測；賣房常用有 房地合一稅試算/我的房子行情」。
 * 四顆都是上面 TOOLS 裡既有的工具，這裡只是分組，字跟連結都從 TOOLS 來、不另外寫一份。
 * （跟 config/roles.ts 的 /owner、/buyer 兩顆按鈕剛好同一組工具，但那邊還多了流程頁，各自維護。）
 */
export const TOOL_GROUPS: readonly ToolGroup[] = [
  {
    key: "buy",
    icon: "🔑",
    title: "買房常用",
    desc: "先抓每個月的負擔，再看青安辦不辦得下來。",
    hrefs: ["/tax#loan", "/tax#youth-loan"],
  },
  {
    key: "sell",
    icon: "🏷️",
    title: "賣房常用",
    desc: "先知道要繳多少稅、房子現在值多少，再談價。",
    hrefs: ["/tax#land-tax", "/estimate"],
  },
];

/** 照 group.hrefs 的順序把 TOOLS 裡的那幾顆挑出來 */
export function toolsInGroup(group: ToolGroup): Tool[] {
  return group.hrefs.map((href) => {
    const tool = TOOLS.find((t) => t.href === href);
    // 這個專案的失敗模式是「靜默失效」：href 打錯不能只是少一顆，要在 build 就停下來
    if (!tool) throw new Error(`config/tools.ts：TOOL_GROUPS「${group.title}」裡的 ${href} 不在 TOOLS 裡`);
    return tool;
  });
}

/**
 * 沒被任何一區收走的工具 —— /tools 的「其他」那排。
 * 2026-11-11 系統擁有者：「全部工具改其他，移除已歸類的項目」。從 TOOL_GROUPS 跟
 * INFO_SITES 裡的站內工具（internal）反推、不另外手寫一份，之後把某個工具搬進買房／賣房組
 * 或房屋地產資訊網，這排會自己少掉那一張。七個工具在 /tools 上每個只出現一次。
 */
export function ungroupedTools(): Tool[] {
  const placed = new Set<string>([
    ...TOOL_GROUPS.flatMap((g) => g.hrefs),
    ...INFO_SITES.filter((s) => s.internal).map((s) => s.href),
  ]);
  for (const href of placed) {
    // 站內工具的 href 一定要在 TOOLS 裡（分組跟資訊網都只是「放哪裡」，工具本體只有一份）
    if (href.startsWith("/") && !TOOLS.some((t) => t.href === href)) {
      throw new Error(`config/tools.ts：${href} 被排進分組或房屋地產資訊網，但不在 TOOLS 裡`);
    }
  }
  return TOOLS.filter((t) => !placed.has(t.href));
}

export type InfoSite = {
  icon: string;
  title: string;
  desc: string;
  /** 卡上標的機關名，照各站自己寫的；站內工具就寫資料來源 */
  agency: string;
  href: string;
  /**
   * true＝站內頁面（同一個分頁開、卡底寫「開始查詢 →」），沒給＝外部網站（另開新視窗）。
   * 2026-11-11 系統擁有者：「國中小學區查詢移到房屋地產資訊網」—— 這區第一次混進站內工具。
   * 有這個旗標的 href 必須也在 TOOLS 裡（它還是工具，首頁藥丸、導覽列選單照列），
   * 只是 /tools 上改放這區、不再出現在「其他」（見 ungroupedTools）。
   */
  internal?: true;
};

/**
 * 房屋地產資訊網 —— /tools 分頁下半部，五個政府查詢系統的外部連結。
 * 2026-11-11 系統擁有者：「在免費小工具裡建立一區房屋地產資訊網，這些網站要帶入外部連結」。
 *
 * 跟 TOOLS 的差別：這些不是站上的工具，整張卡是 <a target="_blank">，卡上直接寫機關名＋「另開新視窗」。
 * 網址是他給的，一字不改；機關名照各站自己寫的（套繪那站首頁寫都市發展局、稅籍那站標題寫地方稅務局）。
 * 說明只寫「拿來查什麼」，不替政府系統解釋怎麼操作 —— 他們改版我們不會知道。
 * 之後要加站：先 curl 確認活著，機關名照對方網站自己寫的。
 */
export const INFO_SITES: readonly InfoSite[] = [
  // 2026-11-11 系統擁有者：「國中小學區查詢移到房屋地產資訊網」—— 站內工具，放第一張；
  // 字跟 TOOLS 那筆各自寫（這裡要短一點、像這區其他卡的口吻），連結一定要一樣是 /school。
  {
    icon: "🏫",
    title: "國中小學區查詢",
    desc: "打路名或地址、選里，或直接手機定位，馬上列出讀哪間國小國中；只有幾個鄰、共同學區這些細節照教育局公告標出來。",
    agency: "本站工具，資料整理自臺中市政府教育局公告",
    href: "/school",
    internal: true,
  },
  {
    icon: "🗺️",
    title: "台中市158空間資訊網",
    desc: "台中市政府的地圖查詢平台。輸入地址或地號，疊看都市計畫、地籍、航照等各種圖層。",
    agency: "臺中市政府",
    href: "https://lohas.taichung.gov.tw/webgis/",
  },
  {
    icon: "🧾",
    title: "台中市房屋稅籍編號查詢",
    desc: "用門牌地址查這間房子的房屋稅籍編號，辦理房屋稅相關申請、線上查稅時會用到。",
    agency: "臺中市政府地方稅務局",
    href: "https://www.tax.taichung.gov.tw/41375/42040/?path=326",
  },
  {
    icon: "🏙️",
    title: "全國土地使用分區查詢",
    desc: "查這塊地是住宅區、商業區，還是農業區、保護區。買地、蓋房前先確認能做什麼用途。",
    agency: "內政部國土管理署",
    href: "https://luz.nlma.gov.tw/web/",
  },
  {
    icon: "📍",
    title: "地籍圖資網路便民服務系統",
    desc: "輸入地段地號或門牌，在地圖上看這塊地的位置、形狀，和鄰地怎麼接。",
    agency: "內政部地政司",
    href: "https://easymap.moi.gov.tw/Z10Web/Normal",
  },
  {
    icon: "🏗️",
    title: "建築物地籍套繪查詢",
    desc: "查這塊土地有沒有被既有建物的建照套繪過。買空地、想分割或增建前先看清楚。",
    agency: "臺中市政府都市發展局",
    href: "https://mcgbm.taichung.gov.tw/geoViewer2/geoViewAction.do?infopage=1&pas=I80",
  },
];

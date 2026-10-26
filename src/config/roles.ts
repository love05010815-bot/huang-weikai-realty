/**
 * 首頁 hero「我是屋主／我是買方」兩顆分流按鈕，以及各自連進去的分頁（/owner、/buyer）。
 *
 * 2026-10-26 系統擁有者：「在紅框處做兩個按鈕，我是屋主 / 我是買方」，接著指定
 *   我是屋主 → 另一個分頁，放「房地合一稅試算」「我的房子行情多少」兩顆按鈕；
 *   我是買方 → 另一個分頁，放「房貸月付金試算」「新青安 3.0 資格檢測」兩顆按鈕。
 *
 * 工具本身都是既有頁面（/tax 的 hash 會直接切到那個計算分頁、/estimate），這裡只是分流入口。
 * 工具的標題／說明跟首頁 TOOLS（app/page.tsx）、導覽列 TOOLS_MENU（_ui/SiteNav.tsx）
 * 一樣是各自一份、手動同步 —— 改了那邊的字，記得回來對一下。
 *
 * 首頁那兩顆按鈕的字、圖示、目的地，跟 /owner、/buyer 頁面的標題、說明、兩顆工具，全部只在這裡。
 */
import { OWNER } from "@/config/owner";

export type RoleTool = {
  icon: string;
  title: string;
  desc: string;
  href: string;
  cta: string;
};

export type Role = {
  slug: "owner" | "buyer";
  /** 分頁網址 */
  path: string;
  /** 首頁按鈕上的字，也是分頁的 h1 */
  label: string;
  icon: string;
  eyebrow: string;
  /** 分頁標題下面那一句 */
  desc: string;
  tools: RoleTool[];
  seo: { title: string; description: string; keywords: string[] };
};

export const ROLES: Record<Role["slug"], Role> = {
  owner: {
    slug: "owner",
    path: "/owner",
    label: "我是屋主",
    icon: "🏠",
    eyebrow: "FOR OWNERS",
    desc: "賣房前最常被問的兩件事：這間房賣掉要繳多少稅、現在的行情值多少。先算好，再談價格才有底。",
    tools: [
      {
        icon: "🏠",
        title: "房地合一稅試算",
        desc: "賣房前先算清楚要繳多少稅。填入取得與出售的日期與價格，馬上算出持有期間、適用稅率與應納稅額，還會把每一步怎麼來的攤開給你看。",
        href: "/tax#land-tax",
        cta: "開始試算 →",
      },
      {
        icon: "💰",
        title: "我的房子行情多少",
        desc: "填行政區、大樓或透天、權狀坪數、屋齡，從內政部實價登錄裡挑出跟您條件相近的成交，算出每坪最低、中價位、最高，再換成您這間的總價區間。",
        href: "/estimate",
        cta: "查我的房子 →",
      },
    ],
    seo: {
      title: `我是屋主｜賣房先算房地合一稅、查我的房子行情｜台中海線房仲${OWNER.name}`,
      description:
        "準備賣房的屋主先用兩個免費工具：房地合一稅試算（填取得與出售的日期、價格，算出持有期間、稅率與應納稅額）、我的房子行情多少（填行政區、型態、坪數、屋齡，從內政部實價登錄算出每坪與總價區間）。沙鹿、梧棲、清水、龍井賣房，找太平洋房屋黃瑋凱。",
      keywords: ["賣房要繳什麼稅", "房地合一稅試算", "我的房子值多少", "房子行情查詢", "沙鹿房價", "梧棲房價", "台中海線賣房", "台中海線房仲", OWNER.name],
    },
  },
  buyer: {
    slug: "buyer",
    path: "/buyer",
    label: "我是買方",
    icon: "🔍",
    eyebrow: "FOR BUYERS",
    desc: "買房前先把錢算清楚：每個月要還多少、新青安 3.0 能不能辦、能貸多少。兩個工具都免費，三十秒有答案。",
    tools: [
      {
        icon: "🏦",
        title: "房貸月付金試算",
        desc: "先抓出每個月要還多少。填入貸款金額、利率、年限與寬限期，算出月付金與總利息，買房的預算才抓得準。",
        href: "/tax#loan",
        cta: "開始試算 →",
      },
      {
        icon: "🏡",
        title: "新青安 3.0 資格檢測",
        desc: "115 年 8 月上路的新制多了年齡、所得、總價三道門檻。點 7 題，30 秒看你能不能辦、能貸多少、月付大概多少，連補貼退場後的月付也一起算。",
        href: "/tax#youth-loan",
        cta: "開始檢測 →",
      },
    ],
    seo: {
      title: `我是買方｜買房先算房貸月付金、新青安 3.0 資格｜台中海線房仲${OWNER.name}`,
      description:
        "準備買房先用兩個免費工具：房貸月付金試算（填貸款金額、利率、年限、寬限期，算出月付金與總利息）、新青安 3.0 資格檢測（點 7 題，看能不能辦、能貸多少、月付多少）。沙鹿、梧棲、清水、龍井買房，找太平洋房屋黃瑋凱。",
      keywords: ["房貸月付金試算", "房貸試算", "新青安 3.0", "新青安資格", "青安貸款試算", "買房預算", "台中海線買房", "台中海線房仲", OWNER.name],
    },
  },
};

/** 首頁按鈕的順序：屋主在左、買方在右 */
export const ROLE_LIST: Role[] = [ROLES.owner, ROLES.buyer];

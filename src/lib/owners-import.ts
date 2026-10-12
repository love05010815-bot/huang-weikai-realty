/**
 * 📇 屋主建檔 —— 「整批貼上」的解析器（純函式，不碰資料庫，`npm run check:owners` 會測）
 *
 * 他手上現有的屋主資料散在 LINE、Excel、筆記本裡。要把它們倒進來，最不折騰的方式是
 * 讓他直接複製貼上：一行一位屋主，欄位用「Tab／逗號／頓號／直線 |」分開。
 *
 *   姓名  電話  房子地址  社區名  備註
 *
 * 只有姓名是必填。後面幾欄缺幾個都可以 —— 不過**順序是固定的**，缺中間那欄就留空
 * （例：「王小明,0912345678,,龍井透天」）。
 *
 * 從 Excel 複製出來的是 Tab 分隔，從 LINE 複製的多半是逗號或空白 —— 空白不當分隔符，
 * 因為地址裡本來就有空白（「中山路 123 號」）。
 *
 * 🔴 電話欄會自動辨識：如果第 2 欄不像電話（沒有 8 碼以上的數字）而第 3 欄像，
 *    就當作他把電話放錯位置、把兩欄調過來 —— Excel 表「姓名、地址、電話」的順序很常見。
 */
import type { OwnerInput } from "@/lib/owners";
import type { PropertyStatus } from "@/config/owners";

export type ParsedImportRow = {
  /** 原始第幾行（從 1 起算，給錯誤訊息用） */
  line: number;
  raw: string;
  owner: OwnerInput;
  property: { address: string; community: string; status: PropertyStatus } | null;
  error: string | null;
};

const PHONE_LIKE = /\d[\d\s\-()（）]{7,}\d/;

export function looksLikePhone(s: string): boolean {
  const digits = s.replace(/\D+/g, "");
  return digits.length >= 8 && digits.length <= 15 && PHONE_LIKE.test(s);
}

/** 房子地址要有「路／街／巷／段／號／區／鄉／鎮／市」之一才算地址 */
export function looksLikeAddress(s: string): boolean {
  return /[路街巷弄段號區鄉鎮市村里]/.test(s) && s.length >= 4;
}

function splitLine(line: string): string[] {
  // Tab 優先（Excel）；沒有 Tab 才看逗號／全形逗號／頓號／直線
  if (line.includes("\t")) return line.split("\t").map((s) => s.trim());
  return line.split(/[,，、|｜]/).map((s) => s.trim());
}

const EMPTY_OWNER: OwnerInput = {
  name: "",
  phone: "",
  phone2: "",
  lineId: "",
  address: "",
  source: "",
  birthday: "",
  tags: "",
  note: "",
};

export function parseImportText(text: string): ParsedImportRow[] {
  const out: ParsedImportRow[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  lines.forEach((rawLine, idx) => {
    // 只去掉頭尾的空白，**開頭的 Tab 要留著**——「\t0912…」代表第一欄（姓名）是空的，
    // 整行 trim 掉會把電話擠到姓名欄、錯誤訊息從「缺姓名」變成莫名其妙的一筆。
    const raw = rawLine.replace(/^[ 　]+/, "").replace(/\s+$/, "");
    if (!raw) return;
    const cells = splitLine(raw);
    // 常見的標題列：第一格就是「姓名」之類的字就跳過（CJK 沒有 \b 可用，整格比對）
    if (/^(姓名|屋主|名字|客戶|name)$/i.test(cells[0] ?? "")) return;

    const name = cells[0] ?? "";
    let phone = cells[1] ?? "";
    let address = cells[2] ?? "";
    const community = cells[3] ?? "";
    const note = cells.slice(4).filter(Boolean).join("；");

    // 電話／地址放反了就調回來
    if (phone && address && !looksLikePhone(phone) && looksLikePhone(address)) {
      [phone, address] = [address, phone];
    }
    // 只有兩欄、第二欄是地址不是電話：當作沒電話
    if (phone && !address && !looksLikePhone(phone) && looksLikeAddress(phone)) {
      address = phone;
      phone = "";
    }

    let error: string | null = null;
    if (!name) error = "缺姓名";
    else if (name.length > 80) error = "姓名太長";
    else if (phone && !looksLikePhone(phone)) error = `電話欄看起來不是電話：${phone}`;

    out.push({
      line: idx + 1,
      raw,
      owner: { ...EMPTY_OWNER, name, phone, note },
      property: address ? { address, community, status: "other" } : null,
      error,
    });
  });

  return out;
}

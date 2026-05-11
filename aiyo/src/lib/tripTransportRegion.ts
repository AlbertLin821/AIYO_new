/**
 * Infer Google Maps `region` ccTLD for Routes / legacy Directions bias.
 */
export function inferMapsRegionCode(destination: string): string {
  const d = destination.trim().toLowerCase();
  if (!d) {
    return "tw";
  }
  if (/japan|日本|東京|tokyo|大阪|osaka|京都|kyoto|北海道|沖繩|okinawa|福岡|fukuoka|名古屋|nagoya|広島|hiroshima|jr\b/.test(d)) {
    return "jp";
  }
  if (/korea|韓國|韩国|首爾|首尔|seoul|釜山|busan|濟州|济州|jeju/.test(d)) {
    return "kr";
  }
  if (/hong kong|香港|hk\b/.test(d)) {
    return "hk";
  }
  if (/singapore|新加坡|狮城/.test(d)) {
    return "sg";
  }
  if (/china|中國|中国|北京|beijing|上海|shanghai|廣州|广州|guangzhou|深圳|shenzhen/.test(d)) {
    return "cn";
  }
  if (/thailand|泰國|泰国|曼谷|bangkok|清邁|chiang mai|phuket|普吉/.test(d)) {
    return "th";
  }
  if (/vietnam|越南|河內|河内|hanoi|胡志明|ho chi minh|岘港|danang/.test(d)) {
    return "vn";
  }
  if (/usa|u\.s\.|america|美國|美国|new york|los angeles|san francisco|las vegas|夏威夷|hawaii/.test(d)) {
    return "us";
  }
  if (/europe|歐洲|欧洲|paris|london|berlin|rome|madrid|amsterdam|瑞士|switzerland|義大利|意大利|italy|法國|法国|france|西班牙|spain|德國|德国|germany/.test(d)) {
    return "de";
  }
  if (/台灣|台湾|taiwan|台北|臺北|taichung|台中|高雄|kaohsiung|台南|tainan|花蓮|hualien|墾丁|kenting/.test(d)) {
    return "tw";
  }
  return "tw";
}

/** `labelKey` must exist on `zhTW.itineraryPanel` (profile reuses the same keys for the four standard modes). */
export type TransportOptionRow = { value: string; labelKey: string };

const STANDARD: TransportOptionRow[] = [
  { value: "Driving", labelKey: "transportDriving" },
  { value: "Transit", labelKey: "transportTransit" },
  { value: "Walking", labelKey: "transportWalking" },
  { value: "Bicycling", labelKey: "transportBicycling" },
];

/**
 * Google Maps 標準四種模式，加上依目的地關鍵字顯示的區域大眾運輸標籤（路線仍為 TRANSIT）。
 */
export function getRegionalTransitOptions(destination: string): TransportOptionRow[] {
  const d = destination.trim().toLowerCase();
  const extra: TransportOptionRow[] = [];

  if (/台灣|台湾|taiwan|台北|臺北|taichung|台中|高雄|kaohsiung|台南|tainan|花蓮|hualien|墾丁|kenting|新北|桃園|台東|屏東|嘉義|基隆|宜蘭|苗栗|彰化|雲林|南投|澎湖|金門|馬祖/.test(d)) {
    extra.push(
      { value: "Transit (MRT)", labelKey: "transportTransitMrtTw" },
      { value: "Transit (THSR)", labelKey: "transportTransitThsrTw" },
      { value: "Transit (TRA)", labelKey: "transportTransitTrainTw" },
    );
  }
  if (/japan|日本|東京|tokyo|大阪|osaka|京都|kyoto|北海道|沖繩|okinawa|福岡|fukuoka|名古屋|nagoya|広島|hiroshima|札幌|sapporo|仙台|sendai|金澤|kanazawa|jr\b|新幹線|地鐵|地下鐵/.test(d)) {
    extra.push(
      { value: "Transit (JR)", labelKey: "transportTransitJrJp" },
      { value: "Transit (Metro)", labelKey: "transportTransitMetroJp" },
    );
  }
  if (/korea|韓國|韩国|首爾|首尔|seoul|釜山|busan|濟州|济州|jeju|大邱|daegu|仁川|incheon/.test(d)) {
    extra.push({ value: "Transit (Metro KR)", labelKey: "transportTransitMetroKr" });
  }
  if (/hong kong|香港/.test(d)) {
    extra.push({ value: "Transit (MTR)", labelKey: "transportTransitMtrHk" });
  }

  return [...STANDARD, ...extra];
}

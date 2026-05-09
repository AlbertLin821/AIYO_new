export type GoogleDirectionsTravelModeKey = "DRIVING" | "WALKING" | "BICYCLING" | "TRANSIT";

/**
 * 將行程文字交通方式對應到 Google Directions 的 travelMode（與地圖導航一致：開車／步行／單車／大眾運輸）。
 */
export function resolveGoogleTravelMode(transport: string): GoogleDirectionsTravelModeKey {
  const mode = transport.trim().toLowerCase();

  if (/walk|步行|徒步|走路|歩行/.test(mode)) {
    return "WALKING";
  }
  if (/bike|bicycle|自行車|單車|腳踏車|cycling/.test(mode)) {
    return "BICYCLING";
  }
  if (
    /metro|subway|mrt|地鐵|捷運|輕軌|tram|火車|鐵路|電車|高鐵|台鐵|bus|巴士|公車|客運|transit|大眾/.test(mode)
  ) {
    return "TRANSIT";
  }

  return "DRIVING";
}

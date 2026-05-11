export type GoogleDirectionsTravelModeKey = "DRIVING" | "WALKING" | "BICYCLING" | "TRANSIT";

/**
 * 將行程文字交通方式對應到 Google Routes／Directions 的 travelMode（汽車、大眾運輸、步行、自行車）。
 * 保留舊版 UI 值（Walk、Metro、Car…）與區域標籤（Transit (JR) 等）以利相容。
 */
export function resolveGoogleTravelMode(transport: string): GoogleDirectionsTravelModeKey {
  const raw = transport.trim();
  const mode = raw.toLowerCase();

  if (!mode) {
    return "DRIVING";
  }

  if (
    /^walking$|^walk$|步行|徒步|走路|歩行/.test(mode) ||
    (mode === "walk" && !/walkable|walkway/.test(mode))
  ) {
    return "WALKING";
  }

  if (/bicycling|^bike$|bicycle|自行車|單車|腳踏車|cycling/.test(mode)) {
    return "BICYCLING";
  }

  if (
    /^transit|\(transit|大眾|地鐵|捷運|輕軌|\bmrt\b|\bmetro\b|\bsubway\b|台鐵|高鐵|thsr|\btra\b|jr\b|新幹線|在來線|巴士|公車|客運|火車|鐵路|電車|港鐵|\(mrt\)|\(thsr\)|\(tra\)|\(jr\)|\(metro|混合|\bmixed\b|\btrain\b|\bbus\b|commuter|ferry|渡輪/.test(
      mode,
    )
  ) {
    return "TRANSIT";
  }

  if (/drive|driving|汽車|開車|自駕|租車|car|taxi|計程車|uber|lyft/.test(mode)) {
    return "DRIVING";
  }

  return "DRIVING";
}

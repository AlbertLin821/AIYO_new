import { zhTW as t } from "@/locales/zh-TW";

export type TransportDisplayOption = { value: string; label: string };

export type TransportDisplayIcon =
  | "car"
  | "train"
  | "bus"
  | "walk"
  | "bike"
  | "taxi";

function normalizeTransportValue(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function transportDisplayLabel(value: string, options: TransportDisplayOption[] = []): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const option = options.find((row) => row.value === trimmed);
  if (option) {
    return option.label;
  }

  const normalized = normalizeTransportValue(trimmed);
  const labelByValue: Record<string, string> = {
    driving: t.itineraryPanel.transportDriving,
    drive: t.itineraryPanel.transportDriving,
    car: t.itineraryPanel.transportCar,
    transit: t.itineraryPanel.transportTransit,
    public_transport: t.itineraryPanel.transportTransit,
    publictransport: t.itineraryPanel.transportTransit,
    walking: t.itineraryPanel.transportWalking,
    walk: t.itineraryPanel.transportWalking,
    bicycling: t.itineraryPanel.transportBicycling,
    bicycle: t.itineraryPanel.transportBicycling,
    bike: t.itineraryPanel.transportBicycling,
    metro: t.itineraryPanel.transportMetro,
    subway: t.itineraryPanel.transportMetro,
    mrt: t.itineraryPanel.transportMetro,
    train: t.itineraryPanel.transportTrain,
    bus: t.itineraryPanel.transportBus,
    taxi: t.itineraryPanel.transportTaxi,
    mixed: t.itineraryPanel.transportMixed,
    ai_recommend: t.itineraryPanel.segmentTransport,
    ai_recommended: t.itineraryPanel.segmentTransport,
    ai_recommond: t.itineraryPanel.segmentTransport,
  };

  return labelByValue[normalized] ?? trimmed;
}

export function transportDisplayIcon(value: string): TransportDisplayIcon {
  const normalized = normalizeTransportValue(value);
  if (/walking|walk|步行|徒歩|走路/u.test(normalized)) {
    return "walk";
  }
  if (/bicycling|bicycle|bike|自行車|單車|腳踏車|cycling/u.test(normalized)) {
    return "bike";
  }
  if (/taxi|計程車/u.test(normalized)) {
    return "taxi";
  }
  if (/bus|公車/u.test(normalized)) {
    return "bus";
  }
  if (
    /transit|public_transport|metro|subway|mrt|train|jr|高鐵|台鐵|火車|rail|tram|大眾/u.test(
      normalized,
    )
  ) {
    return "train";
  }
  return "car";
}

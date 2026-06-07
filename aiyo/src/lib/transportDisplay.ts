import { zhTW as t } from "@/locales/zh-TW";

export type TransportDisplayOption = { value: string; label: string };

export function transportDisplayLabel(value: string, options: TransportDisplayOption[] = []): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const option = options.find((row) => row.value === trimmed);
  if (option) {
    return option.label;
  }

  const normalized = trimmed.toLowerCase().replace(/[\s-]+/g, "_");
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

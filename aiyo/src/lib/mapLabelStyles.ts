export type MapLabelToggleKey = "highway" | "road" | "poi" | "administrative";

export type MapLabelVisibility = Record<MapLabelToggleKey, boolean>;

export const DEFAULT_MAP_LABEL_VISIBILITY: MapLabelVisibility = {
  highway: true,
  road: true,
  poi: true,
  administrative: true,
};

type GoogleMapStyleRule = {
  featureType: string;
  elementType: string;
  stylers: Array<{ visibility: "on" | "off" }>;
};

function hideLabelRule(featureType: string): GoogleMapStyleRule {
  return {
    featureType,
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  };
}

/** Build Google Maps JSON style rules from label visibility prefs (hidden = off). */
export function buildMapLabelStyles(visibility: MapLabelVisibility): GoogleMapStyleRule[] {
  const rules: GoogleMapStyleRule[] = [];

  if (!visibility.highway) {
    rules.push(hideLabelRule("road.highway"));
    rules.push(hideLabelRule("road.highway.controlled_access"));
  }

  if (!visibility.road) {
    rules.push(hideLabelRule("road.arterial"));
    rules.push(hideLabelRule("road.local"));
  }

  if (!visibility.poi) {
    rules.push(hideLabelRule("poi"));
    rules.push(hideLabelRule("poi.business"));
    rules.push(hideLabelRule("poi.park"));
    rules.push(hideLabelRule("poi.medical"));
    rules.push(hideLabelRule("poi.school"));
    rules.push(hideLabelRule("poi.government"));
    rules.push(hideLabelRule("poi.place_of_worship"));
    rules.push(hideLabelRule("poi.sports_complex"));
  }

  if (!visibility.administrative) {
    rules.push(hideLabelRule("administrative"));
    rules.push(hideLabelRule("administrative.locality"));
    rules.push(hideLabelRule("administrative.neighborhood"));
    rules.push(hideLabelRule("administrative.land_parcel"));
  }

  return rules;
}

export function normalizeMapLabelVisibility(
  partial: Partial<MapLabelVisibility> | undefined,
): MapLabelVisibility {
  return {
    highway: partial?.highway !== false,
    road: partial?.road !== false,
    poi: partial?.poi !== false,
    administrative: partial?.administrative !== false,
  };
}

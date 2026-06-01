export function isUsableMapCoordinate(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001)
  );
}

export function hasUsableMapCoordinate(value: { lat: number; lng: number } | undefined | null): boolean {
  return Boolean(value && isUsableMapCoordinate(value.lat, value.lng));
}

export function osmSourceUrl(placeId?: string | null): string | null {
  const match = placeId?.match(/^(?:(?:photon|overpass):)?(N|W|R|node|way|relation):(\d+)$/i);
  if (!match) return null;
  const type = ({ n: "node", w: "way", r: "relation" } as Record<string, string>)[match[1].toLowerCase()] || match[1].toLowerCase();
  return `https://www.openstreetmap.org/${type}/${match[2]}`;
}

const verifiedNameAliases: Record<string, { query: string; displayName: string }> = {
  晴空塔: { query: "東京スカイツリー", displayName: "東京晴空塔" },
  東京晴空塔: { query: "東京スカイツリー", displayName: "東京晴空塔" },
};

export function localizedPlaceAlias(query: string, destination: string) {
  if (!/東京|tokyo/i.test(destination)) return null;
  return verifiedNameAliases[query.trim()] || null;
}

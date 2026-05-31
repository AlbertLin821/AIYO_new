type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const cacheStore = new Map<string, CacheEntry<unknown>>();

export function buildTravelSearchCacheKey(parts: Record<string, string | number | undefined>): string {
  return Object.entries(parts)
    .filter(([, value]) => value !== undefined && value !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("|");
}

export async function withTravelSearchCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const cached = cacheStore.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value as T;
  }
  const value = await loader();
  cacheStore.set(key, { value, expiresAt: now + Math.max(1_000, ttlMs) });
  return value;
}

export function clearTravelSearchCache(): void {
  cacheStore.clear();
}

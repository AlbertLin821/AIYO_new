type Entry<T> = { value: T; expiresAt: number };

export class MapMemoryCache {
  private readonly values = new Map<string, Entry<unknown>>();
  constructor(private readonly maxEntries = 500, private readonly now = () => Date.now()) {}

  get<T>(key: string): T | null {
    const entry = this.values.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.values.delete(key);
      return null;
    }
    this.values.delete(key);
    this.values.set(key, entry);
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.values.delete(key);
    this.values.set(key, { value, expiresAt: this.now() + Math.max(1, ttlMs) });
    while (this.values.size > this.maxEntries) {
      const oldest = this.values.keys().next().value as string | undefined;
      if (!oldest) break;
      this.values.delete(oldest);
    }
  }

  clear(): void {
    this.values.clear();
  }
}

export function normalizedMapCacheKey(operation: string, parts: Array<string | number | undefined>): string {
  return [operation, ...parts.map((part) => String(part ?? "").trim().toLowerCase())].join(":");
}

export const mapMemoryCache = new MapMemoryCache();

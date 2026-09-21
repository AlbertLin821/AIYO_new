export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number };

type Bucket = { count: number; resetsAt: number };

export class InMemoryRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
    private readonly maxBuckets = 10_000,
  ) {}

  consume(key: string): RateLimitResult {
    const currentTime = this.now();
    const current = this.buckets.get(key);
    if (!current || current.resetsAt <= currentTime) {
      this.prune(currentTime);
      this.buckets.set(key, { count: 1, resetsAt: currentTime + this.windowMs });
      return { allowed: true, remaining: Math.max(0, this.maxRequests - 1) };
    }
    if (current.count >= this.maxRequests) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((current.resetsAt - currentTime) / 1000)),
      };
    }
    current.count += 1;
    return { allowed: true, remaining: Math.max(0, this.maxRequests - current.count) };
  }

  clear(): void {
    this.buckets.clear();
  }

  private prune(currentTime: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetsAt <= currentTime) this.buckets.delete(key);
    }
    while (this.buckets.size >= this.maxBuckets) {
      const oldest = this.buckets.keys().next().value as string | undefined;
      if (!oldest) break;
      this.buckets.delete(oldest);
    }
  }
}

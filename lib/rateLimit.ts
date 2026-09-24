/**
 * In-memory fixed-window rate limiter for public endpoints.
 *
 * Limitation (documented, not hidden): this state lives in the memory of a
 * single serverless instance, so on a platform that runs multiple
 * instances the effective limit is `limit * instanceCount`, and it resets
 * on cold start. That's an acceptable MVP tradeoff — it still stops a
 * single naive script from hammering the endpoint — but production scale
 * should move this to Upstash Redis (`@upstash/ratelimit`) or the
 * platform's built-in edge rate limiting. See README "Known limitations".
 */

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now - existing.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: limit - 1, retryAfterMs: 0 };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: windowMs - (now - existing.windowStart),
    };
  }

  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, retryAfterMs: 0 };
}

/** Periodically drop stale buckets so this map doesn't grow unbounded. */
export function pruneRateLimitBuckets(maxAgeMs: number): void {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > maxAgeMs) buckets.delete(key);
  }
}

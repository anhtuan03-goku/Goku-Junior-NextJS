import "server-only";
import { ForbiddenError, RateLimitError } from "@/domain/errors/domain-errors";

interface BucketEntry {
  timestamps: number[];
}

export class SlidingWindowRateLimiter {
  private readonly buckets = new Map<string, BucketEntry>();

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {}

  consume(key: string): void {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    const entry = this.buckets.get(key) ?? { timestamps: [] };
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

    if (entry.timestamps.length >= this.maxRequests) {
      const oldest = entry.timestamps[0] ?? now;
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((oldest + this.windowMs - now) / 1000),
      );
      throw new RateLimitError(
        `Too many requests. Please try again in ${retryAfterSeconds}s.`,
        retryAfterSeconds,
      );
    }

    entry.timestamps.push(now);
    this.buckets.set(key, entry);

    // Periodic memory cleanup to avoid unbounded map growth
    if (this.buckets.size > 5000) {
      for (const [k, v] of this.buckets.entries()) {
        if (v.timestamps.every((t) => t <= cutoff)) {
          this.buckets.delete(k);
        }
      }
    }
  }
}

export const authRateLimiter = new SlidingWindowRateLimiter(12, 60_000); // 12 attempts / min / IP
export const mutationRateLimiter = new SlidingWindowRateLimiter(60, 60_000); // 60 mutations / min / user
export const uploadRateLimiter = new SlidingWindowRateLimiter(10, 60_000); // 10 uploads / min / user

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip") ?? "local";
}

export function verifyCsrfOrigin(request: Request): void {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return;
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    // Same-origin non-browser or server calls without Origin are checked via Sec-Fetch-Site if present
    const secFetchSite = request.headers.get("sec-fetch-site");
    if (secFetchSite && secFetchSite !== "same-origin" && secFetchSite !== "none") {
      throw new ForbiddenError("Request rejected by CSRF protection policy.");
    }
    return;
  }

  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const host = forwardedHost || request.headers.get("host");
  if (!host) return;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ForbiddenError("Malformed Origin header.");
  }

  if (originHost !== host) {
    throw new ForbiddenError("Cross-origin state-changing requests are not permitted.");
  }
}

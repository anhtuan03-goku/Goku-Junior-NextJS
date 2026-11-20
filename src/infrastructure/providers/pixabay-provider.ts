import "server-only";
import type {
  ExternalImageItem,
  PhotographerSummary,
} from "@/domain/entities/models";
import type {
  IImageProvider,
  ProviderFetchResult,
} from "@/domain/repositories/ports";
import { getEnv } from "../config/env";
import { UpstreamQuotaExceededError, readRetryAfter } from "./unsplash-provider";

export const PIXABAY_MIN_PER_PAGE = 3;
export const PIXABAY_MAX_PER_PAGE = 200;
export const PIXABAY_MAX_TOTAL_HITS = 500;
export const PIXABAY_RATE_LIMIT_DEFAULT = 100;
export const PIXABAY_RATE_WINDOW_SECONDS = 60;
/**
 * Pixabay API Terms mandate caching API request results for 24 hours.
 * Note: webformatURL / largeImageURL tokens also expire after 24 hours.
 */
export const PIXABAY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_MEMORY_CACHE_ENTRIES = 500;

const ALLOWED_PIXABAY_ASSET_HOSTS = new Set(["pixabay.com", "cdn.pixabay.com"]);

export function isSafePixabayAssetUrl(
  rawUrl: string | null | undefined,
): boolean {
  if (!rawUrl || typeof rawUrl !== "string") return false;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password || parsed.port) return false;
    return ALLOWED_PIXABAY_ASSET_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

function sanitizePixabayAssetUrl(
  rawUrl: string | null | undefined,
): string | null {
  if (!rawUrl || !isSafePixabayAssetUrl(rawUrl)) return null;
  try {
    return new URL(rawUrl).toString();
  } catch {
    return null;
  }
}

function sanitizePixabayPageUrl(
  rawUrl: string | null | undefined,
): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) {
      return null;
    }
    if (parsed.hostname !== "pixabay.com" && parsed.hostname !== "www.pixabay.com") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function upgradeWebformatUrl(webformatUrl: string | undefined): string | null {
  const safe = sanitizePixabayAssetUrl(webformatUrl);
  if (!safe) return null;
  // Pixabay documented resize modifier: replace _640 with _960 for higher clarity
  return safe.replace(/_640(\.[a-zA-Z0-9]+)(\?.*)?$/, "_960$1$2");
}

function formatTagsDescription(tags: string | undefined): string | null {
  if (!tags || typeof tags !== "string") return null;
  const cleaned = tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 6)
    .join(", ");
  if (!cleaned) return null;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export interface RawPixabayHit {
  id: number;
  pageURL?: string;
  type?: string;
  tags?: string;
  previewURL?: string;
  previewWidth?: number;
  previewHeight?: number;
  webformatURL?: string;
  webformatWidth?: number;
  webformatHeight?: number;
  largeImageURL?: string;
  imageWidth?: number;
  imageHeight?: number;
  views?: number;
  downloads?: number;
  likes?: number;
  comments?: number;
  user_id?: number;
  user?: string;
  userImageURL?: string;
}

interface RawPixabayResponse {
  total?: number;
  totalHits?: number;
  hits?: RawPixabayHit[];
}

interface PixabayCacheEntry<T> {
  value: T;
  expiresAt: number;
}

function parsePixabayRateHeaders(headers: Headers): {
  limit?: number;
  remaining?: number;
  resetSeconds?: number;
} {
  const limRaw = headers.get("x-ratelimit-limit");
  const remRaw = headers.get("x-ratelimit-remaining");
  const rstRaw = headers.get("x-ratelimit-reset");

  const limit = limRaw !== null ? Number.parseInt(limRaw, 10) : undefined;
  const remaining = remRaw !== null ? Number.parseInt(remRaw, 10) : undefined;
  const resetSeconds = rstRaw !== null ? Number.parseInt(rstRaw, 10) : undefined;

  return {
    limit: Number.isFinite(limit) ? limit : undefined,
    remaining: Number.isFinite(remaining) ? remaining : undefined,
    resetSeconds: Number.isFinite(resetSeconds) ? resetSeconds : undefined,
  };
}

function buildPixabayPhotographer(hit: RawPixabayHit): PhotographerSummary | null {
  const rawName = (hit.user ?? "").trim();
  const userId = hit.user_id !== undefined ? String(hit.user_id) : "";
  if (!rawName && !userId) return null;

  const cleanSlugBase = (rawName || "pixabay_creator")
    .replace(/[^a-zA-Z0-9_.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 44);
  const username = userId
    ? `${cleanSlugBase || "creator"}-${userId}`.slice(0, 64)
    : (cleanSlugBase || `creator_${hit.id}`).slice(0, 64);

  const profileUrl =
    rawName && userId
      ? `https://pixabay.com/users/${encodeURIComponent(rawName)}-${encodeURIComponent(userId)}/`
      : "https://pixabay.com/";

  return {
    username,
    name: rawName || `Pixabay Creator #${userId || hit.id}`,
    avatarUrl: sanitizePixabayAssetUrl(hit.userImageURL),
    profileUrl,
    bio: "Photographer featured on Pixabay.",
    location: null,
    portfolioUrl: sanitizePixabayPageUrl(hit.pageURL) ?? "https://pixabay.com/",
    totalPhotos: 1,
    totalLikes: Math.max(0, Number(hit.likes ?? 0)),
    totalCollections: 0,
  };
}

/**
 * Secondary Image Provider backed by Pixabay API (100 req / 60s).
 * Enforces:
 * 1. Mandatory 24-hour request result caching (PIXABAY_CACHE_TTL_MS).
 * 2. Singleflight request coalescing for concurrent identical queries.
 * 3. X-RateLimit-Limit / Remaining / Reset tracking & UpstreamQuotaExceededError on 429.
 * 4. Strict secret hygiene (API key never appears in error messages or DTOs).
 */
export class PixabayImageProvider implements IImageProvider {
  public readonly providerName = "pixabay";
  private readonly apiKey: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly pageCache = new Map<
    string,
    PixabayCacheEntry<ExternalImageItem[]>
  >();
  private readonly byIdCache = new Map<
    string,
    PixabayCacheEntry<ExternalImageItem | null>
  >();
  private readonly inFlight = new Map<string, Promise<unknown>>();

  private rateLimit = PIXABAY_RATE_LIMIT_DEFAULT;
  private rateRemaining = PIXABAY_RATE_LIMIT_DEFAULT;
  private rateResetAtMs = Date.now() + PIXABAY_RATE_WINDOW_SECONDS * 1000;

  constructor(options?: {
    apiKey?: string;
    fetchImpl?: typeof fetch;
  }) {
    if (options && "apiKey" in options) {
      this.apiKey = options.apiKey?.trim() || undefined;
    } else {
      try {
        this.apiKey = getEnv().PIXABAY_API_KEY;
      } catch {
        this.apiKey = process.env.PIXABAY_API_KEY?.trim() || undefined;
      }
    }
    this.fetchImpl = options?.fetchImpl ?? fetch;
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.length >= 10);
  }

  public getRateTelemetry(): {
    configured: boolean;
    remainingQuota: number;
    limitQuota: number;
    windowResetSeconds: number;
  } {
    const now = Date.now();
    if (now >= this.rateResetAtMs) {
      return {
        configured: this.isConfigured(),
        remainingQuota: this.rateLimit,
        limitQuota: this.rateLimit,
        windowResetSeconds: PIXABAY_RATE_WINDOW_SECONDS,
      };
    }

    return {
      configured: this.isConfigured(),
      remainingQuota: this.rateRemaining,
      limitQuota: this.rateLimit,
      windowResetSeconds: Math.max(
        1,
        Math.ceil((this.rateResetAtMs - now) / 1000),
      ),
    };
  }

  private coalesce<T>(key: string, task: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key) as Promise<T> | undefined;
    if (existing) return existing;

    const promise = task().finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, promise);
    return promise;
  }

  private setBoundedCache<T>(
    map: Map<string, PixabayCacheEntry<T>>,
    key: string,
    value: T,
  ): void {
    if (map.size >= MAX_MEMORY_CACHE_ENTRIES && !map.has(key)) {
      const oldestKey = map.keys().next().value;
      if (oldestKey !== undefined) {
        map.delete(oldestKey);
      }
    }
    map.set(key, {
      value,
      expiresAt: Date.now() + PIXABAY_CACHE_TTL_MS,
    });
  }

  private mapHit(raw: RawPixabayHit): ExternalImageItem | null {
    if (!raw || typeof raw.id !== "number") return null;

    const largeUrl = sanitizePixabayAssetUrl(raw.largeImageURL);
    const web960Url = upgradeWebformatUrl(raw.webformatURL);
    const web640Url = sanitizePixabayAssetUrl(raw.webformatURL);
    const previewUrl = sanitizePixabayAssetUrl(raw.previewURL);

    const imageUrl = largeUrl ?? web960Url ?? web640Url;
    const thumbUrl = web640Url ?? previewUrl ?? imageUrl;
    if (!imageUrl || !thumbUrl) return null;

    const width = Math.max(
      1,
      Number(raw.imageWidth || raw.webformatWidth || 1280),
    );
    const height = Math.max(
      1,
      Number(raw.imageHeight || raw.webformatHeight || 853),
    );

    return {
      provider: this.providerName,
      externalId: String(raw.id),
      imageUrl,
      thumbUrl,
      width,
      height,
      color: null,
      description: formatTagsDescription(raw.tags),
      downloadLocation: null,
      photographer: buildPixabayPhotographer(raw),
    };
  }

  private async requestPixabayApi(
    searchParams: Record<string, string>,
  ): Promise<{
    data: RawPixabayResponse;
    rateLimitRemaining?: number;
    rateLimitLimit?: number;
  }> {
    if (!this.apiKey) {
      return { data: { hits: [] } };
    }

    const now = Date.now();
    if (this.rateRemaining <= 0 && now < this.rateResetAtMs) {
      throw new UpstreamQuotaExceededError(
        "Pixabay rate window temporarily exhausted",
        0,
        new Date(this.rateResetAtMs),
      );
    }

    const u = new URL("https://pixabay.com/api/");
    u.searchParams.set("key", this.apiKey);
    for (const [k, v] of Object.entries(searchParams)) {
      u.searchParams.set(k, v);
    }

    const response = await this.fetchImpl(u.toString(), {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });

    const { limit, remaining, resetSeconds } = parsePixabayRateHeaders(
      response.headers,
    );
    if (limit !== undefined) this.rateLimit = limit;
    if (remaining !== undefined) {
      this.rateRemaining = Math.max(0, remaining);
    } else if (now >= this.rateResetAtMs) {
      this.rateRemaining = Math.max(0, this.rateLimit - 1);
    } else {
      this.rateRemaining = Math.max(0, this.rateRemaining - 1);
    }

    if (resetSeconds !== undefined) {
      this.rateResetAtMs = Date.now() + Math.max(1, resetSeconds) * 1000;
    } else if (now >= this.rateResetAtMs) {
      this.rateResetAtMs = Date.now() + PIXABAY_RATE_WINDOW_SECONDS * 1000;
    }

    if (response.status === 429) {
      this.rateRemaining = 0;
      const retryAfter = readRetryAfter(response.headers);
      const windowResetAt = resetSeconds === undefined ? 0 : this.rateResetAtMs;
      const fallbackResetAt = Date.now() + PIXABAY_RATE_WINDOW_SECONDS * 1000;
      const retryAt = new Date(Math.max(windowResetAt, retryAfter?.getTime() ?? 0) || fallbackResetAt);
      this.rateResetAtMs = retryAt.getTime();
      throw new UpstreamQuotaExceededError(
        "Pixabay API rate limit exceeded (HTTP 429)",
        0,
        retryAt,
      );
    }

    if (!response.ok) {
      // Never include request URL or API key in thrown errors!
      throw new Error(`Pixabay upstream HTTP ${response.status}`);
    }

    const data = (await response.json()) as RawPixabayResponse;
    return {
      data,
      rateLimitRemaining: this.rateRemaining,
      rateLimitLimit: this.rateLimit,
    };
  }

  async fetchPage(params: {
    page: number;
    perPage: number;
    query?: string;
  }): Promise<ProviderFetchResult> {
    if (!this.isConfigured()) {
      return { items: [] };
    }

    const requestedCount = Math.min(
      Math.max(Math.floor(params.perPage || 20), 1),
      PIXABAY_MAX_PER_PAGE,
    );
    const apiPerPage = Math.min(
      Math.max(requestedCount, PIXABAY_MIN_PER_PAGE),
      PIXABAY_MAX_PER_PAGE,
    );
    const page = Math.max(1, Math.floor(params.page || 1));
    const maxValidPage = Math.max(
      1,
      Math.floor(PIXABAY_MAX_TOTAL_HITS / apiPerPage),
    );
    if (page > maxValidPage) {
      return { items: [] };
    }

    const cleanQuery = params.query?.trim().slice(0, 100) || undefined;
    const cacheKey = `page:${page}:pp:${apiPerPage}:q:${(cleanQuery ?? "").toLowerCase()}`;

    const cached = this.pageCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        items: cached.value.slice(0, requestedCount),
        rateLimitRemaining: this.rateRemaining,
        rateLimitLimit: this.rateLimit,
      };
    }

    const res = await this.coalesce(`fetch:${cacheKey}`, async () => {
      const queryParams: Record<string, string> = {
        image_type: "photo",
        safesearch: "true",
        order: "popular",
        page: String(page),
        per_page: String(apiPerPage),
      };
      if (cleanQuery) {
        queryParams.q = cleanQuery;
      }

      const upstream = await this.requestPixabayApi(queryParams);
      const mapped = (Array.isArray(upstream.data.hits) ? upstream.data.hits : [])
        .map((h) => this.mapHit(h))
        .filter((item): item is ExternalImageItem => item !== null);

      if (mapped.length > 0) {
        this.setBoundedCache(this.pageCache, cacheKey, mapped);
        for (const item of mapped) {
          this.setBoundedCache(this.byIdCache, item.externalId, item);
        }
      }

      return {
        items: mapped,
        rateLimitRemaining: upstream.rateLimitRemaining,
        rateLimitLimit: upstream.rateLimitLimit,
      };
    });

    return {
      items: res.items.slice(0, requestedCount),
      rateLimitRemaining: res.rateLimitRemaining,
      rateLimitLimit: res.rateLimitLimit,
    };
  }

  /**
   * Retrieves a single Pixabay image by numeric ID (cached for 24 hours).
   * Used by server-side permanent archiving when downloading saved Pixabay assets.
   */
  async fetchPhotoById(externalId: string): Promise<ExternalImageItem | null> {
    const cleanId = externalId.trim();
    if (!/^[0-9]{1,20}$/.test(cleanId) || !this.isConfigured()) {
      return null;
    }

    const cached = this.byIdCache.get(cleanId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    return this.coalesce(`id:${cleanId}`, async () => {
      const upstream = await this.requestPixabayApi({ id: cleanId });
      const firstHit = Array.isArray(upstream.data.hits)
        ? upstream.data.hits[0]
        : undefined;
      const mapped = firstHit ? this.mapHit(firstHit) : null;
      this.setBoundedCache(this.byIdCache, cleanId, mapped);
      return mapped;
    });
  }
}

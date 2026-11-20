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

export const UNSPLASH_MAX_PER_PAGE = 30;

export class UpstreamQuotaExceededError extends Error {
  constructor(
    message = "Unsplash upstream rate limit reached",
    public readonly remaining = 0,
    public readonly retryAt?: Date,
  ) {
    super(message);
    this.name = "UpstreamQuotaExceededError";
  }
}

export function readRetryAfter(headers: Headers): Date | undefined {
  const value = headers.get("retry-after")?.trim();
  if (!value) return undefined;

  const now = Date.now();
  const timestamp = /^\d+$/.test(value) ? now + Number(value) * 1_000 : Date.parse(value);
  const retryAt = new Date(Math.max(now + 1_000, timestamp));
  return Number.isNaN(retryAt.getTime()) ? undefined : retryAt;
}

/**
 * Strict SSRF guard: ensures we ONLY ever send Authorization: Client-ID
 * to https://api.unsplash.com/photos/<id>/download
 */
export function isSafeUnsplashDownloadUrl(rawUrl: string | null | undefined): boolean {
  if (!rawUrl || typeof rawUrl !== "string") return false;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") return false;
    if (parsed.hostname !== "api.unsplash.com") return false;
    if (parsed.username || parsed.password || parsed.port) return false;
    return /^\/photos\/[a-zA-Z0-9_-]+\/download\/?$/.test(parsed.pathname);
  } catch {
    return false;
  }
}

interface RawUnsplashUser {
  username?: string;
  name?: string;
  bio?: string | null;
  location?: string | null;
  portfolio_url?: string | null;
  total_photos?: number;
  total_likes?: number;
  total_collections?: number;
  profile_image?: {
    small?: string;
    medium?: string;
    large?: string;
  };
  links?: {
    html?: string;
  };
}

interface RawUnsplashPhoto {
  id: string;
  width?: number;
  height?: number;
  color?: string | null;
  description?: string | null;
  alt_description?: string | null;
  urls?: {
    regular?: string;
    small?: string;
    thumb?: string;
  };
  links?: {
    download_location?: string;
  };
  user?: RawUnsplashUser;
}

function sanitizeExternalHttpUrl(rawUrl: string | undefined | null): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  try {
    const u = new URL(rawUrl);
    if ((u.protocol !== "https:" && u.protocol !== "http:") || u.username || u.password) {
      return null;
    }
    return u.toString();
  } catch {
    return null;
  }
}

function appendUtm(url: string | undefined | null, appName: string): string | null {
  const safe = sanitizeExternalHttpUrl(url);
  if (!safe) return null;
  try {
    const u = new URL(safe);
    u.searchParams.set("utm_source", appName);
    u.searchParams.set("utm_medium", "referral");
    return u.toString();
  } catch {
    return null;
  }
}

function mapPhotographer(
  raw: RawUnsplashUser | undefined,
  appName: string,
): PhotographerSummary | null {
  if (!raw?.username) return null;
  return {
    username: raw.username,
    name: raw.name || raw.username,
    avatarUrl:
      raw.profile_image?.large ??
      raw.profile_image?.medium ??
      raw.profile_image?.small ??
      null,
    profileUrl: appendUtm(raw.links?.html, appName),
    bio: raw.bio ?? null,
    location: raw.location ?? null,
    portfolioUrl: sanitizeExternalHttpUrl(raw.portfolio_url),
    totalPhotos: Number(raw.total_photos ?? 0),
    totalLikes: Number(raw.total_likes ?? 0),
    totalCollections: Number(raw.total_collections ?? 0),
  };
}

function parseRateHeaders(headers: Headers): {
  remaining?: number;
  limit?: number;
} {
  const remRaw = headers.get("x-ratelimit-remaining");
  const limRaw = headers.get("x-ratelimit-limit");
  const remaining = remRaw !== null ? Number.parseInt(remRaw, 10) : undefined;
  const limit = limRaw !== null ? Number.parseInt(limRaw, 10) : undefined;
  return {
    remaining: Number.isFinite(remaining) ? remaining : undefined,
    limit: Number.isFinite(limit) ? limit : undefined,
  };
}

export class UnsplashImageProvider implements IImageProvider {
  public readonly providerName = "unsplash";
  private readonly accessKey: string;
  private readonly appName: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options?: {
    accessKey?: string;
    appName?: string;
    fetchImpl?: typeof fetch;
  }) {
    const env = options?.accessKey ? null : getEnv();
    this.accessKey = options?.accessKey ?? env!.UNSPLASH_ACCESS_KEY;
    this.appName = options?.appName ?? env?.UNSPLASH_APP_NAME ?? "naut_frame";
    this.fetchImpl = options?.fetchImpl ?? fetch;
  }

  private getAuthHeaders(): HeadersInit {
    return {
      Authorization: `Client-ID ${this.accessKey}`,
      "Accept-Version": "v1",
    };
  }

  private async requestJson<T>(url: string): Promise<{
    data: T;
    rateLimitRemaining?: number;
    rateLimitLimit?: number;
  }> {
    const response = await this.fetchImpl(url, {
      method: "GET",
      headers: this.getAuthHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });

    const { remaining, limit } = parseRateHeaders(response.headers);

    if (
      response.status === 429 ||
      (response.status === 403 && (remaining === 0 || remaining === undefined))
    ) {
      throw new UpstreamQuotaExceededError(
        `Unsplash rate limit reached (HTTP ${response.status})`,
        0,
        readRetryAfter(response.headers),
      );
    }

    if (!response.ok) {
      throw new Error(`Unsplash upstream HTTP ${response.status}`);
    }

    const data = (await response.json()) as T;
    return {
      data,
      rateLimitRemaining: remaining,
      rateLimitLimit: limit,
    };
  }

  private mapPhoto(raw: RawUnsplashPhoto): ExternalImageItem | null {
    const imageUrl = raw.urls?.regular ?? raw.urls?.small;
    const thumbUrl = raw.urls?.small ?? raw.urls?.thumb ?? imageUrl;
    if (!raw.id || !imageUrl || !thumbUrl) return null;

    const downloadLoc = raw.links?.download_location ?? null;

    return {
      provider: this.providerName,
      externalId: raw.id,
      imageUrl,
      thumbUrl,
      width: Number(raw.width ?? 1080),
      height: Number(raw.height ?? 1350),
      color: raw.color ?? null,
      description: raw.description ?? raw.alt_description ?? null,
      downloadLocation: isSafeUnsplashDownloadUrl(downloadLoc)
        ? downloadLoc
        : null,
      photographer: mapPhotographer(raw.user, this.appName),
    };
  }

  async fetchPage(params: {
    page: number;
    perPage: number;
    query?: string;
  }): Promise<ProviderFetchResult> {
    const perPage = Math.min(
      Math.max(params.perPage, 1),
      UNSPLASH_MAX_PER_PAGE,
    );
    const page = Math.max(1, params.page);

    if (params.query) {
      const u = new URL("https://api.unsplash.com/search/photos");
      u.searchParams.set("query", params.query);
      u.searchParams.set("page", String(page));
      u.searchParams.set("per_page", String(perPage));

      const res = await this.requestJson<{ results?: RawUnsplashPhoto[] }>(
        u.toString(),
      );
      const items = (res.data.results ?? [])
        .map((p) => this.mapPhoto(p))
        .filter((x): x is ExternalImageItem => x !== null);

      return {
        items,
        rateLimitRemaining: res.rateLimitRemaining,
        rateLimitLimit: res.rateLimitLimit,
      };
    }

    const u = new URL("https://api.unsplash.com/photos");
    u.searchParams.set("page", String(page));
    u.searchParams.set("per_page", String(perPage));
    u.searchParams.set("order_by", "latest");

    const res = await this.requestJson<RawUnsplashPhoto[]>(u.toString());
    const items = (Array.isArray(res.data) ? res.data : [])
      .map((p) => this.mapPhoto(p))
      .filter((x): x is ExternalImageItem => x !== null);

    return {
      items,
      rateLimitRemaining: res.rateLimitRemaining,
      rateLimitLimit: res.rateLimitLimit,
    };
  }

  async fetchRandomBatch(perPage: number): Promise<ProviderFetchResult> {
    const count = Math.min(Math.max(perPage, 1), UNSPLASH_MAX_PER_PAGE);
    const u = new URL("https://api.unsplash.com/photos/random");
    u.searchParams.set("count", String(count));
    u.searchParams.set("content_filter", "high");

    const { data, rateLimitRemaining, rateLimitLimit } =
      await this.requestJson<RawUnsplashPhoto[]>(u.toString());
    const items = (Array.isArray(data) ? data : [])
      .map((photo) => this.mapPhoto(photo))
      .filter((photo): photo is ExternalImageItem => photo !== null);

    return { items, rateLimitRemaining, rateLimitLimit };
  }

  async fetchPhotographer(username: string) {
    const encoded = encodeURIComponent(username);
    const res = await this.requestJson<RawUnsplashUser>(
      `https://api.unsplash.com/users/${encoded}`,
    );
    const photographer = mapPhotographer(res.data, this.appName);
    if (!photographer) {
      throw new Error("Photographer not found");
    }
    return {
      photographer,
      rateLimitRemaining: res.rateLimitRemaining,
      rateLimitLimit: res.rateLimitLimit,
    };
  }

  async fetchPhotographerPhotos(
    username: string,
    perPage = UNSPLASH_MAX_PER_PAGE,
  ): Promise<ProviderFetchResult> {
    const clamped = Math.min(Math.max(perPage, 1), UNSPLASH_MAX_PER_PAGE);
    const encoded = encodeURIComponent(username);
    const u = new URL(`https://api.unsplash.com/users/${encoded}/photos`);
    u.searchParams.set("per_page", String(clamped));
    u.searchParams.set("order_by", "popular");

    const res = await this.requestJson<RawUnsplashPhoto[]>(u.toString());
    const items = (Array.isArray(res.data) ? res.data : [])
      .map((p) => this.mapPhoto(p))
      .filter((x): x is ExternalImageItem => x !== null);

    return {
      items,
      rateLimitRemaining: res.rateLimitRemaining,
      rateLimitLimit: res.rateLimitLimit,
    };
  }

  async triggerDownloadEvent(downloadLocation: string): Promise<{
    ok: boolean;
    rateLimitRemaining?: number;
  }> {
    if (!isSafeUnsplashDownloadUrl(downloadLocation)) {
      return { ok: false };
    }

    const response = await this.fetchImpl(downloadLocation, {
      method: "GET",
      headers: this.getAuthHeaders(),
      cache: "no-store",
    });

    const { remaining } = parseRateHeaders(response.headers);
    if (response.status === 429 || (response.status === 403 && remaining === 0)) {
      throw new UpstreamQuotaExceededError(
        "Quota exhausted during download trigger",
        0,
        readRetryAfter(response.headers),
      );
    }

    return {
      ok: response.ok,
      rateLimitRemaining: remaining,
    };
  }
}

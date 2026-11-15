import "server-only";
import type {
  ExternalImageItem,
  PhotographerSummary,
} from "@/domain/entities/models";
import type {
  INasaSpaceProvider,
  NasaSpaceProviderResult,
  NasaSpaceQuery,
} from "@/domain/repositories/ports";

export const NASA_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes cache
const DEFAULT_UPSTREAM_TIMEOUT_MS = 8000;
const MAX_CACHE_ENTRIES = 300;
const MAX_SAFE_DIMENSION = 20000;
const MAX_DESCRIPTION_LENGTH = 480;

export const ALLOWED_NASA_ASSET_HOSTS = [
  "images-assets.nasa.gov",
  "images.nasa.gov",
  "www.nasa.gov",
  "science.nasa.gov",
  "photojournal.jpl.nasa.gov",
] as const;

const ALLOWED_NASA_HOST_SET = new Set<string>(ALLOWED_NASA_ASSET_HOSTS);
const UNSUPPORTED_RAW_IMAGE_EXT = /\.(tif|tiff|bmp|fits)(\?.*)?$/i;

/**
 * Validates and normalizes NASA image asset URLs.
 * Upgrades legacy http:// links on *.nasa.gov hosts to https://, blocks raw TIFFs,
 * and enforces the strict NASA host allowlist.
 */
export function sanitizeNasaAssetUrl(
  rawUrl: string | null | undefined,
): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (
      parsed.protocol === "http:" &&
      parsed.hostname.endsWith(".nasa.gov")
    ) {
      parsed.protocol = "https:";
    }
    if (parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password || parsed.port) return null;
    if (!ALLOWED_NASA_HOST_SET.has(parsed.hostname)) return null;
    if (UNSUPPORTED_RAW_IMAGE_EXT.test(parsed.pathname)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function stripHtmlAndCollapseWhitespace(raw: string | undefined | null): string {
  if (!raw || typeof raw !== "string") return "";
  return raw
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateCleanly(text: string, maxLen = MAX_DESCRIPTION_LENGTH): string {
  if (text.length <= maxLen) return text;
  const sliced = text.slice(0, maxLen - 3);
  const lastSpace = sliced.lastIndexOf(" ");
  return `${(lastSpace > maxLen * 0.6 ? sliced.slice(0, lastSpace) : sliced).trim()}...`;
}

function clampDimension(value: unknown, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 1) return fallback;
  return Math.min(MAX_SAFE_DIMENSION, Math.max(1, Math.round(num)));
}

/**
 * Standard NASA credit resolution formula from NASA API documentation (Section 3):
 * credit = photo.copyright || photo.photographer || photo.center || "NASA / JPL-Caltech"
 */
export function resolveNasaImageCredit(input: {
  copyright?: string | null;
  photographer?: string | null;
  center?: string | null;
}): string {
  const copyright = stripHtmlAndCollapseWhitespace(input.copyright);
  const photographer = stripHtmlAndCollapseWhitespace(input.photographer);
  const center = stripHtmlAndCollapseWhitespace(input.center);
  return copyright || photographer || center || "NASA / JPL-Caltech";
}

function buildNasaAttribution(params: {
  credit: string;
  profileUrl: string;
}): PhotographerSummary {
  const safeName = params.credit.slice(0, 140) || "NASA / JPL-Caltech";
  const slug = safeName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);

  return {
    username: `nasa_${slug || "jpl_caltech"}`,
    name: safeName,
    avatarUrl: null,
    profileUrl: params.profileUrl,
    bio: "NASA Image and Video Library archival space imagery.",
    location: null,
    portfolioUrl: "https://images.nasa.gov/",
    totalPhotos: 0,
    totalLikes: 0,
    totalCollections: 0,
  };
}

export interface RawNasaLibraryLink {
  href?: string;
  rel?: string;
  render?: string;
  width?: number;
  height?: number;
  size?: number;
}

export interface RawNasaLibraryDataItem {
  nasa_id?: string;
  title?: string;
  description?: string;
  description_508?: string;
  photographer?: string;
  secondary_creator?: string;
  center?: string;
  date_created?: string;
  media_type?: string;
}

export interface RawNasaLibraryResponse {
  collection?: {
    items?: Array<{
      href?: string;
      data?: RawNasaLibraryDataItem[];
      links?: RawNasaLibraryLink[];
    }>;
    metadata?: {
      total_hits?: number;
    };
    links?: Array<{
      rel?: string;
      prompt?: string;
      href?: string;
    }>;
  };
}

interface CacheEntry {
  value: NasaSpaceProviderResult;
  expiresAt: number;
}

/**
 * Dedicated NASA Image and Video Library adapter (`images-api.nasa.gov/search`) for the Space tab.
 * Completely independent from Unsplash, Pixabay, Picsum, and fallback pools.
 * Never throws upstream errors to callers and never falls back to non-NASA imagery.
 */
export class NasaSpaceImageProvider implements INasaSpaceProvider {
  public readonly providerName = "nasa" as const;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<NasaSpaceProviderResult>>();

  constructor(options?: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  }) {
    this.fetchImpl = options?.fetchImpl ?? fetch;
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_UPSTREAM_TIMEOUT_MS;
  }

  private coalesce(
    key: string,
    task: () => Promise<NasaSpaceProviderResult>,
  ): Promise<NasaSpaceProviderResult> {
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const promise = task().finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, promise);
    return promise;
  }

  private setBoundedCache(
    key: string,
    value: NasaSpaceProviderResult,
    ttlMs = NASA_CACHE_TTL_MS,
  ): void {
    if (this.cache.size >= MAX_CACHE_ENTRIES && !this.cache.has(key)) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(url, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private mapLibraryItem(rawItem: {
    data?: RawNasaLibraryDataItem[];
    links?: RawNasaLibraryLink[];
  }): ExternalImageItem | null {
    const meta = Array.isArray(rawItem?.data) ? rawItem.data[0] : undefined;
    const rawId = stripHtmlAndCollapseWhitespace(meta?.nasa_id);
    if (!meta || !rawId) return null;
    if (meta.media_type && meta.media_type.toLowerCase() !== "image") {
      return null;
    }

    const validLinks = (Array.isArray(rawItem.links) ? rawItem.links : [])
      .map((lnk) => {
        const safeHref = sanitizeNasaAssetUrl(lnk.href);
        if (!safeHref) return null;
        return {
          ...lnk,
          safeHref,
        };
      })
      .filter(
        (
          lnk,
        ): lnk is RawNasaLibraryLink & {
          safeHref: string;
        } => lnk !== null,
      );

    if (validLinks.length === 0) return null;

    // Select crisp web-friendly full image (~large or ~medium or reasonably sized ~orig)
    const largeLink = validLinks.find((l) => /~large\./i.test(l.safeHref));
    const mediumLink = validLinks.find((l) => /~medium\./i.test(l.safeHref));
    const safeOrigLink = validLinks.find(
      (l) =>
        (l.rel === "canonical" || /~orig\./i.test(l.safeHref)) &&
        (l.size === undefined || l.size <= 15_000_000),
    );
    const previewLink =
      validLinks.find((l) => l.rel === "preview" || /~thumb\./i.test(l.safeHref)) ??
      validLinks.find((l) => /~small\./i.test(l.safeHref));

    const chosenFull =
      largeLink ?? mediumLink ?? safeOrigLink ?? previewLink ?? validLinks[0]!;
    const chosenThumb = mediumLink ?? previewLink ?? chosenFull;

    const dimSource =
      (chosenFull.width && chosenFull.height ? chosenFull : null) ??
      validLinks.find((l) => l.width && l.height) ??
      null;

    const width = clampDimension(dimSource?.width, 1280);
    const height = clampDimension(dimSource?.height, 960);

    const title = stripHtmlAndCollapseWhitespace(meta.title);
    const rawDesc = stripHtmlAndCollapseWhitespace(
      meta.description || meta.description_508,
    );
    const combinedDesc =
      title && rawDesc && !rawDesc.toLowerCase().startsWith(title.toLowerCase())
        ? `${title} — ${rawDesc}`
        : title || rawDesc || "NASA Space Archive Photograph";

    const credit = resolveNasaImageCredit({
      photographer: meta.photographer,
      center: meta.center,
    });

    const safeExternalId = `lib_${rawId.replace(/[^a-zA-Z0-9_.-]/g, "_")}`.slice(
      0,
      120,
    );

    return {
      provider: this.providerName,
      externalId: safeExternalId,
      imageUrl: chosenFull.safeHref,
      thumbUrl: chosenThumb.safeHref,
      width,
      height,
      color: "#090d16",
      description: truncateCleanly(combinedDesc),
      downloadLocation: null,
      photographer: buildNasaAttribution({
        credit,
        profileUrl: `https://images.nasa.gov/details/${encodeURIComponent(rawId)}`,
      }),
    };
  }

  private async fetchLibrary(
    params: NasaSpaceQuery,
  ): Promise<NasaSpaceProviderResult> {
    const effectiveQuery = params.query?.trim() || "nebula galaxy";
    const u = new URL("https://images-api.nasa.gov/search");
    u.searchParams.set("q", effectiveQuery);
    u.searchParams.set("media_type", "image");
    u.searchParams.set("page", String(params.page));
    u.searchParams.set("page_size", String(params.perPage));
    if (params.yearStart !== undefined) {
      u.searchParams.set("year_start", String(params.yearStart));
    }
    if (params.yearEnd !== undefined) {
      u.searchParams.set("year_end", String(params.yearEnd));
    }

    const response = await this.fetchWithTimeout(u.toString());
    if (!response.ok) {
      return { items: [], hasMore: false };
    }

    const payload = (await response.json()) as RawNasaLibraryResponse;
    const rawItems = Array.isArray(payload?.collection?.items)
      ? payload.collection.items
      : [];

    const mapped = rawItems
      .map((item) => this.mapLibraryItem(item))
      .filter((item): item is ExternalImageItem => item !== null);

    const totalHits = Number(payload?.collection?.metadata?.total_hits ?? 0);
    const hasNextLink = Array.isArray(payload?.collection?.links)
      ? payload.collection.links.some((l) => l.rel === "next")
      : false;
    const hasMore =
      mapped.length > 0 &&
      (hasNextLink || totalHits > params.page * params.perPage);

    return {
      items: mapped,
      hasMore,
    };
  }

  async fetchSpacePage(
    params: NasaSpaceQuery,
  ): Promise<NasaSpaceProviderResult> {
    const cacheKey = [
      `p:${params.page}`,
      `pp:${params.perPage}`,
      `q:${(params.query ?? "").toLowerCase()}`,
      `ys:${params.yearStart ?? ""}`,
      `ye:${params.yearEnd ?? ""}`,
    ].join("|");

    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    return this.coalesce(cacheKey, async () => {
      try {
        const res = await this.fetchLibrary(params);
        if (res.items.length > 0) {
          this.setBoundedCache(cacheKey, res, NASA_CACHE_TTL_MS);
        }
        return res;
      } catch {
        // Strict isolation: never fallback to other providers and never expose upstream errors
        return {
          items: [],
          hasMore: false,
        };
      }
    });
  }
}

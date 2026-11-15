import "server-only";
import type { ExternalImageItem } from "@/domain/entities/models";
import type {
  IImageProvider,
  ProviderFetchResult,
} from "@/domain/repositories/ports";

interface RawPicsumItem {
  id: string;
  author: string;
  width: number;
  height: number;
  url: string;
  download_url: string;
}

interface PicsumCacheEntry {
  items: ExternalImageItem[];
  expiresAt: number;
}

export const PICSUM_DEFAULT_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes L1 resilience cache
const MAX_PICSUM_CACHE_ENTRIES = 200;

function sanitizeHttpsUrl(rawUrl: string | undefined | null): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "https:" || u.username || u.password) {
      return null;
    }
    return u.toString();
  } catch {
    return null;
  }
}

export interface PicsumProviderOptions {
  fetchImpl?: typeof fetch;
  cacheTtlMs?: number;
}

/**
 * Tertiary curated/random image adapter implementing IImageProvider.
 * Acts as the Tier-3 ultra-resilient fallback source behind Unsplash (Primary)
 * and Pixabay (Secondary) so the feed never degrades or returns HTTP 429.
 */
export class PicsumRandomProvider implements IImageProvider {
  public readonly providerName = "picsum";
  private readonly fetchImpl: typeof fetch;
  private readonly cacheTtlMs: number;
  private readonly pageCache = new Map<string, PicsumCacheEntry>();
  private readonly inFlight = new Map<string, Promise<ProviderFetchResult>>();

  constructor(optionsOrFetch?: typeof fetch | PicsumProviderOptions) {
    if (typeof optionsOrFetch === "function") {
      this.fetchImpl = optionsOrFetch;
      this.cacheTtlMs = PICSUM_DEFAULT_CACHE_TTL_MS;
    } else {
      this.fetchImpl = optionsOrFetch?.fetchImpl ?? fetch;
      this.cacheTtlMs =
        optionsOrFetch?.cacheTtlMs ?? PICSUM_DEFAULT_CACHE_TTL_MS;
    }
  }

  async fetchPage(params: {
    page: number;
    perPage: number;
    query?: string;
  }): Promise<ProviderFetchResult> {
    const limit = Math.min(Math.max(Math.floor(params.perPage || 20), 1), 30);
    const page = Math.max(1, Math.floor(params.page || 1));
    const cleanQuery = params.query?.trim().slice(0, 100) || undefined;
    const cacheKey = `${page}:${limit}:${(cleanQuery ?? "").toLowerCase()}`;

    if (this.cacheTtlMs > 0) {
      const hit = this.pageCache.get(cacheKey);
      if (hit && hit.expiresAt > Date.now()) {
        return { items: hit.items };
      }
    }

    const active = this.inFlight.get(cacheKey);
    if (active) return active;

    const task = (async (): Promise<ProviderFetchResult> => {
      const u = new URL("https://picsum.photos/v2/list");
      u.searchParams.set("page", String(page));
      u.searchParams.set("limit", String(limit));

      let response: Response;
      try {
        response = await this.fetchImpl(u.toString(), {
          method: "GET",
          cache: "no-store",
        });
      } catch {
        return { items: [] };
      }

      if (!response.ok) {
        return { items: [] };
      }

      const rawList = (await response.json()) as RawPicsumItem[];
      const items: ExternalImageItem[] = (
        Array.isArray(rawList) ? rawList : []
      ).map((item) => {
        const slug =
          item.author
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "") || `artist_${item.id}`;
        const w = Math.max(400, Number(item.width || 1200));
        const h = Math.max(400, Number(item.height || 900));
        const scaledH = Math.round((800 / w) * h);
        const safeSourceUrl = sanitizeHttpsUrl(item.url);

        return {
          provider: this.providerName,
          externalId: String(item.id),
          imageUrl: `https://picsum.photos/id/${item.id}/1200/${Math.round((1200 / w) * h)}`,
          thumbUrl: `https://picsum.photos/id/${item.id}/800/${scaledH}`,
          width: w,
          height: h,
          color: "#e4e4e7",
          description: cleanQuery
            ? `Curated visual (${cleanQuery}) - ${item.author}`
            : `Minimalist frame by ${item.author}`,
          downloadLocation: null,
          photographer: {
            username: slug.slice(0, 64),
            name: item.author,
            avatarUrl: null,
            profileUrl: safeSourceUrl,
            bio: "Photographer featured in the Picsum Curated Archive.",
            location: null,
            portfolioUrl: safeSourceUrl,
            totalPhotos: 1,
            totalLikes: 0,
            totalCollections: 0,
          },
        };
      });

      if (items.length > 0 && this.cacheTtlMs > 0) {
        if (
          this.pageCache.size >= MAX_PICSUM_CACHE_ENTRIES &&
          !this.pageCache.has(cacheKey)
        ) {
          const firstKey = this.pageCache.keys().next().value;
          if (firstKey !== undefined) {
            this.pageCache.delete(firstKey);
          }
        }
        this.pageCache.set(cacheKey, {
          items,
          expiresAt: Date.now() + this.cacheTtlMs,
        });
      }

      return { items };
    })().finally(() => {
      this.inFlight.delete(cacheKey);
    });

    this.inFlight.set(cacheKey, task);
    return task;
  }
}

export class ImageProviderRegistry {
  private readonly providers = new Map<string, IImageProvider>();

  register(provider: IImageProvider): this {
    this.providers.set(provider.providerName, provider);
    return this;
  }

  get(name: string): IImageProvider | undefined {
    return this.providers.get(name);
  }

  listNames(): string[] {
    return Array.from(this.providers.keys());
  }
}

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

/**
 * Extensible secondary random-image adapter implementing IImageProvider.
 * Demonstrates Open/Closed Principle (OCP) for adding new image APIs
 * and serves as an ultra-resilient fallback source when primary quota is cold-exhausted.
 */
export class PicsumRandomProvider implements IImageProvider {
  public readonly providerName = "picsum";
  private readonly fetchImpl: typeof fetch;

  constructor(fetchImpl?: typeof fetch) {
    this.fetchImpl = fetchImpl ?? fetch;
  }

  async fetchPage(params: {
    page: number;
    perPage: number;
    query?: string;
  }): Promise<ProviderFetchResult> {
    const limit = Math.min(Math.max(params.perPage, 1), 30);
    const page = Math.max(1, params.page);

    const u = new URL("https://picsum.photos/v2/list");
    u.searchParams.set("page", String(page));
    u.searchParams.set("limit", String(limit));

    const response = await this.fetchImpl(u.toString(), {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      return { items: [] };
    }

    const rawList = (await response.json()) as RawPicsumItem[];
    const items: ExternalImageItem[] = (Array.isArray(rawList) ? rawList : []).map(
      (item) => {
        const slug = item.author
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "") || `artist_${item.id}`;
        const w = Math.max(400, Number(item.width || 1200));
        const h = Math.max(400, Number(item.height || 900));
        const scaledH = Math.round((800 / w) * h);

        return {
          provider: this.providerName,
          externalId: String(item.id),
          imageUrl: `https://picsum.photos/id/${item.id}/1200/${Math.round((1200 / w) * h)}`,
          thumbUrl: `https://picsum.photos/id/${item.id}/800/${scaledH}`,
          width: w,
          height: h,
          color: "#e4e4e7",
          description: params.query
            ? `Curated visual (${params.query}) — ${item.author}`
            : `Minimalist frame by ${item.author}`,
          downloadLocation: null,
          photographer: {
            username: slug,
            name: item.author,
            avatarUrl: null,
            profileUrl: item.url || null,
            bio: "Nhiếp ảnh gia từ nguồn mở rộng Picsum Curated Archive.",
            location: null,
            portfolioUrl: item.url || null,
            totalPhotos: 1,
            totalLikes: 0,
            totalCollections: 0,
          },
        };
      },
    );

    return { items };
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

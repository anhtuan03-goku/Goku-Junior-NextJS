import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SaveImageUseCase } from "@/application/use-cases/image-use-cases";
import type {
  ExternalImageItem,
  PhotographerSummary,
  QuotaHealthSummary,
  SavedImage,
} from "@/domain/entities/models";
import { ValidationError } from "@/domain/errors/domain-errors";
import type {
  IImageProvider,
  ISavedImageRepository,
} from "@/domain/repositories/ports";
import {
  PIXABAY_CACHE_TTL_MS,
  PixabayImageProvider,
} from "@/infrastructure/providers/pixabay-provider";
import {
  ImageProviderRegistry,
  PicsumRandomProvider,
} from "@/infrastructure/providers/picsum-provider";
import type {
  IQuotaPersistenceStore,
  QueuedJobRecord,
  RateStateRecord,
  StoredPhotographerRecord,
} from "@/infrastructure/providers/quota-store";
import { UpstreamQuotaExceededError } from "@/infrastructure/providers/unsplash-provider";
import { UnsplashQuotaWorker } from "@/infrastructure/providers/unsplash-quota-worker";
import { PixabayServerMediaStorage } from "@/infrastructure/storage/pixabay-media-storage";

class MemoryQuotaStore implements IQuotaPersistenceStore {
  public rate = new Map<string, RateStateRecord>();
  public images: ExternalImageItem[] = [];
  public photographers = new Map<string, StoredPhotographerRecord>();
  public jobs: Array<QueuedJobRecord & { status: string; nextRunAt: Date }> = [];

  async getRateState(provider: string) {
    return this.rate.get(provider) ?? null;
  }
  async saveRateState(state: RateStateRecord) {
    this.rate.set(state.provider, state);
  }
  async upsertCachedImages(items: ExternalImageItem[]) {
    for (const item of items) {
      const idx = this.images.findIndex(
        (x) => x.provider === item.provider && x.externalId === item.externalId,
      );
      if (idx >= 0) this.images[idx] = item;
      else this.images.push(item);
    }
  }
  async upsertPhotographers(
    list: PhotographerSummary[],
    provider: string,
    fullFetched: boolean,
  ) {
    for (const p of list) {
      this.photographers.set(p.username.toLowerCase(), {
        ...p,
        provider,
        fullFetched,
        updatedAt: new Date(),
      });
    }
  }
  async queryCachedImages(params: {
    page: number;
    perPage: number;
    provider?: string;
  }) {
    const filtered = params.provider
      ? this.images.filter((i) => i.provider === params.provider)
      : this.images;
    const start = (params.page - 1) * params.perPage;
    return filtered.slice(start, start + params.perPage);
  }
  async getCachedPhotographer(username: string) {
    return this.photographers.get(username.toLowerCase()) ?? null;
  }
  async getCachedPhotosByPhotographer(username: string, limit: number) {
    return this.images
      .filter(
        (i) =>
          i.photographer?.username.toLowerCase() === username.toLowerCase(),
      )
      .slice(0, limit);
  }
  async enqueueJob(
    jobType: "TRIGGER_DOWNLOAD" | "SYNC_PHOTOGRAPHER",
    payload: Record<string, unknown>,
    nextRunAt = new Date(),
  ) {
    this.jobs.push({
      id: `job_${this.jobs.length + 1}`,
      jobType,
      payload,
      attempts: 0,
      status: "PENDING",
      nextRunAt,
    });
  }
  async claimDueJobs(limit: number) {
    const due = this.jobs.filter((j) => j.status === "PENDING").slice(0, limit);
    for (const d of due) d.status = "PROCESSING";
    return due;
  }
  async completeJob(id: string) {
    const f = this.jobs.find((j) => j.id === id);
    if (f) f.status = "DONE";
  }
  async deferJob(id: string, nextRunAt: Date, attempts: number) {
    const f = this.jobs.find((j) => j.id === id);
    if (f) {
      f.status = "DEFERRED";
      f.nextRunAt = nextRunAt;
      f.attempts = attempts;
    }
  }
  async getHealthCounts(provider: string): Promise<QuotaHealthSummary> {
    const r = this.rate.get(provider);
    return {
      provider,
      remainingQuota: r?.remainingQuota ?? 50,
      limitQuota: r?.limitQuota ?? 50,
      windowResetAt: (r?.windowResetAt ?? new Date()).toISOString(),
      cachedImagesCount: this.images.length,
      cachedPhotographersCount: this.photographers.size,
      pendingJobsCount: this.jobs.filter((j) => j.status !== "DONE").length,
    };
  }
}

const noopSavedRepo = {
  findSavedExternalKeys: async () => new Map<string, string>(),
} as unknown as ISavedImageRepository;

// Minimal valid WebP header bytes ("RIFF....WEBP")
const VALID_WEBP_BYTES = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  0x56, 0x50, 0x38, 0x20,
]);

function makeProviderItems(
  count: number,
  provider: "unsplash" | "pixabay" | "picsum",
): ExternalImageItem[] {
  return Array.from({ length: count }, (_, idx) => ({
    provider,
    externalId: `${provider}_${idx + 1}`,
    imageUrl:
      provider === "pixabay"
        ? `https://pixabay.com/get/g_sample_${idx + 1}_1280.jpg`
        : provider === "picsum"
          ? `https://picsum.photos/id/${idx + 1}/1200/900`
          : `https://images.unsplash.com/photo-${idx + 1}`,
    thumbUrl:
      provider === "pixabay"
        ? `https://pixabay.com/get/g_sample_${idx + 1}_640.jpg`
        : provider === "picsum"
          ? `https://picsum.photos/id/${idx + 1}/800/600`
          : `https://images.unsplash.com/photo-${idx + 1}?w=400`,
    width: 1280,
    height: 853,
    color: null,
    description: `Curated ${provider} frame ${idx + 1}`,
    downloadLocation:
      provider === "unsplash"
        ? `https://api.unsplash.com/photos/u_${idx + 1}/download`
        : null,
    photographer: {
      username: `${provider}_creator_${idx + 1}`,
      name: `Creator ${idx + 1}`,
      avatarUrl: null,
      profileUrl:
        provider === "pixabay"
          ? `https://pixabay.com/users/creator-${idx + 1}/`
          : `https://unsplash.com/@creator_${idx + 1}`,
      bio: `Featured on ${provider}`,
      location: null,
      portfolioUrl:
        provider === "pixabay" ? "https://pixabay.com/" : null,
      totalPhotos: 5,
      totalLikes: 20,
      totalCollections: 0,
    },
  }));
}

describe("PixabayImageProvider (Secondary: 100 req/60s, Mandatory 24h Cache)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("clamps per_page >= 3, caches responses for 24 hours, coalesces concurrent requests, and tracks X-RateLimit headers", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));

    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const parsed = new URL(String(input));
      expect(parsed.origin + parsed.pathname).toBe("https://pixabay.com/api/");
      expect(parsed.searchParams.get("image_type")).toBe("photo");
      expect(parsed.searchParams.get("safesearch")).toBe("true");
      // Caller requested perPage=1, Pixabay provider must clamp per_page to >= 3!
      expect(parsed.searchParams.get("per_page")).toBe("3");

      return new Response(
        JSON.stringify({
          total: 500,
          totalHits: 500,
          hits: [1, 2, 3].map((id) => ({
            id,
            pageURL: `https://pixabay.com/photos/rose-${id}/`,
            type: "photo",
            tags: "red rose, flower, botanical",
            previewURL: `https://cdn.pixabay.com/photo/rose_${id}_150.jpg`,
            webformatURL: `https://pixabay.com/get/g_rose_${id}_640.jpg`,
            largeImageURL: `https://pixabay.com/get/g_rose_${id}_1280.jpg`,
            imageWidth: 2400,
            imageHeight: 1600,
            likes: 88,
            user: "Botanical_Artist",
            user_id: 778899,
            userImageURL: "https://cdn.pixabay.com/user/avatar_250x250.jpg",
          })),
        }),
        {
          status: 200,
          headers: {
            "X-RateLimit-Limit": "100",
            "X-RateLimit-Remaining": "94",
            "X-RateLimit-Reset": "52",
          },
        },
      );
    });

    const provider = new PixabayImageProvider({
      apiKey: "unit_test_secret_pixabay_key_999",
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });

    // Fire 8 concurrent requests with perPage=1 -> Singleflight executes 1 upstream call
    const concurrentResults = await Promise.all(
      Array.from({ length: 8 }, () =>
        provider.fetchPage({ page: 1, perPage: 1, query: "red roses" }),
      ),
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    for (const r of concurrentResults) {
      expect(r.items).toHaveLength(1);
      expect(r.items[0]?.provider).toBe("pixabay");
      expect(r.items[0]?.photographer?.username).toBe(
        "Botanical_Artist-778899",
      );
      expect(r.items[0]?.photographer?.profileUrl).toBe(
        "https://pixabay.com/users/Botanical_Artist-778899/",
      );
      expect(r.items[0]?.photographer?.portfolioUrl).toBe(
        "https://pixabay.com/photos/rose-1/",
      );
    }

    const telemetry = provider.getRateTelemetry();
    expect(telemetry.remainingQuota).toBe(94);
    expect(telemetry.limitQuota).toBe(100);
    expect(telemetry.windowResetSeconds).toBeLessThanOrEqual(52);

    // Advance 23 hours -> STILL served from mandatory 24h cache (0 extra upstream calls!)
    vi.advanceTimersByTime(23 * 60 * 60 * 1000);
    const cachedHit = await provider.fetchPage({
      page: 1,
      perPage: 1,
      query: "red roses",
    });
    expect(cachedHit.items).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Advance past 24 hours -> cache expires and refreshes cleanly
    vi.advanceTimersByTime(2 * 60 * 60 * 1000);
    await provider.fetchPage({ page: 1, perPage: 1, query: "red roses" });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("throws UpstreamQuotaExceededError on 429 and never leaks API key in error messages", async () => {
    const secretKey = "top_secret_pixabay_api_key_do_not_leak";
    const provider429 = new PixabayImageProvider({
      apiKey: secretKey,
      fetchImpl: (async () =>
        new Response("API rate limit exceeded", {
          status: 429,
          headers: {
            "X-RateLimit-Limit": "100",
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": "45",
          },
        })) as unknown as typeof fetch,
    });

    await expect(
      provider429.fetchPage({ page: 1, perPage: 20 }),
    ).rejects.toThrow(UpstreamQuotaExceededError);

    const provider500 = new PixabayImageProvider({
      apiKey: secretKey,
      fetchImpl: (async () =>
        new Response("Internal Server Error", {
          status: 500,
        })) as unknown as typeof fetch,
    });

    try {
      await provider500.fetchPage({ page: 1, perPage: 20 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).not.toContain(secretKey);
    }

    expect(PIXABAY_CACHE_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe("PixabayServerMediaStorage (Hotlinking Policy & SSRF/XSS Guards)", () => {
  it("downloads, magic-byte-verifies, and persists saved Pixabay frames locally while blocking traversal, SSRF, and disguised SVG", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pixabay-media-"));
    try {
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("pixabay.com/api/")) {
          return new Response(
            JSON.stringify({
              hits: [
                {
                  id: 556677,
                  webformatURL: "https://pixabay.com/get/g556677_640.webp",
                  largeImageURL: "https://pixabay.com/get/g556677_1280.webp",
                  user: "Studio_Pix",
                  user_id: 101,
                },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response(VALID_WEBP_BYTES, {
          status: 200,
          headers: { "content-type": "image/webp" },
        });
      });

      const storage = new PixabayServerMediaStorage({
        storageDir: tmpDir,
        fetchImpl: fetchMock as unknown as typeof fetch,
      });

      // Path traversal attempt is rejected
      await expect(
        storage.archiveSavedPair({
          externalId: "../etc/passwd",
          imageUrl: "https://pixabay.com/get/g_1280.webp",
          thumbUrl: "https://pixabay.com/get/g_640.webp",
        }),
      ).rejects.toThrow(ValidationError);

      // SSRF untrusted host attempt is rejected
      await expect(
        storage.archiveSavedPair({
          externalId: "12345",
          imageUrl: "https://169.254.169.254/latest/meta-data",
          thumbUrl: "https://pixabay.com/get/g_640.webp",
        }),
      ).rejects.toThrow(ValidationError);

      // Valid Pixabay image archives cleanly to permanent local /api/media/pixabay/<id> URLs
      const archived = await storage.archiveSavedPair({
        externalId: "998877",
        imageUrl: "https://pixabay.com/get/g998877_1280.webp",
        thumbUrl: "https://pixabay.com/get/g998877_640.webp",
      });
      expect(archived).toEqual({
        imageUrl: "/api/media/pixabay/998877?variant=full",
        thumbUrl: "/api/media/pixabay/998877?variant=thumb",
      });

      const readBack = await storage.readOrHydrateMedia({
        externalId: "998877",
        variant: "full",
      });
      expect(readBack?.mimeType).toBe("image/webp");
      expect(readBack?.buffer.byteLength).toBe(VALID_WEBP_BYTES.byteLength);

      // Cold disk cache self-heals via PixabayImageProvider.fetchPhotoById
      const pixabayProvider = new PixabayImageProvider({
        apiKey: "dummy_pixabay_key_12345",
        fetchImpl: fetchMock as unknown as typeof fetch,
      });
      const hydrated = await storage.readOrHydrateMedia({
        externalId: "556677",
        variant: "full",
        pixabayProvider,
      });
      expect(hydrated?.mimeType).toBe("image/webp");

      // Disguised SVG payload is blocked by magic-byte verification
      const svgStorage = new PixabayServerMediaStorage({
        storageDir: tmpDir,
        fetchImpl: (async () =>
          new Response("<svg onload=alert(1)></svg>", {
            status: 200,
          })) as unknown as typeof fetch,
      });
      await expect(
        svgStorage.archiveSavedPair({
          externalId: "443322",
          imageUrl: "https://pixabay.com/get/evil.svg",
          thumbUrl: "https://pixabay.com/get/evil_thumb.svg",
        }),
      ).rejects.toThrow(ValidationError);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("3-Tier Orchestration: Unsplash (Primary) -> Pixabay (Secondary) -> Picsum (Tertiary)", () => {
  it("cascades Unsplash -> DB Pool -> Pixabay (Secondary) -> Picsum (Tertiary) with zero 429 errors", async () => {
    const unsplash: IImageProvider = {
      providerName: "unsplash",
      fetchPage: vi.fn(async () => {
        throw new UpstreamQuotaExceededError("Unsplash 429", 0);
      }),
    };
    const pixabaySpy = vi.fn(async () => ({
      items: makeProviderItems(12, "pixabay"), // Partial 12 items from Secondary
      rateLimitRemaining: 98,
      rateLimitLimit: 100,
    }));
    const pixabay: IImageProvider = {
      providerName: "pixabay",
      fetchPage: pixabaySpy,
    };
    const picsumSpy = vi.fn(async ({ perPage }: { perPage: number }) => ({
      items: makeProviderItems(perPage, "picsum"),
    }));
    const picsum: IImageProvider = {
      providerName: "picsum",
      fetchPage: picsumSpy,
    };

    const store = new MemoryQuotaStore();
    await store.upsertCachedImages(makeProviderItems(8, "unsplash")); // 8 cached Unsplash items

    const registry = new ImageProviderRegistry()
      .register(unsplash)
      .register(pixabay)
      .register(picsum);

    const worker = new UnsplashQuotaWorker(
      unsplash,
      registry,
      store,
      noopSavedRepo,
      true, // ENABLE_SECONDARY_PROVIDER (Pixabay)
      true, // ENABLE_TERTIARY_PROVIDER (Picsum)
    );

    const feed = await worker.getInfiniteFeed({ page: 1 });
    // 8 from Unsplash DB Pool + 12 from Secondary (Pixabay) + 10 from Tertiary (Picsum) = 30!
    expect(feed.items).toHaveLength(30);
    expect(feed.source).toBe("hybrid_fallback");
    expect(
      feed.items.filter((i) => i.provider === "unsplash"),
    ).toHaveLength(8);
    expect(
      feed.items.filter((i) => i.provider === "pixabay"),
    ).toHaveLength(12);
    expect(
      feed.items.filter((i) => i.provider === "picsum"),
    ).toHaveLength(10);

    // Cached Pixabay photographer resolves with 0 Unsplash API calls!
    const pixPhotog = await worker.getPhotographerDetail({
      username: "pixabay_creator_1",
    });
    expect(pixPhotog.provider).toBe("pixabay");
    expect(pixPhotog.photos.length).toBeGreaterThanOrEqual(1);
  });

  it("falls through to Tertiary (Picsum) when Secondary (Pixabay) is disabled or hits 429", async () => {
    const unsplash: IImageProvider = {
      providerName: "unsplash",
      fetchPage: vi.fn(async () => {
        throw new UpstreamQuotaExceededError("Unsplash 429", 0);
      }),
    };
    const pixabay429: IImageProvider = {
      providerName: "pixabay",
      fetchPage: vi.fn(async () => {
        throw new UpstreamQuotaExceededError("Pixabay 429", 0);
      }),
    };
    const picsumFetch = vi.fn(async () => {
      return new Response(
        JSON.stringify(
          Array.from({ length: 30 }, (_, i) => ({
            id: String(i + 10),
            author: `Picsum Artist ${i + 1}`,
            width: 1600,
            height: 1200,
            url: "https://unsplash.com/",
            download_url: `https://picsum.photos/id/${i + 10}/1600/1200`,
          })),
        ),
        { status: 200 },
      );
    });
    const picsum = new PicsumRandomProvider(
      picsumFetch as unknown as typeof fetch,
    );

    const store = new MemoryQuotaStore();
    const registry = new ImageProviderRegistry()
      .register(unsplash)
      .register(pixabay429)
      .register(picsum);

    // Case A: Secondary enabled but returns 429 -> Tertiary Picsum seamlessly serves all 30 items
    const workerWhenSec429 = new UnsplashQuotaWorker(
      unsplash,
      registry,
      store,
      noopSavedRepo,
      true,
      true,
    );
    const resA = await workerWhenSec429.getInfiniteFeed({ page: 1 });
    expect(resA.items).toHaveLength(30);
    expect(resA.items.every((i) => i.provider === "picsum")).toBe(true);

    // Case B: ENABLE_SECONDARY_PROVIDER=false -> Pixabay not called, Tertiary Picsum serves from L1 cache
    const pixabayNeverCalledSpy = vi.fn(async () => ({ items: [] }));
    const registryB = new ImageProviderRegistry()
      .register(unsplash)
      .register({ providerName: "pixabay", fetchPage: pixabayNeverCalledSpy })
      .register(picsum);

    const workerSecDisabled = new UnsplashQuotaWorker(
      unsplash,
      registryB,
      new MemoryQuotaStore(),
      noopSavedRepo,
      false, // ENABLE_SECONDARY_PROVIDER="false"
      true, // ENABLE_TERTIARY_PROVIDER="true"
    );
    const resB = await workerSecDisabled.getInfiniteFeed({ page: 1 });
    expect(pixabayNeverCalledSpy).not.toHaveBeenCalled();
    expect(resB.items).toHaveLength(30);
    expect(picsumFetch).toHaveBeenCalledTimes(1); // Reused Picsum L1 cache!
  });

  it("archives saved Pixabay frames to local permanent URLs via SaveImageUseCase without permanent hotlinking", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "save-pixabay-"));
    try {
      const storage = new PixabayServerMediaStorage({
        storageDir: tmpDir,
        fetchImpl: (async () =>
          new Response(VALID_WEBP_BYTES, { status: 200 })) as unknown as typeof fetch,
      });

      const savedList: SavedImage[] = [];
      const savedRepo = {
        async findByUserAndExternal() {
          return null;
        },
        async create(input: Omit<SavedImage, "id" | "createdAt">) {
          const rec: SavedImage = {
            ...input,
            id: "saved_pix_1",
            createdAt: new Date(),
          };
          savedList.push(rec);
          return rec;
        },
        async findSavedExternalKeys() {
          return new Map<string, string>();
        },
      } as unknown as ISavedImageRepository;

      const primary: IImageProvider = {
        providerName: "unsplash",
        fetchPage: async () => ({ items: [] }),
      };
      const store = new MemoryQuotaStore();
      const worker = new UnsplashQuotaWorker(
        primary,
        new ImageProviderRegistry().register(primary),
        store,
        savedRepo,
        true,
        true,
        { pixabayMediaStorage: storage },
      );

      const saveUseCase = new SaveImageUseCase(savedRepo, worker);
      const { savedImage } = await saveUseCase.execute({
        userId: "user_1",
        provider: "pixabay",
        externalId: "10544685",
        imageUrl: "https://pixabay.com/get/g10544685_1280.jpg",
        thumbUrl: "https://pixabay.com/get/g10544685_640.jpg",
        width: 2741,
        height: 4111,
        photographerUsername: "Monikas_Wunderwelt-9556472",
        photographerName: "Monikas_Wunderwelt",
      });

      expect(savedImage.imageUrl).toBe(
        "/api/media/pixabay/10544685?variant=full",
      );
      expect(savedImage.thumbUrl).toBe(
        "/api/media/pixabay/10544685?variant=thumb",
      );
      expect(store.jobs).toHaveLength(0);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});

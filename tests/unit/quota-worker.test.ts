import { describe, expect, it, vi } from "vitest";
import type {
  ExternalImageItem,
  PhotographerSummary,
  QuotaHealthSummary,
} from "@/domain/entities/models";
import type {
  IImageProvider,
  ISavedImageRepository,
} from "@/domain/repositories/ports";
import { ImageProviderRegistry } from "@/infrastructure/providers/picsum-provider";
import type {
  IQuotaPersistenceStore,
  QueuedJobRecord,
  RateStateRecord,
  StoredPhotographerRecord,
} from "@/infrastructure/providers/quota-store";
import {
  UNSPLASH_MAX_PER_PAGE,
  UpstreamQuotaExceededError,
  isSafeUnsplashDownloadUrl,
} from "@/infrastructure/providers/unsplash-provider";
import { UnsplashQuotaWorker } from "@/infrastructure/providers/unsplash-quota-worker";

class InMemoryQuotaStore implements IQuotaPersistenceStore {
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
    excludeExternalIds?: string[];
  }) {
    const start = (params.page - 1) * params.perPage;
    return this.images.filter((item) =>
      (!params.provider || item.provider === params.provider) &&
      !params.excludeExternalIds?.includes(item.externalId),
    ).slice(start, start + params.perPage);
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
    const now = new Date();
    const due = this.jobs
      .filter((j) => j.status === "PENDING" && j.nextRunAt <= now)
      .slice(0, limit);
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

function makeFakeBatch(count: number, provider = "unsplash"): ExternalImageItem[] {
  return Array.from({ length: count }, (_, idx) => ({
    provider,
    externalId: `photo_${idx + 1}`,
    imageUrl: `https://images.unsplash.com/photo-${idx + 1}`,
    thumbUrl: `https://images.unsplash.com/photo-${idx + 1}?w=400`,
    width: 1200,
    height: 1500,
    color: "#cccccc",
    description: `Minimalist frame ${idx + 1}`,
    downloadLocation: `https://api.unsplash.com/photos/photo_${idx + 1}/download`,
    photographer: {
      username: "haruto_minimal",
      name: "Haruto Minimal",
      avatarUrl: null,
      profileUrl: "https://unsplash.com/@haruto_minimal",
      bio: "Tokyo architectural minimalist photographer",
      location: "Tokyo",
      portfolioUrl: null,
      totalPhotos: 42,
      totalLikes: 128,
      totalCollections: 4,
    },
  }));
}

function makeDiverseBatch(count: number, provider: string): ExternalImageItem[] {
  return makeFakeBatch(count, provider).map((item, index) => ({
    ...item,
    photographer: {
      ...item.photographer!,
      username: `${provider}-author-${index}`,
      name: `${provider} Author ${index}`,
    },
  }));
}

describe("UnsplashQuotaWorker (50 req/hr, 30 photos/req, Zero-429)", () => {
  it("fills Explore from Unsplash first even when its photos have the same photographer", async () => {
    const store = new InMemoryQuotaStore();
    const primary: IImageProvider = {
      providerName: "unsplash",
      fetchPage: vi.fn(),
      fetchRandomBatch: vi.fn(async () => ({ items: makeFakeBatch(30) })),
    };
    const pixabay: IImageProvider = {
      providerName: "pixabay",
      fetchPage: vi.fn(async () => ({ items: makeDiverseBatch(30, "pixabay") })),
    };
    const picsum: IImageProvider = {
      providerName: "picsum",
      fetchPage: vi.fn(async () => ({ items: makeDiverseBatch(30, "picsum") })),
    };
    const registry = new ImageProviderRegistry().register(primary).register(pixabay).register(picsum);
    const worker = new UnsplashQuotaWorker(primary, registry, store, noopSavedRepo);

    const feed = await worker.getInfiniteFeed({ page: 1, seed: 42 });
    expect(feed.items).toHaveLength(30);
    expect(new Set(feed.items.map((item) => item.provider))).toEqual(new Set(["unsplash"]));
    expect(primary.fetchRandomBatch).toHaveBeenCalledOnce();
    expect(primary.fetchRandomBatch).toHaveBeenCalledWith(30);
    expect(primary.fetchPage).not.toHaveBeenCalled();
    expect(pixabay.fetchPage).not.toHaveBeenCalled();
    expect(picsum.fetchPage).not.toHaveBeenCalled();
  });

  it("filters seen photos and cross-provider originals before sampling photographers in provider order", async () => {
    const store = new InMemoryQuotaStore();
    const originalId = "gkT4FfgHO5o";
    const recentId = "Ven2CV8IJ5A";
    const unsplashItems = makeFakeBatch(4);
    unsplashItems[0]!.externalId = originalId;
    unsplashItems[1]!.externalId = recentId;
    unsplashItems[2]!.photographer = makeDiverseBatch(1, "unsplash")[0]!.photographer;
    const primary: IImageProvider = {
      providerName: "unsplash",
      fetchPage: vi.fn(),
      fetchRandomBatch: vi.fn(async () => ({ items: unsplashItems })),
    };
    const pixabay: IImageProvider = {
      providerName: "pixabay",
      fetchPage: vi.fn(async () => ({ items: makeFakeBatch(3, "pixabay") })),
    };
    const picsumItems = makeFakeBatch(3, "picsum");
    picsumItems[0]!.photographer!.portfolioUrl = `https://unsplash.com/photos/old-photo-${originalId}?utm_source=picsum`;
    picsumItems[1]!.photographer!.portfolioUrl = `https://unsplash.com/photos/${recentId}`;
    const picsum: IImageProvider = {
      providerName: "picsum",
      fetchPage: vi.fn(async () => ({ items: picsumItems })),
    };
    const registry = new ImageProviderRegistry().register(primary).register(pixabay).register(picsum);
    const worker = new UnsplashQuotaWorker(primary, registry, store, noopSavedRepo);

    const feed = await worker.getInfiniteFeed({
      page: 50,
      seed: 0,
      seenKeys: [`unsplash:${originalId}`, "pixabay:photo_1"],
    });

    expect(feed.items.map((item) => item.provider)).toEqual([
      "unsplash", "unsplash", "unsplash", "pixabay", "pixabay", "picsum",
    ]);
    expect(new Set(feed.items.slice(0, 2).map((item) => item.photographer?.name)).size).toBe(2);
    expect(feed.items.map((item) => `${item.provider}:${item.externalId}`)).not.toContain(`unsplash:${originalId}`);
    expect(feed.items.find((item) => item.provider === "picsum")?.externalId).toBe("photo_3");
    expect(picsum.fetchPage).toHaveBeenCalledWith(expect.objectContaining({ page: 10, perPage: 100 }));
    expect(feed.hasMore).toBe(true);
  });

  it("falls back on 429 and retries the higher providers when their persisted windows expire", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-04-03T12:10:00Z"));
      const store = new InMemoryQuotaStore();
      const primary: IImageProvider = {
        providerName: "unsplash",
        fetchPage: vi.fn(),
        fetchRandomBatch: vi.fn(async () => ({ items: makeFakeBatch(30) }))
          .mockRejectedValueOnce(new UpstreamQuotaExceededError("429", 0, new Date(Date.now() + 30_000))),
      };
      const pixabay: IImageProvider = {
        providerName: "pixabay",
        fetchPage: vi.fn(async () => ({ items: makeFakeBatch(30, "pixabay") }))
          .mockRejectedValueOnce(new UpstreamQuotaExceededError("429", 0, new Date(Date.now() + 10_000))),
      };
      const picsum: IImageProvider = {
        providerName: "picsum",
        fetchPage: vi.fn(async () => ({ items: makeFakeBatch(30, "picsum") })),
      };
      const registry = new ImageProviderRegistry().register(primary).register(pixabay).register(picsum);
      const createWorker = () => new UnsplashQuotaWorker(primary, registry, store, noopSavedRepo);
      const first = await createWorker().getInfiniteFeed({ page: 1, seed: 0 });
      expect(first.items[0]?.provider).toBe("picsum");

      vi.advanceTimersByTime(5_000);
      const anotherWorker = createWorker();
      const blocked = await anotherWorker.getInfiniteFeed({ page: 2, seed: 0 });
      expect(blocked.items[0]?.provider).toBe("picsum");
      expect(primary.fetchRandomBatch).toHaveBeenCalledTimes(1);
      expect(pixabay.fetchPage).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(5_000);
      const secondaryRecovered = await anotherWorker.getInfiniteFeed({ page: 3, seed: 0 });
      expect(secondaryRecovered.items[0]?.provider).toBe("pixabay");
      expect(primary.fetchRandomBatch).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(20_000);
      const primaryRecovered = await anotherWorker.getInfiniteFeed({ page: 4, seed: 0 });
      expect(primaryRecovered.items[0]?.provider).toBe("unsplash");
      expect(primary.fetchRandomBatch).toHaveBeenCalledTimes(2);
      expect(pixabay.fetchPage).toHaveBeenCalledTimes(2);
      expect(picsum.fetchPage).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses another provider when Explore reaches Unsplash’s reserve even with a full Unsplash pool", async () => {
    const store = new InMemoryQuotaStore();
    store.images = makeFakeBatch(30);
    await store.saveRateState({
      provider: "unsplash",
      remainingQuota: 8,
      limitQuota: 50,
      windowResetAt: new Date(Date.now() + 60_000),
    });
    const primary: IImageProvider = {
      providerName: "unsplash",
      fetchPage: vi.fn(),
      fetchRandomBatch: vi.fn(),
    };
    const pixabay: IImageProvider = {
      providerName: "pixabay",
      fetchPage: vi.fn(async () => ({ items: [] })),
    };
    const picsum: IImageProvider = {
      providerName: "picsum",
      fetchPage: vi.fn(async () => ({ items: makeDiverseBatch(30, "picsum") })),
    };
    const registry = new ImageProviderRegistry().register(primary).register(pixabay).register(picsum);
    const worker = new UnsplashQuotaWorker(primary, registry, store, noopSavedRepo);

    const feed = await worker.getInfiniteFeed({ page: 1, seed: 0 });

    expect(primary.fetchRandomBatch).not.toHaveBeenCalled();
    expect(feed.items).toHaveLength(30);
    expect(new Set(feed.items.map((item) => item.provider))).toEqual(new Set(["picsum"]));
  });

  it("coalesces 15 concurrent requests into 1 single upstream call with perPage=30 and hydrates photographers", async () => {
    const fetchPageSpy = vi.fn(async (params: { perPage: number }) => {
      await new Promise((r) => setTimeout(r, 25));
      expect(params.perPage).toBe(UNSPLASH_MAX_PER_PAGE);
      return {
        items: makeFakeBatch(30),
        rateLimitRemaining: 49,
        rateLimitLimit: 50,
      };
    });

    const primary: IImageProvider = {
      providerName: "unsplash",
      fetchPage: fetchPageSpy,
    };

    const store = new InMemoryQuotaStore();
    const registry = new ImageProviderRegistry().register(primary);
    const worker = new UnsplashQuotaWorker(
      primary,
      registry,
      store,
      noopSavedRepo,
    );

    const results = await Promise.all(
      Array.from({ length: 15 }, () => worker.getInfiniteFeed({ page: 1 })),
    );

    expect(fetchPageSpy).toHaveBeenCalledTimes(1);
    for (const res of results) {
      expect(res.items).toHaveLength(30);
    }
    // Photographer opportunistically hydrated with 0 extra requests!
    const hydrated = await store.getCachedPhotographer("haruto_minimal");
    expect(hydrated?.name).toBe("Haruto Minimal");
  });

  it("never throws 429 when quota is 0 or upstream returns 429; serves smoothly from cache pool & fallback", async () => {
    const primary: IImageProvider = {
      providerName: "unsplash",
      fetchPage: vi.fn(async () => {
        throw new UpstreamQuotaExceededError("429 Too Many Requests", 0);
      }),
    };
    const secondary: IImageProvider = {
      providerName: "picsum",
      fetchPage: vi.fn(async ({ perPage }) => ({
        items: makeFakeBatch(perPage, "picsum"),
      })),
    };

    const store = new InMemoryQuotaStore();
    await store.upsertCachedImages(makeFakeBatch(10, "unsplash"));
    await store.upsertPhotographers(
      [makeFakeBatch(1)[0]!.photographer!],
      "unsplash",
      false,
    );

    const registry = new ImageProviderRegistry()
      .register(primary)
      .register(secondary);
    const worker = new UnsplashQuotaWorker(
      primary,
      registry,
      store,
      noopSavedRepo,
      true,
    );

    const feed = await worker.getInfiniteFeed({ page: 1 });
    expect(feed.items.length).toBe(30);
    expect(feed.source).toBe("hybrid_fallback");

    // Photographer detail STILL resolves cleanly at 0 remaining quota!
    const photog = await worker.getPhotographerDetail({
      username: "haruto_minimal",
    });
    expect(photog.username).toBe("haruto_minimal");
    expect(photog.isFallbackCache).toBe(true);
    expect(photog.photos.length).toBe(10);
  });

  it("strictly blocks SSRF URLs on download_location and only queues valid api.unsplash.com download URLs", async () => {
    expect(
      isSafeUnsplashDownloadUrl("https://api.unsplash.com/photos/abc_123/download?ixid=xyz"),
    ).toBe(true);
    expect(
      isSafeUnsplashDownloadUrl("https://evil.attacker.com/photos/abc_123/download"),
    ).toBe(false);
    expect(
      isSafeUnsplashDownloadUrl("http://api.unsplash.com/photos/abc_123/download"),
    ).toBe(false);
    expect(
      isSafeUnsplashDownloadUrl("http://169.254.169.254/latest/meta-data/"),
    ).toBe(false);
    expect(
      isSafeUnsplashDownloadUrl("https://api.unsplash.com:8443/photos/abc/download"),
    ).toBe(false);

    const store = new InMemoryQuotaStore();
    await store.saveRateState({
      provider: "unsplash",
      remainingQuota: 3, // Low quota -> deferred instead of dropped!
      limitQuota: 50,
      windowResetAt: new Date(Date.now() + 1800_000),
    });

    const primary: IImageProvider = {
      providerName: "unsplash",
      fetchPage: async () => ({ items: [] }),
      triggerDownloadEvent: vi.fn(async () => ({ ok: true })),
    };

    const worker = new UnsplashQuotaWorker(
      primary,
      new ImageProviderRegistry().register(primary),
      store,
      noopSavedRepo,
    );

    // Malicious SSRF URL must not even enter queue
    await worker.enqueueDownloadTrigger({
      provider: "unsplash",
      externalId: "x1",
      downloadLocation: "https://attacker.evil/steal-key",
    });
    expect(store.jobs).toHaveLength(0);

    // Valid URL enters queue safely and waits because remainingQuota (3) <= reserve (12)
    await worker.enqueueDownloadTrigger({
      provider: "unsplash",
      externalId: "x2",
      downloadLocation: "https://api.unsplash.com/photos/x2/download",
    });
    expect(store.jobs).toHaveLength(1);
    expect(primary.triggerDownloadEvent).not.toHaveBeenCalled();
  });
});

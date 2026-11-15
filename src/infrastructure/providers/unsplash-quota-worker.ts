import "server-only";
import type {
  ExternalImageItem,
  PhotographerDetail,
  PhotographerSummary,
  QuotaHealthSummary,
} from "@/domain/entities/models";
import { NotFoundError } from "@/domain/errors/domain-errors";
import type {
  FeedResponseDTO,
  IImageFeedOrchestrator,
  IImageProvider,
  ISavedImageRepository,
} from "@/domain/repositories/ports";
import type { PixabayServerMediaStorage } from "../storage/pixabay-media-storage";
import {
  PIXABAY_CACHE_TTL_MS,
  PixabayImageProvider,
} from "./pixabay-provider";
import type { ImageProviderRegistry } from "./picsum-provider";
import type { IQuotaPersistenceStore } from "./quota-store";
import {
  UNSPLASH_MAX_PER_PAGE,
  UpstreamQuotaExceededError,
  isSafeUnsplashDownloadUrl,
} from "./unsplash-provider";

const HOURLY_LIMIT = 50;
const FEED_RESERVE_THRESHOLD = 8; // Keep last 8 req/hr reserved for Photographer detail lookups
const DOWNLOAD_RESERVE_THRESHOLD = 12; // Drain deferred download triggers comfortably when > 12 req remain
const FEED_PAGE_CACHE_TTL_MS = 10 * 60 * 1000; // Reuse exact feed page for 10 mins across all users (0 extra API cost!)
const PHOTOGRAPHER_FRESH_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours fresh photographer cache

interface L1PageCacheEntry {
  items: ExternalImageItem[];
  expiresAt: number;
}

export interface MultiProviderWorkerOptions {
  secondaryProviderName?: string;
  tertiaryProviderName?: string;
  pixabayMediaStorage?: PixabayServerMediaStorage;
}

function computeNextHourReset(nowMs = Date.now()): Date {
  const nextTopOfHour = (Math.floor(nowMs / 3_600_000) + 1) * 3_600_000;
  return new Date(nextTopOfHour);
}

function appendUniqueItems(
  target: ExternalImageItem[],
  candidates: ExternalImageItem[],
  maxTotal: number,
): ExternalImageItem[] {
  if (target.length >= maxTotal || candidates.length === 0) {
    return target;
  }
  const seen = new Set(target.map((i) => `${i.provider}:${i.externalId}`));
  const merged = [...target];
  for (const item of candidates) {
    if (merged.length >= maxTotal) break;
    const key = `${item.provider}:${item.externalId}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  }
  return merged;
}

export class UnsplashQuotaWorker implements IImageFeedOrchestrator {
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly l1FeedCache = new Map<string, L1PageCacheEntry>();
  private isDrainingQueue = false;
  private readonly secondaryProviderName: string;
  private readonly tertiaryProviderName: string;
  private readonly pixabayMediaStorage?: PixabayServerMediaStorage;

  constructor(
    private readonly primaryProvider: IImageProvider,
    private readonly registry: ImageProviderRegistry,
    private readonly store: IQuotaPersistenceStore,
    private readonly savedImageRepo: ISavedImageRepository,
    private readonly enableSecondaryFallback = true,
    private readonly enableTertiaryFallback = true,
    options?: MultiProviderWorkerOptions,
  ) {
    this.secondaryProviderName = options?.secondaryProviderName ?? "pixabay";
    this.tertiaryProviderName = options?.tertiaryProviderName ?? "picsum";
    this.pixabayMediaStorage = options?.pixabayMediaStorage;
  }

  /**
   * Singleflight coalescer: ensures N identical concurrent requests
   * share 1 single execution and consume at most 1 upstream quota unit.
   */
  private coalesce<T>(key: string, task: () => Promise<T>): Promise<T> {
    const active = this.inFlight.get(key) as Promise<T> | undefined;
    if (active) return active;

    const promise = task().finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, promise);
    return promise;
  }

  private async getEffectiveQuota(): Promise<{
    remaining: number;
    limit: number;
    windowResetAt: Date;
  }> {
    const now = new Date();
    const persisted = await this.store.getRateState(
      this.primaryProvider.providerName,
    );

    if (!persisted || persisted.windowResetAt <= now) {
      const freshReset = computeNextHourReset(now.getTime());
      const limit = persisted?.limitQuota ?? HOURLY_LIMIT;
      await this.store.saveRateState({
        provider: this.primaryProvider.providerName,
        remainingQuota: limit,
        limitQuota: limit,
        windowResetAt: freshReset,
      });
      return {
        remaining: limit,
        limit,
        windowResetAt: freshReset,
      };
    }

    return {
      remaining: persisted.remainingQuota,
      limit: persisted.limitQuota,
      windowResetAt: persisted.windowResetAt,
    };
  }

  private async recordQuotaAfterCall(
    headerRemaining?: number,
    headerLimit?: number,
    callsCost = 1,
  ): Promise<void> {
    const current = await this.getEffectiveQuota();
    const nextLimit = headerLimit ?? current.limit ?? HOURLY_LIMIT;
    const nextRemaining =
      headerRemaining !== undefined
        ? Math.max(0, headerRemaining)
        : Math.max(0, current.remaining - callsCost);

    await this.store.saveRateState({
      provider: this.primaryProvider.providerName,
      remainingQuota: nextRemaining,
      limitQuota: nextLimit,
      windowResetAt: current.windowResetAt,
    });
  }

  private async markQuotaExhausted(): Promise<Date> {
    const resetAt = computeNextHourReset();
    await this.store.saveRateState({
      provider: this.primaryProvider.providerName,
      remainingQuota: 0,
      limitQuota: HOURLY_LIMIT,
      windowResetAt: resetAt,
    });
    return resetAt;
  }

  private async hydratePoolAndPhotographers(
    items: ExternalImageItem[],
    queryTag = "",
    providerOverride?: string,
  ): Promise<void> {
    if (items.length === 0) return;
    await this.store.upsertCachedImages(items, queryTag);

    const photographers = items
      .map((i) => i.photographer)
      .filter((p): p is PhotographerSummary => p !== null);

    if (photographers.length > 0) {
      await this.store.upsertPhotographers(
        photographers,
        providerOverride ?? items[0]?.provider ?? this.primaryProvider.providerName,
        false,
      );
    }
  }

  private async attachSavedState(
    items: ExternalImageItem[],
    viewerUserId?: string | null,
  ): Promise<
    Array<
      ExternalImageItem & { savedByMe: boolean; savedImageId: string | null }
    >
  > {
    if (!viewerUserId || items.length === 0) {
      return items.map((item) => ({
        ...item,
        savedByMe: false,
        savedImageId: null,
      }));
    }

    const savedMap = await this.savedImageRepo.findSavedExternalKeys(
      viewerUserId,
      items.map((i) => ({ provider: i.provider, externalId: i.externalId })),
    );

    return items.map((item) => {
      const savedId = savedMap.get(`${item.provider}:${item.externalId}`) ?? null;
      return {
        ...item,
        savedByMe: savedId !== null,
        savedImageId: savedId,
      };
    });
  }

  /**
   * Fetches items from a fallback provider (Secondary = Pixabay or Tertiary = Picsum),
   * hydrating Neon DB cache & photographer snapshots and swallowing any upstream 429/errors
   * so Zero-429 cascade continues smoothly.
   */
  private async fetchFromFallbackProvider(params: {
    provider: IImageProvider;
    page: number;
    needed: number;
    query?: string;
    persistToPool: boolean;
    allowDbPoolFallback: boolean;
  }): Promise<ExternalImageItem[]> {
    const {
      provider,
      page,
      needed,
      query,
      persistToPool,
      allowDbPoolFallback,
    } = params;
    if (needed <= 0) return [];

    // Fetch standard 30-photo batch for Pixabay so its mandatory 24-hour cache holds full pages
    const fetchCount =
      provider.providerName === "pixabay"
        ? Math.max(needed, UNSPLASH_MAX_PER_PAGE)
        : needed;

    try {
      const res = await provider.fetchPage({
        page,
        perPage: fetchCount,
        query,
      });
      if (res.items.length > 0) {
        if (persistToPool) {
          await this.hydratePoolAndPhotographers(
            res.items,
            query ?? "",
            provider.providerName,
          );
        }
        return res.items.slice(0, needed);
      }
    } catch {
      // Upstream 429 or transient error -> fall back to fresh DB cache or next tier!
    }

    if (allowDbPoolFallback) {
      try {
        return await this.store.queryCachedImages({
          page,
          perPage: needed,
          query,
          provider: provider.providerName,
        });
      } catch {
        return [];
      }
    }

    return [];
  }

  async getInfiniteFeed(params: {
    page: number;
    query?: string;
    provider?: string;
    viewerUserId?: string | null;
  }): Promise<FeedResponseDTO> {
    const page = Math.max(1, params.page);
    const query = params.query?.trim() || undefined;

    // Explicit secondary/tertiary provider selection (multi-provider extensibility!)
    if (
      params.provider &&
      params.provider !== this.primaryProvider.providerName
    ) {
      const altProvider = this.registry.get(params.provider);
      if (altProvider) {
        const altItems = await this.coalesce(
          `alt:${altProvider.providerName}:${page}:${query ?? ""}`,
          () =>
            this.fetchFromFallbackProvider({
              provider: altProvider,
              page,
              needed: UNSPLASH_MAX_PER_PAGE,
              query,
              persistToPool: true,
              allowDbPoolFallback: true,
            }),
        );
        const decorated = await this.attachSavedState(
          altItems,
          params.viewerUserId,
        );
        return {
          items: decorated,
          page,
          hasMore: decorated.length > 0,
          source: "live",
        };
      }
    }

    const cacheKey = `feed:${page}:${(query ?? "").toLowerCase()}`;
    const nowMs = Date.now();
    const l1Hit = this.l1FeedCache.get(cacheKey);
    if (l1Hit && l1Hit.expiresAt > nowMs && l1Hit.items.length > 0) {
      const decorated = await this.attachSavedState(
        l1Hit.items,
        params.viewerUserId,
      );
      void this.drainQueueBackground();
      return {
        items: decorated,
        page,
        hasMore: true,
        source: "cache_pool",
      };
    }

    const fetched = await this.coalesce(cacheKey, async () => {
      const quota = await this.getEffectiveQuota();

      // Tier 1 (Primary — Unsplash): Fetch live 30-image batch when above reserve threshold
      if (quota.remaining > FEED_RESERVE_THRESHOLD) {
        try {
          const liveRes = await this.primaryProvider.fetchPage({
            page,
            perPage: UNSPLASH_MAX_PER_PAGE,
            query,
          });
          await this.recordQuotaAfterCall(
            liveRes.rateLimitRemaining,
            liveRes.rateLimitLimit,
          );
          await this.hydratePoolAndPhotographers(
            liveRes.items,
            query ?? "",
            this.primaryProvider.providerName,
          );

          if (liveRes.items.length > 0) {
            this.l1FeedCache.set(cacheKey, {
              items: liveRes.items,
              expiresAt: Date.now() + FEED_PAGE_CACHE_TTL_MS,
            });
            return {
              items: liveRes.items,
              source: "live" as const,
            };
          }
        } catch (err) {
          if (err instanceof UpstreamQuotaExceededError) {
            await this.markQuotaExhausted();
          }
          // Fall through seamlessly to Zero-429 Multi-Tier Fallback Engine!
        }
      }

      // Zero-429 Fallback Step A: Serve from Persistent Neon DB Image Pool (Primary)
      const poolItems = await this.store.queryCachedImages({
        page,
        perPage: UNSPLASH_MAX_PER_PAGE,
        query,
        provider: this.primaryProvider.providerName,
      });

      if (poolItems.length >= UNSPLASH_MAX_PER_PAGE) {
        return {
          items: poolItems.slice(0, UNSPLASH_MAX_PER_PAGE),
          source: "cache_pool" as const,
        };
      }

      let merged = [...poolItems];
      let usedExternalFallback = false;

      // Zero-429 Fallback Step B (Tier 2 — Secondary Provider: Pixabay via ENABLE_SECONDARY_PROVIDER)
      if (
        this.enableSecondaryFallback &&
        merged.length < UNSPLASH_MAX_PER_PAGE
      ) {
        const secondary = this.registry.get(this.secondaryProviderName);
        if (secondary) {
          const secItems = await this.fetchFromFallbackProvider({
            provider: secondary,
            page,
            needed: UNSPLASH_MAX_PER_PAGE - merged.length,
            query,
            persistToPool: true,
            allowDbPoolFallback: true,
          });
          if (secItems.length > 0) {
            merged = appendUniqueItems(
              merged,
              secItems,
              UNSPLASH_MAX_PER_PAGE,
            );
            usedExternalFallback = true;
          }
        }
      }

      // Zero-429 Fallback Step C (Tier 3 — Tertiary Provider: Picsum via ENABLE_TERTIARY_PROVIDER)
      if (
        this.enableTertiaryFallback &&
        merged.length < UNSPLASH_MAX_PER_PAGE
      ) {
        const tertiary = this.registry.get(this.tertiaryProviderName);
        if (tertiary) {
          const tertItems = await this.fetchFromFallbackProvider({
            provider: tertiary,
            page,
            needed: UNSPLASH_MAX_PER_PAGE - merged.length,
            query,
            persistToPool: false,
            allowDbPoolFallback: false,
          });
          if (tertItems.length > 0) {
            merged = appendUniqueItems(
              merged,
              tertItems,
              UNSPLASH_MAX_PER_PAGE,
            );
            usedExternalFallback = true;
          }
        }
      }

      // Deterministic wrap-around safety net if both Secondary & Tertiary are disabled/unavailable on deep pages
      if (merged.length === 0 && !query && page > 1) {
        const allFirstPage = await this.store.queryCachedImages({
          page: 1,
          perPage: UNSPLASH_MAX_PER_PAGE,
          provider: this.primaryProvider.providerName,
        });
        if (allFirstPage.length > 0) {
          const shift = ((page - 1) * 7) % allFirstPage.length;
          merged = [
            ...allFirstPage.slice(shift),
            ...allFirstPage.slice(0, shift),
          ];
        }
      }

      return {
        items: merged,
        source: usedExternalFallback
          ? ("hybrid_fallback" as const)
          : ("cache_pool" as const),
      };
    });

    void this.drainQueueBackground();

    const decorated = await this.attachSavedState(
      fetched.items,
      params.viewerUserId,
    );

    return {
      items: decorated,
      page,
      hasMore: decorated.length > 0,
      source: fetched.source,
    };
  }

  async getPhotographerDetail(params: {
    username: string;
    viewerUserId?: string | null;
  }): Promise<
    Omit<PhotographerDetail, "photos"> & {
      photos: Array<
        ExternalImageItem & { savedByMe: boolean; savedImageId: string | null }
      >;
    }
  > {
    const cleanUsername = params.username.trim();
    const coalesceKey = `photographer:${cleanUsername.toLowerCase()}`;

    const detail = await this.coalesce(coalesceKey, async () => {
      const cachedProfile =
        await this.store.getCachedPhotographer(cleanUsername);
      const cachedPhotos = await this.store.getCachedPhotosByPhotographer(
        cleanUsername,
        UNSPLASH_MAX_PER_PAGE,
      );

      // Secondary/Tertiary photographers (Pixabay / Picsum) resolve directly from cache with 0 Unsplash quota cost
      if (
        cachedProfile &&
        cachedProfile.provider !== this.primaryProvider.providerName
      ) {
        return {
          ...cachedProfile,
          isFallbackCache: !cachedProfile.fullFetched,
          updatedAt: cachedProfile.updatedAt.toISOString(),
          photos: cachedPhotos,
        };
      }

      const isFresh =
        cachedProfile?.fullFetched &&
        Date.now() - cachedProfile.updatedAt.getTime() <
          PHOTOGRAPHER_FRESH_TTL_MS &&
        cachedPhotos.length >= 6;

      if (cachedProfile && isFresh) {
        return {
          ...cachedProfile,
          isFallbackCache: false,
          updatedAt: cachedProfile.updatedAt.toISOString(),
          photos: cachedPhotos,
        };
      }

      const quota = await this.getEffectiveQuota();

      // Priority Lane P1: Interactive Photographer lookup gets top priority down to last 2 reqs
      if (
        quota.remaining >= 2 &&
        this.primaryProvider.fetchPhotographer &&
        this.primaryProvider.fetchPhotographerPhotos
      ) {
        try {
          const [profRes, photosRes] = await Promise.all([
            this.primaryProvider.fetchPhotographer(cleanUsername),
            this.primaryProvider.fetchPhotographerPhotos(
              cleanUsername,
              UNSPLASH_MAX_PER_PAGE,
            ),
          ]);

          const remCandidates = [
            profRes.rateLimitRemaining,
            photosRes.rateLimitRemaining,
          ].filter((n): n is number => n !== undefined);
          const latestRem =
            remCandidates.length > 0 ? Math.min(...remCandidates) : undefined;
          const latestLim =
            photosRes.rateLimitLimit ?? profRes.rateLimitLimit;
          await this.recordQuotaAfterCall(latestRem, latestLim, 2);

          await this.store.upsertPhotographers(
            [profRes.photographer],
            this.primaryProvider.providerName,
            true,
          );
          await this.hydratePoolAndPhotographers(
            photosRes.items,
            "",
            this.primaryProvider.providerName,
          );

          return {
            ...profRes.photographer,
            provider: this.primaryProvider.providerName,
            fullFetched: true,
            isFallbackCache: false,
            updatedAt: new Date().toISOString(),
            photos:
              photosRes.items.length > 0 ? photosRes.items : cachedPhotos,
          };
        } catch (err) {
          if (err instanceof UpstreamQuotaExceededError) {
            const resetAt = await this.markQuotaExhausted();
            await this.store.enqueueJob(
              "SYNC_PHOTOGRAPHER",
              { username: cleanUsername },
              resetAt,
            );
          } else if (!cachedProfile && cachedPhotos.length === 0) {
            throw new NotFoundError(
              `Photographer @${cleanUsername} was not found.`,
            );
          }
        }
      } else {
        // Schedule background sync for when the hourly window resets
        await this.store.enqueueJob(
          "SYNC_PHOTOGRAPHER",
          { username: cleanUsername },
          quota.windowResetAt,
        );
      }

      // Zero-429 Fallback for Photographer Detail: use opportunistically cached snapshot + photos!
      if (cachedProfile) {
        return {
          ...cachedProfile,
          isFallbackCache: true,
          updatedAt: cachedProfile.updatedAt.toISOString(),
          photos: cachedPhotos,
        };
      }

      if (cachedPhotos.length > 0 && cachedPhotos[0]?.photographer) {
        const snap = cachedPhotos[0].photographer;
        return {
          ...snap,
          provider: cachedPhotos[0].provider,
          fullFetched: false,
          isFallbackCache: true,
          updatedAt: new Date().toISOString(),
          photos: cachedPhotos,
        };
      }

      throw new NotFoundError(
        `No cached profile for @${cleanUsername} yet. A background sync has been queued.`,
      );
    });

    const decoratedPhotos = await this.attachSavedState(
      detail.photos,
      params.viewerUserId,
    );

    return {
      ...detail,
      photos: decoratedPhotos,
    };
  }

  /**
   * Complies with Pixabay's no-permanent-hotlinking & 24h URL expiry policy:
   * downloads and stores saved Pixabay images onto server storage so Saved Frames
   * and Community/Private Stories remain permanently accessible beyond 24 hours.
   */
  async resolvePermanentImageUrls(params: {
    provider: string;
    externalId: string;
    imageUrl: string;
    thumbUrl: string;
  }): Promise<{ imageUrl: string; thumbUrl: string }> {
    if (params.provider !== "pixabay" || !this.pixabayMediaStorage) {
      return {
        imageUrl: params.imageUrl,
        thumbUrl: params.thumbUrl,
      };
    }

    return this.pixabayMediaStorage.archiveSavedPair({
      externalId: params.externalId,
      imageUrl: params.imageUrl,
      thumbUrl: params.thumbUrl,
    });
  }

  async enqueueDownloadTrigger(params: {
    provider: string;
    externalId: string;
    downloadLocation: string | null;
  }): Promise<void> {
    if (params.provider !== "unsplash") return;
    if (!isSafeUnsplashDownloadUrl(params.downloadLocation)) {
      return;
    }

    await this.store.enqueueJob("TRIGGER_DOWNLOAD", {
      externalId: params.externalId,
      downloadLocation: params.downloadLocation,
    });

    // Trigger non-blocking background drain
    void this.drainQueueBackground();
  }

  async drainQueueBackground(): Promise<void> {
    if (this.isDrainingQueue) return;
    this.isDrainingQueue = true;

    try {
      const quota = await this.getEffectiveQuota();
      if (quota.remaining <= DOWNLOAD_RESERVE_THRESHOLD) {
        return;
      }

      const jobs = await this.store.claimDueJobs(2);
      for (const job of jobs) {
        const currentQuota = await this.getEffectiveQuota();
        if (currentQuota.remaining <= DOWNLOAD_RESERVE_THRESHOLD) {
          await this.store.deferJob(
            job.id,
            currentQuota.windowResetAt,
            job.attempts,
          );
          continue;
        }

        try {
          if (
            job.jobType === "TRIGGER_DOWNLOAD" &&
            this.primaryProvider.triggerDownloadEvent
          ) {
            const downloadLocation = String(
              job.payload.downloadLocation ?? "",
            );
            if (!isSafeUnsplashDownloadUrl(downloadLocation)) {
              await this.store.completeJob(job.id);
              continue;
            }
            const res =
              await this.primaryProvider.triggerDownloadEvent(downloadLocation);
            await this.recordQuotaAfterCall(res.rateLimitRemaining);
            await this.store.completeJob(job.id);
          } else if (
            job.jobType === "SYNC_PHOTOGRAPHER" &&
            this.primaryProvider.fetchPhotographer &&
            this.primaryProvider.fetchPhotographerPhotos
          ) {
            const username = String(job.payload.username ?? "");
            if (!username) {
              await this.store.completeJob(job.id);
              continue;
            }
            const [profRes, photosRes] = await Promise.all([
              this.primaryProvider.fetchPhotographer(username),
              this.primaryProvider.fetchPhotographerPhotos(
                username,
                UNSPLASH_MAX_PER_PAGE,
              ),
            ]);
            const syncRems = [
              profRes.rateLimitRemaining,
              photosRes.rateLimitRemaining,
            ].filter((n): n is number => n !== undefined);
            await this.recordQuotaAfterCall(
              syncRems.length > 0 ? Math.min(...syncRems) : undefined,
              photosRes.rateLimitLimit ?? profRes.rateLimitLimit,
              2,
            );
            await this.store.upsertPhotographers(
              [profRes.photographer],
              this.primaryProvider.providerName,
              true,
            );
            await this.hydratePoolAndPhotographers(
              photosRes.items,
              "",
              this.primaryProvider.providerName,
            );
            await this.store.completeJob(job.id);
          } else {
            await this.store.completeJob(job.id);
          }
        } catch (err) {
          if (err instanceof UpstreamQuotaExceededError) {
            const resetAt = await this.markQuotaExhausted();
            await this.store.deferJob(job.id, resetAt, job.attempts + 1);
            break;
          }
          const retryAt = new Date(Date.now() + 5 * 60 * 1000);
          await this.store.deferJob(job.id, retryAt, job.attempts + 1);
        }
      }
    } catch {
      // Never allow background queue errors to bubble into unhandled rejections
    } finally {
      this.isDrainingQueue = false;
    }
  }

  async getQuotaHealth(): Promise<QuotaHealthSummary> {
    const base = await this.store.getHealthCounts(
      this.primaryProvider.providerName,
    );
    const secondary = this.registry.get(this.secondaryProviderName);
    const tertiary = this.registry.get(this.tertiaryProviderName);

    const secondaryTelemetry =
      secondary instanceof PixabayImageProvider
        ? secondary.getRateTelemetry()
        : {
            configured: Boolean(secondary),
            remainingQuota: 100,
            limitQuota: 100,
            windowResetSeconds: 60,
          };

    return {
      ...base,
      secondaryProvider: {
        provider: this.secondaryProviderName,
        enabled: this.enableSecondaryFallback,
        configured: secondaryTelemetry.configured,
        remainingQuota: secondaryTelemetry.remainingQuota,
        limitQuota: secondaryTelemetry.limitQuota,
        windowResetSeconds: secondaryTelemetry.windowResetSeconds,
        cacheTtlHours: Math.round(PIXABAY_CACHE_TTL_MS / 3_600_000),
      },
      tertiaryProvider: {
        provider: this.tertiaryProviderName,
        enabled: this.enableTertiaryFallback && Boolean(tertiary),
      },
    };
  }
}

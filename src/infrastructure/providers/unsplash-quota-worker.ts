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

function computeNextHourReset(nowMs = Date.now()): Date {
  const nextTopOfHour = (Math.floor(nowMs / 3_600_000) + 1) * 3_600_000;
  return new Date(nextTopOfHour);
}

export class UnsplashQuotaWorker implements IImageFeedOrchestrator {
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly l1FeedCache = new Map<string, L1PageCacheEntry>();
  private isDrainingQueue = false;

  constructor(
    private readonly primaryProvider: IImageProvider,
    private readonly registry: ImageProviderRegistry,
    private readonly store: IQuotaPersistenceStore,
    private readonly savedImageRepo: ISavedImageRepository,
    private readonly enableSecondaryFallback = true,
  ) {}

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
  ): Promise<void> {
    if (items.length === 0) return;
    await this.store.upsertCachedImages(items, queryTag);

    const photographers = items
      .map((i) => i.photographer)
      .filter((p): p is PhotographerSummary => p !== null);

    if (photographers.length > 0) {
      await this.store.upsertPhotographers(
        photographers,
        this.primaryProvider.providerName,
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

  async getInfiniteFeed(params: {
    page: number;
    query?: string;
    provider?: string;
    viewerUserId?: string | null;
  }): Promise<FeedResponseDTO> {
    const page = Math.max(1, params.page);
    const query = params.query?.trim() || undefined;

    // Explicit secondary provider selection (multi-provider extensibility!)
    if (
      params.provider &&
      params.provider !== this.primaryProvider.providerName
    ) {
      const altProvider = this.registry.get(params.provider);
      if (altProvider) {
        const res = await this.coalesce(
          `alt:${altProvider.providerName}:${page}:${query ?? ""}`,
          () =>
            altProvider.fetchPage({
              page,
              perPage: UNSPLASH_MAX_PER_PAGE,
              query,
            }),
        );
        await this.store.upsertCachedImages(res.items, query ?? "");
        const decorated = await this.attachSavedState(
          res.items,
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

      // Priority Lane P2: Fetch live 30-image batch when above reserve threshold
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
          await this.hydratePoolAndPhotographers(liveRes.items, query ?? "");

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
          // Fall through seamlessly to Zero-429 Fallback Engine!
        }
      }

      // Zero-429 Fallback Step A: Serve from Persistent Neon DB Image Pool
      let poolItems = await this.store.queryCachedImages({
        page,
        perPage: UNSPLASH_MAX_PER_PAGE,
        query,
        provider: this.primaryProvider.providerName,
      });

      // If high page number exceeds pool size, wrap around deterministically so Infinite Scroll stays smooth
      if (poolItems.length === 0 && !query && page > 1) {
        const allFirstPage = await this.store.queryCachedImages({
          page: 1,
          perPage: UNSPLASH_MAX_PER_PAGE,
          provider: this.primaryProvider.providerName,
        });
        if (allFirstPage.length > 0) {
          const shift = ((page - 1) * 7) % allFirstPage.length;
          poolItems = [
            ...allFirstPage.slice(shift),
            ...allFirstPage.slice(0, shift),
          ];
        }
      }

      if (poolItems.length >= UNSPLASH_MAX_PER_PAGE || !this.enableSecondaryFallback) {
        return {
          items: poolItems,
          source: "cache_pool" as const,
        };
      }

      // Zero-429 Fallback Step B: Supplement with secondary registered provider (e.g. Picsum)
      const secondary = this.registry.get("picsum");
      if (secondary) {
        try {
          const needed = UNSPLASH_MAX_PER_PAGE - poolItems.length;
          const secRes = await secondary.fetchPage({
            page,
            perPage: needed,
            query,
          });
          const merged = [...poolItems, ...secRes.items];
          return {
            items: merged,
            source: "hybrid_fallback" as const,
          };
        } catch {
          return {
            items: poolItems,
            source: "cache_pool" as const,
          };
        }
      }

      return {
        items: poolItems,
        source: "cache_pool" as const,
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
          await this.hydratePoolAndPhotographers(photosRes.items);

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
              `Không tìm thấy thông tin nhiếp ảnh gia @${cleanUsername}.`,
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
        `Chưa có dữ liệu lưu trữ cho nhiếp ảnh gia @${cleanUsername}. Hệ thống đã đưa vào hàng đợi đồng bộ.`,
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
            await this.hydratePoolAndPhotographers(photosRes.items);
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
    return this.store.getHealthCounts(this.primaryProvider.providerName);
  }
}

import "server-only";
import {
  and,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  lte,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import type {
  ExternalImageItem,
  PhotographerSummary,
  QuotaHealthSummary,
} from "@/domain/entities/models";
import { db } from "../db/client";
import {
  cachedImages,
  cachedPhotographers,
  providerRateState,
  unsplashJobQueue,
} from "../db/schema";
import { PIXABAY_CACHE_TTL_MS } from "./pixabay-provider";

export interface StoredPhotographerRecord extends PhotographerSummary {
  provider: string;
  fullFetched: boolean;
  updatedAt: Date;
}

export interface QueuedJobRecord {
  id: string;
  jobType: "TRIGGER_DOWNLOAD" | "SYNC_PHOTOGRAPHER";
  payload: Record<string, unknown>;
  attempts: number;
}

export interface RateStateRecord {
  provider: string;
  remainingQuota: number;
  limitQuota: number;
  windowResetAt: Date;
}

export interface IQuotaPersistenceStore {
  getRateState(provider: string): Promise<RateStateRecord | null>;
  saveRateState(state: RateStateRecord): Promise<void>;
  upsertCachedImages(items: ExternalImageItem[], queryTag?: string): Promise<void>;
  upsertPhotographers(
    photographers: PhotographerSummary[],
    provider: string,
    fullFetched: boolean,
  ): Promise<void>;
  queryCachedImages(params: {
    page: number;
    perPage: number;
    query?: string;
    provider?: string;
    seed?: number;
    excludeExternalIds?: string[];
  }): Promise<ExternalImageItem[]>;
  getCachedPhotographer(
    username: string,
  ): Promise<StoredPhotographerRecord | null>;
  getCachedPhotosByPhotographer(
    username: string,
    limit: number,
  ): Promise<ExternalImageItem[]>;
  enqueueJob(
    jobType: "TRIGGER_DOWNLOAD" | "SYNC_PHOTOGRAPHER",
    payload: Record<string, unknown>,
    nextRunAt?: Date,
  ): Promise<void>;
  claimDueJobs(limit: number): Promise<QueuedJobRecord[]>;
  completeJob(id: string): Promise<void>;
  deferJob(id: string, nextRunAt: Date, attempts: number): Promise<void>;
  getHealthCounts(provider: string): Promise<QuotaHealthSummary>;
}

export class PostgresQuotaPersistenceStore implements IQuotaPersistenceStore {
  async getRateState(provider: string): Promise<RateStateRecord | null> {
    const rows = await db
      .select()
      .from(providerRateState)
      .where(eq(providerRateState.provider, provider))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      provider: row.provider,
      remainingQuota: row.remainingQuota,
      limitQuota: row.limitQuota,
      windowResetAt: row.windowResetAt,
    };
  }

  async saveRateState(state: RateStateRecord): Promise<void> {
    await db
      .insert(providerRateState)
      .values({
        provider: state.provider,
        remainingQuota: state.remainingQuota,
        limitQuota: state.limitQuota,
        windowResetAt: state.windowResetAt,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: providerRateState.provider,
        set: {
          remainingQuota: state.remainingQuota,
          limitQuota: state.limitQuota,
          windowResetAt: state.windowResetAt,
          updatedAt: new Date(),
        },
      });
  }

  async upsertCachedImages(
    items: ExternalImageItem[],
    queryTag = "",
  ): Promise<void> {
    if (items.length === 0) return;

    const normalizedTag = queryTag.trim().toLowerCase().slice(0, 120);
    const now = new Date();
    const uniqueByKey = new Map<string, typeof cachedImages.$inferInsert>();

    for (const item of items) {
      uniqueByKey.set(`${item.provider}:${item.externalId}`, {
        provider: item.provider,
        externalId: item.externalId,
        queryTag: normalizedTag,
        imageUrl: item.imageUrl,
        thumbUrl: item.thumbUrl,
        color: item.color,
        width: item.width,
        height: item.height,
        description: item.description,
        photographerUsername: item.photographer?.username ?? null,
        photographerSnapshot: item.photographer ?? null,
        downloadLocation: item.downloadLocation,
        fetchedAt: now,
      });
    }

    const batchValues = Array.from(uniqueByKey.values());
    if (batchValues.length === 0) return;

    await db
      .insert(cachedImages)
      .values(batchValues)
      .onConflictDoUpdate({
        target: [cachedImages.provider, cachedImages.externalId],
        set: {
          imageUrl: sql`excluded.image_url`,
          thumbUrl: sql`excluded.thumb_url`,
          color: sql`excluded.color`,
          width: sql`excluded.width`,
          height: sql`excluded.height`,
          description: sql`excluded.description`,
          photographerUsername: sql`excluded.photographer_username`,
          photographerSnapshot: sql`excluded.photographer_snapshot`,
          downloadLocation: sql`excluded.download_location`,
          queryTag: normalizedTag
            ? sql`excluded.query_tag`
            : sql`${cachedImages.queryTag}`,
          fetchedAt: now,
        },
      });
  }

  async upsertPhotographers(
    photographers: PhotographerSummary[],
    provider: string,
    fullFetched: boolean,
  ): Promise<void> {
    if (photographers.length === 0) return;
    const now = new Date();
    const uniqueByUsername = new Map<
      string,
      typeof cachedPhotographers.$inferInsert
    >();

    for (const p of photographers) {
      const key = p.username.trim().toLowerCase();
      if (!key || uniqueByUsername.has(key)) continue;
      uniqueByUsername.set(key, {
        username: p.username,
        provider,
        name: p.name,
        bio: p.bio,
        location: p.location,
        avatarUrl: p.avatarUrl,
        portfolioUrl: p.portfolioUrl,
        profileUrl: p.profileUrl,
        totalPhotos: p.totalPhotos,
        totalLikes: p.totalLikes,
        totalCollections: p.totalCollections,
        fullFetched,
        updatedAt: now,
      });
    }

    const batchValues = Array.from(uniqueByUsername.values());
    if (batchValues.length === 0) return;

    await db
      .insert(cachedPhotographers)
      .values(batchValues)
      .onConflictDoUpdate({
        target: cachedPhotographers.username,
        set: {
          name: sql`excluded.name`,
          bio: sql`excluded.bio`,
          location: sql`excluded.location`,
          avatarUrl: sql`excluded.avatar_url`,
          portfolioUrl: sql`excluded.portfolio_url`,
          profileUrl: sql`excluded.profile_url`,
          totalPhotos: sql`excluded.total_photos`,
          totalLikes: sql`excluded.total_likes`,
          totalCollections: sql`excluded.total_collections`,
          fullFetched: fullFetched
            ? sql`true`
            : sql`${cachedPhotographers.fullFetched}`,
          updatedAt: now,
        },
      });
  }

  async queryCachedImages(params: {
    page: number;
    perPage: number;
    query?: string;
    provider?: string;
    seed?: number;
    excludeExternalIds?: string[];
  }): Promise<ExternalImageItem[]> {
    const offset = Math.max(0, (params.page - 1) * params.perPage);
    const conditions = [];

    const pixabayFreshFloor = new Date(Date.now() - PIXABAY_CACHE_TTL_MS);
    // Pixabay signed image URLs expire after 24 hours; never serve expired Pixabay cache entries
    conditions.push(
      or(
        ne(cachedImages.provider, "pixabay"),
        gt(cachedImages.fetchedAt, pixabayFreshFloor),
      )!,
    );

    if (params.provider) {
      conditions.push(eq(cachedImages.provider, params.provider));
    }
    if (params.excludeExternalIds?.length) {
      conditions.push(notInArray(cachedImages.externalId, params.excludeExternalIds));
    }

    if (params.query) {
      const pattern = `%${params.query.trim()}%`;
      conditions.push(
        or(
          ilike(cachedImages.queryTag, pattern),
          ilike(cachedImages.description, pattern),
          ilike(cachedImages.photographerUsername, pattern),
        ),
      );
    }

    const rows = await db
      .select()
      .from(cachedImages)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(
        params.seed === undefined
          ? desc(cachedImages.fetchedAt)
          : sql`md5(${cachedImages.externalId} || ${String(params.seed)})`,
        desc(cachedImages.id),
      )
      .limit(params.perPage)
      .offset(offset);

    return rows.map((r) => ({
      provider: r.provider,
      externalId: r.externalId,
      imageUrl: r.imageUrl,
      thumbUrl: r.thumbUrl,
      width: r.width,
      height: r.height,
      color: r.color,
      description: r.description,
      downloadLocation: r.downloadLocation,
      photographer: r.photographerSnapshot ?? null,
    }));
  }

  async getCachedPhotographer(
    username: string,
  ): Promise<StoredPhotographerRecord | null> {
    const rows = await db
      .select()
      .from(cachedPhotographers)
      .where(ilike(cachedPhotographers.username, username))
      .limit(1);
    const r = rows[0];
    if (!r) return null;
    return {
      username: r.username,
      provider: r.provider,
      name: r.name,
      bio: r.bio,
      location: r.location,
      avatarUrl: r.avatarUrl,
      portfolioUrl: r.portfolioUrl,
      profileUrl: r.profileUrl,
      totalPhotos: r.totalPhotos,
      totalLikes: r.totalLikes,
      totalCollections: r.totalCollections,
      fullFetched: r.fullFetched,
      updatedAt: r.updatedAt,
    };
  }

  async getCachedPhotosByPhotographer(
    username: string,
    limit: number,
  ): Promise<ExternalImageItem[]> {
    const pixabayFreshFloor = new Date(Date.now() - PIXABAY_CACHE_TTL_MS);
    const rows = await db
      .select()
      .from(cachedImages)
      .where(
        and(
          ilike(cachedImages.photographerUsername, username),
          or(
            ne(cachedImages.provider, "pixabay"),
            gt(cachedImages.fetchedAt, pixabayFreshFloor),
          ),
        ),
      )
      .orderBy(desc(cachedImages.fetchedAt))
      .limit(limit);

    return rows.map((r) => ({
      provider: r.provider,
      externalId: r.externalId,
      imageUrl: r.imageUrl,
      thumbUrl: r.thumbUrl,
      width: r.width,
      height: r.height,
      color: r.color,
      description: r.description,
      downloadLocation: r.downloadLocation,
      photographer: r.photographerSnapshot ?? null,
    }));
  }

  async enqueueJob(
    jobType: "TRIGGER_DOWNLOAD" | "SYNC_PHOTOGRAPHER",
    payload: Record<string, unknown>,
    nextRunAt = new Date(),
  ): Promise<void> {
    await db.insert(unsplashJobQueue).values({
      jobType,
      payload,
      status: "PENDING",
      attempts: 0,
      nextRunAt,
    });
  }

  async claimDueJobs(limit: number): Promise<QueuedJobRecord[]> {
    const now = new Date();
    const rows = await db
      .select()
      .from(unsplashJobQueue)
      .where(
        and(
          or(
            eq(unsplashJobQueue.status, "PENDING"),
            eq(unsplashJobQueue.status, "DEFERRED"),
          ),
          lte(unsplashJobQueue.nextRunAt, now),
        ),
      )
      .orderBy(unsplashJobQueue.createdAt)
      .limit(limit);

    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    await db
      .update(unsplashJobQueue)
      .set({ status: "PROCESSING" })
      .where(inArray(unsplashJobQueue.id, ids));

    return rows.map((row) => ({
      id: row.id,
      jobType: row.jobType as "TRIGGER_DOWNLOAD" | "SYNC_PHOTOGRAPHER",
      payload: row.payload,
      attempts: row.attempts,
    }));
  }

  async completeJob(id: string): Promise<void> {
    await db
      .update(unsplashJobQueue)
      .set({ status: "DONE" })
      .where(eq(unsplashJobQueue.id, id));
  }

  async deferJob(id: string, nextRunAt: Date, attempts: number): Promise<void> {
    if (attempts >= 5) {
      await db
        .update(unsplashJobQueue)
        .set({ status: "DONE", attempts })
        .where(eq(unsplashJobQueue.id, id));
      return;
    }
    await db
      .update(unsplashJobQueue)
      .set({ status: "DEFERRED", nextRunAt, attempts })
      .where(eq(unsplashJobQueue.id, id));
  }

  async getHealthCounts(provider: string): Promise<QuotaHealthSummary> {
    const [rate, imgCountRes, photogCountRes, jobCountRes] = await Promise.all([
      this.getRateState(provider),
      db.select({ total: count() }).from(cachedImages),
      db.select({ total: count() }).from(cachedPhotographers),
      db
        .select({ total: count() })
        .from(unsplashJobQueue)
        .where(
          or(
            eq(unsplashJobQueue.status, "PENDING"),
            eq(unsplashJobQueue.status, "DEFERRED"),
          ),
        ),
    ]);

    const now = new Date();
    const resetAt =
      rate && rate.windowResetAt > now
        ? rate.windowResetAt
        : new Date(Math.ceil(now.getTime() / 3_600_000) * 3_600_000);
    const effectiveRemaining =
      rate && rate.windowResetAt <= now
        ? (rate.limitQuota || 50)
        : (rate?.remainingQuota ?? 50);

    return {
      provider,
      remainingQuota: effectiveRemaining,
      limitQuota: rate?.limitQuota ?? 50,
      windowResetAt: resetAt.toISOString(),
      cachedImagesCount: Number(imgCountRes[0]?.total ?? 0),
      cachedPhotographersCount: Number(photogCountRes[0]?.total ?? 0),
      pendingJobsCount: Number(jobCountRes[0]?.total ?? 0),
    };
  }
}

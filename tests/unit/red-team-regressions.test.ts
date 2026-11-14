import { describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/domain/errors/domain-errors";
import type {
  IImageProvider,
  ISavedImageRepository,
} from "@/domain/repositories/ports";
import { normalizePgConnectionString } from "@/infrastructure/config/env";
import { ImageProviderRegistry } from "@/infrastructure/providers/picsum-provider";
import type {
  IQuotaPersistenceStore,
  RateStateRecord,
} from "@/infrastructure/providers/quota-store";
import { UnsplashImageProvider } from "@/infrastructure/providers/unsplash-provider";
import { UnsplashQuotaWorker } from "@/infrastructure/providers/unsplash-quota-worker";
import { verifyCsrfOrigin } from "@/infrastructure/security/request-guards";

describe("Red-Team Remediation Regressions", () => {
  it("upgrades legacy sslmode=require to sslmode=verify-full to prevent pg-connection-string security warnings", () => {
    const legacy =
      "postgresql://user:pass@ep-test.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
    const normalized = normalizePgConnectionString(legacy);
    expect(normalized).toContain("sslmode=verify-full");
    expect(normalized).toContain("channel_binding=require");
  });

  it("normalizes multi-hop x-forwarded-host in verifyCsrfOrigin", () => {
    const validProxiedReq = new Request("https://internal:3000/api/posts", {
      method: "POST",
      headers: {
        origin: "https://goku.frame.example",
        "x-forwarded-host": "goku.frame.example, internal-lb.local",
        host: "internal:3000",
      },
    });
    expect(() => verifyCsrfOrigin(validProxiedReq)).not.toThrow();

    const spoofedReq = new Request("https://internal:3000/api/posts", {
      method: "POST",
      headers: {
        origin: "https://evil.attacker.tld",
        "x-forwarded-host": "goku.frame.example, evil.attacker.tld",
        host: "internal:3000",
      },
    });
    expect(() => verifyCsrfOrigin(spoofedReq)).toThrow(ForbiddenError);
  });

  it("sanitizes unsafe portfolio_url schemes in UnsplashImageProvider photographer mapping", async () => {
    const fakeFetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          username: "unsafe_artist",
          name: "Unsafe Artist",
          portfolio_url: "javascript:alert(document.cookie)",
          links: { html: "https://unsplash.com/@unsafe_artist" },
          total_photos: 5,
          total_likes: 10,
          total_collections: 1,
        }),
        {
          status: 200,
          headers: { "x-ratelimit-remaining": "44", "x-ratelimit-limit": "50" },
        },
      );
    });

    const provider = new UnsplashImageProvider({
      accessKey: "dummy_key_for_unit_test",
      appName: "goku_test",
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    const res = await provider.fetchPhotographer("unsafe_artist");
    expect(res.photographer.portfolioUrl).toBeNull();
    expect(res.photographer.profileUrl).toContain("https://unsplash.com/@unsafe_artist");
  });

  it("deducts minimum remaining header (or 2 calls when headers absent) on parallel photographer detail fetch", async () => {
    let savedState: RateStateRecord = {
      provider: "unsplash",
      remainingQuota: 50,
      limitQuota: 50,
      windowResetAt: new Date(Date.now() + 3600_000),
    };

    const mockStore = {
      async getRateState() {
        return savedState;
      },
      async saveRateState(s: RateStateRecord) {
        savedState = s;
      },
      async getCachedPhotographer() {
        return null;
      },
      async getCachedPhotosByPhotographer() {
        return [];
      },
      async upsertPhotographers() {},
      async upsertCachedImages() {},
    } as unknown as IQuotaPersistenceStore;

    const primaryNoHeaders: IImageProvider = {
      providerName: "unsplash",
      fetchPage: async () => ({ items: [] }),
      fetchPhotographer: async (username) => ({
        photographer: {
          username,
          name: "Studio Zen",
          avatarUrl: null,
          profileUrl: "https://unsplash.com/@zen",
          bio: null,
          location: null,
          portfolioUrl: null,
          totalPhotos: 3,
          totalLikes: 9,
          totalCollections: 1,
        },
      }),
      fetchPhotographerPhotos: async () => ({ items: [] }),
    };

    const worker = new UnsplashQuotaWorker(
      primaryNoHeaders,
      new ImageProviderRegistry().register(primaryNoHeaders),
      mockStore,
      { findSavedExternalKeys: async () => new Map() } as unknown as ISavedImageRepository,
    );

    await worker.getPhotographerDetail({ username: "zen" });
    expect(savedState.remainingQuota).toBe(48); // Deducted 2 calls!
  });
});

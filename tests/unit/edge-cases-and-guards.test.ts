import { describe, expect, it, vi } from "vitest";
import {
  AdminDeleteUserUseCase,
  AdminManageUserUseCase,
} from "@/application/use-cases/admin-use-cases";
import {
  GetAuthenticatedUserUseCase,
  LoginUserUseCase,
} from "@/application/use-cases/auth-use-cases";
import { SaveImageUseCase } from "@/application/use-cases/image-use-cases";
import {
  RemoveAvatarUseCase,
  UpdatePhotographerModeUseCase,
} from "@/application/use-cases/profile-use-cases";
import type { SavedImage, User } from "@/domain/entities/models";
import {
  ForbiddenError,
  RateLimitError,
  UnauthorizedError,
  ValidationError,
} from "@/domain/errors/domain-errors";
import type {
  IAvatarStorageService,
  IImageFeedOrchestrator,
  IImageProvider,
  ISavedImageRepository,
  IUserRepository,
} from "@/domain/repositories/ports";
import {
  ImageProviderRegistry,
  PicsumRandomProvider,
} from "@/infrastructure/providers/picsum-provider";
import type {
  IQuotaPersistenceStore,
  QueuedJobRecord,
  RateStateRecord,
} from "@/infrastructure/providers/quota-store";
import { UnsplashQuotaWorker } from "@/infrastructure/providers/unsplash-quota-worker";
import { JoseSessionTokenService } from "@/infrastructure/security/jwt-session";
import { BcryptPasswordHasher } from "@/infrastructure/security/password-hasher";
import {
  SlidingWindowRateLimiter,
  getClientIp,
  verifyCsrfOrigin,
} from "@/infrastructure/security/request-guards";

function buildUserMemoryRepo() {
  const users = new Map<string, User>();
  const repo: IUserRepository = {
    async findById(id) {
      return users.get(id) ?? null;
    },
    async findByUsername(username) {
      for (const u of users.values()) {
        if (u.username === username.toLowerCase()) return u;
      }
      return null;
    },
    async create(input) {
      const id = `user_${users.size + 1}`;
      const u: User = {
        id,
        username: input.username,
        passwordHash: input.passwordHash,
        role: input.role ?? "USER",
        isActive: true,
        showPhotographerInfo: true,
        sessionVersion: 1,
        avatarUrl: null,
        avatarPublicId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      users.set(id, u);
      return u;
    },
    async updateUsername(userId, newUsername) {
      const u = users.get(userId)!;
      u.username = newUsername;
      return u;
    },
    async updatePassword(userId, newPasswordHash) {
      const u = users.get(userId)!;
      u.passwordHash = newPasswordHash;
      u.sessionVersion += 1;
      return u;
    },
    async updatePhotographerMode(userId, show) {
      const u = users.get(userId)!;
      u.showPhotographerInfo = show;
      return u;
    },
    async updateAvatar(userId, avatarUrl, avatarPublicId) {
      const u = users.get(userId)!;
      u.avatarUrl = avatarUrl;
      u.avatarPublicId = avatarPublicId;
      return u;
    },
    async updateAdminUserState(userId, patch) {
      const u = users.get(userId)!;
      if (patch.role !== undefined) u.role = patch.role;
      if (patch.isActive !== undefined) u.isActive = patch.isActive;
      u.sessionVersion += 1;
      return u;
    },
    async countAdmins() {
      return Array.from(users.values()).filter((u) => u.role === "ADMIN").length;
    },
    async deleteById(userId) {
      users.delete(userId);
    },
    async listAdminUserSummaries() {
      return [];
    },
  };
  return { users, repo };
}

describe("Request Security Guards (CSRF Origin & SlidingWindowRateLimiter)", () => {
  it("verifyCsrfOrigin permits safe methods and same-origin mutations while rejecting cross-origin & malformed origins", () => {
    // Safe GET with foreign origin is allowed
    const safeGet = new Request("http://localhost:3000/api/images/feed", {
      method: "GET",
      headers: {
        host: "localhost:3000",
        origin: "https://another-site.example",
      },
    });
    expect(() => verifyCsrfOrigin(safeGet)).not.toThrow();

    // Same-origin POST passes
    const sameOriginPost = new Request("http://localhost:3000/api/posts", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
      },
    });
    expect(() => verifyCsrfOrigin(sameOriginPost)).not.toThrow();

    // Same-origin behind reverse proxy (x-forwarded-host) passes
    const forwardedHostPost = new Request("http://internal:3000/api/posts", {
      method: "POST",
      headers: {
        host: "internal:3000",
        "x-forwarded-host": "goku.example.com",
        origin: "https://goku.example.com",
      },
    });
    expect(() => verifyCsrfOrigin(forwardedHostPost)).not.toThrow();

    // Cross-origin POST throws ForbiddenError
    const crossOriginPost = new Request("http://localhost:3000/api/posts", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "https://csrf-attacker.evil",
      },
    });
    expect(() => verifyCsrfOrigin(crossOriginPost)).toThrow(ForbiddenError);

    // Malformed Origin header throws ForbiddenError
    const malformedOriginPost = new Request("http://localhost:3000/api/posts", {
      method: "DELETE",
      headers: {
        host: "localhost:3000",
        origin: ":::not_a_valid_url:::",
      },
    });
    expect(() => verifyCsrfOrigin(malformedOriginPost)).toThrow(ForbiddenError);

    // Missing Origin + Sec-Fetch-Site: cross-site throws ForbiddenError
    const crossSiteNoOrigin = new Request("http://localhost:3000/api/posts", {
      method: "PATCH",
      headers: {
        host: "localhost:3000",
        "sec-fetch-site": "cross-site",
      },
    });
    expect(() => verifyCsrfOrigin(crossSiteNoOrigin)).toThrow(ForbiddenError);

    // Missing Origin + Sec-Fetch-Site: same-origin passes
    const sameSiteNoOrigin = new Request("http://localhost:3000/api/posts", {
      method: "PATCH",
      headers: {
        host: "localhost:3000",
        "sec-fetch-site": "same-origin",
      },
    });
    expect(() => verifyCsrfOrigin(sameSiteNoOrigin)).not.toThrow();
  });

  it("SlidingWindowRateLimiter enforces 429 RateLimitError with Retry-After and resets after window expires", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      const limiter = new SlidingWindowRateLimiter(3, 10_000);

      limiter.consume("ip:1.2.3.4");
      limiter.consume("ip:1.2.3.4");
      limiter.consume("ip:1.2.3.4");

      let caught: unknown;
      try {
        limiter.consume("ip:1.2.3.4");
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(RateLimitError);
      const rateErr = caught as RateLimitError;
      expect(rateErr.statusCode).toBe(429);
      expect(rateErr.retryAfterSeconds).toBeGreaterThanOrEqual(1);

      // Independent key is unaffected
      expect(() => limiter.consume("ip:9.9.9.9")).not.toThrow();

      // Advance past 10s window -> bucket recovers cleanly
      vi.advanceTimersByTime(10_500);
      expect(() => limiter.consume("ip:1.2.3.4")).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });

  it("getClientIp extracts first X-Forwarded-For hop or falls back safely", () => {
    const req1 = new Request("http://localhost:3000", {
      headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
    });
    expect(getClientIp(req1)).toBe("203.0.113.7");

    const req2 = new Request("http://localhost:3000", {
      headers: { "x-real-ip": "198.51.100.42" },
    });
    expect(getClientIp(req2)).toBe("198.51.100.42");

    const req3 = new Request("http://localhost:3000");
    expect(getClientIp(req3)).toBe("local");
  });
});

describe("PicsumRandomProvider & Quota Worker Deferred Queue Drain", () => {
  it("PicsumRandomProvider normalizes items, slugs photographer usernames, and handles HTTP failure gracefully", async () => {
    const okFetch = vi.fn(async () => {
      return new Response(
        JSON.stringify([
          {
            id: "102",
            author: "Alejandro Escamilla!",
            width: 4320,
            height: 3240,
            url: "https://unsplash.com/photos/pJILiyPdrXI",
            download_url: "https://picsum.photos/id/102/4320/3240",
          },
        ]),
        { status: 200 },
      );
    });

    const provider = new PicsumRandomProvider(okFetch as unknown as typeof fetch);
    const result = await provider.fetchPage({
      page: 1,
      perPage: 15,
      query: "zen garden",
    });

    expect(result.items).toHaveLength(1);
    const first = result.items[0]!;
    expect(first.provider).toBe("picsum");
    expect(first.externalId).toBe("102");
    expect(first.downloadLocation).toBeNull();
    expect(first.description).toContain("zen garden");
    expect(first.photographer?.username).toBe("alejandro_escamilla");
    expect(first.photographer?.name).toBe("Alejandro Escamilla!");

    // Upstream 503 returns empty items instead of throwing
    const failProvider = new PicsumRandomProvider(
      (async () => new Response("Service Unavailable", { status: 503 })) as unknown as typeof fetch,
    );
    const emptyRes = await failProvider.fetchPage({ page: 1, perPage: 10 });
    expect(emptyRes.items).toEqual([]);
  });

  it("SaveImageUseCase is idempotent on duplicate saves and QuotaWorker drains TRIGGER_DOWNLOAD when quota > reserve", async () => {
    const savedById = new Map<string, SavedImage>();
    const savedRepo = {
      async findByUserAndExternal(
        userId: string,
        provider: string,
        externalId: string,
      ) {
        for (const s of savedById.values()) {
          if (
            s.userId === userId &&
            s.provider === provider &&
            s.externalId === externalId
          ) {
            return s;
          }
        }
        return null;
      },
      async create(input: Omit<SavedImage, "id" | "createdAt">) {
        const s: SavedImage = {
          ...input,
          id: `saved_${savedById.size + 1}`,
          createdAt: new Date(),
        };
        savedById.set(s.id, s);
        return s;
      },
      async findSavedExternalKeys() {
        return new Map<string, string>();
      },
    } as unknown as ISavedImageRepository;

    const triggerDownloadSpy = vi.fn(async () => ({
      ok: true,
      rateLimitRemaining: 40,
    }));

    const primary: IImageProvider = {
      providerName: "unsplash",
      fetchPage: async () => ({ items: [] }),
      triggerDownloadEvent: triggerDownloadSpy,
    };

    let rateState: RateStateRecord = {
      provider: "unsplash",
      remainingQuota: 45, // Above DOWNLOAD_RESERVE_THRESHOLD (12)
      limitQuota: 50,
      windowResetAt: new Date(Date.now() + 3600_000),
    };
    const jobs: Array<QueuedJobRecord & { status: string; nextRunAt: Date }> = [];

    const store: IQuotaPersistenceStore = {
      async getRateState() {
        return rateState;
      },
      async saveRateState(next) {
        rateState = next;
      },
      async upsertCachedImages() {},
      async upsertPhotographers() {},
      async queryCachedImages() {
        return [];
      },
      async getCachedPhotographer() {
        return null;
      },
      async getCachedPhotosByPhotographer() {
        return [];
      },
      async enqueueJob(jobType, payload, nextRunAt = new Date()) {
        jobs.push({
          id: `j_${jobs.length + 1}`,
          jobType,
          payload,
          attempts: 0,
          status: "PENDING",
          nextRunAt,
        });
      },
      async claimDueJobs(limit) {
        const due = jobs.filter((j) => j.status === "PENDING").slice(0, limit);
        for (const d of due) d.status = "PROCESSING";
        return due;
      },
      async completeJob(id) {
        const f = jobs.find((j) => j.id === id);
        if (f) f.status = "DONE";
      },
      async deferJob(id, nextRunAt, attempts) {
        const f = jobs.find((j) => j.id === id);
        if (f) {
          f.status = "DEFERRED";
          f.nextRunAt = nextRunAt;
          f.attempts = attempts;
        }
      },
      async getHealthCounts(provider) {
        return {
          provider,
          remainingQuota: rateState.remainingQuota,
          limitQuota: rateState.limitQuota,
          windowResetAt: rateState.windowResetAt.toISOString(),
          cachedImagesCount: 0,
          cachedPhotographersCount: 0,
          pendingJobsCount: jobs.filter((j) => j.status !== "DONE").length,
        };
      },
    };

    const worker: IImageFeedOrchestrator & UnsplashQuotaWorker =
      new UnsplashQuotaWorker(
        primary,
        new ImageProviderRegistry().register(primary),
        store,
        savedRepo,
      );

    const saveImage = new SaveImageUseCase(savedRepo, worker);

    const firstSave = await saveImage.execute({
      userId: "u_1",
      provider: "unsplash",
      externalId: "unsp_99",
      imageUrl: "https://images.unsplash.com/photo-99",
      thumbUrl: "https://images.unsplash.com/photo-99?w=400",
      width: 1200,
      height: 1600,
      downloadLocation: "https://api.unsplash.com/photos/unsp_99/download",
    });
    expect(firstSave.alreadySaved).toBe(false);

    // Wait briefly for non-blocking background drain
    await new Promise((r) => setTimeout(r, 30));
    expect(triggerDownloadSpy).toHaveBeenCalledTimes(1);
    expect(jobs[0]?.status).toBe("DONE");

    // Duplicate save returns alreadySaved=true and does NOT enqueue a second download job
    const duplicateSave = await saveImage.execute({
      userId: "u_1",
      provider: "unsplash",
      externalId: "unsp_99",
      imageUrl: "https://images.unsplash.com/photo-99",
      thumbUrl: "https://images.unsplash.com/photo-99?w=400",
      width: 1200,
      height: 1600,
      downloadLocation: "https://api.unsplash.com/photos/unsp_99/download",
    });
    expect(duplicateSave.alreadySaved).toBe(true);
    expect(duplicateSave.savedImage.id).toBe(firstSave.savedImage.id);
    expect(jobs).toHaveLength(1);
  });
});

describe("Admin Last-Admin Protection, Locked-User Revocation & Profile Controls", () => {
  it("prevents demoting, locking, or deleting the sole ADMIN while permitting actions when multiple ADMINs exist", async () => {
    const { repo } = buildUserMemoryRepo();
    const avatarStorage: IAvatarStorageService = {
      uploadUserAvatar: vi.fn(),
      deleteUserAvatar: vi.fn(),
    };

    const soleAdmin = await repo.create({
      username: "sole_admin",
      passwordHash: "h",
      role: "ADMIN",
    });

    const manageUser = new AdminManageUserUseCase(repo);
    const deleteUser = new AdminDeleteUserUseCase(repo, avatarStorage);

    // Cannot self-lock
    await expect(
      manageUser.execute({
        actor: soleAdmin,
        targetUserId: soleAdmin.id,
        isActive: false,
      }),
    ).rejects.toThrow(ValidationError);

    // Cannot demote the sole admin
    await expect(
      manageUser.execute({
        actor: soleAdmin,
        targetUserId: soleAdmin.id,
        role: "USER",
      }),
    ).rejects.toThrow(ValidationError);

    // Cannot self-delete
    await expect(
      deleteUser.execute({
        actor: soleAdmin,
        targetUserId: soleAdmin.id,
      }),
    ).rejects.toThrow(ValidationError);

    // Add a second admin -> now demoting or deleting one admin is allowed
    const secondAdmin = await repo.create({
      username: "backup_admin",
      passwordHash: "h",
      role: "ADMIN",
    });
    expect(await repo.countAdmins()).toBe(2);

    await manageUser.execute({
      actor: soleAdmin,
      targetUserId: secondAdmin.id,
      role: "USER",
    });
    expect((await repo.findById(secondAdmin.id))?.role).toBe("USER");
    expect(await repo.countAdmins()).toBe(1);
  });

  it("immediately rejects locked users (isActive=false) on both JWT session verification and login", async () => {
    const { repo } = buildUserMemoryRepo();
    const hasher = new BcryptPasswordHasher();
    const tokenService = new JoseSessionTokenService(
      "test_jwt_secret_for_locked_user_check_123456",
    );

    const passwordHash = await hasher.hash("ValidPass123!");
    const member = await repo.create({
      username: "locked_candidate",
      passwordHash,
      role: "USER",
    });

    const login = new LoginUserUseCase(repo, hasher, tokenService);
    const getAuth = new GetAuthenticatedUserUseCase(repo, tokenService);

    // Wrong password -> 401 UnauthorizedError
    await expect(
      login.execute({ username: "locked_candidate", password: "WrongPassword!" }),
    ).rejects.toThrow(UnauthorizedError);

    // Unknown user -> 401 UnauthorizedError
    await expect(
      login.execute({ username: "ghost_user", password: "ValidPass123!" }),
    ).rejects.toThrow(UnauthorizedError);

    // Valid login succeeds initially
    const { token } = await login.execute({
      username: "locked_candidate",
      password: "ValidPass123!",
    });
    expect((await getAuth.execute(token))?.id).toBe(member.id);

    // Admin locks account -> existing JWT immediately returns null & login throws ForbiddenError
    await repo.updateAdminUserState(member.id, { isActive: false });
    expect(await getAuth.execute(token)).toBeNull();
    await expect(
      login.execute({ username: "locked_candidate", password: "ValidPass123!" }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("toggles Photographer Mode cleanly and destroys Cloudinary slot when user removes avatar", async () => {
    const { repo } = buildUserMemoryRepo();
    const deleteSpy = vi.fn(async () => undefined);
    const avatarStorage: IAvatarStorageService = {
      uploadUserAvatar: vi.fn(),
      deleteUserAvatar: deleteSpy,
    };

    const user = await repo.create({
      username: "minimalist_viewer",
      passwordHash: "secret_hash",
      role: "USER",
    });
    await repo.updateAvatar(
      user.id,
      "https://res.cloudinary.com/demo/image/upload/goku_avatars/user_1.webp",
      "goku_avatars/user_1",
    );

    const togglePhotog = new UpdatePhotographerModeUseCase(repo);
    const hidden = await togglePhotog.execute({
      userId: user.id,
      showPhotographerInfo: false,
    });
    expect(hidden.showPhotographerInfo).toBe(false);
    expect("passwordHash" in hidden).toBe(false);

    const shown = await togglePhotog.execute({
      userId: user.id,
      showPhotographerInfo: true,
    });
    expect(shown.showPhotographerInfo).toBe(true);

    const removeAvatar = new RemoveAvatarUseCase(repo, avatarStorage);
    const cleared = await removeAvatar.execute(user.id);
    expect(deleteSpy).toHaveBeenCalledWith("goku_avatars/user_1");
    expect(cleared.avatarUrl).toBeNull();
  });
});

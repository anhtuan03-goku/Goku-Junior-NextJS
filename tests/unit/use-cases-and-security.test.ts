import { describe, expect, it, vi } from "vitest";
import {
  AdminDeleteUserUseCase,
  AdminListLikeAuditLogsUseCase,
} from "@/application/use-cases/admin-use-cases";
import {
  GetAuthenticatedUserUseCase,
  LoginUserUseCase,
  RegisterUserUseCase,
} from "@/application/use-cases/auth-use-cases";
import {
  CreatePostUseCase,
  TogglePostLikeUseCase,
  UpdatePostUseCase,
} from "@/application/use-cases/post-use-cases";
import {
  ChangePasswordUseCase,
  UpdateAvatarUseCase,
} from "@/application/use-cases/profile-use-cases";
import type {
  LikeAuditEntry,
  Post,
  PostViewItem,
  SavedImage,
  User,
} from "@/domain/entities/models";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/domain/errors/domain-errors";
import type {
  IPostRepository,
  ISavedImageRepository,
  IUserRepository,
} from "@/domain/repositories/ports";
import { JoseSessionTokenService } from "@/infrastructure/security/jwt-session";
import { BcryptPasswordHasher } from "@/infrastructure/security/password-hasher";
import {
  CloudinarySingleSlotStorage,
  detectSafeImageMime,
} from "@/infrastructure/storage/cloudinary-avatar-storage";

function createInMemoryRepos() {
  const users = new Map<string, User>();
  const savedImages = new Map<string, SavedImage>();
  const posts = new Map<string, Post>();
  const postLikes = new Set<string>();
  const auditLogs: LikeAuditEntry[] = [];

  const userRepo: IUserRepository = {
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
      const id = `u_${users.size + 1}`;
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
      if (patch.role) u.role = patch.role;
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

  const savedImageRepo = {
    async findById(id: string) {
      return savedImages.get(id) ?? null;
    },
  } as unknown as ISavedImageRepository;

  const toView = (p: Post, viewerId?: string | null): PostViewItem => {
    const author = users.get(p.authorId)!;
    const img = savedImages.get(p.savedImageId)!;
    return {
      id: p.id,
      savedImageId: p.savedImageId,
      content: p.content,
      visibility: p.visibility,
      likesCount: p.likesCount,
      likedByMe: viewerId ? postLikes.has(`${p.id}:${viewerId}`) : false,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      author: { id: author.id, username: author.username, avatarUrl: author.avatarUrl },
      image: {
        id: img.id,
        provider: img.provider,
        externalId: img.externalId,
        imageUrl: img.imageUrl,
        thumbUrl: img.thumbUrl,
        color: img.color,
        width: img.width,
        height: img.height,
        description: img.description,
        photographerUsername: img.photographerUsername,
        photographerName: img.photographerName,
        photographerAvatar: img.photographerAvatar,
        photographerUrl: img.photographerUrl,
      },
    };
  };

  const postRepo = {
    async findById(id: string) {
      return posts.get(id) ?? null;
    },
    async create(input: {
      savedImageId: string;
      authorId: string;
      content: string;
      visibility: "PRIVATE" | "PUBLIC";
    }) {
      const p: Post = {
        id: `p_${posts.size + 1}`,
        savedImageId: input.savedImageId,
        authorId: input.authorId,
        content: input.content,
        visibility: input.visibility,
        likesCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      posts.set(p.id, p);
      return toView(p, input.authorId);
    },
    async update(
      postId: string,
      patch: { content?: string; visibility?: "PRIVATE" | "PUBLIC" },
      viewerId: string,
    ) {
      const p = posts.get(postId)!;
      if (patch.content !== undefined) p.content = patch.content;
      if (patch.visibility !== undefined) p.visibility = patch.visibility;
      return toView(p, viewerId);
    },
    async toggleLike({ postId, userId }: { postId: string; userId: string }) {
      const p = posts.get(postId)!;
      const actor = users.get(userId)!;
      const author = users.get(p.authorId)!;
      const key = `${postId}:${userId}`;
      if (postLikes.has(key)) {
        postLikes.delete(key);
        p.likesCount = Math.max(0, p.likesCount - 1);
        auditLogs.unshift({
          id: `log_${auditLogs.length + 1}`,
          postId,
          postExcerpt: p.content,
          postVisibility: p.visibility,
          postAuthorUsername: author.username,
          actorUserId: actor.id,
          actorUsername: actor.username,
          action: "UNLIKE",
          createdAt: new Date().toISOString(),
        });
        return { likesCount: p.likesCount, likedByMe: false };
      }
      postLikes.add(key);
      p.likesCount += 1;
      auditLogs.unshift({
        id: `log_${auditLogs.length + 1}`,
        postId,
        postExcerpt: p.content,
        postVisibility: p.visibility,
        postAuthorUsername: author.username,
        actorUserId: actor.id,
        actorUsername: actor.username,
        action: "LIKE",
        createdAt: new Date().toISOString(),
      });
      return { likesCount: p.likesCount, likedByMe: true };
    },
    async listLikeAuditLogs() {
      return auditLogs;
    },
  } as unknown as IPostRepository;

  return { users, savedImages, posts, userRepo, savedImageRepo, postRepo };
}

describe("Business Logic, Anonymity, Multi-Post & Security Controls", () => {
  const tokenService = new JoseSessionTokenService(
    "unit_test_secret_at_least_32_chars_long_9999",
  );
  const hasher = new BcryptPasswordHasher();

  it("enforces Zero-PII auth, unique username, and instant JWT revocation on password change", async () => {
    const { userRepo } = createInMemoryRepos();
    const register = new RegisterUserUseCase(userRepo, hasher, tokenService);
    const login = new LoginUserUseCase(userRepo, hasher, tokenService);
    const getAuth = new GetAuthenticatedUserUseCase(userRepo, tokenService);
    const changePwd = new ChangePasswordUseCase(userRepo, hasher, tokenService);

    const { user, token: oldToken } = await register.execute({
      username: "Goku_User",
      password: "Password123!",
    });

    expect(user.username).toBe("goku_user");
    expect(user.role).toBe("USER");
    expect("passwordHash" in user).toBe(false);

    await expect(
      register.execute({ username: "goku_user", password: "AnotherPassword1!" }),
    ).rejects.toThrow(ConflictError);

    expect((await getAuth.execute(oldToken))?.id).toBe(user.id);

    // Changing password increments sessionVersion -> old JWT immediately revoked!
    const { token: newToken } = await changePwd.execute({
      userId: user.id,
      currentPassword: "Password123!",
      newPassword: "NewSecurePassword99!",
    });

    expect(await getAuth.execute(oldToken)).toBeNull();
    expect((await getAuth.execute(newToken))?.id).toBe(user.id);

    const relogin = await login.execute({
      username: "goku_user",
      password: "NewSecurePassword99!",
    });
    expect(relogin.user.id).toBe(user.id);
  });

  it("supports 1-to-Many posts per saved image, Private <-> Public switching, IDOR defense, and strict Like Anonymity", async () => {
    const { users, savedImages, userRepo, savedImageRepo, postRepo } =
      createInMemoryRepos();
    const alice = await userRepo.create({
      username: "alice",
      passwordHash: "h1",
      role: "USER",
    });
    const bob = await userRepo.create({
      username: "bob",
      passwordHash: "h2",
      role: "USER",
    });
    const admin = await userRepo.create({
      username: "root_admin",
      passwordHash: "h3",
      role: "ADMIN",
    });
    void users;

    const savedImg: SavedImage = {
      id: "img_1",
      userId: alice.id,
      provider: "unsplash",
      externalId: "ext_1",
      imageUrl: "https://images.unsplash.com/photo-1",
      thumbUrl: "https://images.unsplash.com/photo-1?w=400",
      color: "#111111",
      width: 1000,
      height: 1200,
      description: "Silent fog",
      photographerUsername: "zen",
      photographerName: "Zen",
      photographerAvatar: null,
      photographerUrl: null,
      downloadLocation: null,
      createdAt: new Date(),
    };
    savedImages.set(savedImg.id, savedImg);

    const createPost = new CreatePostUseCase(savedImageRepo, postRepo);
    const updatePost = new UpdatePostUseCase(postRepo);
    const toggleLike = new TogglePostLikeUseCase(postRepo);
    const adminListLikes = new AdminListLikeAuditLogsUseCase(postRepo);

    // 1-to-Many: Alice creates TWO distinct posts on the same saved image
    const post1 = await createPost.execute({
      authorId: alice.id,
      savedImageId: savedImg.id,
      content: "Bài viết riêng tư số 1",
      visibility: "PRIVATE",
    });
    const post2 = await createPost.execute({
      authorId: alice.id,
      savedImageId: savedImg.id,
      content: "Bài viết công khai số 2 trên cùng bức ảnh",
      visibility: "PUBLIC",
    });
    expect(post1.id).not.toBe(post2.id);

    // IDOR block: Bob cannot write a post on Alice's saved image
    await expect(
      createPost.execute({
        authorId: bob.id,
        savedImageId: savedImg.id,
        content: "IDOR attempt",
        visibility: "PUBLIC",
      }),
    ).rejects.toThrow(ForbiddenError);

    // IDOR block: Bob cannot like Alice's PRIVATE post
    await expect(
      toggleLike.execute({ postId: post1.id, userId: bob.id }),
    ).rejects.toThrow(NotFoundError);

    // Alice toggles post1 from PRIVATE -> PUBLIC
    const toggledPublic = await updatePost.execute({
      userId: alice.id,
      postId: post1.id,
      visibility: "PUBLIC",
    });
    expect(toggledPublic.visibility).toBe("PUBLIC");

    // Bob likes post1 -> response ONLY has likesCount & likedByMe (Zero liker leak!)
    const likeRes = await toggleLike.execute({
      postId: post1.id,
      userId: bob.id,
    });
    expect(Object.keys(likeRes).sort()).toEqual(["likedByMe", "likesCount"]);
    expect(likeRes).toEqual({ likesCount: 1, likedByMe: true });

    // Non-admin user (even post author Alice!) CANNOT read like audit logs
    await expect(adminListLikes.execute(alice)).rejects.toThrow(ForbiddenError);

    // Admin CAN inspect who liked which post
    const logs = await adminListLikes.execute(admin);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.actorUsername).toBe("bob");
    expect(logs[0]?.action).toBe("LIKE");
  });

  it("blocks disguised SVG XSS uploads via magic bytes and enforces 1-slot Cloudinary cleanup on update & user delete", async () => {
    // Disguised SVG with XSS payload
    const fakeSvgAsWebp = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>',
      "utf8",
    );
    expect(() => detectSafeImageMime(fakeSvgAsWebp)).toThrow(ValidationError);

    // Valid minimal WebP RIFF....WEBP header
    const validWebpBuffer = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      0x56, 0x50, 0x38, 0x20,
    ]);
    expect(detectSafeImageMime(validWebpBuffer)).toBe("image/webp");

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/image/destroy")) {
        return new Response(JSON.stringify({ result: "ok" }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          secure_url: "https://res.cloudinary.com/y34parpj/image/upload/v1/goku_avatars/user_u_1.webp",
          public_id: "goku_avatars/user_u_1",
        }),
        { status: 200 },
      );
    });

    const storage = new CloudinarySingleSlotStorage(
      {
        cloudName: "y34parpj",
        apiKey: "test_key",
        apiSecret: "test_secret",
      },
      fetchMock as unknown as typeof fetch,
    );

    const { userRepo } = createInMemoryRepos();
    const admin = await userRepo.create({
      username: "admin1",
      passwordHash: "h",
      role: "ADMIN",
    });
    const member = await userRepo.create({
      username: "member1",
      passwordHash: "h",
      role: "USER",
    });
    await userRepo.updateAvatar(
      member.id,
      "https://res.cloudinary.com/y34parpj/old.webp",
      "legacy_slot_123",
    );

    const updateAvatar = new UpdateAvatarUseCase(userRepo, storage);
    await updateAvatar.execute({
      userId: member.id,
      fileBuffer: validWebpBuffer,
      mimeType: "image/webp",
    });

    // Called destroy on old slot FIRST, then upload to deterministic single slot!
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/image/destroy");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/image/upload");

    // Admin deleting user also destroys their 1 Cloudinary slot!
    const adminDelete = new AdminDeleteUserUseCase(userRepo, storage);
    await adminDelete.execute({
      actor: admin,
      targetUserId: member.id,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain("/image/destroy");
  });
});

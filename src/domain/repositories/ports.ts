import type {
  AdminUserSummary,
  ExternalImageItem,
  LikeAuditEntry,
  PhotographerDetail,
  PhotographerSummary,
  PlatformStats,
  Post,
  PostViewItem,
  PostVisibility,
  QuotaHealthSummary,
  SavedImage,
  SavedImageWithPosts,
  SpaceFeedResponseDTO,
  User,
  UserRole,
} from "../entities/models";

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  create(input: {
    username: string;
    passwordHash: string;
    role?: UserRole;
  }): Promise<User>;
  updateUsername(userId: string, newUsername: string): Promise<User>;
  updatePassword(userId: string, newPasswordHash: string): Promise<User>;
  updatePhotographerMode(
    userId: string,
    showPhotographerInfo: boolean,
  ): Promise<User>;
  updateAvatar(
    userId: string,
    avatarUrl: string | null,
    avatarPublicId: string | null,
  ): Promise<User>;
  updateAdminUserState(
    userId: string,
    patch: { role?: UserRole; isActive?: boolean },
  ): Promise<User>;
  countAdmins(): Promise<number>;
  deleteById(userId: string): Promise<void>;
  listAdminUserSummaries(search?: string): Promise<AdminUserSummary[]>;
}

export interface ISavedImageRepository {
  findById(id: string): Promise<SavedImage | null>;
  findByUserAndExternal(
    userId: string,
    provider: string,
    externalId: string,
  ): Promise<SavedImage | null>;
  findSavedExternalKeys(
    userId: string,
    keys: Array<{ provider: string; externalId: string }>,
  ): Promise<Map<string, string>>;
  create(input: Omit<SavedImage, "id" | "createdAt">): Promise<SavedImage>;
  deleteByIdAndUser(id: string, userId: string): Promise<boolean>;
  listByUserWithPosts(userId: string): Promise<SavedImageWithPosts[]>;
}

export interface IPostRepository {
  findById(id: string): Promise<Post | null>;
  findViewById(
    id: string,
    viewerUserId?: string | null,
  ): Promise<PostViewItem | null>;
  create(input: {
    savedImageId: string;
    authorId: string;
    content: string;
    visibility: PostVisibility;
  }): Promise<PostViewItem>;
  update(
    postId: string,
    patch: { content?: string; visibility?: PostVisibility },
    viewerUserId: string,
  ): Promise<PostViewItem>;
  deleteById(postId: string): Promise<void>;
  listPublicFeed(params: {
    page: number;
    limit: number;
    seed?: number;
    after?: string;
    viewerUserId?: string | null;
  }): Promise<{ items: PostViewItem[]; hasMore: boolean }>;
  toggleLike(params: {
    postId: string;
    userId: string;
  }): Promise<{ likesCount: number; likedByMe: boolean }>;
  listLikeAuditLogs(limit?: number): Promise<LikeAuditEntry[]>;
  getPlatformStats(): Promise<Omit<PlatformStats, "quota">>;
}

export interface ProviderFetchResult {
  items: ExternalImageItem[];
  rateLimitRemaining?: number;
  rateLimitLimit?: number;
}

export interface IImageProvider {
  readonly providerName: string;
  fetchPage(params: {
    page: number;
    perPage: number;
    query?: string;
  }): Promise<ProviderFetchResult>;
  fetchRandomBatch?(perPage: number): Promise<ProviderFetchResult>;
  fetchPhotographer?(username: string): Promise<{
    photographer: PhotographerSummary;
    rateLimitRemaining?: number;
    rateLimitLimit?: number;
  }>;
  fetchPhotographerPhotos?(
    username: string,
    perPage: number,
  ): Promise<ProviderFetchResult>;
  triggerDownloadEvent?(downloadLocation: string): Promise<{
    ok: boolean;
    rateLimitRemaining?: number;
  }>;
}

export interface FeedResponseDTO {
  items: Array<ExternalImageItem & { savedByMe: boolean; savedImageId: string | null }>;
  page: number;
  hasMore: boolean;
  source: "live" | "cache_pool" | "hybrid_fallback";
}

export interface NasaSpaceQuery {
  page: number;
  perPage: number;
  query?: string;
  yearStart?: number;
  yearEnd?: number;
}

export interface NasaSpaceProviderResult {
  items: ExternalImageItem[];
  hasMore: boolean;
}

/**
 * Isolated NASA Space imagery port.
 * Completely independent of Unsplash, Pixabay, Picsum, and multi-provider fallback pools.
 */
export interface INasaSpaceProvider {
  readonly providerName: "nasa";
  fetchSpacePage(params: NasaSpaceQuery): Promise<NasaSpaceProviderResult>;
}

export type { SpaceFeedResponseDTO };

export interface IImageFeedOrchestrator {
  getInfiniteFeed(params: {
    page: number;
    query?: string;
    provider?: string;
    seed?: number;
    seenKeys?: readonly string[];
    viewerUserId?: string | null;
  }): Promise<FeedResponseDTO>;
  getPhotographerDetail(params: {
    username: string;
    viewerUserId?: string | null;
  }): Promise<
    Omit<PhotographerDetail, "photos"> & {
      photos: Array<
        ExternalImageItem & { savedByMe: boolean; savedImageId: string | null }
      >;
    }
  >;
  enqueueDownloadTrigger(params: {
    provider: string;
    externalId: string;
    downloadLocation: string | null;
  }): Promise<void>;
  resolvePermanentImageUrls?(params: {
    provider: string;
    externalId: string;
    imageUrl: string;
    thumbUrl: string;
  }): Promise<{ imageUrl: string; thumbUrl: string }>;
  getQuotaHealth(): Promise<QuotaHealthSummary>;
}

export interface IAvatarStorageService {
  uploadUserAvatar(params: {
    userId: string;
    fileBuffer: Buffer;
    mimeType: string;
    previousPublicId: string | null;
  }): Promise<{ avatarUrl: string; avatarPublicId: string }>;
  deleteUserAvatar(publicId: string | null): Promise<void>;
}

export interface IPasswordHasher {
  hash(plainPassword: string): Promise<string>;
  verify(plainPassword: string, passwordHash: string): Promise<boolean>;
}

export interface SessionPayload {
  sub: string;
  username: string;
  role: UserRole;
  sv: number; // sessionVersion
}

export interface ISessionTokenService {
  sign(payload: SessionPayload): Promise<string>;
  verify(token: string): Promise<SessionPayload | null>;
}

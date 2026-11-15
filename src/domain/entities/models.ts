export type UserRole = "USER" | "ADMIN";
export type PostVisibility = "PRIVATE" | "PUBLIC";
export type LikeAction = "LIKE" | "UNLIKE";

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
  showPhotographerInfo: boolean;
  sessionVersion: number;
  avatarUrl: string | null;
  avatarPublicId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SafeUserDTO {
  id: string;
  username: string;
  role: UserRole;
  isActive: boolean;
  showPhotographerInfo: boolean;
  avatarUrl: string | null;
  createdAt: string;
}

export interface PhotographerSummary {
  username: string;
  name: string;
  avatarUrl: string | null;
  profileUrl: string | null;
  bio: string | null;
  location: string | null;
  portfolioUrl: string | null;
  totalPhotos: number;
  totalLikes: number;
  totalCollections: number;
}

export interface ExternalImageItem {
  provider: string;
  externalId: string;
  imageUrl: string;
  thumbUrl: string;
  width: number;
  height: number;
  color: string | null;
  description: string | null;
  downloadLocation: string | null;
  photographer: PhotographerSummary | null;
}

export interface PhotographerDetail extends PhotographerSummary {
  provider: string;
  fullFetched: boolean;
  isFallbackCache: boolean;
  updatedAt: string;
  photos: ExternalImageItem[];
}

export interface SavedImage {
  id: string;
  userId: string;
  provider: string;
  externalId: string;
  imageUrl: string;
  thumbUrl: string;
  color: string | null;
  width: number;
  height: number;
  description: string | null;
  photographerUsername: string | null;
  photographerName: string | null;
  photographerAvatar: string | null;
  photographerUrl: string | null;
  downloadLocation: string | null;
  createdAt: Date;
}

export interface Post {
  id: string;
  savedImageId: string;
  authorId: string;
  content: string;
  visibility: PostVisibility;
  likesCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Strictly privacy-preserving Post DTO for regular users & authors.
 * NEVER includes who liked the post (no liker userIds or usernames).
 */
export interface PostViewItem {
  id: string;
  savedImageId: string;
  content: string;
  visibility: PostVisibility;
  likesCount: number;
  likedByMe: boolean;
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    username: string;
    avatarUrl: string | null;
  };
  image: {
    id: string;
    provider: string;
    externalId: string;
    imageUrl: string;
    thumbUrl: string;
    color: string | null;
    width: number;
    height: number;
    description: string | null;
    photographerUsername: string | null;
    photographerName: string | null;
    photographerAvatar: string | null;
    photographerUrl: string | null;
  };
}

export interface SavedImageWithPosts extends SavedImage {
  posts: PostViewItem[];
}

export interface LikeAuditEntry {
  id: string;
  postId: string;
  postExcerpt: string;
  postVisibility: PostVisibility;
  postAuthorUsername: string;
  actorUserId: string;
  actorUsername: string;
  action: LikeAction;
  createdAt: string;
}

export interface QuotaHealthSummary {
  provider: string;
  remainingQuota: number;
  limitQuota: number;
  windowResetAt: string;
  cachedImagesCount: number;
  cachedPhotographersCount: number;
  pendingJobsCount: number;
  secondaryProvider?: {
    provider: string;
    enabled: boolean;
    configured: boolean;
    remainingQuota: number;
    limitQuota: number;
    windowResetSeconds: number;
    cacheTtlHours: number;
  };
  tertiaryProvider?: {
    provider: string;
    enabled: boolean;
  };
}

export interface AdminUserSummary {
  id: string;
  username: string;
  avatarUrl: string | null;
  role: UserRole;
  isActive: boolean;
  savedCount: number;
  postCount: number;
  publicPostCount: number;
  privatePostCount: number;
  createdAt: string;
}

export interface PlatformStats {
  totalUsers: number;
  activeUsers: number;
  lockedUsers: number;
  totalSavedImages: number;
  totalPosts: number;
  publicPosts: number;
  privatePosts: number;
  totalLikes: number;
  dailyActivity: Array<{
    date: string;
    savedCount: number;
    postCount: number;
  }>;
  quota: QuotaHealthSummary;
}

export interface SpaceFeedResponseDTO {
  items: Array<
    ExternalImageItem & { savedByMe: boolean; savedImageId: string | null }
  >;
  page: number;
  hasMore: boolean;
}

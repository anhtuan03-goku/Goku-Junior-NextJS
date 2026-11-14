import type {
  PostViewItem,
  PostVisibility,
  UserRole,
} from "@/domain/entities/models";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/domain/errors/domain-errors";
import type {
  IPostRepository,
  ISavedImageRepository,
} from "@/domain/repositories/ports";

function validatePostContent(raw: string): string {
  const cleaned = raw.trim();
  if (cleaned.length < 1 || cleaned.length > 2000) {
    throw new ValidationError("Nội dung bài viết phải từ 1 đến 2000 ký tự.");
  }
  return cleaned;
}

function validateVisibility(v: string): PostVisibility {
  if (v !== "PRIVATE" && v !== "PUBLIC") {
    throw new ValidationError("Chế độ bài viết chỉ chấp nhận PRIVATE hoặc PUBLIC.");
  }
  return v;
}

export class CreatePostUseCase {
  constructor(
    private readonly savedImageRepo: ISavedImageRepository,
    private readonly postRepo: IPostRepository,
  ) {}

  /**
   * Supports 1-to-Many: an owner can write multiple independent posts
   * on the exact same saved image.
   */
  async execute(input: {
    authorId: string;
    savedImageId: string;
    content: string;
    visibility: PostVisibility;
  }): Promise<PostViewItem> {
    const savedImage = await this.savedImageRepo.findById(input.savedImageId);
    if (!savedImage) {
      throw new NotFoundError("Không tìm thấy hình ảnh đã lưu.");
    }
    if (savedImage.userId !== input.authorId) {
      throw new ForbiddenError("Bạn chỉ có thể viết bài cho hình ảnh do chính mình lưu.");
    }

    const content = validatePostContent(input.content);
    const visibility = validateVisibility(input.visibility);

    return this.postRepo.create({
      savedImageId: savedImage.id,
      authorId: input.authorId,
      content,
      visibility,
    });
  }
}

export class UpdatePostUseCase {
  constructor(private readonly postRepo: IPostRepository) {}

  async execute(input: {
    userId: string;
    postId: string;
    content?: string;
    visibility?: PostVisibility;
  }): Promise<PostViewItem> {
    const existing = await this.postRepo.findById(input.postId);
    if (!existing) {
      throw new NotFoundError("Không tìm thấy bài viết.");
    }
    if (existing.authorId !== input.userId) {
      throw new ForbiddenError("Bạn không có quyền chỉnh sửa bài viết này.");
    }

    const patch: { content?: string; visibility?: PostVisibility } = {};
    if (input.content !== undefined) {
      patch.content = validatePostContent(input.content);
    }
    if (input.visibility !== undefined) {
      patch.visibility = validateVisibility(input.visibility);
    }
    if (patch.content === undefined && patch.visibility === undefined) {
      throw new ValidationError("Không có dữ liệu thay đổi để cập nhật.");
    }

    return this.postRepo.update(existing.id, patch, input.userId);
  }
}

export class DeletePostUseCase {
  constructor(private readonly postRepo: IPostRepository) {}

  async execute(input: {
    actorId: string;
    actorRole: UserRole;
    postId: string;
  }): Promise<void> {
    const existing = await this.postRepo.findById(input.postId);
    if (!existing) {
      throw new NotFoundError("Không tìm thấy bài viết.");
    }
    if (existing.authorId !== input.actorId && input.actorRole !== "ADMIN") {
      throw new ForbiddenError("Bạn không có quyền xóa bài viết này.");
    }
    await this.postRepo.deleteById(existing.id);
  }
}

export class ListPublicPostsUseCase {
  constructor(private readonly postRepo: IPostRepository) {}

  async execute(params: {
    page: number;
    limit?: number;
    viewerUserId?: string | null;
  }): Promise<{ items: PostViewItem[]; hasMore: boolean }> {
    const safePage = Number.isFinite(params.page) && params.page >= 1
      ? Math.floor(params.page)
      : 1;
    const safeLimit = Math.min(Math.max(params.limit ?? 18, 1), 30);

    return this.postRepo.listPublicFeed({
      page: safePage,
      limit: safeLimit,
      viewerUserId: params.viewerUserId,
    });
  }
}

export class TogglePostLikeUseCase {
  constructor(private readonly postRepo: IPostRepository) {}

  /**
   * Toggles heart anonymously for users (returns ONLY likesCount + likedByMe),
   * while recording an immutable audit entry for Admin only.
   */
  async execute(input: {
    postId: string;
    userId: string;
  }): Promise<{ likesCount: number; likedByMe: boolean }> {
    const post = await this.postRepo.findById(input.postId);
    if (!post) {
      throw new NotFoundError("Không tìm thấy bài viết.");
    }
    // Block liking someone else's PRIVATE post (anti-IDOR)
    if (post.visibility === "PRIVATE" && post.authorId !== input.userId) {
      throw new NotFoundError("Không tìm thấy bài viết.");
    }

    return this.postRepo.toggleLike({
      postId: post.id,
      userId: input.userId,
    });
  }
}

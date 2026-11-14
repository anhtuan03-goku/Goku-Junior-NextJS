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
    throw new ValidationError("Story content must be between 1 and 2000 characters.");
  }
  return cleaned;
}

function validateVisibility(v: string): PostVisibility {
  if (v !== "PRIVATE" && v !== "PUBLIC") {
    throw new ValidationError("Story visibility must be PRIVATE or PUBLIC.");
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
      throw new NotFoundError("Saved frame not found.");
    }
    if (savedImage.userId !== input.authorId) {
      throw new ForbiddenError(
        "You can only write stories on frames saved in your own collection.",
      );
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
      throw new NotFoundError("Story not found.");
    }
    if (existing.authorId !== input.userId) {
      throw new ForbiddenError("You do not have permission to edit this story.");
    }

    const patch: { content?: string; visibility?: PostVisibility } = {};
    if (input.content !== undefined) {
      patch.content = validatePostContent(input.content);
    }
    if (input.visibility !== undefined) {
      patch.visibility = validateVisibility(input.visibility);
    }
    if (patch.content === undefined && patch.visibility === undefined) {
      throw new ValidationError("No changes provided to update.");
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
      throw new NotFoundError("Story not found.");
    }
    if (existing.authorId !== input.actorId && input.actorRole !== "ADMIN") {
      throw new ForbiddenError("You do not have permission to delete this story.");
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
    const safePage =
      Number.isFinite(params.page) && params.page >= 1
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
      throw new NotFoundError("Story not found.");
    }
    // Block liking someone else's PRIVATE post (anti-IDOR)
    if (post.visibility === "PRIVATE" && post.authorId !== input.userId) {
      throw new NotFoundError("Story not found.");
    }

    return this.postRepo.toggleLike({
      postId: post.id,
      userId: input.userId,
    });
  }
}

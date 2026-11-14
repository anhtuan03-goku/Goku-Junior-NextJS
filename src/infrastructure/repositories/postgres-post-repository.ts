import "server-only";
import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type {
  LikeAction,
  LikeAuditEntry,
  PlatformStats,
  Post,
  PostViewItem,
  PostVisibility,
} from "@/domain/entities/models";
import { NotFoundError } from "@/domain/errors/domain-errors";
import type { IPostRepository } from "@/domain/repositories/ports";
import { db } from "../db/client";
import {
  likeAuditLogs,
  postLikes,
  posts,
  savedImages,
  users,
} from "../db/schema";

function mapPostRow(row: typeof posts.$inferSelect): Post {
  return {
    id: row.id,
    savedImageId: row.savedImageId,
    authorId: row.authorId,
    content: row.content,
    visibility: (row.visibility === "PUBLIC"
      ? "PUBLIC"
      : "PRIVATE") as PostVisibility,
    likesCount: row.likesCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PostgresPostRepository implements IPostRepository {
  async findById(id: string): Promise<Post | null> {
    const rows = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
    return rows[0] ? mapPostRow(rows[0]) : null;
  }

  async findViewById(
    id: string,
    viewerUserId?: string | null,
  ): Promise<PostViewItem | null> {
    const rows = await db
      .select({
        post: posts,
        authorId: users.id,
        authorUsername: users.username,
        authorAvatar: users.avatarUrl,
        image: savedImages,
      })
      .from(posts)
      .innerJoin(users, eq(posts.authorId, users.id))
      .innerJoin(savedImages, eq(posts.savedImageId, savedImages.id))
      .where(eq(posts.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    let likedByMe = false;
    if (viewerUserId) {
      const likeCheck = await db
        .select({ id: postLikes.id })
        .from(postLikes)
        .where(
          and(
            eq(postLikes.postId, row.post.id),
            eq(postLikes.userId, viewerUserId),
          ),
        )
        .limit(1);
      likedByMe = likeCheck.length > 0;
    }

    return {
      id: row.post.id,
      savedImageId: row.post.savedImageId,
      content: row.post.content,
      visibility: (row.post.visibility === "PUBLIC"
        ? "PUBLIC"
        : "PRIVATE") as PostVisibility,
      likesCount: row.post.likesCount,
      likedByMe,
      createdAt: row.post.createdAt.toISOString(),
      updatedAt: row.post.updatedAt.toISOString(),
      author: {
        id: row.authorId,
        username: row.authorUsername,
        avatarUrl: row.authorAvatar,
      },
      image: {
        id: row.image.id,
        provider: row.image.provider,
        externalId: row.image.externalId,
        imageUrl: row.image.imageUrl,
        thumbUrl: row.image.thumbUrl,
        color: row.image.color,
        width: row.image.width,
        height: row.image.height,
        description: row.image.description,
        photographerUsername: row.image.photographerUsername,
        photographerName: row.image.photographerName,
        photographerAvatar: row.image.photographerAvatar,
        photographerUrl: row.image.photographerUrl,
      },
    };
  }

  async create(input: {
    savedImageId: string;
    authorId: string;
    content: string;
    visibility: PostVisibility;
  }): Promise<PostViewItem> {
    const inserted = await db
      .insert(posts)
      .values({
        savedImageId: input.savedImageId,
        authorId: input.authorId,
        content: input.content,
        visibility: input.visibility,
      })
      .returning({ id: posts.id });

    const created = await this.findViewById(inserted[0]!.id, input.authorId);
    if (!created) {
      throw new NotFoundError("Không thể tải bài viết vừa tạo.");
    }
    return created;
  }

  async update(
    postId: string,
    patch: { content?: string; visibility?: PostVisibility },
    viewerUserId: string,
  ): Promise<PostViewItem> {
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (patch.content !== undefined) updates.content = patch.content;
    if (patch.visibility !== undefined) updates.visibility = patch.visibility;

    await db.update(posts).set(updates).where(eq(posts.id, postId));
    const view = await this.findViewById(postId, viewerUserId);
    if (!view) throw new NotFoundError("Không tìm thấy bài viết.");
    return view;
  }

  async deleteById(postId: string): Promise<void> {
    await db.delete(posts).where(eq(posts.id, postId));
  }

  async listPublicFeed(params: {
    page: number;
    limit: number;
    viewerUserId?: string | null;
  }): Promise<{ items: PostViewItem[]; hasMore: boolean }> {
    const offset = Math.max(0, (params.page - 1) * params.limit);
    const rows = await db
      .select({
        post: posts,
        authorId: users.id,
        authorUsername: users.username,
        authorAvatar: users.avatarUrl,
        image: savedImages,
      })
      .from(posts)
      .innerJoin(users, eq(posts.authorId, users.id))
      .innerJoin(savedImages, eq(posts.savedImageId, savedImages.id))
      .where(and(eq(posts.visibility, "PUBLIC"), eq(users.isActive, true)))
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .limit(params.limit + 1)
      .offset(offset);

    const hasMore = rows.length > params.limit;
    const slice = rows.slice(0, params.limit);

    const likedSet = new Set<string>();
    if (params.viewerUserId && slice.length > 0) {
      const likes = await db
        .select({ postId: postLikes.postId })
        .from(postLikes)
        .where(
          and(
            eq(postLikes.userId, params.viewerUserId),
            inArray(
              postLikes.postId,
              slice.map((s) => s.post.id),
            ),
          ),
        );
      for (const l of likes) likedSet.add(l.postId);
    }

    const items: PostViewItem[] = slice.map((row) => ({
      id: row.post.id,
      savedImageId: row.post.savedImageId,
      content: row.post.content,
      visibility: "PUBLIC",
      likesCount: row.post.likesCount,
      likedByMe: likedSet.has(row.post.id),
      createdAt: row.post.createdAt.toISOString(),
      updatedAt: row.post.updatedAt.toISOString(),
      author: {
        id: row.authorId,
        username: row.authorUsername,
        avatarUrl: row.authorAvatar,
      },
      image: {
        id: row.image.id,
        provider: row.image.provider,
        externalId: row.image.externalId,
        imageUrl: row.image.imageUrl,
        thumbUrl: row.image.thumbUrl,
        color: row.image.color,
        width: row.image.width,
        height: row.image.height,
        description: row.image.description,
        photographerUsername: row.image.photographerUsername,
        photographerName: row.image.photographerName,
        photographerAvatar: row.image.photographerAvatar,
        photographerUrl: row.image.photographerUrl,
      },
    }));

    return { items, hasMore };
  }

  /**
   * Concurrency-safe atomic DB transaction:
   * 1. Acquires FOR UPDATE row lock on target post to serialize concurrent toggles.
   * 2. Uses .returning() / .onConflictDoNothing().returning() to guarantee idempotency.
   * 3. Computes authoritative likes_count directly from post_likes and logs audit event.
   */
  async toggleLike(params: {
    postId: string;
    userId: string;
  }): Promise<{ likesCount: number; likedByMe: boolean }> {
    return db.transaction(async (tx) => {
      const locked = await tx.execute(
        sql`SELECT id FROM ${posts} WHERE ${posts.id} = ${params.postId} FOR UPDATE`,
      );
      if (locked.rowCount === 0) {
        throw new NotFoundError("Không tìm thấy bài viết.");
      }

      const deleted = await tx
        .delete(postLikes)
        .where(
          and(
            eq(postLikes.postId, params.postId),
            eq(postLikes.userId, params.userId),
          ),
        )
        .returning({ id: postLikes.id });

      if (deleted.length > 0) {
        const updatedPost = await tx
          .update(posts)
          .set({
            likesCount: sql`(SELECT count(*)::int FROM ${postLikes} WHERE ${postLikes.postId} = ${params.postId})`,
          })
          .where(eq(posts.id, params.postId))
          .returning({ likesCount: posts.likesCount });

        await tx.insert(likeAuditLogs).values({
          postId: params.postId,
          actorUserId: params.userId,
          action: "UNLIKE",
        });

        return {
          likesCount: updatedPost[0]?.likesCount ?? 0,
          likedByMe: false,
        };
      }

      const inserted = await tx
        .insert(postLikes)
        .values({
          postId: params.postId,
          userId: params.userId,
        })
        .onConflictDoNothing()
        .returning({ id: postLikes.id });

      const updatedPost = await tx
        .update(posts)
        .set({
          likesCount: sql`(SELECT count(*)::int FROM ${postLikes} WHERE ${postLikes.postId} = ${params.postId})`,
        })
        .where(eq(posts.id, params.postId))
        .returning({ likesCount: posts.likesCount });

      if (inserted.length > 0) {
        await tx.insert(likeAuditLogs).values({
          postId: params.postId,
          actorUserId: params.userId,
          action: "LIKE",
        });
      }

      return {
        likesCount: updatedPost[0]?.likesCount ?? 1,
        likedByMe: true,
      };
    });
  }

  async listLikeAuditLogs(limit = 100): Promise<LikeAuditEntry[]> {
    const actorUsers = alias(users, "actor_users");
    const authorUsers = alias(users, "author_users");

    const rows = await db
      .select({
        id: likeAuditLogs.id,
        postId: likeAuditLogs.postId,
        postContent: posts.content,
        postVisibility: posts.visibility,
        postAuthorUsername: authorUsers.username,
        actorUserId: likeAuditLogs.actorUserId,
        actorUsername: actorUsers.username,
        action: likeAuditLogs.action,
        createdAt: likeAuditLogs.createdAt,
      })
      .from(likeAuditLogs)
      .innerJoin(posts, eq(likeAuditLogs.postId, posts.id))
      .innerJoin(authorUsers, eq(posts.authorId, authorUsers.id))
      .innerJoin(actorUsers, eq(likeAuditLogs.actorUserId, actorUsers.id))
      .orderBy(desc(likeAuditLogs.createdAt))
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      postId: r.postId,
      postExcerpt:
        r.postContent.length > 80
          ? `${r.postContent.slice(0, 80)}…`
          : r.postContent,
      postVisibility: (r.postVisibility === "PUBLIC"
        ? "PUBLIC"
        : "PRIVATE") as PostVisibility,
      postAuthorUsername: r.postAuthorUsername,
      actorUserId: r.actorUserId,
      actorUsername: r.actorUsername,
      action: (r.action === "UNLIKE" ? "UNLIKE" : "LIKE") as LikeAction,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async getPlatformStats(): Promise<Omit<PlatformStats, "quota">> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      userGrouping,
      savedTotalRes,
      postGrouping,
      likesTotalRes,
      recentSaves,
      recentPosts,
    ] = await Promise.all([
      db
        .select({
          isActive: users.isActive,
          total: count(),
        })
        .from(users)
        .groupBy(users.isActive),
      db.select({ total: count() }).from(savedImages),
      db
        .select({
          visibility: posts.visibility,
          total: count(),
        })
        .from(posts)
        .groupBy(posts.visibility),
      db.select({ total: count() }).from(postLikes),
      db
        .select({ createdAt: savedImages.createdAt })
        .from(savedImages)
        .where(gte(savedImages.createdAt, sevenDaysAgo)),
      db
        .select({ createdAt: posts.createdAt })
        .from(posts)
        .where(gte(posts.createdAt, sevenDaysAgo)),
    ]);

    let activeUsers = 0;
    let lockedUsers = 0;
    for (const u of userGrouping) {
      if (u.isActive) activeUsers += Number(u.total);
      else lockedUsers += Number(u.total);
    }

    let publicPosts = 0;
    let privatePosts = 0;
    for (const p of postGrouping) {
      if (p.visibility === "PUBLIC") publicPosts += Number(p.total);
      else privatePosts += Number(p.total);
    }

    const dayBuckets = new Map<string, { savedCount: number; postCount: number }>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      dayBuckets.set(d, { savedCount: 0, postCount: 0 });
    }

    for (const s of recentSaves) {
      const key = s.createdAt.toISOString().slice(0, 10);
      const bucket = dayBuckets.get(key);
      if (bucket) bucket.savedCount += 1;
    }

    for (const p of recentPosts) {
      const key = p.createdAt.toISOString().slice(0, 10);
      const bucket = dayBuckets.get(key);
      if (bucket) bucket.postCount += 1;
    }

    return {
      totalUsers: activeUsers + lockedUsers,
      activeUsers,
      lockedUsers,
      totalSavedImages: Number(savedTotalRes[0]?.total ?? 0),
      totalPosts: publicPosts + privatePosts,
      publicPosts,
      privatePosts,
      totalLikes: Number(likesTotalRes[0]?.total ?? 0),
      dailyActivity: Array.from(dayBuckets.entries()).map(([date, val]) => ({
        date,
        savedCount: val.savedCount,
        postCount: val.postCount,
      })),
    };
  }
}

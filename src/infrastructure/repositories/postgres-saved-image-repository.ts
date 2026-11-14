import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import type {
  PostViewItem,
  PostVisibility,
  SavedImage,
  SavedImageWithPosts,
} from "@/domain/entities/models";
import type { ISavedImageRepository } from "@/domain/repositories/ports";
import { db } from "../db/client";
import { postLikes, posts, savedImages, users } from "../db/schema";

function mapSavedImageRow(row: typeof savedImages.$inferSelect): SavedImage {
  return {
    id: row.id,
    userId: row.userId,
    provider: row.provider,
    externalId: row.externalId,
    imageUrl: row.imageUrl,
    thumbUrl: row.thumbUrl,
    color: row.color,
    width: row.width,
    height: row.height,
    description: row.description,
    photographerUsername: row.photographerUsername,
    photographerName: row.photographerName,
    photographerAvatar: row.photographerAvatar,
    photographerUrl: row.photographerUrl,
    downloadLocation: row.downloadLocation,
    createdAt: row.createdAt,
  };
}

export class PostgresSavedImageRepository implements ISavedImageRepository {
  async findById(id: string): Promise<SavedImage | null> {
    const rows = await db
      .select()
      .from(savedImages)
      .where(eq(savedImages.id, id))
      .limit(1);
    return rows[0] ? mapSavedImageRow(rows[0]) : null;
  }

  async findByUserAndExternal(
    userId: string,
    provider: string,
    externalId: string,
  ): Promise<SavedImage | null> {
    const rows = await db
      .select()
      .from(savedImages)
      .where(
        and(
          eq(savedImages.userId, userId),
          eq(savedImages.provider, provider),
          eq(savedImages.externalId, externalId),
        ),
      )
      .limit(1);
    return rows[0] ? mapSavedImageRow(rows[0]) : null;
  }

  async findSavedExternalKeys(
    userId: string,
    keys: Array<{ provider: string; externalId: string }>,
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (keys.length === 0) return result;

    const externalIds = Array.from(new Set(keys.map((k) => k.externalId)));
    const rows = await db
      .select({
        id: savedImages.id,
        provider: savedImages.provider,
        externalId: savedImages.externalId,
      })
      .from(savedImages)
      .where(
        and(
          eq(savedImages.userId, userId),
          inArray(savedImages.externalId, externalIds),
        ),
      );

    for (const r of rows) {
      result.set(`${r.provider}:${r.externalId}`, r.id);
    }
    return result;
  }

  async create(
    input: Omit<SavedImage, "id" | "createdAt">,
  ): Promise<SavedImage> {
    const rows = await db
      .insert(savedImages)
      .values({
        userId: input.userId,
        provider: input.provider,
        externalId: input.externalId,
        imageUrl: input.imageUrl,
        thumbUrl: input.thumbUrl,
        color: input.color,
        width: input.width,
        height: input.height,
        description: input.description,
        photographerUsername: input.photographerUsername,
        photographerName: input.photographerName,
        photographerAvatar: input.photographerAvatar,
        photographerUrl: input.photographerUrl,
        downloadLocation: input.downloadLocation,
      })
      .onConflictDoUpdate({
        target: [
          savedImages.userId,
          savedImages.provider,
          savedImages.externalId,
        ],
        set: {
          imageUrl: input.imageUrl,
          thumbUrl: input.thumbUrl,
        },
      })
      .returning();

    return mapSavedImageRow(rows[0]!);
  }

  async deleteByIdAndUser(id: string, userId: string): Promise<boolean> {
    const deleted = await db
      .delete(savedImages)
      .where(and(eq(savedImages.id, id), eq(savedImages.userId, userId)))
      .returning({ id: savedImages.id });
    return deleted.length > 0;
  }

  /**
   * Loads user's saved images along with ALL 1-to-Many posts per saved image
   * in batch queries (Zero N+1) and strictly omits liker identities.
   */
  async listByUserWithPosts(userId: string): Promise<SavedImageWithPosts[]> {
    const [userRows, imgRows] = await Promise.all([
      db
        .select({
          id: users.id,
          username: users.username,
          avatarUrl: users.avatarUrl,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1),
      db
        .select()
        .from(savedImages)
        .where(eq(savedImages.userId, userId))
        .orderBy(desc(savedImages.createdAt)),
    ]);

    const owner = userRows[0];
    if (!owner || imgRows.length === 0) return [];

    const imgIds = imgRows.map((i) => i.id);
    const postRows = await db
      .select()
      .from(posts)
      .where(
        and(
          eq(posts.authorId, userId),
          inArray(posts.savedImageId, imgIds),
        ),
      )
      .orderBy(desc(posts.createdAt));

    const likedPostIds = new Set<string>();
    if (postRows.length > 0) {
      const likes = await db
        .select({ postId: postLikes.postId })
        .from(postLikes)
        .where(
          and(
            eq(postLikes.userId, userId),
            inArray(
              postLikes.postId,
              postRows.map((p) => p.id),
            ),
          ),
        );
      for (const l of likes) likedPostIds.add(l.postId);
    }

    const imgMap = new Map<string, SavedImage>();
    for (const r of imgRows) {
      imgMap.set(r.id, mapSavedImageRow(r));
    }

    const postsByImage = new Map<string, PostViewItem[]>();
    for (const p of postRows) {
      const img = imgMap.get(p.savedImageId);
      if (!img) continue;

      const view: PostViewItem = {
        id: p.id,
        savedImageId: p.savedImageId,
        content: p.content,
        visibility: (p.visibility === "PUBLIC"
          ? "PUBLIC"
          : "PRIVATE") as PostVisibility,
        likesCount: p.likesCount,
        likedByMe: likedPostIds.has(p.id),
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        author: {
          id: owner.id,
          username: owner.username,
          avatarUrl: owner.avatarUrl,
        },
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

      const arr = postsByImage.get(p.savedImageId) ?? [];
      arr.push(view);
      postsByImage.set(p.savedImageId, arr);
    }

    return imgRows.map((r) => {
      const mapped = mapSavedImageRow(r);
      return {
        ...mapped,
        posts: postsByImage.get(r.id) ?? [],
      };
    });
  }
}

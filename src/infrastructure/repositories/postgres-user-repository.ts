import "server-only";
import { count, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import type {
  AdminUserSummary,
  User,
  UserRole,
} from "@/domain/entities/models";
import { ConflictError, NotFoundError } from "@/domain/errors/domain-errors";
import type { IUserRepository } from "@/domain/repositories/ports";
import { db } from "../db/client";
import { postLikes, posts, savedImages, users } from "../db/schema";

function mapUserRow(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.passwordHash,
    role: (row.role === "ADMIN" ? "ADMIN" : "USER") as UserRole,
    isActive: row.isActive,
    showPhotographerInfo: row.showPhotographerInfo,
    sessionVersion: row.sessionVersion,
    avatarUrl: row.avatarUrl,
    avatarPublicId: row.avatarPublicId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PostgresUserRepository implements IUserRepository {
  async findById(id: string): Promise<User | null> {
    const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0] ? mapUserRow(rows[0]) : null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const normalized = username.trim().toLowerCase();
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.username, normalized))
      .limit(1);
    return rows[0] ? mapUserRow(rows[0]) : null;
  }

  async create(input: {
    username: string;
    passwordHash: string;
    role?: UserRole;
  }): Promise<User> {
    try {
      const rows = await db
        .insert(users)
        .values({
          username: input.username.trim().toLowerCase(),
          passwordHash: input.passwordHash,
          role: input.role ?? "USER",
        })
        .returning();
      return mapUserRow(rows[0]!);
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: string }).code === "23505"
      ) {
        throw new ConflictError("Tên đăng nhập này đã tồn tại.");
      }
      throw err;
    }
  }

  async updateUsername(userId: string, newUsername: string): Promise<User> {
    try {
      const rows = await db
        .update(users)
        .set({
          username: newUsername.trim().toLowerCase(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();
      if (!rows[0]) throw new NotFoundError("Không tìm thấy người dùng.");
      return mapUserRow(rows[0]);
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: string }).code === "23505"
      ) {
        throw new ConflictError("Tên đăng nhập này đã được sử dụng.");
      }
      throw err;
    }
  }

  async updatePassword(userId: string, newPasswordHash: string): Promise<User> {
    const rows = await db
      .update(users)
      .set({
        passwordHash: newPasswordHash,
        sessionVersion: sql`${users.sessionVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    if (!rows[0]) throw new NotFoundError("Không tìm thấy người dùng.");
    return mapUserRow(rows[0]);
  }

  async updatePhotographerMode(
    userId: string,
    showPhotographerInfo: boolean,
  ): Promise<User> {
    const rows = await db
      .update(users)
      .set({
        showPhotographerInfo,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    if (!rows[0]) throw new NotFoundError("Không tìm thấy người dùng.");
    return mapUserRow(rows[0]);
  }

  async updateAvatar(
    userId: string,
    avatarUrl: string | null,
    avatarPublicId: string | null,
  ): Promise<User> {
    const rows = await db
      .update(users)
      .set({
        avatarUrl,
        avatarPublicId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    if (!rows[0]) throw new NotFoundError("Không tìm thấy người dùng.");
    return mapUserRow(rows[0]);
  }

  async updateAdminUserState(
    userId: string,
    patch: { role?: UserRole; isActive?: boolean },
  ): Promise<User> {
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
      sessionVersion: sql`${users.sessionVersion} + 1`,
    };
    if (patch.role !== undefined) updates.role = patch.role;
    if (patch.isActive !== undefined) updates.isActive = patch.isActive;

    const rows = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, userId))
      .returning();
    if (!rows[0]) throw new NotFoundError("Không tìm thấy người dùng.");
    return mapUserRow(rows[0]);
  }

  async countAdmins(): Promise<number> {
    const res = await db
      .select({ total: count() })
      .from(users)
      .where(eq(users.role, "ADMIN"));
    return Number(res[0]?.total ?? 0);
  }

  async deleteById(userId: string): Promise<void> {
    await db.transaction(async (tx) => {
      const likedRows = await tx
        .select({ postId: postLikes.postId })
        .from(postLikes)
        .where(eq(postLikes.userId, userId));

      const affectedPostIds = Array.from(
        new Set(likedRows.map((r) => r.postId)),
      );

      await tx.delete(users).where(eq(users.id, userId));

      if (affectedPostIds.length > 0) {
        await tx
          .update(posts)
          .set({
            likesCount: sql`(SELECT count(*)::int FROM ${postLikes} WHERE ${postLikes.postId} = ${posts.id})`,
          })
          .where(inArray(posts.id, affectedPostIds));
      }
    });
  }

  async listAdminUserSummaries(search?: string): Promise<AdminUserSummary[]> {
    const userRows = await db
      .select()
      .from(users)
      .where(search ? ilike(users.username, `%${search}%`) : undefined)
      .orderBy(desc(users.createdAt));

    if (userRows.length === 0) return [];

    // Aggregate saved image & post counts in 2 grouped queries (Zero N+1!)
    const [saveCounts, postCounts] = await Promise.all([
      db
        .select({
          userId: savedImages.userId,
          total: count(),
        })
        .from(savedImages)
        .groupBy(savedImages.userId),
      db
        .select({
          authorId: posts.authorId,
          visibility: posts.visibility,
          total: count(),
        })
        .from(posts)
        .groupBy(posts.authorId, posts.visibility),
    ]);

    const saveMap = new Map<string, number>();
    for (const s of saveCounts) {
      saveMap.set(s.userId, Number(s.total));
    }

    const postMap = new Map<string, { pub: number; priv: number }>();
    for (const p of postCounts) {
      const curr = postMap.get(p.authorId) ?? { pub: 0, priv: 0 };
      if (p.visibility === "PUBLIC") curr.pub += Number(p.total);
      else curr.priv += Number(p.total);
      postMap.set(p.authorId, curr);
    }

    return userRows.map((u) => {
      const pc = postMap.get(u.id) ?? { pub: 0, priv: 0 };
      return {
        id: u.id,
        username: u.username,
        avatarUrl: u.avatarUrl,
        role: (u.role === "ADMIN" ? "ADMIN" : "USER") as UserRole,
        isActive: u.isActive,
        savedCount: saveMap.get(u.id) ?? 0,
        postCount: pc.pub + pc.priv,
        publicPostCount: pc.pub,
        privatePostCount: pc.priv,
        createdAt: u.createdAt.toISOString(),
      };
    });
  }
}

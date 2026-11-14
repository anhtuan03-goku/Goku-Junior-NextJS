import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { PhotographerSummary } from "@/domain/entities/models";

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    username: varchar("username", { length: 32 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    role: varchar("role", { length: 16 }).notNull().default("USER"), // USER | ADMIN
    isActive: boolean("is_active").notNull().default(true),
    showPhotographerInfo: boolean("show_photographer_info")
      .notNull()
      .default(true),
    sessionVersion: integer("session_version").notNull().default(1),
    avatarUrl: text("avatar_url"),
    avatarPublicId: varchar("avatar_public_id", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("users_username_unique_idx").on(table.username)],
);

export const savedImages = pgTable(
  "saved_images",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 32 }).notNull().default("unsplash"),
    externalId: varchar("external_id", { length: 128 }).notNull(),
    imageUrl: text("image_url").notNull(),
    thumbUrl: text("thumb_url").notNull(),
    color: varchar("color", { length: 32 }),
    width: integer("width").notNull().default(800),
    height: integer("height").notNull().default(600),
    description: text("description"),
    photographerUsername: varchar("photographer_username", { length: 100 }),
    photographerName: varchar("photographer_name", { length: 150 }),
    photographerAvatar: text("photographer_avatar"),
    photographerUrl: text("photographer_url"),
    downloadLocation: text("download_location"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("saved_images_user_provider_ext_idx").on(
      table.userId,
      table.provider,
      table.externalId,
    ),
    index("saved_images_user_created_idx").on(table.userId, table.createdAt),
  ],
);

/**
 * 1 SavedImage -> Many Posts (no unique constraint on saved_image_id)
 */
export const posts = pgTable(
  "posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    savedImageId: uuid("saved_image_id")
      .notNull()
      .references(() => savedImages.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    visibility: varchar("visibility", { length: 16 })
      .notNull()
      .default("PRIVATE"), // PRIVATE | PUBLIC
    likesCount: integer("likes_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("posts_visibility_created_idx").on(table.visibility, table.createdAt),
    index("posts_author_created_idx").on(table.authorId, table.createdAt),
    index("posts_saved_image_created_idx").on(
      table.savedImageId,
      table.createdAt,
    ),
  ],
);

export const postLikes = pgTable(
  "post_likes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("post_likes_post_user_unique_idx").on(
      table.postId,
      table.userId,
    ),
    index("post_likes_user_idx").on(table.userId),
  ],
);

/**
 * Strictly Admin-only audit trail of who liked/unliked which post and when.
 */
export const likeAuditLogs = pgTable(
  "like_audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 16 }).notNull(), // LIKE | UNLIKE
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("like_audit_logs_created_idx").on(table.createdAt)],
);

/**
 * Persistent image pool populated by UnsplashQuotaWorker (30 images/batch)
 * so Infinite Scroll never breaks or throws 429 when 50 req/hr budget is exhausted.
 */
export const cachedImages = pgTable(
  "cached_images",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: varchar("provider", { length: 32 }).notNull().default("unsplash"),
    externalId: varchar("external_id", { length: 128 }).notNull(),
    queryTag: varchar("query_tag", { length: 120 }).notNull().default(""),
    imageUrl: text("image_url").notNull(),
    thumbUrl: text("thumb_url").notNull(),
    color: varchar("color", { length: 32 }),
    width: integer("width").notNull().default(800),
    height: integer("height").notNull().default(600),
    description: text("description"),
    photographerUsername: varchar("photographer_username", { length: 100 }),
    photographerSnapshot: jsonb("photographer_snapshot").$type<PhotographerSummary | null>(),
    downloadLocation: text("download_location"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("cached_images_provider_ext_unique_idx").on(
      table.provider,
      table.externalId,
    ),
    index("cached_images_provider_fetched_idx").on(
      table.provider,
      table.fetchedAt,
    ),
    index("cached_images_photographer_idx").on(table.photographerUsername),
  ],
);

export const cachedPhotographers = pgTable("cached_photographers", {
  username: varchar("username", { length: 100 }).primaryKey(),
  provider: varchar("provider", { length: 32 }).notNull().default("unsplash"),
  name: varchar("name", { length: 150 }).notNull(),
  bio: text("bio"),
  location: varchar("location", { length: 150 }),
  avatarUrl: text("avatar_url"),
  portfolioUrl: text("portfolio_url"),
  profileUrl: text("profile_url"),
  totalPhotos: integer("total_photos").notNull().default(0),
  totalLikes: integer("total_likes").notNull().default(0),
  totalCollections: integer("total_collections").notNull().default(0),
  fullFetched: boolean("full_fetched").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const unsplashJobQueue = pgTable(
  "unsplash_job_queue",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobType: varchar("job_type", { length: 48 }).notNull(), // TRIGGER_DOWNLOAD | SYNC_PHOTOGRAPHER
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: varchar("status", { length: 24 }).notNull().default("PENDING"), // PENDING | PROCESSING | DONE | DEFERRED
    attempts: integer("attempts").notNull().default(0),
    nextRunAt: timestamp("next_run_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("unsplash_job_queue_status_run_idx").on(
      table.status,
      table.nextRunAt,
    ),
  ],
);

export const providerRateState = pgTable("provider_rate_state", {
  provider: varchar("provider", { length: 32 }).primaryKey(),
  remainingQuota: integer("remaining_quota").notNull().default(50),
  limitQuota: integer("limit_quota").notNull().default(50),
  windowResetAt: timestamp("window_reset_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

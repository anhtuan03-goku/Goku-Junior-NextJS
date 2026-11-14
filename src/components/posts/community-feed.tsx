"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Heart, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAppSession } from "@/components/providers/app-providers";
import { UserAvatarCircle } from "@/components/ui/primitives";
import type { PostViewItem } from "@/domain/entities/models";
import { cn, formatMinimalDate } from "@/lib/utils";

export function CommunityPostsFeed({
  initialPosts,
  initialHasMore,
}: {
  initialPosts: PostViewItem[];
  initialHasMore: boolean;
}) {
  const router = useRouter();
  const { user, showPhotographerInfo } = useAppSession();

  const [posts, setPosts] = useState<PostViewItem[]>(initialPosts);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [likingIds, setLikingIds] = useState<Set<string>>(new Set());

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async (nextPage: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/posts?page=${nextPage}&limit=18`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setHasMore(false);
        return;
      }
      const data = (await res.json()) as {
        items: PostViewItem[];
        hasMore: boolean;
      };
      setPosts((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        const uniqueNew = data.items.filter((p) => !existingIds.has(p.id));
        return [...prev, ...uniqueNew];
      });
      setPage(nextPage);
      setHasMore(data.hasMore);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading) return;

    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loading && hasMore) {
          void loadMore(page + 1);
        }
      },
      { rootMargin: "500px" },
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loadMore, loading, page]);

  async function handleToggleLike(postId: string) {
    if (!user) {
      toast.info("Vui lòng đăng nhập để thả tim bài viết.");
      router.push("/login");
      return;
    }
    if (likingIds.has(postId)) return;

    setLikingIds((prev) => new Set(prev).add(postId));

    try {
      const res = await fetch(`/api/posts/${postId}/like`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        likesCount?: number;
        likedByMe?: boolean;
        error?: string;
      };
      if (!res.ok || data.likesCount === undefined || data.likedByMe === undefined) {
        throw new Error(data.error ?? "Không thể cập nhật lượt thích.");
      }

      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                likesCount: data.likesCount!,
                likedByMe: data.likedByMe!,
              }
            : p,
        ),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Đã xảy ra lỗi.");
    } finally {
      setLikingIds((prev) => {
        const next = new Set(prev);
        next.delete(postId);
        return next;
      });
    }
  }

  if (posts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border py-20 text-center space-y-2">
        <p className="text-sm font-medium">Chưa có bài viết công khai nào</p>
        <p className="text-xs text-muted-foreground">
          Hãy lưu một hình ảnh bạn yêu thích và chia sẻ bài viết đầu tiên ở chế độ Public.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="columns-1 sm:columns-2 lg:columns-3 gap-5">
        {posts.map((post) => {
          const isLiking = likingIds.has(post.id);
          const photogLink =
            post.image.photographerUsername && post.image.provider === "unsplash"
              ? `/photographers/${encodeURIComponent(post.image.photographerUsername)}`
              : null;

          return (
            <article
              key={post.id}
              className="mb-5 break-inside-avoid overflow-hidden rounded-xl border border-border bg-card"
            >
              <div
                style={{
                  aspectRatio: `${Math.max(post.image.width || 4, 1)} / ${Math.max(post.image.height || 5, 1)}`,
                  backgroundColor: post.image.color ?? undefined,
                }}
                className="w-full overflow-hidden bg-muted"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={post.image.imageUrl}
                  alt={post.image.description ?? "Hình ảnh bài viết"}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </div>

              <div className="p-4 space-y-3.5">
                {showPhotographerInfo && post.image.photographerName && (
                  <div className="text-[11px] text-muted-foreground">
                    Ảnh bởi{" "}
                    {photogLink ? (
                      <Link
                        href={photogLink}
                        className="underline underline-offset-4 hover:text-foreground"
                      >
                        {post.image.photographerName}
                      </Link>
                    ) : (
                      <span>{post.image.photographerName}</span>
                    )}
                  </div>
                )}

                <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
                  {post.content}
                </p>

                <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <UserAvatarCircle
                      username={post.author.username}
                      avatarUrl={post.author.avatarUrl}
                      size="xs"
                    />
                    <div className="truncate text-xs">
                      <span className="font-medium">@{post.author.username}</span>
                      <span className="mx-1.5 text-muted-foreground">·</span>
                      <span className="text-muted-foreground text-[11px]">
                        {formatMinimalDate(post.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Anonymous Like button — strictly shows total count only, zero liker list, zero comments */}
                  <button
                    type="button"
                    disabled={isLiking}
                    onClick={() => void handleToggleLike(post.id)}
                    aria-label="Thả tim bài viết"
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors cursor-pointer",
                      post.likedByMe
                        ? "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                        : "border-border text-muted-foreground hover:text-foreground hover:bg-accent",
                    )}
                  >
                    <Heart
                      className={cn(
                        "size-3.5",
                        post.likedByMe && "fill-current",
                      )}
                    />
                    <span className="tabular-nums">{post.likesCount}</span>
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div
        ref={sentinelRef}
        className="flex min-h-12 items-center justify-center"
      >
        {loading && (
          <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span>Đang tải thêm bài viết...</span>
          </div>
        )}
      </div>
    </div>
  );
}

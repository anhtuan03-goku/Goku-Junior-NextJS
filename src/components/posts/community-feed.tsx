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
  seed,
  initialPosts,
  initialHasMore,
}: {
  seed: number;
  initialPosts: PostViewItem[];
  initialHasMore: boolean;
}) {
  const router = useRouter();
  const { user, showPhotographerInfo, t, tr } = useAppSession();

  const [posts, setPosts] = useState<PostViewItem[]>(initialPosts);
  const [feedSeed] = useState(seed);
  const [after, setAfter] = useState(() => initialPosts.at(-1)?.id);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [likingIds, setLikingIds] = useState<Set<string>>(new Set());

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const loadMore = useCallback(async () => {
    if (!after || requestRef.current) return;

    const request = new AbortController();
    requestRef.current = request;
    setLoading(true);
    try {
      const params = new URLSearchParams({ seed: String(feedSeed), after, limit: "18" });
      const res = await fetch(`/api/posts?${params}`, {
        cache: "no-store",
        signal: request.signal,
      });
      if (!res.ok) {
        setHasMore(false);
        return;
      }
      const data = (await res.json()) as {
        items: PostViewItem[];
        hasMore: boolean;
      };
      if (request.signal.aborted) return;

      setPosts((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        const uniqueNew = data.items.filter((p) => !existingIds.has(p.id));
        return [...prev, ...uniqueNew];
      });
      const next = data.items.at(-1)?.id;
      setAfter(next);
      setHasMore(data.hasMore && next !== undefined);
    } catch {
      if (!request.signal.aborted) setHasMore(false);
    } finally {
      if (requestRef.current === request) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }, [after, feedSeed]);

  useEffect(() => () => {
    requestRef.current?.abort();
    requestRef.current = null;
  }, []);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading) return;

    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loading && hasMore) {
          void loadMore();
        }
      },
      { rootMargin: "500px" },
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loadMore, loading]);

  async function handleToggleLike(postId: string) {
    if (!user) {
      toast.info(t.community.signInToHeart);
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
      if (
        !res.ok ||
        data.likesCount === undefined ||
        data.likedByMe === undefined
      ) {
        throw new Error(data.error ?? "Unable to update heart count.");
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
      toast.error(
        tr(err instanceof Error ? err.message : "Something went wrong."),
      );
    } finally {
      setLikingIds((prev) => {
        const next = new Set(prev);
        next.delete(postId);
        return next;
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
          {t.community.heading}
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          {t.community.subheading}
        </p>
      </div>

      {posts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-20 text-center space-y-2">
          <p className="text-sm font-medium">{t.community.emptyTitle}</p>
          <p className="text-xs text-muted-foreground">
            {t.community.emptySubtitle}
          </p>
        </div>
      ) : (
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-5">
          {posts.map((post) => {
            const isLiking = likingIds.has(post.id);
            const photogLink =
              post.image.photographerUsername &&
              (post.image.provider === "unsplash" ||
                post.image.provider === "pixabay")
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
                    alt={post.image.description ?? "Story photograph"}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                </div>

                <div className="p-4 space-y-3.5">
                  {showPhotographerInfo && post.image.photographerName && (
                    <div className="text-[11px] text-muted-foreground">
                      {post.image.provider === "nasa"
                        ? "Image Credit: "
                        : t.community.photoBy}
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
                      {post.image.provider === "pixabay" && (
                        <>
                          {" · "}
                          <a
                            href="https://pixabay.com/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline underline-offset-4 hover:text-foreground"
                          >
                            Pixabay
                          </a>
                        </>
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
                        <span className="font-medium">
                          @{post.author.username}
                        </span>
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
                      aria-label="Send anonymous heart"
                      className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-all active:scale-95 cursor-pointer",
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
      )}

      <div
        ref={sentinelRef}
        className="flex min-h-12 items-center justify-center"
      >
        {loading && (
          <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span>{t.community.loadingMore}</span>
          </div>
        )}
      </div>
    </div>
  );
}

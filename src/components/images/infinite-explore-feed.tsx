"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/primitives";
import {
  type DecoratedFeedImage,
  MinimalImageCard,
} from "@/components/images/image-card";
import { cn } from "@/lib/utils";

export function InfiniteExploreFeed({
  initialItems,
  initialHasMore,
}: {
  initialItems: DecoratedFeedImage[];
  initialHasMore: boolean;
}) {
  const [items, setItems] = useState<DecoratedFeedImage[]>(initialItems);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const seenKeysRef = useRef<Set<string>>(
    new Set(initialItems.map((i) => `${i.provider}:${i.externalId}`)),
  );

  const loadPage = useCallback(async (targetPage: number) => {
    setLoading(true);
    try {
      const u = new URL("/api/images/feed", window.location.origin);
      u.searchParams.set("page", String(targetPage));

      const res = await fetch(u.toString(), { cache: "no-store" });
      if (!res.ok) {
        setHasMore(false);
        return;
      }

      const data = (await res.json()) as {
        items: DecoratedFeedImage[];
        hasMore: boolean;
      };

      const appended: DecoratedFeedImage[] = [];
      for (const item of data.items) {
        const k = `${item.provider}:${item.externalId}`;
        if (!seenKeysRef.current.has(k)) {
          seenKeysRef.current.add(k);
          appended.push(item);
        }
      }
      setItems((prev) => [...prev, ...appended]);
      setPage(targetPage);
      setHasMore(data.hasMore && appended.length > 0);
    } finally {
      setLoading(false);
    }
  }, []);

  // IntersectionObserver for seamless Infinite Scroll
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first?.isIntersecting && !loading && hasMore) {
          void loadPage(page + 1);
        }
      },
      { rootMargin: "650px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadPage, loading, page]);

  const handleSaveChange = useCallback(
    (key: string, savedByMe: boolean, savedImageId: string | null) => {
      setItems((prev) =>
        prev.map((it) =>
          `${it.provider}:${it.externalId}` === key
            ? { ...it, savedByMe, savedImageId }
            : it,
        ),
      );
    },
    [],
  );

  return (
    <div className="space-y-4">
      {items.length === 0 && loading ? (
        <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4">
          {Array.from({ length: 12 }).map((_, idx) => (
            <Skeleton
              key={idx}
              className={cn(
                "mb-4 w-full rounded-lg",
                idx % 3 === 0 ? "h-80" : idx % 2 === 0 ? "h-60" : "h-72",
              )}
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-20 text-center">
          <p className="text-sm text-muted-foreground">
            No frames available right now. Please refresh in a moment.
          </p>
        </div>
      ) : (
        <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4">
          {items.map((item) => (
            <MinimalImageCard
              key={`${item.provider}:${item.externalId}`}
              item={item}
              onSaveStateChange={handleSaveChange}
            />
          ))}
        </div>
      )}

      {/* Quiet Infinite Scroll Trigger Sentinel */}
      <div
        ref={sentinelRef}
        className="flex min-h-14 items-center justify-center py-3"
      >
        {loading && items.length > 0 && (
          <Loader2
            aria-label="Loading more frames"
            className="size-4 animate-spin text-muted-foreground"
          />
        )}
      </div>
    </div>
  );
}

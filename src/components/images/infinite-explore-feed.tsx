"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [searchInput, setSearchInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [provider, setProvider] = useState<"unsplash" | "picsum">("unsplash");

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const seenKeysRef = useRef<Set<string>>(
    new Set(initialItems.map((i) => `${i.provider}:${i.externalId}`)),
  );

  const loadPage = useCallback(
    async (
      targetPage: number,
      queryStr: string,
      targetProvider: "unsplash" | "picsum",
      replace = false,
    ) => {
      setLoading(true);
      try {
        const u = new URL("/api/images/feed", window.location.origin);
        u.searchParams.set("page", String(targetPage));
        u.searchParams.set("provider", targetProvider);
        if (queryStr.trim()) {
          u.searchParams.set("query", queryStr.trim());
        }

        const res = await fetch(u.toString(), { cache: "no-store" });
        if (!res.ok) {
          setHasMore(false);
          return;
        }

        const data = (await res.json()) as {
          items: DecoratedFeedImage[];
          hasMore: boolean;
        };

        if (replace) {
          seenKeysRef.current = new Set();
          const freshUnique: DecoratedFeedImage[] = [];
          for (const item of data.items) {
            const k = `${item.provider}:${item.externalId}`;
            if (!seenKeysRef.current.has(k)) {
              seenKeysRef.current.add(k);
              freshUnique.push(item);
            }
          }
          setItems(freshUnique);
          setPage(targetPage);
          setHasMore(data.hasMore && data.items.length > 0);
        } else {
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
        }
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // IntersectionObserver for seamless Infinite Scroll
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first?.isIntersecting && !loading && hasMore) {
          void loadPage(page + 1, activeQuery, provider, false);
        }
      },
      { rootMargin: "650px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [activeQuery, hasMore, loadPage, loading, page, provider]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = searchInput.trim();
    setActiveQuery(trimmed);
    void loadPage(1, trimmed, provider, true);
  }

  function handleClearSearch() {
    setSearchInput("");
    setActiveQuery("");
    void loadPage(1, "", provider, true);
  }

  function handleSwitchProvider(nextProvider: "unsplash" | "picsum") {
    if (nextProvider === provider) return;
    setProvider(nextProvider);
    void loadPage(1, activeQuery, nextProvider, true);
  }

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
    <div className="space-y-6">
      {/* Ultra-minimalist toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <form
          onSubmit={handleSearchSubmit}
          className="relative flex w-full sm:max-w-sm items-center gap-2"
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Tìm chủ đề tối giản (architecture, monochrome, nature...)"
              className="pl-8 pr-8 text-xs"
            />
            {searchInput && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute top-1/2 right-0.5 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground cursor-pointer"
                aria-label="Xóa từ khóa"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <Button type="submit" variant="outline" size="default">
            Tìm
          </Button>
        </form>

        <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
          <span className="text-[11px] text-muted-foreground mr-1">Nguồn ảnh:</span>
          <button
            type="button"
            onClick={() => handleSwitchProvider("unsplash")}
            className={cn(
              "inline-flex min-h-9 items-center rounded-full px-3.5 py-1 text-xs font-medium transition-colors cursor-pointer",
              provider === "unsplash"
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted-foreground hover:text-foreground",
            )}
          >
            Unsplash
          </button>
          <button
            type="button"
            onClick={() => handleSwitchProvider("picsum")}
            className={cn(
              "inline-flex min-h-9 items-center rounded-full px-3.5 py-1 text-xs font-medium transition-colors cursor-pointer",
              provider === "picsum"
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted-foreground hover:text-foreground",
            )}
          >
            Picsum Random
          </button>
        </div>
      </div>

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
            Không tìm thấy hình ảnh phù hợp với từ khóa này.
          </p>
          {activeQuery && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={handleClearSearch}
            >
              Xem lại toàn bộ kho ảnh
            </Button>
          )}
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

      {/* Infinite Scroll Trigger Sentinel */}
      <div
        ref={sentinelRef}
        className="flex min-h-16 items-center justify-center py-4"
      >
        {loading && items.length > 0 && (
          <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span>Đang tải thêm khung hình...</span>
          </div>
        )}
        {!hasMore && items.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Bạn đã xem hết danh sách hiện tại.
          </p>
        )}
      </div>
    </div>
  );
}

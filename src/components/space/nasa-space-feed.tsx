"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Orbit, Search, X } from "lucide-react";
import {
  type DecoratedFeedImage,
  MinimalImageCard,
} from "@/components/images/image-card";
import { useAppSession } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const COSMIC_TOPICS: Array<{ fallbackLabel: string; query: string }> = [
  { fallbackLabel: "Featured Cosmos", query: "" },
  { fallbackLabel: "Nebula", query: "nebula" },
  { fallbackLabel: "James Webb", query: "james webb" },
  { fallbackLabel: "Hubble", query: "hubble galaxy" },
  { fallbackLabel: "Galaxies", query: "spiral galaxy" },
  { fallbackLabel: "Saturn", query: "saturn cassini" },
  { fallbackLabel: "Apollo", query: "apollo moon" },
  { fallbackLabel: "Supernova", query: "supernova" },
];

export function NasaSpaceFeed({
  initialItems,
  initialHasMore,
}: {
  initialItems: DecoratedFeedImage[];
  initialHasMore: boolean;
}) {
  const { locale, t } = useAppSession();
  const [activeQuery, setActiveQuery] = useState("");
  const [searchDraft, setSearchDraft] = useState("");

  const [items, setItems] = useState<DecoratedFeedImage[]>(initialItems);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isInitialMountRef = useRef(true);
  const seenKeysRef = useRef<Set<string>>(
    new Set(initialItems.map((i) => `${i.provider}:${i.externalId}`)),
  );

  const fetchSpaceFeed = useCallback(
    async (
      queryText: string,
      targetPage: number,
      mode: "replace" | "append",
    ) => {
      if (mode === "replace") {
        abortRef.current?.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);

      try {
        const u = new URL("/api/space/feed", window.location.origin);
        u.searchParams.set("page", String(targetPage));
        if (queryText.trim()) {
          u.searchParams.set("query", queryText.trim());
        }

        const res = await fetch(u.toString(), {
          cache: "no-store",
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        if (!res.ok) {
          if (mode === "replace") {
            seenKeysRef.current = new Set();
            setItems([]);
          }
          setHasMore(false);
          return;
        }

        const data = (await res.json()) as {
          items: DecoratedFeedImage[];
          hasMore: boolean;
        };

        if (controller.signal.aborted) return;

        if (mode === "replace") {
          const nextSeen = new Set<string>();
          const deduped: DecoratedFeedImage[] = [];
          for (const item of data.items) {
            const k = `${item.provider}:${item.externalId}`;
            if (!nextSeen.has(k)) {
              nextSeen.add(k);
              deduped.push(item);
            }
          }
          seenKeysRef.current = nextSeen;
          setItems(deduped);
          setPage(1);
          setHasMore(data.hasMore && deduped.length > 0);
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
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        if (mode === "replace") {
          seenKeysRef.current = new Set();
          setItems([]);
        }
        setHasMore(false);
      } finally {
        if (abortRef.current === controller) {
          setLoading(false);
        }
      }
    },
    [],
  );

  // Trigger replace fetch whenever query changes after initial SSR mount
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }
    void fetchSpaceFeed(activeQuery, 1, "replace");
  }, [activeQuery, fetchSpaceFeed]);

  // Infinite scroll observer
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first?.isIntersecting && !loading && hasMore) {
          void fetchSpaceFeed(activeQuery, page + 1, "append");
        }
      },
      { rootMargin: "650px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [activeQuery, fetchSpaceFeed, hasMore, loading, page]);

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

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setActiveQuery(searchDraft.trim());
  }

  function handleSelectTopic(topicQuery: string) {
    setSearchDraft(topicQuery);
    setActiveQuery(topicQuery);
  }

  return (
    <div className="space-y-5">
      {/* Minimalist NASA Archive Search & Cosmic Topic Bar (zero sub-tabs) */}
      <div className="rounded-xl border border-border/80 bg-card/60 p-3 sm:p-4 space-y-2.5">
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder={t.space.searchPlaceholder}
              aria-label={t.space.searchPlaceholder}
              className="h-9 pl-8 pr-8 text-xs sm:text-sm bg-background"
            />
            {searchDraft && (
              <button
                type="button"
                aria-label={t.space.clearSearch}
                onClick={() => handleSelectTopic("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <Button type="submit" size="sm" className="h-9 shrink-0">
            {t.space.searchBtn}
          </Button>
        </form>

        <div className="flex flex-wrap items-center gap-1.5">
          {COSMIC_TOPICS.map((topic) => {
            const active =
              activeQuery.toLowerCase() === topic.query.toLowerCase();
            return (
              <button
                key={topic.fallbackLabel}
                type="button"
                onClick={() => handleSelectTopic(topic.query)}
                className={cn(
                  "inline-flex min-h-7 items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors cursor-pointer",
                  active
                    ? "border-foreground/30 bg-secondary text-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {t.space.topics[topic.query] ?? topic.fallbackLabel}
              </button>
            );
          })}
        </div>
      </div>

      {/* Space Masonry Gallery or Zero-Fallback Empty State */}
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
        <div
          data-testid="nasa-empty-state"
          className="rounded-xl border border-dashed border-border py-20 px-4 text-center space-y-2"
        >
          <Orbit className="mx-auto size-6 text-muted-foreground/70" />
          <p className="text-sm font-medium text-foreground">
            {locale === "vi" ? t.space.emptyTitle : "No space images available"}
          </p>
          <p className="mx-auto max-w-md text-xs text-muted-foreground">
            {t.space.emptySubtitle}
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

      {/* Infinite Scroll Sentinel */}
      <div
        ref={sentinelRef}
        className="flex min-h-14 items-center justify-center py-3"
      >
        {loading && items.length > 0 && (
          <Loader2
            aria-label="Loading more space frames"
            className="size-4 animate-spin text-muted-foreground"
          />
        )}
      </div>
    </div>
  );
}

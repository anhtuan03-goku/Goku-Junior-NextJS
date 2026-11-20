"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  type DecoratedFeedImage,
  MinimalImageCard,
} from "@/components/images/image-card";
import { useAppSession } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/primitives";
import { getExploreImageKey } from "@/domain/entities/explore-feed";
import { cn } from "@/lib/utils";

const GALLERY_COLUMNS = "columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4";
const MAX_EMPTY_AUTO_LOADS = 3;

function imageKey(item: DecoratedFeedImage) {
  return `${item.provider}:${item.externalId}`;
}

export function InfiniteExploreFeed({
  seed,
  initialItems,
  initialHasMore,
}: {
  seed: number;
  initialItems: DecoratedFeedImage[];
  initialHasMore: boolean;
}) {
  const { t, showPhotographerInfo } = useAppSession();
  const [session] = useState(() => ({ seed, initialKeys: initialItems.map(getExploreImageKey) }));
  const [{ firstPage, laterItems }, setItems] = useState(() => ({
    firstPage: initialItems,
    laterItems: [] as DecoratedFeedImage[],
  }));
  const [nextPage, setNextPage] = useState(initialItems.length > 0 ? 2 : 1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [emptyLoads, setEmptyLoads] = useState(0);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const seenKeysRef = useRef<Set<string> | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const firstPageRef = useRef<HTMLDivElement | null>(null);
  const laterItemsRef = useRef<HTMLDivElement | null>(null);
  const hasItems = firstPage.length > 0;

  useLayoutEffect(() => {
    const initialGallery = firstPageRef.current;
    const extension = laterItemsRef.current;
    if (!initialGallery || !extension) return;

    const initialCards = Array.from(initialGallery.querySelectorAll(":scope > article"));
    const addedCards = Array.from(extension.children) as HTMLDivElement[];

    const placeAddedCards = () => {
      const { columnCount, columnGap } = getComputedStyle(initialGallery);
      const count = Number(columnCount) || 1;
      const gap = Number.parseFloat(columnGap) || 0;
      const bounds = initialGallery.getBoundingClientRect();
      if (bounds.width === 0) return;

      const columnStep = (bounds.width + gap) / count;
      const ends = new Array<number>(count).fill(0);

      // The first page keeps its original column flow. Start each extension at its last card.
      for (const card of initialCards) {
        const rect = card.getBoundingClientRect();
        const column = Math.round((rect.left - bounds.left) / columnStep);
        ends[column] = Math.max(ends[column]!, rect.bottom - bounds.top + gap);
      }

      extension.style.setProperty("--explore-column-width", `${columnStep - gap}px`);
      const heights = addedCards.map((card) => card.getBoundingClientRect().height);

      addedCards.forEach((card, index) => {
        const top = Math.min(...ends);
        const column = ends.indexOf(top);
        card.style.left = `${column * columnStep}px`;
        card.style.top = `${top}px`;
        ends[column] = top + heights[index]!;
      });
      extension.style.height = `${Math.max(...ends)}px`;
    };

    placeAddedCards();
    const observer = new ResizeObserver(placeAddedCards);
    observer.observe(initialGallery);
    initialCards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [laterItems.length, showPhotographerInfo]);

  const loadPage = useCallback(async () => {
    if (requestRef.current) return;

    const request = new AbortController();
    requestRef.current = request;
    setLoading(true);
    setLoadFailed(false);
    try {
      const seenKeys = (seenKeysRef.current ??= new Set(session.initialKeys));
      const res = await fetch("/api/images/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: nextPage, seed: session.seed, seenKeys: [...seenKeys] }),
        cache: "no-store",
        signal: request.signal,
      });
      if (!res.ok) throw new Error("Unable to load images");

      const data = (await res.json()) as {
        items: DecoratedFeedImage[];
        hasMore: boolean;
      };
      if (request.signal.aborted) return;

      const appended = data.items.filter((item) => {
        const key = getExploreImageKey(item);
        if (seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
      });

      if (appended.length > 0) {
        setItems((previous) =>
          previous.firstPage.length > 0
            ? { ...previous, laterItems: [...previous.laterItems, ...appended] }
            : { firstPage: appended, laterItems: [] },
        );
      }
      if (appended.length > 0 || data.hasMore) setNextPage(nextPage + 1);
      setEmptyLoads((previous) => (appended.length > 0 ? 0 : previous + 1));
      setHasMore(data.hasMore);
    } catch {
      if (!request.signal.aborted) setLoadFailed(true);
    } finally {
      if (requestRef.current === request) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }, [nextPage, session]);

  useEffect(() => () => {
    requestRef.current?.abort();
    requestRef.current = null;
  }, []);

  const canAutoLoad = hasMore && !loading && !loadFailed && emptyLoads < MAX_EMPTY_AUTO_LOADS;
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !canAutoLoad || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void loadPage();
      },
      { rootMargin: "0px 0px 650px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [canAutoLoad, loadPage]);

  const handleSaveChange = useCallback(
    (key: string, savedByMe: boolean, savedImageId: string | null) => {
      const updateItem = (item: DecoratedFeedImage) =>
        imageKey(item) === key ? { ...item, savedByMe, savedImageId } : item;
      setItems((previous) => ({
        firstPage: previous.firstPage.map(updateItem),
        laterItems: previous.laterItems.map(updateItem),
      }));
    },
    [],
  );

  return (
    <div className="space-y-4">
      {!hasItems && loading ? (
        <div className={GALLERY_COLUMNS} aria-hidden="true">
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
      ) : !hasItems ? (
        <div className="rounded-lg border border-dashed border-border py-20 text-center">
          <p className="text-sm text-muted-foreground">{t.explore.empty}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1">
          <div ref={firstPageRef} className={cn(GALLERY_COLUMNS, "col-start-1 row-start-1 self-start")}>
            {firstPage.map((item) => (
              <MinimalImageCard
                key={imageKey(item)}
                item={item}
                onSaveStateChange={handleSaveChange}
              />
            ))}
          </div>

          {laterItems.length > 0 && (
            <div ref={laterItemsRef} className="pointer-events-none relative col-start-1 row-start-1 self-start">
              {laterItems.map((item) => (
                <div key={imageKey(item)} className="pointer-events-auto absolute flow-root w-[var(--explore-column-width)]">
                  <MinimalImageCard
                    item={item}
                    onSaveStateChange={handleSaveChange}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div
        ref={sentinelRef}
        className="flex min-h-14 items-center justify-center gap-2 py-3 [overflow-anchor:none]"
      >
        {loading ? (
          <span role="status">
            <Loader2 aria-hidden="true" className="size-4 animate-spin text-muted-foreground" />
            <span className="sr-only">{t.explore.loadingMore}</span>
          </span>
        ) : (hasMore || loadFailed || !hasItems) && (
          <Button type="button" variant="ghost" size="sm" onClick={() => void loadPage()}>
            {loadFailed || !hasMore ? t.explore.retry : t.explore.loadMore}
          </Button>
        )}
      </div>
    </div>
  );
}

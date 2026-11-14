"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bookmark,
  Check,
  ExternalLink,
  PenLine,
  User as UserIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useAppSession } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UserAvatarCircle } from "@/components/ui/primitives";
import type { ExternalImageItem } from "@/domain/entities/models";
import { cn } from "@/lib/utils";

export type DecoratedFeedImage = ExternalImageItem & {
  savedByMe: boolean;
  savedImageId: string | null;
};

export function MinimalImageCard({
  item,
  onSaveStateChange,
}: {
  item: DecoratedFeedImage;
  onSaveStateChange?: (
    key: string,
    savedByMe: boolean,
    savedImageId: string | null,
  ) => void;
}) {
  const router = useRouter();
  const { user, showPhotographerInfo } = useAppSession();
  const [saved, setSaved] = useState(item.savedByMe);
  const [savedId, setSavedId] = useState<string | null>(item.savedImageId);
  const [prevUserId, setPrevUserId] = useState<string | null>(user?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [openPreview, setOpenPreview] = useState(false);

  if ((user?.id ?? null) !== prevUserId) {
    setPrevUserId(user?.id ?? null);
    if (!user) {
      setSaved(false);
      setSavedId(null);
    } else {
      setSaved(item.savedByMe);
      setSavedId(item.savedImageId);
    }
  }

  const itemKey = `${item.provider}:${item.externalId}`;
  const aspectRatio = `${Math.max(item.width || 4, 1)} / ${Math.max(item.height || 5, 1)}`;

  async function handleToggleSave(e: React.MouseEvent) {
    e.stopPropagation();
    if (!user) {
      toast.info("Please sign in to save frames to your collection.");
      router.push("/login");
      return;
    }
    if (busy) return;
    setBusy(true);

    try {
      if (saved && savedId) {
        const res = await fetch(`/api/saved/${savedId}`, { method: "DELETE" });
        if (!res.ok) {
          const err = (await res.json()) as { error?: string };
          throw new Error(err.error ?? "Unable to remove saved frame.");
        }
        setSaved(false);
        setSavedId(null);
        onSaveStateChange?.(itemKey, false, null);
        toast.success("Removed from your saved frames.");
      } else {
        const res = await fetch("/api/saved", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: item.provider,
            externalId: item.externalId,
            imageUrl: item.imageUrl,
            thumbUrl: item.thumbUrl,
            color: item.color,
            width: item.width,
            height: item.height,
            description: item.description,
            photographerUsername: item.photographer?.username ?? null,
            photographerName: item.photographer?.name ?? null,
            photographerAvatar: item.photographer?.avatarUrl ?? null,
            photographerUrl: item.photographer?.profileUrl ?? null,
            downloadLocation: item.downloadLocation,
          }),
        });
        const data = (await res.json()) as {
          savedImage?: { id: string };
          error?: string;
        };
        if (!res.ok || !data.savedImage) {
          throw new Error(data.error ?? "Unable to save this frame.");
        }
        setSaved(true);
        setSavedId(data.savedImage.id);
        onSaveStateChange?.(itemKey, true, data.savedImage.id);
        toast.success("Saved to your personal collection.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const photographerHref =
    item.photographer && item.provider === "unsplash"
      ? `/photographers/${encodeURIComponent(item.photographer.username)}`
      : null;

  return (
    <>
      <article className="group relative mb-4 break-inside-avoid overflow-hidden rounded-lg border border-border/70 bg-card transition-all hover:border-foreground/30">
        <div
          onClick={() => setOpenPreview(true)}
          style={{
            aspectRatio,
            backgroundColor: item.color ?? undefined,
          }}
          className="relative w-full cursor-zoom-in overflow-hidden bg-muted"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.thumbUrl}
            alt={item.description ?? "Curated minimalist photograph"}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.015]"
          />

          <button
            type="button"
            disabled={busy}
            onClick={(e) => void handleToggleSave(e)}
            aria-label={saved ? "Remove from saved frames" : "Save frame"}
            className={cn(
              "absolute top-2.5 right-2.5 inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-medium backdrop-blur-md transition-all active:scale-95 cursor-pointer",
              saved
                ? "bg-primary text-primary-foreground opacity-100 shadow-sm"
                : "bg-background/85 text-foreground opacity-95 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-background",
            )}
          >
            {saved ? (
              <>
                <Check className="size-3.5" />
                <span>Saved</span>
              </>
            ) : (
              <>
                <Bookmark className="size-3.5" />
                <span>Save</span>
              </>
            )}
          </button>
        </div>

        {showPhotographerInfo && item.photographer && (
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-card">
            {photographerHref ? (
              <Link
                href={photographerHref}
                className="inline-flex min-w-0 items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <UserAvatarCircle
                  username={item.photographer.name}
                  avatarUrl={item.photographer.avatarUrl}
                  size="xs"
                />
                <span className="truncate font-medium text-foreground/90">
                  {item.photographer.name}
                </span>
              </Link>
            ) : (
              <div className="inline-flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                <UserAvatarCircle
                  username={item.photographer.name}
                  avatarUrl={item.photographer.avatarUrl}
                  size="xs"
                />
                <span className="truncate font-medium text-foreground/90">
                  {item.photographer.name}
                </span>
              </div>
            )}

            {photographerHref && (
              <Link
                href={photographerHref}
                className="text-[11px] text-muted-foreground hover:text-foreground shrink-0"
                title="View photographer profile"
              >
                Profile →
              </Link>
            )}
          </div>
        )}
      </article>

      <Dialog open={openPreview} onOpenChange={setOpenPreview}>
        <DialogContent className="max-w-3xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="font-medium text-sm truncate pr-6">
              {item.description || "Minimalist frame"}
            </DialogTitle>
            <DialogDescription>
              {item.width} × {item.height}px
            </DialogDescription>
          </DialogHeader>

          <div
            style={{ backgroundColor: item.color ?? undefined }}
            className="overflow-hidden rounded-md border border-border bg-muted flex items-center justify-center max-h-[68vh]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.imageUrl}
              alt={item.description ?? "Expanded frame preview"}
              className="max-h-[68vh] w-auto object-contain"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            {showPhotographerInfo && item.photographer ? (
              <div className="flex items-center gap-2.5">
                <UserAvatarCircle
                  username={item.photographer.name}
                  avatarUrl={item.photographer.avatarUrl}
                  size="sm"
                />
                <div className="text-xs">
                  <p className="font-medium">{item.photographer.name}</p>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span>@{item.photographer.username}</span>
                    {photographerHref && (
                      <Link
                        href={photographerHref}
                        onClick={() => setOpenPreview(false)}
                        className="inline-flex items-center gap-1 underline underline-offset-4 text-foreground"
                      >
                        <UserIcon className="size-3" />
                        Author profile
                      </Link>
                    )}
                    {item.photographer.profileUrl && (
                      <a
                        href={item.photographer.profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 hover:text-foreground"
                      >
                        Unsplash <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">
                Author attribution is currently hidden
              </span>
            )}

            <div className="flex items-center gap-2">
              {saved && (
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={savedId ? `/saved?highlight=${savedId}` : "/saved"}
                    onClick={() => setOpenPreview(false)}
                  >
                    <PenLine className="size-3.5" />
                    Write post
                  </Link>
                </Button>
              )}
              <Button
                variant={saved ? "secondary" : "default"}
                size="sm"
                disabled={busy}
                onClick={(e) => void handleToggleSave(e)}
              >
                {saved ? (
                  <>
                    <Check className="size-3.5" />
                    Saved
                  </>
                ) : (
                  <>
                    <Bookmark className="size-3.5" />
                    Save frame
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

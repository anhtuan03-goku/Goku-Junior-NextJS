"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import {
  Globe,
  Heart,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Trash2,
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
import { Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/primitives";
import type { PostViewItem, PostVisibility } from "@/domain/entities/models";
import { cn, formatMinimalDateTime } from "@/lib/utils";
import {
  type StoryPostFormValues,
  createStoryPostSchema,
} from "@/lib/validations/forms";

export interface ClientSavedImageItem {
  id: string;
  provider: string;
  externalId: string;
  imageUrl: string;
  thumbUrl: string;
  color: string | null;
  width: number;
  height: number;
  description: string | null;
  photographerUsername: string | null;
  photographerName: string | null;
  photographerAvatar: string | null;
  photographerUrl: string | null;
  createdAt: string;
  posts: PostViewItem[];
}

export function SavedMultiPostStudio({
  initialItems,
  initialHighlightId,
}: {
  initialItems: ClientSavedImageItem[];
  initialHighlightId?: string;
}) {
  const { showPhotographerInfo, locale, t, tr } = useAppSession();
  const [items, setItems] = useState<ClientSavedImageItem[]>(initialItems);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialHighlightId ?? null,
  );

  // Editing existing post state
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [busyPostId, setBusyPostId] = useState<string | null>(null);
  const [unsavingId, setUnsavingId] = useState<string | null>(null);

  const storySchema = useMemo(() => createStoryPostSchema(locale), [locale]);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    reset,
    trigger,
    formState: { errors, isSubmitting, touchedFields },
  } = useForm<StoryPostFormValues>({
    resolver: zodResolver(storySchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: {
      content: "",
      visibility: "PRIVATE",
    },
  });

  useEffect(() => {
    if (Object.keys(touchedFields).length > 0) {
      void trigger();
    }
  }, [locale, touchedFields, trigger]);

  const watchedContent = useWatch({ control, name: "content" });
  const watchedVisibility = useWatch({ control, name: "visibility" });

  const [prevHighlightId, setPrevHighlightId] = useState<string | undefined>(
    initialHighlightId,
  );
  if (prevHighlightId !== initialHighlightId) {
    setPrevHighlightId(initialHighlightId);
    if (initialHighlightId) {
      setSelectedId(initialHighlightId);
    }
  }

  const selectedItem = items.find((i) => i.id === selectedId) ?? null;

  async function onSubmitCreatePost(values: StoryPostFormValues) {
    if (!selectedItem) return;

    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          savedImageId: selectedItem.id,
          content: values.content.trim(),
          visibility: values.visibility,
        }),
      });
      const data = (await res.json()) as {
        post?: PostViewItem;
        error?: string;
      };
      if (!res.ok || !data.post) {
        throw new Error(data.error ?? "Unable to create story.");
      }

      setItems((prev) =>
        prev.map((it) =>
          it.id === selectedItem.id
            ? { ...it, posts: [data.post!, ...it.posts] }
            : it,
        ),
      );
      reset({ content: "", visibility: values.visibility });
      toast.success(
        values.visibility === "PUBLIC"
          ? locale === "vi"
            ? "Đã xuất bản lên Nhật Ký Cộng Đồng!"
            : "Published to Community Journal!"
          : locale === "vi"
            ? "Đã lưu thành ghi chú Riêng tư!"
            : "Saved as a Private journal note!",
      );
    } catch (err) {
      toast.error(
        tr(err instanceof Error ? err.message : "Something went wrong."),
      );
    }
  }

  async function handleToggleVisibility(post: PostViewItem) {
    if (busyPostId) return;
    const nextVis: PostVisibility =
      post.visibility === "PUBLIC" ? "PRIVATE" : "PUBLIC";
    setBusyPostId(post.id);

    try {
      const res = await fetch(`/api/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: nextVis }),
      });
      const data = (await res.json()) as {
        post?: PostViewItem;
        error?: string;
      };
      if (!res.ok || !data.post) {
        throw new Error(data.error ?? "Unable to switch visibility.");
      }

      setItems((prev) =>
        prev.map((img) => ({
          ...img,
          posts: img.posts.map((p) => (p.id === post.id ? data.post! : p)),
        })),
      );
      toast.success(
        nextVis === "PUBLIC"
          ? locale === "vi"
            ? "Câu chuyện đã chuyển sang Công khai."
            : "Story is now Public."
          : locale === "vi"
            ? "Câu chuyện đã chuyển sang Riêng tư."
            : "Story is now Private.",
      );
    } catch (err) {
      toast.error(
        tr(err instanceof Error ? err.message : "Something went wrong."),
      );
    } finally {
      setBusyPostId(null);
    }
  }

  async function handleSaveEdit(postId: string) {
    if (!editingContent.trim() || busyPostId) return;
    setBusyPostId(postId);

    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editingContent.trim() }),
      });
      const data = (await res.json()) as {
        post?: PostViewItem;
        error?: string;
      };
      if (!res.ok || !data.post) {
        throw new Error(data.error ?? "Unable to save changes.");
      }

      setItems((prev) =>
        prev.map((img) => ({
          ...img,
          posts: img.posts.map((p) => (p.id === postId ? data.post! : p)),
        })),
      );
      setEditingPostId(null);
      setEditingContent("");
      toast.success(
        locale === "vi" ? "Đã cập nhật câu chuyện." : "Story updated.",
      );
    } catch (err) {
      toast.error(
        tr(err instanceof Error ? err.message : "Something went wrong."),
      );
    } finally {
      setBusyPostId(null);
    }
  }

  async function handleDeletePost(postId: string) {
    if (busyPostId) return;
    setBusyPostId(postId);

    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Unable to delete story.");
      }

      setItems((prev) =>
        prev.map((img) => ({
          ...img,
          posts: img.posts.filter((p) => p.id !== postId),
        })),
      );
      toast.success(
        locale === "vi" ? "Đã xoá câu chuyện." : "Story deleted.",
      );
    } catch (err) {
      toast.error(
        tr(err instanceof Error ? err.message : "Something went wrong."),
      );
    } finally {
      setBusyPostId(null);
    }
  }

  async function handleUnsaveImage(savedImageId: string) {
    if (unsavingId) return;
    setUnsavingId(savedImageId);

    try {
      const res = await fetch(`/api/saved/${savedImageId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Unable to remove saved frame.");
      }
      setItems((prev) => prev.filter((i) => i.id !== savedImageId));
      if (selectedId === savedImageId) {
        setSelectedId(null);
      }
      toast.success(
        locale === "vi"
          ? "Đã gỡ khung hình khỏi bộ sưu tập."
          : "Removed frame from your collection.",
      );
    } catch (err) {
      toast.error(
        tr(err instanceof Error ? err.message : "Something went wrong."),
      );
    } finally {
      setUnsavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
          {t.saved.heading}
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          {t.saved.subheading}
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-20 text-center space-y-3">
          <p className="text-sm font-medium">{t.saved.emptyTitle}</p>
          <p className="text-xs text-muted-foreground">
            {t.saved.emptySubtitle}
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link href="/">{t.saved.exploreBtn}</Link>
          </Button>
        </div>
      ) : (
        <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4">
          {items.map((item) => {
            const pubCount = item.posts.filter(
              (p) => p.visibility === "PUBLIC",
            ).length;
            const privCount = item.posts.length - pubCount;

            return (
              <article
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                className="group mb-4 break-inside-avoid cursor-pointer overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-foreground/40"
              >
                <div
                  style={{
                    aspectRatio: `${Math.max(item.width || 4, 1)} / ${Math.max(item.height || 5, 1)}`,
                    backgroundColor: item.color ?? undefined,
                  }}
                  className="relative w-full overflow-hidden bg-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.thumbUrl}
                    alt={item.description ?? "Saved frame"}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                  />
                </div>

                <div className="p-3.5 space-y-2">
                  {showPhotographerInfo && item.photographerName && (
                    <p className="truncate text-[11px] text-muted-foreground">
                      {item.provider === "nasa"
                        ? `Image Credit: ${item.photographerName}`
                        : `${t.nav.author}: ${item.photographerName}`}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="secondary">
                        {item.posts.length}{" "}
                        {item.posts.length === 1
                          ? t.saved.storySingular
                          : t.saved.storyPlural}
                      </Badge>
                      {pubCount > 0 && (
                        <Badge variant="outline">
                          {pubCount} {t.saved.publicBadge}
                        </Badge>
                      )}
                      {privCount > 0 && (
                        <Badge variant="outline">
                          {privCount} {t.saved.privateBadge}
                        </Badge>
                      )}
                    </div>

                    <span className="text-[11px] font-medium text-foreground underline underline-offset-4">
                      {t.saved.writeManage}
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* 1-to-Many Multi-Post Studio Modal */}
      <Dialog
        open={Boolean(selectedItem)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null);
            setEditingPostId(null);
            reset({ content: "", visibility: watchedVisibility });
          }
        }}
      >
        {selectedItem && (
          <DialogContent className="max-w-3xl p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle>{t.saved.studioTitle}</DialogTitle>
              <DialogDescription>{t.saved.studioDesc}</DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 pt-1">
              {/* Image preview column */}
              <div className="md:col-span-5 space-y-3">
                <div
                  style={{ backgroundColor: selectedItem.color ?? undefined }}
                  className="overflow-hidden rounded-lg border border-border bg-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selectedItem.imageUrl}
                    alt={selectedItem.description ?? "Saved frame"}
                    className="w-full h-auto max-h-80 object-cover"
                  />
                </div>

                {showPhotographerInfo && selectedItem.photographerName && (
                  <div className="text-xs text-muted-foreground">
                    {selectedItem.provider === "nasa"
                      ? "Image Credit: "
                      : `${t.nav.author}: `}
                    {selectedItem.photographerUsername &&
                    (selectedItem.provider === "unsplash" ||
                      selectedItem.provider === "pixabay") ? (
                      <Link
                        href={`/photographers/${encodeURIComponent(selectedItem.photographerUsername)}`}
                        className="font-medium text-foreground underline underline-offset-4"
                      >
                        {selectedItem.photographerName}
                      </Link>
                    ) : (
                      <span className="font-medium text-foreground">
                        {selectedItem.photographerName}
                      </span>
                    )}
                    {selectedItem.provider === "pixabay" && (
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

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-destructive hover:text-destructive"
                  disabled={unsavingId === selectedItem.id}
                  onClick={() => void handleUnsaveImage(selectedItem.id)}
                >
                  <Trash2 className="size-3.5" />
                  {t.saved.unsaveBtn.replace(
                    "{count}",
                    String(selectedItem.posts.length),
                  )}
                </Button>
              </div>

              {/* Multi-Post Composer & List column (React Hook Form + Zod) */}
              <div className="md:col-span-7 space-y-5">
                <form
                  noValidate
                  onSubmit={(e) => void handleSubmit(onSubmitCreatePost)(e)}
                  className="space-y-3 rounded-lg border border-border p-3.5 bg-secondary/25"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold">
                      {t.saved.newStoryTitle}
                    </span>
                    <div className="inline-flex rounded-md border border-border p-0.5 bg-background">
                      <button
                        type="button"
                        onClick={() =>
                          setValue("visibility", "PRIVATE", {
                            shouldDirty: true,
                          })
                        }
                        className={cn(
                          "inline-flex min-h-9 items-center gap-1 rounded px-3 py-1 text-[11px] font-medium cursor-pointer transition-all active:scale-95",
                          watchedVisibility === "PRIVATE"
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Lock className="size-3" />
                        {t.saved.privateBtn}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setValue("visibility", "PUBLIC", {
                            shouldDirty: true,
                          })
                        }
                        className={cn(
                          "inline-flex min-h-9 items-center gap-1 rounded px-3 py-1 text-[11px] font-medium cursor-pointer transition-all active:scale-95",
                          watchedVisibility === "PUBLIC"
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Globe className="size-3" />
                        {t.saved.publicBtn}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Textarea
                      maxLength={2050}
                      placeholder={t.saved.storyPlaceholder}
                      aria-invalid={Boolean(errors.content) || undefined}
                      className={cn(
                        "min-h-20 bg-background text-xs sm:text-sm",
                        errors.content &&
                          "border-destructive focus-visible:border-destructive",
                      )}
                      {...register("content")}
                    />
                    {errors.content?.message && (
                      <p
                        role="alert"
                        className="text-[11px] font-medium text-destructive"
                      >
                        {errors.content.message}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {watchedContent.length}/2000 {t.saved.charactersCount}
                    </span>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={isSubmitting || Boolean(errors.content)}
                    >
                      {isSubmitting ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Plus className="size-3.5" />
                      )}
                      {isSubmitting
                        ? t.saved.savingStoryBtn
                        : t.saved.saveStoryBtn}
                    </Button>
                  </div>
                </form>

                {/* Existing posts list on this saved image */}
                <div className="space-y-2.5">
                  <h3 className="text-xs font-medium text-muted-foreground">
                    {t.saved.storiesListHeading.replace(
                      "{count}",
                      String(selectedItem.posts.length),
                    )}
                  </h3>

                  {selectedItem.posts.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                      {t.saved.noStoriesYet}
                    </p>
                  ) : (
                    <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                      {selectedItem.posts.map((post) => {
                        const isEditing = editingPostId === post.id;
                        const isBusy = busyPostId === post.id;

                        return (
                          <div
                            key={post.id}
                            className="rounded-lg border border-border p-3.5 space-y-2.5 bg-card"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() =>
                                    void handleToggleVisibility(post)
                                  }
                                  className={cn(
                                    "inline-flex min-h-9 items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-medium cursor-pointer transition-all active:scale-95",
                                    post.visibility === "PUBLIC"
                                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                      : "border-border bg-secondary text-secondary-foreground",
                                  )}
                                >
                                  {post.visibility === "PUBLIC" ? (
                                    <>
                                      <Globe className="size-3" />
                                      {t.saved.publicClickToHide}
                                    </>
                                  ) : (
                                    <>
                                      <Lock className="size-3" />
                                      {t.saved.privateClickToPublish}
                                    </>
                                  )}
                                </button>

                                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                  <Heart className="size-3" />
                                  {post.likesCount}{" "}
                                  {post.likesCount === 1
                                    ? t.saved.heartSingular
                                    : t.saved.heartPlural}
                                </span>
                              </div>

                              <span className="text-[11px] text-muted-foreground">
                                {formatMinimalDateTime(post.updatedAt)}
                              </span>
                            </div>

                            {isEditing ? (
                              <div className="space-y-2">
                                <Textarea
                                  value={editingContent}
                                  onChange={(e) =>
                                    setEditingContent(e.target.value)
                                  }
                                  maxLength={2000}
                                  className="min-h-20 text-xs sm:text-sm"
                                />
                                <div className="flex justify-end gap-2">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setEditingPostId(null);
                                      setEditingContent("");
                                    }}
                                  >
                                    {t.saved.cancelBtn}
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    disabled={
                                      isBusy || !editingContent.trim()
                                    }
                                    onClick={() => void handleSaveEdit(post.id)}
                                  >
                                    {t.saved.saveChangesBtn}
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <p className="whitespace-pre-line text-xs sm:text-sm leading-relaxed">
                                {post.content}
                              </p>
                            )}

                            {!isEditing && (
                              <div className="flex items-center justify-end gap-1.5 pt-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={isBusy}
                                  onClick={() => {
                                    setEditingPostId(post.id);
                                    setEditingContent(post.content);
                                  }}
                                >
                                  <Pencil className="size-3.5" />
                                  {t.saved.editBtn}
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={isBusy}
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => void handleDeletePost(post.id)}
                                >
                                  <Trash2 className="size-3.5" />
                                  {t.saved.deleteBtn}
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

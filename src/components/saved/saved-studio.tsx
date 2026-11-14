"use client";

import React, { useState } from "react";
import Link from "next/link";
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
  const { showPhotographerInfo } = useAppSession();
  const [items, setItems] = useState<ClientSavedImageItem[]>(initialItems);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialHighlightId ?? null,
  );

  // New post composer state (1 saved image -> Many posts!)
  const [newContent, setNewContent] = useState("");
  const [newVisibility, setNewVisibility] = useState<PostVisibility>("PRIVATE");
  const [creatingPost, setCreatingPost] = useState(false);

  // Editing existing post state
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [busyPostId, setBusyPostId] = useState<string | null>(null);
  const [unsavingId, setUnsavingId] = useState<string | null>(null);

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

  async function handleCreatePost(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedItem || creatingPost) return;
    if (!newContent.trim()) {
      toast.error("Vui lòng nhập nội dung bài viết.");
      return;
    }

    setCreatingPost(true);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          savedImageId: selectedItem.id,
          content: newContent.trim(),
          visibility: newVisibility,
        }),
      });
      const data = (await res.json()) as {
        post?: PostViewItem;
        error?: string;
      };
      if (!res.ok || !data.post) {
        throw new Error(data.error ?? "Không thể tạo bài viết.");
      }

      setItems((prev) =>
        prev.map((it) =>
          it.id === selectedItem.id
            ? { ...it, posts: [data.post!, ...it.posts] }
            : it,
        ),
      );
      setNewContent("");
      toast.success(
        newVisibility === "PUBLIC"
          ? "Đã đăng bài viết công khai!"
          : "Đã lưu bài viết riêng tư!",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Đã xảy ra lỗi.");
    } finally {
      setCreatingPost(false);
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
        throw new Error(data.error ?? "Không thể đổi chế độ hiển thị.");
      }

      setItems((prev) =>
        prev.map((img) => ({
          ...img,
          posts: img.posts.map((p) => (p.id === post.id ? data.post! : p)),
        })),
      );
      toast.success(
        nextVis === "PUBLIC"
          ? "Đã chuyển bài viết sang Công khai (Public)."
          : "Đã chuyển bài viết sang Riêng tư (Private).",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Đã xảy ra lỗi.");
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
        throw new Error(data.error ?? "Không thể lưu chỉnh sửa.");
      }

      setItems((prev) =>
        prev.map((img) => ({
          ...img,
          posts: img.posts.map((p) => (p.id === postId ? data.post! : p)),
        })),
      );
      setEditingPostId(null);
      setEditingContent("");
      toast.success("Đã cập nhật nội dung bài viết.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Đã xảy ra lỗi.");
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
        throw new Error(err.error ?? "Không thể xóa bài viết.");
      }

      setItems((prev) =>
        prev.map((img) => ({
          ...img,
          posts: img.posts.filter((p) => p.id !== postId),
        })),
      );
      toast.success("Đã xóa bài viết.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Đã xảy ra lỗi.");
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
        throw new Error(err.error ?? "Không thể bỏ lưu ảnh.");
      }
      setItems((prev) => prev.filter((i) => i.id !== savedImageId));
      if (selectedId === savedImageId) {
        setSelectedId(null);
      }
      toast.success("Đã xóa ảnh khỏi bộ sưu tập cá nhân.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Đã xảy ra lỗi.");
    } finally {
      setUnsavingId(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border py-20 text-center space-y-3">
        <p className="text-sm font-medium">Kho hình ảnh đã lưu đang trống</p>
        <p className="text-xs text-muted-foreground">
          Hãy khám phá và lưu những bức ảnh bạn yêu thích để bắt đầu viết các bài viết cá nhân hoặc công khai.
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/">Khám phá hình ảnh ngay</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
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
                  alt={item.description ?? "Ảnh đã lưu"}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                />
              </div>

              <div className="p-3.5 space-y-2">
                {showPhotographerInfo && item.photographerName && (
                  <p className="truncate text-[11px] text-muted-foreground">
                    Tác giả: {item.photographerName}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="secondary">
                      {item.posts.length} bài viết
                    </Badge>
                    {pubCount > 0 && (
                      <Badge variant="outline">{pubCount} Public</Badge>
                    )}
                    {privCount > 0 && (
                      <Badge variant="outline">{privCount} Private</Badge>
                    )}
                  </div>

                  <span className="text-[11px] font-medium text-foreground underline underline-offset-4">
                    Viết / Quản lý →
                  </span>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* 1-to-Many Multi-Post Studio Modal */}
      <Dialog
        open={Boolean(selectedItem)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null);
            setEditingPostId(null);
          }
        }}
      >
        {selectedItem && (
          <DialogContent className="max-w-3xl p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle>Không gian bài viết cho hình ảnh đã lưu</DialogTitle>
              <DialogDescription>
                Bạn có thể viết nhiều bài viết khác nhau trên cùng một hình ảnh, chỉnh sửa nội dung hoặc bật/tắt Private ↔ Public bất cứ lúc nào.
              </DialogDescription>
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
                    alt={selectedItem.description ?? "Hình ảnh đã lưu"}
                    className="w-full h-auto max-h-80 object-cover"
                  />
                </div>

                {showPhotographerInfo && selectedItem.photographerName && (
                  <div className="text-xs text-muted-foreground">
                    Nhiếp ảnh gia:{" "}
                    {selectedItem.photographerUsername &&
                    selectedItem.provider === "unsplash" ? (
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
                  Bỏ lưu ảnh này (xóa kèm {selectedItem.posts.length} bài viết)
                </Button>
              </div>

              {/* Multi-Post Composer & List column */}
              <div className="md:col-span-7 space-y-5">
                <form
                  onSubmit={(e) => void handleCreatePost(e)}
                  className="space-y-3 rounded-lg border border-border p-3.5 bg-secondary/25"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold">
                      Thêm bài viết mới cho ảnh này
                    </span>
                    <div className="inline-flex rounded-md border border-border p-0.5 bg-background">
                      <button
                        type="button"
                        onClick={() => setNewVisibility("PRIVATE")}
                        className={cn(
                          "inline-flex min-h-9 items-center gap-1 rounded px-3 py-1 text-[11px] font-medium cursor-pointer transition-colors",
                          newVisibility === "PRIVATE"
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Lock className="size-3" />
                        Private
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewVisibility("PUBLIC")}
                        className={cn(
                          "inline-flex min-h-9 items-center gap-1 rounded px-3 py-1 text-[11px] font-medium cursor-pointer transition-colors",
                          newVisibility === "PUBLIC"
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Globe className="size-3" />
                        Public
                      </button>
                    </div>
                  </div>

                  <Textarea
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    maxLength={2000}
                    placeholder="Viết suy nghĩ, cảm hứng hoặc câu chuyện của bạn về khung hình này..."
                    className="min-h-20 bg-background text-xs sm:text-sm"
                  />

                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">
                      {newContent.length}/2000 ký tự
                    </span>
                    <Button type="submit" size="sm" disabled={creatingPost}>
                      {creatingPost ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Plus className="size-3.5" />
                      )}
                      Tạo bài viết
                    </Button>
                  </div>
                </form>

                {/* Existing posts list on this saved image */}
                <div className="space-y-2.5">
                  <h3 className="text-xs font-medium text-muted-foreground">
                    Danh sách bài viết trên ảnh này ({selectedItem.posts.length})
                  </h3>

                  {selectedItem.posts.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                      Chưa có bài viết nào cho ảnh này.
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
                                  onClick={() => void handleToggleVisibility(post)}
                                  title="Nhấn để chuyển đổi nhanh Private ↔ Public"
                                  className={cn(
                                    "inline-flex min-h-9 items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-medium cursor-pointer transition-colors",
                                    post.visibility === "PUBLIC"
                                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                      : "border-border bg-secondary text-secondary-foreground",
                                  )}
                                >
                                  {post.visibility === "PUBLIC" ? (
                                    <>
                                      <Globe className="size-3" />
                                      Public (Bấm để ẩn)
                                    </>
                                  ) : (
                                    <>
                                      <Lock className="size-3" />
                                      Private (Bấm để công khai)
                                    </>
                                  )}
                                </button>

                                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                  <Heart className="size-3" />
                                  {post.likesCount} lượt thích
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
                                    Hủy
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    disabled={isBusy}
                                    onClick={() => void handleSaveEdit(post.id)}
                                  >
                                    Lưu thay đổi
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
                                  Sửa
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
                                  Xóa
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
    </>
  );
}

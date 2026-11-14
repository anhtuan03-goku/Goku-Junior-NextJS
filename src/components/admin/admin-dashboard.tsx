"use client";

import React, { useState } from "react";
import {
  Activity,
  Heart,
  Lock,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  Unlock,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, UserAvatarCircle } from "@/components/ui/primitives";
import type {
  AdminUserSummary,
  LikeAuditEntry,
  PlatformStats,
} from "@/domain/entities/models";
import { cn, formatMinimalDate, formatMinimalDateTime } from "@/lib/utils";

export function AdminConsoleDashboard({
  initialStats,
  initialUsers,
  initialLikeLogs,
  currentAdminId,
}: {
  initialStats: PlatformStats;
  initialUsers: AdminUserSummary[];
  initialLikeLogs: LikeAuditEntry[];
  currentAdminId: string;
}) {
  const [activeTab, setActiveTab] = useState<"overview" | "users" | "likes">(
    "overview",
  );
  const [stats, setStats] = useState<PlatformStats>(initialStats);
  const [users, setUsers] = useState<AdminUserSummary[]>(initialUsers);
  const [likeLogs, setLikeLogs] = useState<LikeAuditEntry[]>(initialLikeLogs);
  const [userSearch, setUserSearch] = useState("");
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function refreshAll() {
    setRefreshing(true);
    try {
      const [statsRes, usersRes, likesRes] = await Promise.all([
        fetch("/api/admin/stats", { cache: "no-store" }),
        fetch(
          `/api/admin/users${userSearch.trim() ? `?search=${encodeURIComponent(userSearch.trim())}` : ""}`,
          { cache: "no-store" },
        ),
        fetch("/api/admin/likes?limit=120", { cache: "no-store" }),
      ]);

      if (statsRes.ok) {
        const d = (await statsRes.json()) as { stats: PlatformStats };
        setStats(d.stats);
      }
      if (usersRes.ok) {
        const d = (await usersRes.json()) as { users: AdminUserSummary[] };
        setUsers(d.users);
      }
      if (likesRes.ok) {
        const d = (await likesRes.json()) as { logs: LikeAuditEntry[] };
        setLikeLogs(d.logs);
      }
      toast.success("Đã làm mới dữ liệu quản trị.");
    } catch {
      toast.error("Không thể làm mới dữ liệu.");
    } finally {
      setRefreshing(false);
    }
  }

  async function handleSearchUsers(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch(
        `/api/admin/users${userSearch.trim() ? `?search=${encodeURIComponent(userSearch.trim())}` : ""}`,
        { cache: "no-store" },
      );
      if (res.ok) {
        const d = (await res.json()) as { users: AdminUserSummary[] };
        setUsers(d.users);
      }
    } catch {
      toast.error("Không thể tìm kiếm người dùng.");
    }
  }

  async function handlePatchUser(
    target: AdminUserSummary,
    patch: { isActive?: boolean; role?: "USER" | "ADMIN" },
  ) {
    if (busyUserId) return;
    setBusyUserId(target.id);

    try {
      const res = await fetch(`/api/admin/users/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Không thể cập nhật người dùng.");
      }

      setUsers((prev) =>
        prev.map((u) => (u.id === target.id ? { ...u, ...patch } : u)),
      );
      toast.success(`Đã cập nhật tài khoản @${target.username}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Đã xảy ra lỗi.");
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleDeleteUser(target: AdminUserSummary) {
    if (busyUserId) return;
    setBusyUserId(target.id);

    try {
      const res = await fetch(`/api/admin/users/${target.id}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Không thể xóa người dùng.");
      }
      setUsers((prev) => prev.filter((u) => u.id !== target.id));
      toast.success(
        `Đã xóa tài khoản @${target.username} và dọn sạch dữ liệu liên quan.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Đã xảy ra lỗi.");
    } finally {
      setBusyUserId(null);
    }
  }

  const maxDailyVal = Math.max(
    1,
    ...stats.dailyActivity.map((d) => Math.max(d.savedCount, d.postCount)),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap sm:inline-flex max-w-full gap-1 rounded-lg border border-border p-1 bg-card">
          {(
            [
              { id: "overview", label: "Thống kê & Worker" },
              { id: "users", label: `Người dùng (${users.length})` },
              { id: "likes", label: `Nhật ký Thả tim (${likeLogs.length})` },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={cn(
                "inline-flex min-h-9 items-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                activeTab === t.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <Button
          variant="outline"
          size="sm"
          disabled={refreshing}
          onClick={() => void refreshAll()}
        >
          <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
          Làm mới
        </Button>
      </div>

      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* KPI Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-border bg-card p-4 space-y-1">
              <p className="text-xs text-muted-foreground">Tổng người dùng</p>
              <p className="text-2xl font-semibold tabular-nums">
                {stats.totalUsers}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {stats.activeUsers} hoạt động · {stats.lockedUsers} bị khóa
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 space-y-1">
              <p className="text-xs text-muted-foreground">Tổng lượt lưu hình</p>
              <p className="text-2xl font-semibold tabular-nums">
                {stats.totalSavedImages}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Đã kích hoạt download event
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 space-y-1">
              <p className="text-xs text-muted-foreground">Tổng bài viết</p>
              <p className="text-2xl font-semibold tabular-nums">
                {stats.totalPosts}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {stats.publicPosts} Public · {stats.privatePosts} Private
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 space-y-1">
              <p className="text-xs text-muted-foreground">
                Tổng lượt thả tim (Active)
              </p>
              <p className="text-2xl font-semibold tabular-nums">
                {stats.totalLikes}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Ẩn danh với user, ghi log Admin
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* 7-Day Activity Chart */}
            <div className="lg:col-span-7 rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold">
                    Hoạt động 7 ngày gần nhất
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    So sánh lượt lưu hình ảnh và lượt đăng bài viết mỗi ngày
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full bg-primary" />
                    Lưu ảnh
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full bg-muted-foreground/50" />
                    Bài viết
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-2 pt-2 items-end h-44">
                {stats.dailyActivity.map((day) => {
                  const savePct = Math.round(
                    (day.savedCount / maxDailyVal) * 100,
                  );
                  const postPct = Math.round(
                    (day.postCount / maxDailyVal) * 100,
                  );

                  return (
                    <div
                      key={day.date}
                      className="flex flex-col items-center gap-2 h-full justify-end"
                    >
                      <div className="flex items-end gap-1 w-full justify-center h-32">
                        <div
                          style={{ height: `${Math.max(savePct, 4)}%` }}
                          title={`Lưu ảnh: ${day.savedCount}`}
                          className="w-2.5 sm:w-3 rounded-t bg-primary transition-all"
                        />
                        <div
                          style={{ height: `${Math.max(postPct, 4)}%` }}
                          title={`Bài viết: ${day.postCount}`}
                          className="w-2.5 sm:w-3 rounded-t bg-muted-foreground/45 transition-all"
                        />
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] font-medium tabular-nums">
                          {day.savedCount}/{day.postCount}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {day.date.slice(5)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Unsplash Quota Worker Health */}
            <div className="lg:col-span-5 rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Activity className="size-4" />
                  <h2 className="text-sm font-semibold">
                    Unsplash Quota Worker
                  </h2>
                </div>
                <Badge variant="secondary">Zero-429 Active</Badge>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">
                    Ngân sách khả dụng trong giờ
                  </span>
                  <span className="font-semibold tabular-nums">
                    {stats.quota.remainingQuota} / {stats.quota.limitQuota} req
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(
                          (stats.quota.remainingQuota /
                            Math.max(stats.quota.limitQuota, 1)) *
                            100,
                        ),
                      )}%`,
                    }}
                    className="h-full bg-primary transition-all"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Cửa sổ kế tiếp làm mới lúc:{" "}
                  {formatMinimalDateTime(stats.quota.windowResetAt)}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 border-t border-border/60 pt-3 text-center">
                <div>
                  <p className="text-base font-semibold tabular-nums">
                    {stats.quota.cachedImagesCount}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Ảnh trong Pool
                  </p>
                </div>
                <div>
                  <p className="text-base font-semibold tabular-nums">
                    {stats.quota.cachedPhotographersCount}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Hồ sơ Tác giả
                  </p>
                </div>
                <div>
                  <p className="text-base font-semibold tabular-nums">
                    {stats.quota.pendingJobsCount}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Job Hàng đợi
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "users" && (
        <div className="space-y-4">
          <form
            onSubmit={(e) => void handleSearchUsers(e)}
            className="flex max-w-sm items-center gap-2"
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Tìm theo username..."
                className="pl-8 text-xs"
              />
            </div>
            <Button type="submit" variant="outline" size="sm">
              Lọc
            </Button>
          </form>

          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-secondary/40 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Người dùng</th>
                  <th className="px-4 py-3 font-medium">Vai trò</th>
                  <th className="px-4 py-3 font-medium">Trạng thái</th>
                  <th className="px-4 py-3 font-medium text-right">Ảnh lưu</th>
                  <th className="px-4 py-3 font-medium text-right">
                    Bài viết (Pub/Priv)
                  </th>
                  <th className="px-4 py-3 font-medium">Ngày tạo</th>
                  <th className="px-4 py-3 font-medium text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {users.map((u) => {
                  const isSelf = u.id === currentAdminId;
                  const isBusy = busyUserId === u.id;

                  return (
                    <tr key={u.id} className="hover:bg-accent/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <UserAvatarCircle
                            username={u.username}
                            avatarUrl={u.avatarUrl}
                            size="xs"
                          />
                          <span className="font-medium">@{u.username}</span>
                          {isSelf && (
                            <Badge variant="outline">Bạn</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={u.role === "ADMIN" ? "default" : "secondary"}
                        >
                          {u.role}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={u.isActive ? "outline" : "destructive"}
                        >
                          {u.isActive ? "Hoạt động" : "Đã khóa"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">
                        {u.savedCount}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span className="font-medium">{u.postCount}</span>{" "}
                        <span className="text-muted-foreground">
                          ({u.publicPostCount}/{u.privatePostCount})
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatMinimalDate(u.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={isSelf || isBusy}
                            title={
                              u.role === "ADMIN"
                                ? "Chuyển thành USER"
                                : "Cấp quyền ADMIN"
                            }
                            onClick={() =>
                              void handlePatchUser(u, {
                                role: u.role === "ADMIN" ? "USER" : "ADMIN",
                              })
                            }
                          >
                            <Shield className="size-3.5" />
                            {u.role === "ADMIN" ? "Hạ USER" : "Cấp ADMIN"}
                          </Button>

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={isSelf || isBusy}
                            onClick={() =>
                              void handlePatchUser(u, {
                                isActive: !u.isActive,
                              })
                            }
                          >
                            {u.isActive ? (
                              <>
                                <Lock className="size-3.5" />
                                Khóa
                              </>
                            ) : (
                              <>
                                <Unlock className="size-3.5" />
                                Mở
                              </>
                            )}
                          </Button>

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={isSelf || isBusy}
                            className="text-destructive hover:text-destructive"
                            onClick={() => void handleDeleteUser(u)}
                            title="Xóa người dùng và giải phóng slot Cloudinary"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "likes" && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Nhật ký độc quyền dành cho Admin: Người dùng thông thường (kể cả tác giả bài viết) không bao giờ xem được danh sách này.
          </p>

          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-secondary/40 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Thời gian</th>
                  <th className="px-4 py-3 font-medium">Người thực hiện</th>
                  <th className="px-4 py-3 font-medium">Hành động</th>
                  <th className="px-4 py-3 font-medium">Tác giả bài viết</th>
                  <th className="px-4 py-3 font-medium">Trích đoạn bài viết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {likeLogs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-10 text-center text-muted-foreground"
                    >
                      Chưa có sự kiện thả tim nào được ghi nhận.
                    </td>
                  </tr>
                ) : (
                  likeLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-accent/30">
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground tabular-nums">
                        {formatMinimalDateTime(log.createdAt)}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        @{log.actorUsername}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            log.action === "LIKE" ? "default" : "secondary"
                          }
                        >
                          <Heart className="mr-1 size-3" />
                          {log.action === "LIKE" ? " Đã thích" : " Đã bỏ thích"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        @{log.postAuthorUsername}
                      </td>
                      <td className="px-4 py-3 max-w-xs truncate">
                        {log.postExcerpt}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

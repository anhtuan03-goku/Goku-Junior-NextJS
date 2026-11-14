"use client";

import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useAppSession } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatarCircle } from "@/components/ui/primitives";
import { Switch } from "@/components/ui/switch";
import type { SafeUserDTO } from "@/domain/entities/models";
import { compressAvatarToWebP } from "@/lib/compress-avatar";

export function ProfileSettingsPanel({
  initialUser,
}: {
  initialUser: SafeUserDTO;
}) {
  const router = useRouter();
  const { user, setUser, showPhotographerInfo, togglePhotographerMode } =
    useAppSession();
  const activeUser = user ?? initialUser;

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [compressionNote, setCompressionNote] = useState<string | null>(null);

  const [username, setUsername] = useState(activeUser.username);
  const [savingUsername, setSavingUsername] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  async function handleAvatarSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const rawFile = e.target.files?.[0];
    e.target.value = "";
    if (!rawFile) return;

    setUploadingAvatar(true);
    setCompressionNote(null);

    try {
      const originalKb = Math.max(1, Math.round(rawFile.size / 1024));
      const compressedFile = await compressAvatarToWebP(rawFile, 512, 0.82);
      const compressedKb = Math.max(1, Math.round(compressedFile.size / 1024));

      setCompressionNote(
        `Đã nén tự động: ${originalKb} KB → ${compressedKb} KB (${compressedFile.type})`,
      );

      const form = new FormData();
      form.append("avatar", compressedFile);

      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        body: form,
      });

      const data = (await res.json()) as {
        user?: SafeUserDTO;
        error?: string;
      };
      if (!res.ok || !data.user) {
        throw new Error(data.error ?? "Không thể tải lên ảnh đại diện.");
      }

      setUser(data.user);
      toast.success("Đã cập nhật ảnh đại diện (slot cũ đã được thu hồi tự động).");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi tải ảnh đại diện.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleRemoveAvatar() {
    if (!activeUser.avatarUrl || uploadingAvatar) return;
    setUploadingAvatar(true);

    try {
      const res = await fetch("/api/profile/avatar", {
        method: "DELETE",
      });
      const data = (await res.json()) as {
        user?: SafeUserDTO;
        error?: string;
      };
      if (!res.ok || !data.user) {
        throw new Error(data.error ?? "Không thể xóa ảnh đại diện.");
      }
      setUser(data.user);
      setCompressionNote(null);
      toast.success("Đã xóa ảnh đại diện khỏi Cloudinary.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Đã xảy ra lỗi.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleUpdateUsername(e: React.FormEvent) {
    e.preventDefault();
    if (savingUsername) return;
    setSavingUsername(true);

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });
      const data = (await res.json()) as {
        user?: SafeUserDTO;
        error?: string;
      };
      if (!res.ok || !data.user) {
        throw new Error(data.error ?? "Không thể đổi tên đăng nhập.");
      }
      setUser(data.user);
      setUsername(data.user.username);
      toast.success(`Đã đổi tên đăng nhập thành @${data.user.username}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Đã xảy ra lỗi.");
    } finally {
      setSavingUsername(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (savingPassword) return;
    setSavingPassword(true);

    try {
      const res = await fetch("/api/profile/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });
      const data = (await res.json()) as {
        user?: SafeUserDTO;
        error?: string;
      };
      if (!res.ok || !data.user) {
        throw new Error(data.error ?? "Không thể đổi mật khẩu.");
      }
      setCurrentPassword("");
      setNewPassword("");
      toast.success("Đã cập nhật mật khẩu mới an toàn.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Đã xảy ra lỗi.");
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Section 1: Single-slot Cloudinary Avatar */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Ảnh đại diện (1 Slot duy nhất)</h2>
          <p className="text-xs text-muted-foreground">
            Ảnh được tự động cắt vuông và nén sang chuẩn WebP nhẹ trước khi lưu lên Cloudinary. Khi cập nhật ảnh mới, ảnh cũ được xóa tự động.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <UserAvatarCircle
            username={activeUser.username}
            avatarUrl={activeUser.avatarUrl}
            size="lg"
          />

          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => void handleAvatarSelect(e)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploadingAvatar}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadingAvatar ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Upload className="size-3.5" />
                )}
                Chọn & nén ảnh mới
              </Button>

              {activeUser.avatarUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={uploadingAvatar}
                  className="text-destructive hover:text-destructive"
                  onClick={() => void handleRemoveAvatar()}
                >
                  <Trash2 className="size-3.5" />
                  Xóa avatar
                </Button>
              )}
            </div>

            {compressionNote && (
              <p className="text-[11px] text-muted-foreground">
                {compressionNote}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Section 2: Photographer Attribution Mode */}
      <div className="rounded-xl border border-border bg-card p-6 flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">
            Hiển thị thông tin nhiếp ảnh gia theo ảnh
          </h2>
          <p className="text-xs text-muted-foreground">
            Khi bật, mỗi bức ảnh sẽ hiển thị tên nhiếp ảnh gia và đường dẫn xem hồ sơ chi tiết của tác giả đó.
          </p>
        </div>
        <Switch
          checked={showPhotographerInfo}
          onCheckedChange={(checked) => void togglePhotographerMode(checked)}
          aria-label="Bật hoặc tắt hiển thị thông tin nhiếp ảnh gia"
        />
      </div>

      {/* Section 3: Unique Username */}
      <form
        onSubmit={(e) => void handleUpdateUsername(e)}
        className="rounded-xl border border-border bg-card p-6 space-y-4"
      >
        <div>
          <h2 className="text-sm font-semibold">Đổi tên đăng nhập (Unique)</h2>
          <p className="text-xs text-muted-foreground">
            Chỉ gồm chữ thường, chữ số và ký tự `._-` (từ 3–32 ký tự).
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5">
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            minLength={3}
            maxLength={32}
            required
            className="sm:max-w-xs"
          />
          <Button
            type="submit"
            size="sm"
            disabled={savingUsername || username.trim().toLowerCase() === activeUser.username}
          >
            {savingUsername && <Loader2 className="size-3.5 animate-spin" />}
            Lưu tên mới
          </Button>
        </div>
      </form>

      {/* Section 4: Password */}
      <form
        onSubmit={(e) => void handleChangePassword(e)}
        className="rounded-xl border border-border bg-card p-6 space-y-4"
      >
        <div>
          <h2 className="text-sm font-semibold">Đổi mật khẩu</h2>
          <p className="text-xs text-muted-foreground">
            Đổi mật khẩu sẽ tự động thu hồi mọi phiên đăng nhập cũ trên thiết bị khác.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium" htmlFor="current-password">
              Mật khẩu hiện tại
            </label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" htmlFor="new-password">
              Mật khẩu mới (tối thiểu 8 ký tự)
            </label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
        </div>

        <Button type="submit" size="sm" disabled={savingPassword}>
          {savingPassword && <Loader2 className="size-3.5 animate-spin" />}
          Cập nhật mật khẩu
        </Button>
      </form>
    </div>
  );
}

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
        `Auto-compressed: ${originalKb} KB → ${compressedKb} KB (${compressedFile.type})`,
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
        throw new Error(data.error ?? "Unable to upload avatar.");
      }

      setUser(data.user);
      toast.success("Avatar updated (previous slot automatically reclaimed).");
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Avatar upload failed.",
      );
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
        throw new Error(data.error ?? "Unable to remove avatar.");
      }
      setUser(data.user);
      setCompressionNote(null);
      toast.success("Avatar removed and Cloudinary slot freed.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
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
        throw new Error(data.error ?? "Unable to update username.");
      }
      setUser(data.user);
      setUsername(data.user.username);
      toast.success(`Username updated to @${data.user.username}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
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
        throw new Error(data.error ?? "Unable to change password.");
      }
      setCurrentPassword("");
      setNewPassword("");
      toast.success("Password updated securely.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Section 1: Single-slot Cloudinary Avatar */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Avatar (Single-Slot Storage)</h2>
          <p className="text-xs text-muted-foreground">
            Your image is center-cropped and compressed to lightweight WebP
            before uploading to Cloudinary. Updating automatically purges the
            previous slot.
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
                Choose & compress photo
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
                  Remove avatar
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
            Show photographer attribution on frames
          </h2>
          <p className="text-xs text-muted-foreground">
            When enabled, each frame displays the photographer&apos;s name and a
            direct link to their curated profile.
          </p>
        </div>
        <Switch
          checked={showPhotographerInfo}
          onCheckedChange={(checked) => void togglePhotographerMode(checked)}
          aria-label="Toggle photographer attribution"
        />
      </div>

      {/* Section 3: Unique Username */}
      <form
        onSubmit={(e) => void handleUpdateUsername(e)}
        className="rounded-xl border border-border bg-card p-6 space-y-4"
      >
        <div>
          <h2 className="text-sm font-semibold">Change Username (Unique)</h2>
          <p className="text-xs text-muted-foreground">
            Lowercase letters, numbers, and `._-` characters only (3–32
            characters).
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
            disabled={
              savingUsername ||
              username.trim().toLowerCase() === activeUser.username
            }
          >
            {savingUsername && <Loader2 className="size-3.5 animate-spin" />}
            Save username
          </Button>
        </div>
      </form>

      {/* Section 4: Password */}
      <form
        onSubmit={(e) => void handleChangePassword(e)}
        className="rounded-xl border border-border bg-card p-6 space-y-4"
      >
        <div>
          <h2 className="text-sm font-semibold">Change Password</h2>
          <p className="text-xs text-muted-foreground">
            Updating your password immediately revokes all active sessions on
            other devices.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium" htmlFor="current-password">
              Current password
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
              New password (at least 8 characters)
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
          Update password
        </Button>
      </form>
    </div>
  );
}

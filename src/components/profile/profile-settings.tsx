"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Check, Loader2, Sparkles, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useAppSession } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatarCircle } from "@/components/ui/primitives";
import { Switch } from "@/components/ui/switch";
import type { SafeUserDTO } from "@/domain/entities/models";
import { compressAvatarToWebP } from "@/lib/compress-avatar";
import {
  PERSONA_OPTIONS,
  type PersonaId,
  VISUAL_THEME_OPTIONS,
  loadUserPersonaPreference,
  saveUserPersonaPreference,
} from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  type ChangePasswordFormValues,
  type UpdateUsernameFormValues,
  createChangePasswordSchema,
  createUpdateUsernameSchema,
} from "@/lib/validations/forms";

export function ProfileSettingsPanel({
  initialUser,
}: {
  initialUser: SafeUserDTO;
}) {
  const router = useRouter();
  const {
    user,
    setUser,
    showPhotographerInfo,
    togglePhotographerMode,
    locale,
    t,
    tr,
  } = useAppSession();
  const activeUser = user ?? initialUser;

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [compressionNote, setCompressionNote] = useState<string | null>(null);

  // Local non-PII "Bạn là ai?" state (lazy-loaded without cascading effect)
  const [persona, setPersona] = useState<PersonaId>(
    () => loadUserPersonaPreference(activeUser.username)?.persona ?? "",
  );
  const [favoriteThemes, setFavoriteThemes] = useState<string[]>(
    () => loadUserPersonaPreference(activeUser.username)?.favoriteThemes ?? [],
  );
  const [creativeNote, setCreativeNote] = useState<string>(
    () => loadUserPersonaPreference(activeUser.username)?.creativeNote ?? "",
  );

  const usernameSchema = useMemo(
    () => createUpdateUsernameSchema(locale),
    [locale],
  );
  const passwordSchema = useMemo(
    () => createChangePasswordSchema(locale),
    [locale],
  );

  const usernameForm = useForm<UpdateUsernameFormValues>({
    resolver: zodResolver(usernameSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: {
      username: activeUser.username,
    },
  });

  const passwordForm = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmNewPassword: "",
    },
  });

  useEffect(() => {
    if (Object.keys(usernameForm.formState.touchedFields).length > 0) {
      void usernameForm.trigger();
    }
    if (Object.keys(passwordForm.formState.touchedFields).length > 0) {
      void passwordForm.trigger();
    }
  }, [locale, passwordForm, usernameForm]);

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
        locale === "vi"
          ? `Đã nén tự động: ${originalKb} KB → ${compressedKb} KB (${compressedFile.type})`
          : `Auto-compressed: ${originalKb} KB → ${compressedKb} KB (${compressedFile.type})`,
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
      toast.success(
        locale === "vi"
          ? "Đã cập nhật ảnh đại diện (tự động thu hồi ảnh cũ trên Cloudinary)."
          : "Avatar updated (previous slot automatically reclaimed).",
      );
      router.refresh();
    } catch (err) {
      toast.error(
        tr(err instanceof Error ? err.message : "Avatar upload failed."),
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
      toast.success(
        locale === "vi"
          ? "Đã xoá ảnh đại diện và giải phóng ô lưu trữ Cloudinary."
          : "Avatar removed and Cloudinary slot freed.",
      );
      router.refresh();
    } catch (err) {
      toast.error(
        tr(err instanceof Error ? err.message : "Something went wrong."),
      );
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function onSubmitUsername(values: UpdateUsernameFormValues) {
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: values.username.trim() }),
      });
      const data = (await res.json()) as {
        user?: SafeUserDTO;
        error?: string;
      };
      if (!res.ok || !data.user) {
        throw new Error(data.error ?? "Unable to update username.");
      }
      setUser(data.user);
      usernameForm.reset({ username: data.user.username });
      toast.success(
        locale === "vi"
          ? `Đã cập nhật tên đăng nhập thành @${data.user.username}`
          : `Username updated to @${data.user.username}`,
      );
      router.refresh();
    } catch (err) {
      toast.error(
        tr(err instanceof Error ? err.message : "Something went wrong."),
      );
    }
  }

  async function onSubmitPassword(values: ChangePasswordFormValues) {
    try {
      const res = await fetch("/api/profile/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        }),
      });
      const data = (await res.json()) as {
        user?: SafeUserDTO;
        error?: string;
      };
      if (!res.ok || !data.user) {
        throw new Error(data.error ?? "Unable to change password.");
      }
      passwordForm.reset();
      toast.success(
        locale === "vi"
          ? "Đã cập nhật mật khẩu an toàn."
          : "Password updated securely.",
      );
    } catch (err) {
      toast.error(
        tr(err instanceof Error ? err.message : "Something went wrong."),
      );
    }
  }

  function handleSaveLocalPersona(e: React.FormEvent) {
    e.preventDefault();
    saveUserPersonaPreference(activeUser.username, {
      persona,
      favoriteThemes,
      creativeNote: creativeNote.trim().slice(0, 120),
    });
    toast.success(
      locale === "vi"
        ? "Đã lưu tuỳ chọn 'Bạn là ai?' trên trình duyệt này."
        : "Saved your local creative persona preference.",
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
          {t.settings.heading}
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          {t.settings.subheading}
        </p>
      </div>

      {/* Section 1: Single-slot Cloudinary Avatar */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold">{t.settings.avatarTitle}</h2>
          <p className="text-xs text-muted-foreground">
            {t.settings.avatarDesc}
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
                {t.settings.chooseAvatarBtn}
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
                  {t.settings.removeAvatarBtn}
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
            {t.settings.photographerTitle}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t.settings.photographerDesc}
          </p>
        </div>
        <Switch
          checked={showPhotographerInfo}
          onCheckedChange={(checked) => void togglePhotographerMode(checked)}
          aria-label={t.settings.photographerTitle}
        />
      </div>

      {/* Section 3: Optional Local "Bạn là ai?" Preference */}
      <form
        onSubmit={handleSaveLocalPersona}
        className="rounded-xl border border-border bg-card p-6 space-y-4"
      >
        <div className="space-y-1">
          <h2 className="text-sm font-semibold inline-flex items-center gap-1.5">
            <Sparkles className="size-4 text-muted-foreground" />
            {t.settings.personaTitle}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t.settings.personaDesc}
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {PERSONA_OPTIONS.map((opt) => {
            const active = persona === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPersona(active ? "" : opt.id)}
                className={cn(
                  "inline-flex min-h-8 items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {active && <Check className="size-3" />}
                {opt.label[locale]}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {VISUAL_THEME_OPTIONS.map((themeItem) => {
            const active = favoriteThemes.includes(themeItem.id);
            return (
              <button
                key={themeItem.id}
                type="button"
                onClick={() => {
                  if (active) {
                    setFavoriteThemes((prev) =>
                      prev.filter((i) => i !== themeItem.id),
                    );
                  } else if (favoriteThemes.length < 3) {
                    setFavoriteThemes((prev) => [...prev, themeItem.id]);
                  }
                }}
                className={cn(
                  "inline-flex min-h-7 items-center gap-1 rounded-md border px-2.5 py-0.5 text-[11px] font-medium transition-colors cursor-pointer",
                  active
                    ? "border-foreground/40 bg-secondary text-foreground"
                    : "border-border/70 bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                #{themeItem.label[locale]}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5">
          <Input
            value={creativeNote}
            maxLength={120}
            onChange={(e) => setCreativeNote(e.target.value)}
            placeholder={t.auth.creativeNotePlaceholder}
            className="flex-1"
          />
          <Button type="submit" variant="outline" size="sm">
            {t.settings.savePersonaBtn}
          </Button>
        </div>
      </form>

      {/* Section 4: Unique Username (React Hook Form + Zod) */}
      <form
        noValidate
        onSubmit={(e) => void usernameForm.handleSubmit(onSubmitUsername)(e)}
        className="rounded-xl border border-border bg-card p-6 space-y-4"
      >
        <div>
          <h2 className="text-sm font-semibold">{t.settings.usernameTitle}</h2>
          <p className="text-xs text-muted-foreground">
            {t.settings.usernameDesc}
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <Input
              aria-invalid={
                Boolean(usernameForm.formState.errors.username) || undefined
              }
              className={cn(
                "sm:max-w-xs",
                usernameForm.formState.errors.username &&
                  "border-destructive focus-visible:border-destructive",
              )}
              {...usernameForm.register("username")}
            />
            <Button
              type="submit"
              size="sm"
              disabled={
                usernameForm.formState.isSubmitting ||
                !usernameForm.formState.isDirty ||
                Boolean(usernameForm.formState.errors.username)
              }
            >
              {usernameForm.formState.isSubmitting && (
                <Loader2 className="size-3.5 animate-spin" />
              )}
              {t.settings.saveUsernameBtn}
            </Button>
          </div>
          {usernameForm.formState.errors.username?.message && (
            <p role="alert" className="text-[11px] font-medium text-destructive">
              {usernameForm.formState.errors.username.message}
            </p>
          )}
        </div>
      </form>

      {/* Section 5: Password (React Hook Form + Zod) */}
      <form
        noValidate
        onSubmit={(e) => void passwordForm.handleSubmit(onSubmitPassword)(e)}
        className="rounded-xl border border-border bg-card p-6 space-y-4"
      >
        <div>
          <h2 className="text-sm font-semibold">{t.settings.passwordTitle}</h2>
          <p className="text-xs text-muted-foreground">
            {t.settings.passwordDesc}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium" htmlFor="current-password">
              {t.settings.currentPasswordLabel}
            </label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              aria-invalid={
                Boolean(passwordForm.formState.errors.currentPassword) ||
                undefined
              }
              className={cn(
                passwordForm.formState.errors.currentPassword &&
                  "border-destructive focus-visible:border-destructive",
              )}
              {...passwordForm.register("currentPassword")}
            />
            {passwordForm.formState.errors.currentPassword?.message && (
              <p
                role="alert"
                className="text-[11px] font-medium text-destructive"
              >
                {passwordForm.formState.errors.currentPassword.message}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium" htmlFor="new-password">
              {t.settings.newPasswordLabel}
            </label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={
                Boolean(passwordForm.formState.errors.newPassword) || undefined
              }
              className={cn(
                passwordForm.formState.errors.newPassword &&
                  "border-destructive focus-visible:border-destructive",
              )}
              {...passwordForm.register("newPassword")}
            />
            {passwordForm.formState.errors.newPassword?.message && (
              <p
                role="alert"
                className="text-[11px] font-medium text-destructive"
              >
                {passwordForm.formState.errors.newPassword.message}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label
              className="text-xs font-medium"
              htmlFor="confirm-new-password"
            >
              {t.settings.confirmNewPasswordLabel}
            </label>
            <Input
              id="confirm-new-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={
                Boolean(passwordForm.formState.errors.confirmNewPassword) ||
                undefined
              }
              className={cn(
                passwordForm.formState.errors.confirmNewPassword &&
                  "border-destructive focus-visible:border-destructive",
              )}
              {...passwordForm.register("confirmNewPassword")}
            />
            {passwordForm.formState.errors.confirmNewPassword?.message && (
              <p
                role="alert"
                className="text-[11px] font-medium text-destructive"
              >
                {passwordForm.formState.errors.confirmNewPassword.message}
              </p>
            )}
          </div>
        </div>

        <Button
          type="submit"
          size="sm"
          disabled={
            passwordForm.formState.isSubmitting ||
            Object.keys(passwordForm.formState.errors).length > 0
          }
        >
          {passwordForm.formState.isSubmitting && (
            <Loader2 className="size-3.5 animate-spin" />
          )}
          {t.settings.updatePasswordBtn}
        </Button>
      </form>
    </div>
  );
}

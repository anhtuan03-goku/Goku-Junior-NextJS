"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ArrowLeft, Eye, EyeOff, Loader2, Shield } from "lucide-react";
import { toast } from "sonner";
import { PolarBearMascot } from "@/components/auth/polar-bear-mascot";
import { useAppSession } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SafeUserDTO } from "@/domain/entities/models";
import { cn } from "@/lib/utils";
import {
  type LoginFormValues,
  createLoginFormSchema,
} from "@/lib/validations/forms";

type AdminFocusedField = "username" | "password" | null;

function computeCaretLookX(input: HTMLInputElement): number {
  const caret = input.selectionStart ?? input.value.length;
  const progress = Math.min(Math.max(caret / 24, 0), 1);
  return -0.88 + progress * 1.76;
}

export function AdminLoginForm({
  currentMemberUsername,
}: {
  currentMemberUsername?: string | null;
}) {
  const router = useRouter();
  const { setUser, locale, t, tr } = useAppSession();

  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<AdminFocusedField>(null);
  const [caretLookX, setCaretLookX] = useState<number>(0);
  const [hasServerError, setHasServerError] = useState(false);

  const schema = useMemo(() => createLoginFormSchema(locale), [locale]);

  const {
    register,
    handleSubmit,
    trigger,
    formState: { errors, isSubmitting, touchedFields },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: {
      username: "",
      password: "",
    },
  });

  useEffect(() => {
    if (Object.keys(touchedFields).length > 0) {
      void trigger();
    }
  }, [locale, touchedFields, trigger]);

  const focusedLookY =
    focusedField === "username"
      ? 0.55
      : focusedField === "password"
        ? 0.75
        : null;

  function triggerErrorFeedback() {
    setHasServerError(true);
    window.setTimeout(() => setHasServerError(false), 500);
  }

  function syncCaretFromEvent(
    field: Exclude<AdminFocusedField, null>,
    el: HTMLInputElement,
  ) {
    setFocusedField(field);
    setCaretLookX(computeCaretLookX(el));
  }

  async function onSubmit(values: LoginFormValues) {
    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: values.username.trim(),
          password: values.password,
        }),
      });

      const data = (await res.json()) as {
        user?: SafeUserDTO;
        error?: string;
      };

      if (!res.ok || !data.user) {
        throw new Error(data.error ?? "Invalid administrator credentials.");
      }

      setUser(data.user);
      toast.success(
        locale === "vi"
          ? `Đã mở phiên Quản trị viên cho @${data.user.username}.`
          : `Admin session opened for @${data.user.username}.`,
      );
      router.push("/admin");
      router.refresh();
    } catch (err) {
      triggerErrorFeedback();
      toast.error(
        tr(
          err instanceof Error
            ? err.message
            : "Unable to verify admin access.",
        ),
      );
    }
  }

  const usernameField = register("username");
  const passwordField = register("password");

  return (
    <div className="mx-auto flex min-h-[74vh] max-w-sm flex-col justify-center py-6 sm:py-8">
      <div className="space-y-5 rounded-2xl border border-border bg-card p-6 sm:p-7 shadow-xs">
        <div className="flex items-center justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/70 px-3 py-1 text-[11px] font-medium tracking-wide text-foreground">
            <Shield className="size-3.5" />
            {t.adminLogin.badge}
          </span>
        </div>

        <div className="pt-0.5">
          <PolarBearMascot
            inputLookX={focusedField ? caretLookX : null}
            inputLookY={focusedLookY}
            isCoveringEyes={showPassword}
            isInputFocused={focusedField !== null}
            isHappy={isSubmitting}
            hasError={hasServerError || Object.keys(errors).length > 0}
          />
        </div>

        <div className="space-y-1 text-center">
          <h1 className="text-lg font-semibold tracking-tight">
            {t.adminLogin.title}
          </h1>
          <p className="text-xs text-muted-foreground">
            {t.adminLogin.subtitle}
          </p>
        </div>

        {currentMemberUsername && (
          <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-[11px] text-muted-foreground text-center">
            {t.adminLogin.currentMemberNote.replace(
              "{username}",
              currentMemberUsername,
            )}
          </div>
        )}

        <form
          noValidate
          onSubmit={(e) =>
            void handleSubmit(onSubmit, () => triggerErrorFeedback())(e)
          }
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <label
              htmlFor="admin-username"
              className="block text-xs font-medium text-foreground"
            >
              {t.adminLogin.usernameLabel}
            </label>
            <Input
              id="admin-username"
              autoComplete="username"
              placeholder={t.adminLogin.usernamePlaceholder}
              aria-invalid={Boolean(errors.username) || undefined}
              className={cn(
                errors.username &&
                  "border-destructive focus-visible:border-destructive",
              )}
              {...usernameField}
              onFocus={(e) => syncCaretFromEvent("username", e.currentTarget)}
              onBlur={(e) => {
                void usernameField.onBlur(e);
                setFocusedField((cur) => (cur === "username" ? null : cur));
              }}
              onClick={(e) => syncCaretFromEvent("username", e.currentTarget)}
              onKeyUp={(e) => syncCaretFromEvent("username", e.currentTarget)}
            />
            {errors.username?.message && (
              <p role="alert" className="text-[11px] font-medium text-destructive">
                {errors.username.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="admin-password"
              className="block text-xs font-medium text-foreground"
            >
              {t.adminLogin.passwordLabel}
            </label>
            <div className="relative">
              <Input
                id="admin-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                aria-invalid={Boolean(errors.password) || undefined}
                className={cn(
                  "pr-9",
                  errors.password &&
                    "border-destructive focus-visible:border-destructive",
                )}
                {...passwordField}
                onFocus={(e) => syncCaretFromEvent("password", e.currentTarget)}
                onBlur={(e) => {
                  void passwordField.onBlur(e);
                  setFocusedField((cur) => (cur === "password" ? null : cur));
                }}
                onClick={(e) => syncCaretFromEvent("password", e.currentTarget)}
                onKeyUp={(e) => syncCaretFromEvent("password", e.currentTarget)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute top-1/2 right-0.5 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground active:scale-95 cursor-pointer"
                aria-label={
                  showPassword ? t.auth.hidePassword : t.auth.showPassword
                }
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
            {errors.password?.message && (
              <p role="alert" className="text-[11px] font-medium text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full h-10 font-medium shadow-sm active:scale-[0.97]"
            disabled={isSubmitting || Object.keys(errors).length > 0}
          >
            {isSubmitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Shield className="size-4" />
            )}
            <span>
              {isSubmitting
                ? t.adminLogin.submittingBtn
                : t.adminLogin.submitBtn}
            </span>
          </Button>
        </form>

        <div className="pt-1 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            {t.adminLogin.backToMemberLogin}
          </Link>
        </div>
      </div>
    </div>
  );
}

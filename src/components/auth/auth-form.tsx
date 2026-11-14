"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PolarBearMascot } from "@/components/auth/polar-bear-mascot";
import { useAppSession } from "@/components/providers/app-providers";
import { GeneratedBrandIcon } from "@/components/ui/brand-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SafeUserDTO } from "@/domain/entities/models";
import { cn } from "@/lib/utils";

type FocusedField = "username" | "password" | "confirmPassword" | null;

function computeCaretLookX(input: HTMLInputElement): number {
  const caret = input.selectionStart ?? input.value.length;
  // Smoothly sweep from left (-0.9) to right (+0.9) across ~24 characters
  const progress = Math.min(Math.max(caret / 24, 0), 1);
  return -0.88 + progress * 1.76;
}

export function MinimalAuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const { setUser } = useAppSession();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Polar bear tracking state
  const [focusedField, setFocusedField] = useState<FocusedField>(null);
  const [caretLookX, setCaretLookX] = useState<number>(0);
  const [hasError, setHasError] = useState(false);

  const isRegister = mode === "register";
  const isCoveringEyes =
    showPassword || (isRegister && showConfirmPassword);

  const passwordsMatch =
    isRegister &&
    password.length >= 8 &&
    confirmPassword.length > 0 &&
    password === confirmPassword;

  const confirmMismatch =
    isRegister && confirmPassword.length > 0 && password !== confirmPassword;

  const focusedLookY =
    focusedField === "username"
      ? 0.55
      : focusedField === "password"
        ? 0.72
        : focusedField === "confirmPassword"
          ? 0.88
          : null;

  function triggerErrorFeedback() {
    setHasError(true);
    window.setTimeout(() => setHasError(false), 500);
  }

  function syncCaretFromEvent(
    field: Exclude<FocusedField, null>,
    el: HTMLInputElement,
  ) {
    setFocusedField(field);
    setCaretLookX(computeCaretLookX(el));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    if (isRegister && password !== confirmPassword) {
      triggerErrorFeedback();
      toast.error("Passwords do not match. Please double-check your confirmation.");
      return;
    }

    setSubmitting(true);

    try {
      const endpoint = isRegister ? "/api/auth/register" : "/api/auth/login";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      const data = (await res.json()) as {
        user?: SafeUserDTO;
        error?: string;
      };

      if (!res.ok || !data.user) {
        throw new Error(data.error ?? "Unable to authenticate your account.");
      }

      setUser(data.user);
      toast.success(
        isRegister
          ? `Welcome @${data.user.username}! Your account is ready.`
          : `Welcome back, @${data.user.username}!`,
      );
      router.push("/");
      router.refresh();
    } catch (err) {
      triggerErrorFeedback();
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[74vh] max-w-sm flex-col justify-center py-6 sm:py-8">
      <div className="space-y-5 rounded-2xl border border-border bg-card p-6 sm:p-7 shadow-xs">
        {/* Segmented Auth Switcher with Generated Icons & Clear Active State */}
        <div
          role="tablist"
          aria-label="Authentication mode"
          className="grid grid-cols-2 gap-1 rounded-xl border border-border/80 bg-secondary/60 p-1"
        >
          <Link
            href="/login"
            role="tab"
            aria-selected={!isRegister}
            className={cn(
              "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150 active:scale-[0.96]",
              !isRegister
                ? "bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-background/60",
            )}
          >
            <GeneratedBrandIcon name="login" className="size-3.5" />
            <span>Sign in</span>
          </Link>
          <Link
            href="/register"
            role="tab"
            aria-selected={isRegister}
            className={cn(
              "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150 active:scale-[0.96]",
              isRegister
                ? "bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-background/60",
            )}
          >
            <GeneratedBrandIcon name="register" className="size-3.5" />
            <span>Sign up</span>
          </Link>
        </div>

        {/* Interactive White Polar Bear Mascot */}
        <div className="pt-1">
          <PolarBearMascot
            inputLookX={focusedField ? caretLookX : null}
            inputLookY={focusedLookY}
            isCoveringEyes={isCoveringEyes}
            isInputFocused={focusedField !== null}
            isHappy={passwordsMatch || submitting}
            hasError={hasError || confirmMismatch}
          />
        </div>

        <div className="space-y-1 text-center">
          <h1 className="text-lg font-semibold tracking-tight">
            {isRegister ? "Create your naut.frame account" : "Welcome back"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {isRegister
              ? "Choose a unique username and password to start collecting."
              : "Sign in to access your saved frames and visual journal."}
          </p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="username"
              className="block text-xs font-medium text-foreground"
            >
              Username
            </label>
            <Input
              id="username"
              name="username"
              autoComplete="username"
              required
              minLength={3}
              maxLength={32}
              value={username}
              onFocus={(e) => syncCaretFromEvent("username", e.currentTarget)}
              onBlur={() =>
                setFocusedField((cur) => (cur === "username" ? null : cur))
              }
              onClick={(e) => syncCaretFromEvent("username", e.currentTarget)}
              onKeyUp={(e) => syncCaretFromEvent("username", e.currentTarget)}
              onChange={(e) => {
                setUsername(e.target.value);
                syncCaretFromEvent("username", e.currentTarget);
              }}
              placeholder="e.g. naut_minimal"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="password"
              className="block text-xs font-medium text-foreground"
            >
              Password
            </label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={isRegister ? "new-password" : "current-password"}
                required
                minLength={isRegister ? 8 : 1}
                maxLength={128}
                value={password}
                onFocus={(e) => syncCaretFromEvent("password", e.currentTarget)}
                onBlur={() =>
                  setFocusedField((cur) => (cur === "password" ? null : cur))
                }
                onClick={(e) => syncCaretFromEvent("password", e.currentTarget)}
                onKeyUp={(e) => syncCaretFromEvent("password", e.currentTarget)}
                onChange={(e) => {
                  setPassword(e.target.value);
                  syncCaretFromEvent("password", e.currentTarget);
                }}
                placeholder={isRegister ? "At least 8 characters" : "••••••••"}
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute top-1/2 right-0.5 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground active:scale-95 cursor-pointer"
                aria-label={
                  showPassword
                    ? "Hide password characters"
                    : "Show password characters"
                }
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
          </div>

          {isRegister && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="confirm-password"
                  className="block text-xs font-medium text-foreground"
                >
                  Confirm password
                </label>
                {passwordsMatch && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                    <Check className="size-3" />
                    Matched
                  </span>
                )}
              </div>
              <div className="relative">
                <Input
                  id="confirm-password"
                  name="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={128}
                  value={confirmPassword}
                  aria-invalid={confirmMismatch || undefined}
                  onFocus={(e) =>
                    syncCaretFromEvent("confirmPassword", e.currentTarget)
                  }
                  onBlur={() =>
                    setFocusedField((cur) =>
                      cur === "confirmPassword" ? null : cur,
                    )
                  }
                  onClick={(e) =>
                    syncCaretFromEvent("confirmPassword", e.currentTarget)
                  }
                  onKeyUp={(e) =>
                    syncCaretFromEvent("confirmPassword", e.currentTarget)
                  }
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    syncCaretFromEvent("confirmPassword", e.currentTarget);
                  }}
                  placeholder="Re-enter your password"
                  className={cn(
                    "pr-9",
                    confirmMismatch &&
                      "border-destructive focus-visible:ring-destructive/30",
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute top-1/2 right-0.5 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground active:scale-95 cursor-pointer"
                  aria-label={
                    showConfirmPassword
                      ? "Hide confirm password characters"
                      : "Show confirm password characters"
                  }
                >
                  {showConfirmPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
              {confirmMismatch && (
                <p className="text-[11px] text-destructive">
                  Confirmation password does not match yet.
                </p>
              )}
            </div>
          )}

          <Button
            type="submit"
            className="w-full h-10 font-medium shadow-sm active:scale-[0.97]"
            disabled={submitting || confirmMismatch}
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <GeneratedBrandIcon
                name={isRegister ? "register" : "login"}
                className="size-4"
              />
            )}
            <span>{isRegister ? "Create account" : "Sign in"}</span>
          </Button>
        </form>
      </div>
    </div>
  );
}

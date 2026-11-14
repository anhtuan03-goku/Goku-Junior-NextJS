"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, EyeOff, Loader2, Shield } from "lucide-react";
import { toast } from "sonner";
import { PolarBearMascot } from "@/components/auth/polar-bear-mascot";
import { useAppSession } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SafeUserDTO } from "@/domain/entities/models";

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
  const { setUser } = useAppSession();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [focusedField, setFocusedField] = useState<AdminFocusedField>(null);
  const [caretLookX, setCaretLookX] = useState<number>(0);
  const [hasError, setHasError] = useState(false);

  const focusedLookY =
    focusedField === "username"
      ? 0.55
      : focusedField === "password"
        ? 0.75
        : null;

  function triggerErrorFeedback() {
    setHasError(true);
    window.setTimeout(() => setHasError(false), 500);
  }

  function syncCaretFromEvent(
    field: Exclude<AdminFocusedField, null>,
    el: HTMLInputElement,
  ) {
    setFocusedField(field);
    setCaretLookX(computeCaretLookX(el));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/admin/auth/login", {
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
        throw new Error(
          data.error ?? "Invalid administrator credentials.",
        );
      }

      setUser(data.user);
      toast.success(`Admin session opened for @${data.user.username}.`);
      router.push("/admin");
      router.refresh();
    } catch (err) {
      triggerErrorFeedback();
      toast.error(
        err instanceof Error ? err.message : "Unable to verify admin access.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[74vh] max-w-sm flex-col justify-center py-6 sm:py-8">
      <div className="space-y-5 rounded-2xl border border-border bg-card p-6 sm:p-7 shadow-xs">
        <div className="flex items-center justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/70 px-3 py-1 text-[11px] font-medium tracking-wide text-foreground">
            <Shield className="size-3.5" />
            Admin Portal · Restricted Access
          </span>
        </div>

        <div className="pt-0.5">
          <PolarBearMascot
            inputLookX={focusedField ? caretLookX : null}
            inputLookY={focusedLookY}
            isCoveringEyes={showPassword}
            isInputFocused={focusedField !== null}
            isHappy={submitting}
            hasError={hasError}
          />
        </div>

        <div className="space-y-1 text-center">
          <h1 className="text-lg font-semibold tracking-tight">
            Administrator Sign In
          </h1>
          <p className="text-xs text-muted-foreground">
            Dedicated gateway for platform governance, quota telemetry, and
            moderation audit logs.
          </p>
        </div>

        {currentMemberUsername && (
          <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-[11px] text-muted-foreground text-center">
            Currently signed in as member{" "}
            <span className="font-medium text-foreground">
              @{currentMemberUsername}
            </span>
            . Authenticate below with an Administrator account to switch
            sessions.
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="admin-username"
              className="block text-xs font-medium text-foreground"
            >
              Admin username
            </label>
            <Input
              id="admin-username"
              name="username"
              autoComplete="username"
              required
              minLength={3}
              maxLength={64}
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
              placeholder="Administrator username"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="admin-password"
              className="block text-xs font-medium text-foreground"
            >
              Admin password
            </label>
            <div className="relative">
              <Input
                id="admin-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                minLength={1}
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
                placeholder="••••••••"
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute top-1/2 right-0.5 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground active:scale-95 cursor-pointer"
                aria-label={
                  showPassword
                    ? "Hide admin password characters"
                    : "Show admin password characters"
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

          <Button
            type="submit"
            className="w-full h-10 font-medium shadow-sm active:scale-[0.97]"
            disabled={submitting}
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Shield className="size-4" />
            )}
            <span>Enter Admin Console</span>
          </Button>
        </form>

        <div className="pt-1 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            Member sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

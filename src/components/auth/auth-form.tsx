"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { PolarBearMascot } from "@/components/auth/polar-bear-mascot";
import { useAppSession } from "@/components/providers/app-providers";
import { GeneratedBrandIcon } from "@/components/ui/brand-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { SafeUserDTO } from "@/domain/entities/models";
import {
  PERSONA_OPTIONS,
  type PersonaId,
  VISUAL_THEME_OPTIONS,
  saveUserPersonaPreference,
} from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  type LoginFormValues,
  type RegisterFormValues,
  createLoginFormSchema,
  createRegisterFormSchema,
} from "@/lib/validations/forms";

type FocusedField =
  | "username"
  | "password"
  | "confirmPassword"
  | "creativeNote"
  | null;

type RegisterStep = 1 | 2 | 3;

function computeCaretLookX(input: HTMLInputElement): number {
  const caret = input.selectionStart ?? input.value.length;
  const progress = Math.min(Math.max(caret / 24, 0), 1);
  return -0.88 + progress * 1.76;
}

export function MinimalAuthForm({ mode }: { mode: "login" | "register" }) {
  if (mode === "register") {
    return <MultiStepRegisterWizard />;
  }
  return <LoginFormCard />;
}

function AuthModeTabs({ isRegister }: { isRegister: boolean }) {
  const { t } = useAppSession();

  return (
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
        <span>{t.auth.signInTab}</span>
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
        <span>{t.auth.signUpTab}</span>
      </Link>
    </div>
  );
}

function LoginFormCard() {
  const router = useRouter();
  const { setUser, locale, t, tr } = useAppSession();

  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<FocusedField>(null);
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

  // Re-translate active error messages when user switches language VI <-> EN
  useEffect(() => {
    const touchedKeys = Object.keys(touchedFields) as Array<
      keyof LoginFormValues
    >;
    if (touchedKeys.length > 0) {
      void trigger(touchedKeys);
    }
  }, [locale, touchedFields, trigger]);

  const isCoveringEyes = showPassword;
  const hasAnyError = hasServerError || Object.keys(errors).length > 0;
  const focusedLookY =
    focusedField === "username"
      ? 0.55
      : focusedField === "password"
        ? 0.75
        : null;

  function pulseErrorShake() {
    setHasServerError(true);
    window.setTimeout(() => setHasServerError(false), 500);
  }

  function syncCaretFromEvent(
    field: Exclude<FocusedField, null>,
    el: HTMLInputElement,
  ) {
    setFocusedField(field);
    setCaretLookX(computeCaretLookX(el));
  }

  async function onSubmit(values: LoginFormValues) {
    try {
      const res = await fetch("/api/auth/login", {
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
        throw new Error(data.error ?? "Unable to authenticate your account.");
      }

      setUser(data.user);
      toast.success(
        t.auth.welcomeLoginToast.replace("{username}", data.user.username),
      );
      router.push(data.user.role === "ADMIN" ? "/admin" : "/");
      router.refresh();
    } catch (err) {
      pulseErrorShake();
      const rawMsg =
        err instanceof Error ? err.message : "Something went wrong.";
      toast.error(tr(rawMsg));
    }
  }

  const usernameField = register("username");
  const passwordField = register("password");

  return (
    <div className="mx-auto flex min-h-[74vh] max-w-sm flex-col justify-center py-6 sm:py-8">
      <div className="space-y-5 rounded-2xl border border-border bg-card p-6 sm:p-7 shadow-xs">
        <AuthModeTabs isRegister={false} />

        <div className="pt-1">
          <PolarBearMascot
            inputLookX={focusedField ? caretLookX : null}
            inputLookY={focusedLookY}
            isCoveringEyes={isCoveringEyes}
            isInputFocused={focusedField !== null}
            isHappy={isSubmitting}
            hasError={hasAnyError}
          />
        </div>

        <div className="space-y-1 text-center">
          <h1 className="text-lg font-semibold tracking-tight">
            {t.auth.loginTitle}
          </h1>
          <p className="text-xs text-muted-foreground">
            {t.auth.loginSubtitle}
          </p>
        </div>

        <form
          noValidate
          onSubmit={(e) =>
            void handleSubmit(onSubmit, () => pulseErrorShake())(e)
          }
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <label
              htmlFor="login-username"
              className="block text-xs font-medium text-foreground"
            >
              {t.auth.usernameLabel}
            </label>
            <Input
              id="login-username"
              autoComplete="username"
              placeholder={t.auth.usernamePlaceholder}
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
              htmlFor="login-password"
              className="block text-xs font-medium text-foreground"
            >
              {t.auth.passwordLabel}
            </label>
            <div className="relative">
              <Input
                id="login-password"
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
              <GeneratedBrandIcon name="login" className="size-4" />
            )}
            <span>
              {isSubmitting ? t.auth.signingInBtn : t.auth.signInBtn}
            </span>
          </Button>
        </form>
      </div>
    </div>
  );
}

function MultiStepRegisterWizard() {
  const router = useRouter();
  const { setUser, locale, t, tr } = useAppSession();

  const [step, setStep] = useState<RegisterStep>(1);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [focusedField, setFocusedField] = useState<FocusedField>(null);
  const [caretLookX, setCaretLookX] = useState<number>(0);
  const [hasServerError, setHasServerError] = useState(false);

  const schema = useMemo(() => createRegisterFormSchema(locale), [locale]);

  const {
    register,
    control,
    handleSubmit,
    trigger,
    setValue,
    formState: { errors, isSubmitting, touchedFields },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    reValidateMode: "onChange",
    // Keep all data intact when moving back and forth across steps
    shouldUnregister: false,
    defaultValues: {
      username: "",
      password: "",
      confirmPassword: "",
      persona: "",
      favoriteThemes: [],
      creativeNote: "",
      showPhotographerInfo: true,
    },
  });

  useEffect(() => {
    const touchedKeys = Object.keys(touchedFields) as Array<
      keyof RegisterFormValues
    >;
    if (touchedKeys.length > 0) {
      void trigger(touchedKeys);
    }
  }, [locale, touchedFields, trigger]);

  const watchedUsername = useWatch({ control, name: "username" });
  const watchedPassword = useWatch({ control, name: "password" });
  const watchedConfirm = useWatch({ control, name: "confirmPassword" });
  const watchedPersona = useWatch({ control, name: "persona" });
  const watchedThemes = useWatch({ control, name: "favoriteThemes" });
  const watchedCreativeNote = useWatch({ control, name: "creativeNote" });
  const watchedShowAuthor = useWatch({ control, name: "showPhotographerInfo" });

  const isCoveringEyes =
    step === 1 && (showPassword || showConfirmPassword);

  const passwordsMatch =
    watchedPassword.length >= 8 &&
    watchedConfirm.length > 0 &&
    watchedPassword === watchedConfirm &&
    !errors.password &&
    !errors.confirmPassword;

  const hasCurrentStepErrors =
    step === 1
      ? Boolean(errors.username || errors.password || errors.confirmPassword)
      : step === 2
        ? Boolean(
            errors.persona || errors.favoriteThemes || errors.creativeNote,
          )
        : Object.keys(errors).length > 0;

  const focusedLookY =
    focusedField === "username"
      ? 0.55
      : focusedField === "password"
        ? 0.72
        : focusedField === "confirmPassword"
          ? 0.88
          : focusedField === "creativeNote"
            ? 0.65
            : null;

  function pulseErrorShake() {
    setHasServerError(true);
    window.setTimeout(() => setHasServerError(false), 500);
  }

  function syncCaretFromEvent(
    field: Exclude<FocusedField, null>,
    el: HTMLInputElement,
  ) {
    setFocusedField(field);
    setCaretLookX(computeCaretLookX(el));
  }

  async function handleNextFromStep1() {
    const valid = await trigger(["username", "password", "confirmPassword"], {
      shouldFocus: true,
    });
    if (!valid) {
      pulseErrorShake();
      return;
    }
    setFocusedField(null);
    setStep(2);
  }

  async function handleNextFromStep2() {
    const valid = await trigger(
      ["persona", "favoriteThemes", "creativeNote", "showPhotographerInfo"],
      { shouldFocus: true },
    );
    if (!valid) {
      pulseErrorShake();
      return;
    }
    setFocusedField(null);
    setStep(3);
  }

  function handleSkipStep2() {
    setValue("persona", "", { shouldValidate: true });
    setValue("favoriteThemes", [], { shouldValidate: true });
    setValue("creativeNote", "", { shouldValidate: true });
    setFocusedField(null);
    setStep(3);
  }

  function handleTogglePersona(id: Exclude<PersonaId, "">) {
    setValue("persona", watchedPersona === id ? "" : id, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  function handleToggleThemeChip(themeId: string) {
    const exists = watchedThemes.includes(themeId);
    const next = exists
      ? watchedThemes.filter((item) => item !== themeId)
      : [...watchedThemes, themeId];
    setValue("favoriteThemes", next, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  }

  async function onSubmit(values: RegisterFormValues) {
    try {
      // Strictly send only username + password to preserve clean auth payload
      const res = await fetch("/api/auth/register", {
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
        throw new Error(data.error ?? "Unable to authenticate your account.");
      }

      let finalUser = data.user;

      // Save optional "Bạn là ai?" persona locally in browser
      if (
        values.persona ||
        values.favoriteThemes.length > 0 ||
        values.creativeNote.trim()
      ) {
        saveUserPersonaPreference(finalUser.username, {
          persona: values.persona,
          favoriteThemes: values.favoriteThemes,
          creativeNote: values.creativeNote.trim(),
        });
      }

      // Sync initial photographer attribution preference if user toggled it off
      if (!values.showPhotographerInfo) {
        try {
          const prefRes = await fetch("/api/profile", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ showPhotographerInfo: false }),
          });
          if (prefRes.ok) {
            const prefData = (await prefRes.json()) as { user?: SafeUserDTO };
            if (prefData.user) {
              finalUser = prefData.user;
            }
          }
        } catch {
          // Non-blocking preference sync
        }
      }

      setUser(finalUser);
      toast.success(
        t.auth.welcomeRegisterToast.replace("{username}", finalUser.username),
      );
      router.push("/");
      router.refresh();
    } catch (err) {
      pulseErrorShake();
      const rawMsg =
        err instanceof Error ? err.message : "Something went wrong.";
      toast.error(tr(rawMsg));
    }
  }

  const progressPercent = step === 1 ? 33 : step === 2 ? 67 : 100;
  const selectedPersonaOption = PERSONA_OPTIONS.find(
    (opt) => opt.id === watchedPersona,
  );

  const usernameField = register("username");
  const passwordField = register("password");
  const confirmPasswordField = register("confirmPassword");
  const creativeNoteField = register("creativeNote");

  const stepsMeta: Array<{ id: RegisterStep; label: string }> = [
    { id: 1, label: t.auth.stepAccount },
    { id: 2, label: t.auth.stepWhoAreYou },
    { id: 3, label: t.auth.stepConfirm },
  ];

  return (
    <div className="mx-auto flex min-h-[74vh] max-w-md flex-col justify-center py-5 sm:py-8">
      <div className="space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-7 shadow-xs">
        <AuthModeTabs isRegister />

        {/* Interactive Polar Bear Mascot */}
        <div className="pt-0.5">
          <PolarBearMascot
            inputLookX={focusedField ? caretLookX : null}
            inputLookY={focusedLookY}
            isCoveringEyes={isCoveringEyes}
            isInputFocused={focusedField !== null}
            isHappy={passwordsMatch || step === 3 || isSubmitting}
            hasError={hasServerError || hasCurrentStepErrors}
          />
        </div>

        <div className="space-y-1 text-center">
          <h1 className="text-lg font-semibold tracking-tight">
            {t.auth.registerTitle}
          </h1>
          <p className="text-xs text-muted-foreground">
            {t.auth.registerSubtitle}
          </p>
        </div>

        {/* Multi-Step Progress Indicator & Bar */}
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-1.5 text-[11px]">
            {stepsMeta.map((item) => {
              const isActive = step === item.id;
              const isCompleted = step > item.id;
              const canJump = item.id < step && !isSubmitting;

              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={!canJump}
                  onClick={() => {
                    if (canJump) setStep(item.id);
                  }}
                  className={cn(
                    "flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 font-medium transition-all",
                    isActive
                      ? "border-foreground/40 bg-secondary text-foreground shadow-2xs"
                      : isCompleted
                        ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 cursor-pointer hover:bg-emerald-500/15"
                        : "border-border/60 bg-background/50 text-muted-foreground",
                  )}
                >
                  {isCompleted ? (
                    <Check className="size-3 shrink-0" />
                  ) : (
                    <span className="tabular-nums">{item.id}.</span>
                  )}
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>

          <div
            role="progressbar"
            aria-label={t.auth.stepProgressLabel}
            aria-valuemin={1}
            aria-valuemax={3}
            aria-valuenow={step}
            className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"
          >
            <div
              style={{ width: `${progressPercent}%` }}
              className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
            />
          </div>
        </div>

        <form
          noValidate
          onSubmit={(e) =>
            void handleSubmit(onSubmit, () => pulseErrorShake())(e)
          }
          onKeyDown={(e) => {
            // On Steps 1 & 2, pressing Enter advances to next step instead of premature submit
            if (e.key === "Enter" && step < 3) {
              e.preventDefault();
              if (step === 1) {
                void handleNextFromStep1();
              } else if (step === 2) {
                void handleNextFromStep2();
              }
            }
          }}
          className="space-y-4"
        >
          {/* STEP 1: ACCOUNT CREDENTIALS */}
          <div className={cn("space-y-4", step !== 1 && "hidden")}>
            <div className="space-y-1.5">
              <label
                htmlFor="username"
                className="block text-xs font-medium text-foreground"
              >
                {t.auth.usernameLabel}
              </label>
              <Input
                id="username"
                autoComplete="username"
                placeholder={t.auth.usernamePlaceholder}
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
                <p
                  role="alert"
                  className="text-[11px] font-medium text-destructive"
                >
                  {errors.username.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-xs font-medium text-foreground"
              >
                {t.auth.passwordLabel}
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder={t.auth.passwordRegisterPlaceholder}
                  aria-invalid={Boolean(errors.password) || undefined}
                  className={cn(
                    "pr-9",
                    errors.password &&
                      "border-destructive focus-visible:border-destructive",
                  )}
                  {...passwordField}
                  onFocus={(e) =>
                    syncCaretFromEvent("password", e.currentTarget)
                  }
                  onBlur={(e) => {
                    void passwordField.onBlur(e);
                    setFocusedField((cur) => (cur === "password" ? null : cur));
                  }}
                  onClick={(e) =>
                    syncCaretFromEvent("password", e.currentTarget)
                  }
                  onKeyUp={(e) =>
                    syncCaretFromEvent("password", e.currentTarget)
                  }
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
                <p
                  role="alert"
                  className="text-[11px] font-medium text-destructive"
                >
                  {errors.password.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="confirm-password"
                  className="block text-xs font-medium text-foreground"
                >
                  {t.auth.confirmPasswordLabel}
                </label>
                {passwordsMatch && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                    <Check className="size-3" />
                    {t.auth.matchedBadge}
                  </span>
                )}
              </div>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder={t.auth.confirmPasswordPlaceholder}
                  aria-invalid={Boolean(errors.confirmPassword) || undefined}
                  className={cn(
                    "pr-9",
                    errors.confirmPassword &&
                      "border-destructive focus-visible:border-destructive",
                  )}
                  {...confirmPasswordField}
                  onFocus={(e) =>
                    syncCaretFromEvent("confirmPassword", e.currentTarget)
                  }
                  onBlur={(e) => {
                    void confirmPasswordField.onBlur(e);
                    setFocusedField((cur) =>
                      cur === "confirmPassword" ? null : cur,
                    );
                  }}
                  onClick={(e) =>
                    syncCaretFromEvent("confirmPassword", e.currentTarget)
                  }
                  onKeyUp={(e) =>
                    syncCaretFromEvent("confirmPassword", e.currentTarget)
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute top-1/2 right-0.5 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground active:scale-95 cursor-pointer"
                  aria-label={
                    showConfirmPassword
                      ? t.auth.hidePassword
                      : t.auth.showPassword
                  }
                >
                  {showConfirmPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
              {errors.confirmPassword?.message && (
                <p
                  role="alert"
                  className="text-[11px] font-medium text-destructive"
                >
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            <Button
              type="button"
              onClick={() => void handleNextFromStep1()}
              className="w-full h-10 font-medium shadow-sm active:scale-[0.97]"
            >
              <span>{t.auth.nextBtn}</span>
              <ArrowRight className="size-4" />
            </Button>
          </div>

          {/* STEP 2: OPTIONAL "BẠN LÀ AI?" PERSONA & PREFERENCES */}
          <div className={cn("space-y-4", step !== 2 && "hidden")}>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xs sm:text-sm font-semibold text-foreground inline-flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-muted-foreground" />
                  {t.auth.whoAreYouQuestion}
                </h2>
                <span className="rounded-full border border-border bg-secondary/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {t.auth.optionalBadge}
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {t.auth.whoAreYouHint}
              </p>
            </div>

            {/* Optional Creative Role Cards */}
            <div className="grid grid-cols-1 gap-1.5">
              {PERSONA_OPTIONS.map((opt) => {
                const selected = watchedPersona === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleTogglePersona(opt.id)}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-all cursor-pointer active:scale-[0.99]",
                      selected
                        ? "border-primary bg-primary/5 ring-1 ring-primary/25"
                        : "border-border bg-background hover:border-foreground/30",
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground">
                        {opt.label[locale]}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {opt.desc[locale]}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "inline-flex size-4 shrink-0 items-center justify-center rounded-full border",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border",
                      )}
                    >
                      {selected && <Check className="size-2.5" />}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Optional Favorite Visual Themes (Max 3) */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-foreground">
                {t.auth.themesLabel}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {VISUAL_THEME_OPTIONS.map((themeItem) => {
                  const active = watchedThemes.includes(themeItem.id);
                  return (
                    <button
                      key={themeItem.id}
                      type="button"
                      onClick={() => handleToggleThemeChip(themeItem.id)}
                      className={cn(
                        "inline-flex min-h-7 items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors cursor-pointer",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {active && <Check className="size-3" />}
                      {themeItem.label[locale]}
                    </button>
                  );
                })}
              </div>
              {errors.favoriteThemes?.message && (
                <p
                  role="alert"
                  className="text-[11px] font-medium text-destructive"
                >
                  {errors.favoriteThemes.message}
                </p>
              )}
            </div>

            {/* Optional Short Creative Note */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="creative-note"
                  className="block text-xs font-medium text-foreground"
                >
                  {t.auth.creativeNoteLabel}
                </label>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {watchedCreativeNote.length}/120
                </span>
              </div>
              <Input
                id="creative-note"
                placeholder={t.auth.creativeNotePlaceholder}
                aria-invalid={Boolean(errors.creativeNote) || undefined}
                className={cn(
                  errors.creativeNote &&
                    "border-destructive focus-visible:border-destructive",
                )}
                {...creativeNoteField}
                onFocus={(e) =>
                  syncCaretFromEvent("creativeNote", e.currentTarget)
                }
                onBlur={(e) => {
                  void creativeNoteField.onBlur(e);
                  setFocusedField((cur) =>
                    cur === "creativeNote" ? null : cur,
                  );
                }}
                onClick={(e) =>
                  syncCaretFromEvent("creativeNote", e.currentTarget)
                }
                onKeyUp={(e) =>
                  syncCaretFromEvent("creativeNote", e.currentTarget)
                }
              />
              {errors.creativeNote?.message && (
                <p
                  role="alert"
                  className="text-[11px] font-medium text-destructive"
                >
                  {errors.creativeNote.message}
                </p>
              )}
            </div>

            {/* Photographer Attribution Toggle */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/25 px-3 py-2.5">
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-foreground">
                  {t.auth.photographerToggleLabel}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {t.auth.photographerToggleHint}
                </p>
              </div>
              <Switch
                checked={watchedShowAuthor}
                onCheckedChange={(checked) =>
                  setValue("showPhotographerInfo", checked, {
                    shouldDirty: true,
                  })
                }
                aria-label={t.auth.photographerToggleLabel}
              />
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStep(1)}
              >
                <ArrowLeft className="size-3.5" />
                {t.auth.backBtn}
              </Button>

              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleSkipStep2}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {t.auth.skipBtn}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={Boolean(
                    errors.favoriteThemes || errors.creativeNote,
                  )}
                  onClick={() => void handleNextFromStep2()}
                >
                  {t.auth.nextBtn}
                  <ArrowRight className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>

          {/* STEP 3: REVIEW & SUBMIT */}
          <div className={cn("space-y-4", step !== 3 && "hidden")}>
            <div className="rounded-xl border border-border bg-secondary/25 p-3.5 space-y-3 text-xs">
              <p className="font-semibold text-foreground">
                {t.auth.reviewTitle}
              </p>

              <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2.5">
                <div>
                  <p className="text-[11px] text-muted-foreground">
                    {t.auth.reviewAccountRow}
                  </p>
                  <p className="font-medium text-foreground">
                    @{watchedUsername.trim().toLowerCase() || "—"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-[11px] font-medium underline underline-offset-4 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  {t.auth.editStepBtn}
                </button>
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2.5">
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground">
                    {t.auth.reviewPersonaRow}
                  </p>
                  <p className="font-medium text-foreground truncate">
                    {selectedPersonaOption
                      ? selectedPersonaOption.label[locale]
                      : t.auth.reviewPersonaSkipped}
                  </p>
                  {watchedCreativeNote.trim() && (
                    <p className="truncate text-[11px] italic text-muted-foreground">
                      “{watchedCreativeNote.trim()}”
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="text-[11px] font-medium underline underline-offset-4 text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                >
                  {t.auth.editStepBtn}
                </button>
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2.5">
                <div>
                  <p className="text-[11px] text-muted-foreground">
                    {t.auth.reviewThemesRow}
                  </p>
                  <p className="font-medium text-foreground">
                    {watchedThemes.length > 0
                      ? watchedThemes
                          .map(
                            (id) =>
                              VISUAL_THEME_OPTIONS.find((item) => item.id === id)
                                ?.label[locale] ?? id,
                          )
                          .join(", ")
                      : t.auth.reviewThemesSkipped}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2.5">
                <span className="text-[11px] text-muted-foreground">
                  {t.auth.reviewAuthorModeRow}
                </span>
                <span className="font-medium text-foreground">
                  {watchedShowAuthor
                    ? t.auth.reviewAuthorOn
                    : t.auth.reviewAuthorOff}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-10"
                disabled={isSubmitting}
                onClick={() => setStep(2)}
              >
                <ArrowLeft className="size-4" />
                {t.auth.backBtn}
              </Button>

              <Button
                type="submit"
                className="flex-1 h-10 font-medium shadow-sm active:scale-[0.97]"
                disabled={isSubmitting || Object.keys(errors).length > 0}
              >
                {isSubmitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <GeneratedBrandIcon name="register" className="size-4" />
                )}
                <span>
                  {isSubmitting
                    ? t.auth.creatingAccountBtn
                    : t.auth.createAccountBtn}
                </span>
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

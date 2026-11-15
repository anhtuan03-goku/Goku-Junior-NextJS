"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Bookmark,
  Camera,
  Languages,
  LogOut,
  Moon,
  Orbit,
  Settings,
  Shield,
  Sun,
} from "lucide-react";
import { useAppSession } from "@/components/providers/app-providers";
import { GeneratedBrandIcon } from "@/components/ui/brand-icon";
import { Button } from "@/components/ui/button";
import { UserAvatarCircle } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  renderIcon: () => React.ReactNode;
  show: boolean;
};

export function MinimalHeader() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const {
    user,
    showPhotographerInfo,
    togglePhotographerMode,
    logout,
    locale,
    toggleLocale,
    t,
  } = useAppSession();

  const navItems: NavItem[] = [
    {
      href: "/",
      label: t.nav.explore,
      renderIcon: () => <GeneratedBrandIcon name="explore" className="size-4" />,
      show: true,
    },
    {
      href: "/space",
      label: t.nav.space,
      renderIcon: () => <Orbit className="size-3.5" />,
      show: true,
    },
    {
      href: "/community",
      label: t.nav.community,
      renderIcon: () => (
        <GeneratedBrandIcon name="community" className="size-4" />
      ),
      show: true,
    },
    {
      href: "/saved",
      label: t.nav.saved,
      renderIcon: () => <Bookmark className="size-3.5" />,
      show: Boolean(user),
    },
    {
      href: "/admin",
      label: t.nav.admin,
      renderIcon: () => <Shield className="size-3.5" />,
      show: user?.role === "ADMIN",
    },
  ].filter((item) => item.show);

  const isOnLogin = pathname === "/login";
  const isOnRegister = pathname === "/register";

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-1.5 px-3.5 sm:gap-2 sm:px-6">
        <div className="flex items-center gap-5 shrink-0">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm sm:text-base font-semibold tracking-tighter select-none transition-opacity hover:opacity-85 active:scale-[0.98]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icons/frame-mark.png"
              alt=""
              aria-hidden="true"
              className="size-5 rounded-[4px] object-contain"
            />
            <span>
              naut<span className="text-muted-foreground">.frame</span>
            </span>
          </Link>

          <nav
            aria-label={t.nav.primaryNav}
            className="hidden md:flex items-center gap-1"
          >
            {navItems.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150 active:scale-[0.96]",
                    active
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent",
                  )}
                >
                  {item.renderIcon()}
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5">
          {/* Author attribution toggle switch (accessible role="switch", >=36px touch height) */}
          <button
            type="button"
            role="switch"
            aria-checked={showPhotographerInfo}
            aria-label={t.nav.authorOnTitle}
            title={
              showPhotographerInfo ? t.nav.authorOnTitle : t.nav.authorOffTitle
            }
            onClick={() => void togglePhotographerMode()}
            className={cn(
              "group inline-flex h-9 items-center gap-1.5 rounded-full border px-2 sm:px-2.5 text-xs font-medium transition-all duration-150 active:scale-[0.97] cursor-pointer select-none",
              showPhotographerInfo
                ? "border-foreground/25 bg-secondary/80 text-foreground"
                : "border-border bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            <Camera className="size-3.5 shrink-0" />
            <span className="hidden lg:inline text-[11px]">{t.nav.author}</span>
            <span
              aria-hidden="true"
              className={cn(
                "relative hidden sm:inline-flex h-4.5 w-8 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200",
                showPhotographerInfo
                  ? "bg-primary"
                  : "bg-muted-foreground/30",
              )}
            >
              <span
                className={cn(
                  "block size-3.5 rounded-full bg-background shadow-xs transition-transform duration-200",
                  showPhotographerInfo ? "translate-x-3.5" : "translate-x-0",
                )}
              />
            </span>
          </button>

          {/* Bilingual EN / VI Instant Switcher */}
          <button
            type="button"
            onClick={toggleLocale}
            aria-label={t.nav.toggleLang}
            title={t.nav.toggleLang}
            className="inline-flex h-9 items-center gap-1 rounded-full border border-border bg-background px-2 sm:px-2.5 text-[11px] font-semibold tracking-wide text-foreground transition-colors hover:bg-accent active:scale-95 cursor-pointer select-none"
          >
            <Languages className="size-3.5 text-muted-foreground hidden sm:inline" />
            <span>{locale === "vi" ? "VI" : "EN"}</span>
          </button>

          <Button
            variant="ghost"
            size="icon"
            className="size-9 shrink-0"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={t.nav.toggleTheme}
          >
            <Sun className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>

          {user ? (
            <div className="flex items-center gap-1">
              <Link
                href="/settings"
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-full border px-2 sm:px-2.5 sm:pr-3 text-xs font-medium transition-all duration-150 hover:bg-accent active:scale-[0.97]",
                  pathname === "/settings"
                    ? "border-foreground bg-secondary/70 shadow-xs"
                    : "border-border",
                )}
                title={t.nav.settings}
              >
                <UserAvatarCircle
                  username={user.username}
                  avatarUrl={user.avatarUrl}
                  size="xs"
                />
                <span className="max-w-24 truncate hidden sm:inline">
                  {user.username}
                </span>
                <Settings className="size-3.5 text-muted-foreground sm:hidden" />
              </Link>

              <Button
                variant="ghost"
                size="icon"
                className="size-9 text-muted-foreground hover:text-foreground shrink-0"
                onClick={() => void logout()}
                title={t.nav.signOut}
                aria-label={t.nav.signOut}
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1 sm:gap-1.5">
              <Link
                href="/login"
                aria-current={isOnLogin ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center justify-center gap-1 rounded-full border px-2.5 sm:px-3.5 text-[11px] sm:text-xs font-medium whitespace-nowrap transition-all duration-150 active:scale-[0.95] select-none",
                  isOnLogin
                    ? "border-primary bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/25"
                    : "border-border bg-background text-foreground hover:bg-accent hover:border-foreground/30",
                )}
              >
                <GeneratedBrandIcon
                  name="login"
                  className="size-3.5 hidden sm:inline"
                />
                <span>{t.nav.signIn}</span>
              </Link>

              <Link
                href="/register"
                aria-current={isOnRegister ? "page" : undefined}
                className={cn(
                  "hidden sm:inline-flex h-9 items-center justify-center gap-1.5 rounded-full border px-3.5 text-xs font-medium whitespace-nowrap transition-all duration-150 active:scale-[0.95] select-none",
                  isOnRegister
                    ? "border-primary bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/30"
                    : isOnLogin
                      ? "border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent"
                      : "border-primary bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
                )}
              >
                <GeneratedBrandIcon name="register" className="size-3.5" />
                <span>{t.nav.signUp}</span>
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Mobile responsive navigation strip (375px safe, >=36px touch targets, zero horizontal overflow) */}
      <nav
        aria-label={t.nav.mobileNav}
        className="flex md:hidden items-center justify-around border-t border-border/60 px-1.5 py-1 bg-background/95"
      >
        {navItems.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-9 items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-all duration-150 active:scale-[0.96]",
                active
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.renderIcon()}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

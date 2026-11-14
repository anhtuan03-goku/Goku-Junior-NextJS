"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Bookmark,
  Camera,
  Compass,
  LogOut,
  Moon,
  Settings,
  Shield,
  Sparkles,
  Sun,
} from "lucide-react";
import { useAppSession } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { UserAvatarCircle } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export function MinimalHeader() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { user, showPhotographerInfo, togglePhotographerMode, logout } =
    useAppSession();

  const navItems = [
    { href: "/", label: "Khám phá", icon: Compass, show: true },
    { href: "/community", label: "Cộng đồng", icon: Sparkles, show: true },
    { href: "/saved", label: "Đã lưu", icon: Bookmark, show: Boolean(user) },
    {
      href: "/admin",
      label: "Quản trị",
      icon: Shield,
      show: user?.role === "ADMIN",
    },
  ].filter((item) => item.show);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="text-base font-semibold tracking-tighter select-none"
          >
            goku<span className="text-muted-foreground">.frame</span>
          </Link>

          <nav
            aria-label="Điều hướng chính"
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
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent",
                  )}
                >
                  <item.icon className="size-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => void togglePhotographerMode()}
            title="Bật / Tắt hiển thị thông tin nhiếp ảnh gia trên ảnh"
            className={cn(
              "inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors cursor-pointer",
              showPhotographerInfo
                ? "border-foreground/25 bg-secondary text-foreground"
                : "border-border bg-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Camera className="size-4" />
            <span className="hidden sm:inline">
              Tác giả: {showPhotographerInfo ? "Bật" : "Tắt"}
            </span>
          </button>

          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Chuyển giao diện Sáng / Tối"
          >
            <Sun className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>

          {user ? (
            <div className="flex items-center gap-1.5">
              <Link
                href="/settings"
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-full border border-border px-2.5 pr-3 text-xs font-medium transition-colors hover:bg-accent",
                  pathname === "/settings" && "border-foreground",
                )}
                title="Quản lý hồ sơ cá nhân"
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
                className="size-9 text-muted-foreground hover:text-foreground"
                onClick={() => void logout()}
                title="Đăng xuất"
                aria-label="Đăng xuất"
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="default" className="px-3 text-xs" asChild>
                <Link href="/login">Đăng nhập</Link>
              </Button>
              <Button size="default" className="px-3 text-xs" asChild>
                <Link href="/register">Đăng ký</Link>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile responsive navigation strip (375px safe, >=36px touch targets, zero horizontal overflow) */}
      <nav
        aria-label="Điều hướng di động"
        className="flex md:hidden items-center justify-around border-t border-border/60 px-2 py-1 bg-background/95"
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
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <item.icon className="size-3.5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

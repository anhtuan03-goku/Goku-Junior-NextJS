import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"span"> & {
  variant?: "default" | "secondary" | "outline" | "destructive";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
        variant === "default" && "bg-primary text-primary-foreground",
        variant === "secondary" && "bg-secondary text-secondary-foreground",
        variant === "outline" && "border border-border text-foreground",
        variant === "destructive" && "bg-destructive/15 text-destructive",
        className,
      )}
      {...props}
    />
  );
}

export function Skeleton({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export function UserAvatarCircle({
  username,
  avatarUrl,
  size = "sm",
  className,
}: {
  username: string;
  avatarUrl?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeClass =
    size === "xs"
      ? "size-5 text-[10px]"
      : size === "sm"
        ? "size-7 text-xs"
        : size === "md"
          ? "size-10 text-sm"
          : "size-16 text-lg";

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={username}
        className={cn(
          "rounded-full object-cover border border-border shrink-0",
          sizeClass,
          className,
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-secondary text-secondary-foreground font-medium uppercase border border-border shrink-0 select-none",
        sizeClass,
        className,
      )}
      aria-label={username}
    >
      {username.slice(0, 1) || "U"}
    </div>
  );
}

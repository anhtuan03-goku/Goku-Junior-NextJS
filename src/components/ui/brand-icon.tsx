import * as React from "react";
import { cn } from "@/lib/utils";

export type GeneratedIconName = "explore" | "community" | "login" | "register";

const ICON_PATHS: Record<GeneratedIconName, string> = {
  explore: "/icons/explore.png",
  community: "/icons/community.png",
  login: "/icons/login.png",
  register: "/icons/register.png",
};

/**
 * Renders AI-generated minimalist glyph assets using CSS alpha masking so they
 * inherit `currentColor` seamlessly across light/dark themes and active buttons.
 */
export function GeneratedBrandIcon({
  name,
  className,
}: {
  name: GeneratedIconName;
  className?: string;
}) {
  const src = ICON_PATHS[name];
  return (
    <span
      aria-hidden="true"
      style={{
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        maskSize: "contain",
      }}
      className={cn("inline-block size-4 shrink-0 bg-current", className)}
    />
  );
}

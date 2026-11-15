"use client";

import Link from "next/link";
import { useAppSession } from "@/components/providers/app-providers";
import { SITE_CONFIG } from "@/lib/site-config";

export function MinimalFooter() {
  const { t } = useAppSession();

  return (
    <footer className="border-t border-border/60 py-5 px-4">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 text-[11px] text-muted-foreground">
        <span>
          © {new Date().getFullYear()} {SITE_CONFIG.name} · {t.footer.tagline}
        </span>
        <div className="flex items-center gap-4">
          <Link
            href="/community"
            className="hover:text-foreground transition-colors"
          >
            {t.footer.community}
          </Link>
          <Link
            href="/privacy"
            className="underline underline-offset-4 hover:text-foreground transition-colors"
          >
            {t.footer.privacy}
          </Link>
        </div>
      </div>
    </footer>
  );
}

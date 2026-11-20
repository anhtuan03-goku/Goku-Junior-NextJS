"use client";

import Link from "next/link";
import { ArrowLeft, EyeOff, KeyRound, Layers, ShieldCheck } from "lucide-react";
import { useAppSession } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";

const PILLAR_ICONS = [ShieldCheck, KeyRound, EyeOff, Layers] as const;

export function ZeroPiiPolicyContent() {
  const { t } = useAppSession();

  return (
    <article className="mx-auto max-w-2xl py-6 sm:py-10 space-y-8">
      <div>
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="-ml-2 text-muted-foreground"
        >
          <Link href="/">
            <ArrowLeft className="size-3.5" />
            {t.privacy.backExplore}
          </Link>
        </Button>
      </div>

      <header className="space-y-3 border-b border-border/70 pb-6">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          {t.privacy.title}
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t.privacy.intro}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4">
        {t.privacy.pillars.map((item, idx) => {
          const IconComp = PILLAR_ICONS[idx] ?? ShieldCheck;
          return (
            <section
              key={item.title}
              className="rounded-xl border border-border bg-card p-5 sm:p-6 space-y-2"
            >
              <div className="flex items-center gap-2.5">
                <span className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-secondary/60 text-foreground">
                  <IconComp className="size-4" />
                </span>
                <h2 className="text-sm sm:text-base font-semibold tracking-tight">
                  {item.title}
                </h2>
              </div>
              <p className="text-xs sm:text-sm leading-relaxed text-muted-foreground pl-10">
                {item.body}
              </p>
            </section>
          );
        })}
      </div>

      <section className="rounded-xl border border-border/70 bg-secondary/30 p-5 text-xs leading-relaxed text-muted-foreground space-y-2">
        <h2 className="font-semibold text-foreground">
          {t.privacy.cookiesTitle}
        </h2>
        <p>{t.privacy.cookiesBody}</p>
      </section>
    </article>
  );
}

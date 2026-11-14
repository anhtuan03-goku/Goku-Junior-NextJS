import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, EyeOff, KeyRound, Layers, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Zero-PII Privacy Policy",
  description:
    "How naut.frame protects your identity with strict Zero-PII authentication, one-way cryptographic hashing, anonymous appreciation, and single-slot media storage.",
  alternates: {
    canonical: "/privacy",
  },
};

const PILLARS = [
  {
    icon: ShieldCheck,
    title: "Zero Personal Identifiable Information (Zero-PII)",
    body: "Registration and sign-in require only a unique lowercase username and a password. We never ask for, store, or process your email address, phone number, legal name, location, or third-party social graph.",
  },
  {
    icon: KeyRound,
    title: "One-Way Password Hashing & Instant Session Revocation",
    body: "Passwords are never stored in plain text. Every password is hashed one-way with bcrypt (cost factor 12) before reaching our database, and changing your password immediately invalidates all prior sessions.",
  },
  {
    icon: EyeOff,
    title: "Quiet & Anonymous Appreciation",
    body: "Public visual stories display only an aggregate heart count—no comment threads, no notification noise, and no public list of who liked a post. Internal moderation audit logs are restricted strictly to system administrators.",
  },
  {
    icon: Layers,
    title: "Private by Default & Single-Slot Avatar Hygiene",
    body: "Saved frames and Private posts remain strictly isolated to your account and can be switched between Private and Public at any time. Optional profile avatars are compressed to WebP in your browser and occupy at most one storage slot—automatically overwritten on update and permanently purged on removal.",
  },
] as const;

export default function ZeroPiiPolicyPage() {
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
            Back to Explore
          </Link>
        </Button>
      </div>

      <header className="space-y-3 border-b border-border/70 pb-6">
        <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          naut.frame · Privacy Architecture
        </p>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          Zero-PII Privacy Policy
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          We built <span className="font-medium text-foreground">naut.frame</span>{" "}
          around a simple conviction: you cannot leak, sell, or expose personal
          data that you never collect in the first place.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4">
        {PILLARS.map((item) => (
          <section
            key={item.title}
            className="rounded-xl border border-border bg-card p-5 sm:p-6 space-y-2"
          >
            <div className="flex items-center gap-2.5">
              <span className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-secondary/60 text-foreground">
                <item.icon className="size-4" />
              </span>
              <h2 className="text-sm sm:text-base font-semibold tracking-tight">
                {item.title}
              </h2>
            </div>
            <p className="text-xs sm:text-sm leading-relaxed text-muted-foreground pl-10">
              {item.body}
            </p>
          </section>
        ))}
      </div>

      <section className="rounded-xl border border-border/70 bg-secondary/30 p-5 text-xs leading-relaxed text-muted-foreground space-y-2">
        <h2 className="font-semibold text-foreground">
          Cookies & Essential Session State
        </h2>
        <p>
          We use a single essential <code className="text-foreground">HttpOnly</code>{" "}
          session cookie to keep you signed in and a local preference key to
          remember your theme and photographer-credit toggle. Zero advertising
          trackers, zero fingerprinting scripts, and zero behavioral analytics
          are loaded on any page.
        </p>
      </section>
    </article>
  );
}

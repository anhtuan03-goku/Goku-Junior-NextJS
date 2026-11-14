import type { Metadata } from "next";
import { CommunityPostsFeed } from "@/components/posts/community-feed";
import { getContainer } from "@/infrastructure/container";
import { getOptionalSessionUser } from "@/interfaces/http/api-helpers";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Community Journal",
  description:
    "Public visual stories shared on naut.frame — no noisy comments, no notifications, only curated frames and anonymous appreciation.",
  alternates: {
    canonical: "/community",
  },
};

export default async function CommunityPage() {
  const viewer = await getOptionalSessionUser();
  const initial = await getContainer().useCases.listPublicPosts.execute({
    page: 1,
    limit: 18,
    viewerUserId: viewer?.id ?? null,
  });

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
          Community Journal
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          No noisy comments, no distracting notifications — just public visual
          stories and quiet, anonymous appreciation.
        </p>
      </div>

      <CommunityPostsFeed
        initialPosts={initial.items}
        initialHasMore={initial.hasMore}
      />
    </section>
  );
}

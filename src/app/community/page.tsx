import { randomInt } from "node:crypto";
import type { Metadata } from "next";
import { CommunityPostsFeed } from "@/components/posts/community-feed";
import { getContainer } from "@/infrastructure/container";
import { getOptionalSessionUser } from "@/interfaces/http/api-helpers";
import { SITE_CONFIG } from "@/lib/site-config";

// SSR: Fresh public visual stories + per-viewer `likedByMe` & live `likesCount`
export const dynamic = "force-dynamic";

const COMMUNITY_TITLE = "Community Journal";
const COMMUNITY_DESC =
  "Public visual stories shared on naut.frame — no noisy comments, no notifications, only curated frames and anonymous appreciation.";

export const metadata: Metadata = {
  title: COMMUNITY_TITLE,
  description: COMMUNITY_DESC,
  alternates: {
    canonical: "/community",
  },
  openGraph: {
    type: "website",
    url: "/community",
    title: `${COMMUNITY_TITLE} · ${SITE_CONFIG.name}`,
    description: COMMUNITY_DESC,
    siteName: SITE_CONFIG.name,
  },
  twitter: {
    card: "summary_large_image",
    title: `${COMMUNITY_TITLE} · ${SITE_CONFIG.name}`,
    description: COMMUNITY_DESC,
  },
};

export default async function CommunityPage() {
  const viewer = await getOptionalSessionUser();
  const seed = randomInt(0x1_0000_0000);
  const initial = await getContainer().useCases.listPublicPosts.execute({
    page: 1,
    limit: 18,
    seed,
    viewerUserId: viewer?.id ?? null,
  });

  return (
    <section>
      <CommunityPostsFeed
        seed={seed}
        initialPosts={initial.items}
        initialHasMore={initial.hasMore}
      />
    </section>
  );
}

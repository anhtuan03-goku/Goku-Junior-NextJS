import { randomInt } from "node:crypto";
import type { Metadata } from "next";
import { InfiniteExploreFeed } from "@/components/images/infinite-explore-feed";
import { getContainer } from "@/infrastructure/container";
import { getOptionalSessionUser } from "@/interfaces/http/api-helpers";
import { SITE_CONFIG } from "@/lib/site-config";

// SSR: Personalized `savedByMe` state per viewer + real-time Quota Worker pool
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: SITE_CONFIG.title,
  description: SITE_CONFIG.description,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    title: SITE_CONFIG.title,
    description: SITE_CONFIG.description,
    siteName: SITE_CONFIG.name,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_CONFIG.title,
    description: SITE_CONFIG.description,
  },
};

export default async function HomePage() {
  const viewer = await getOptionalSessionUser();
  const seed = randomInt(0x1_0000_0000);
  const initialFeed = await getContainer().useCases.browseInfiniteImages.execute({
    page: 1,
    seed,
    viewerUserId: viewer?.id ?? null,
  });

  return (
    <section aria-label="Explore curated photography">
      <h1 className="sr-only">
        Explore curated minimalist photography on naut.frame
      </h1>

      <InfiniteExploreFeed
        seed={seed}
        initialItems={initialFeed.items}
        initialHasMore={initialFeed.hasMore}
      />
    </section>
  );
}

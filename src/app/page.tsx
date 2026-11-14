import type { Metadata } from "next";
import { InfiniteExploreFeed } from "@/components/images/infinite-explore-feed";
import { getContainer } from "@/infrastructure/container";
import { getOptionalSessionUser } from "@/interfaces/http/api-helpers";
import { SITE_CONFIG } from "@/lib/site-config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: SITE_CONFIG.title,
  description: SITE_CONFIG.description,
  alternates: {
    canonical: "/",
  },
};

export default async function HomePage() {
  const viewer = await getOptionalSessionUser();
  const initialFeed = await getContainer().useCases.browseInfiniteImages.execute({
    page: 1,
    viewerUserId: viewer?.id ?? null,
  });

  return (
    <section aria-label="Explore curated photography">
      <h1 className="sr-only">
        Explore curated minimalist photography on naut.frame
      </h1>

      <InfiniteExploreFeed
        initialItems={initialFeed.items}
        initialHasMore={initialFeed.hasMore}
      />
    </section>
  );
}

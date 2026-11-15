import type { Metadata } from "next";
import { NasaSpaceFeed } from "@/components/space/nasa-space-feed";
import { getContainer } from "@/infrastructure/container";
import { getOptionalSessionUser } from "@/interfaces/http/api-helpers";
import { SITE_CONFIG } from "@/lib/site-config";

// Hybrid SSR + Upstream TTL Cache (15m): personalizes `savedByMe` while caching NASA archive responses
export const dynamic = "force-dynamic";

const SPACE_TITLE = "Space — NASA Cosmic Archive";
const SPACE_DESC =
  "Explore deep-space photography, nebulae, galaxies, and cosmic missions directly from the NASA Image and Video Library.";

export const metadata: Metadata = {
  title: SPACE_TITLE,
  description: SPACE_DESC,
  alternates: {
    canonical: "/space",
  },
  openGraph: {
    type: "website",
    url: "/space",
    title: `${SPACE_TITLE} · ${SITE_CONFIG.name}`,
    description: SPACE_DESC,
    siteName: SITE_CONFIG.name,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SPACE_TITLE} · ${SITE_CONFIG.name}`,
    description: SPACE_DESC,
  },
};

export default async function SpacePage() {
  const viewer = await getOptionalSessionUser();
  const initialSpaceFeed =
    await getContainer().useCases.browseSpaceImages.execute({
      page: 1,
      perPage: 24,
      viewerUserId: viewer?.id ?? null,
    });

  return (
    <section aria-label="Explore NASA space photography">
      <h1 className="sr-only">
        Explore NASA cosmic and space photography on naut.frame
      </h1>

      <NasaSpaceFeed
        initialItems={initialSpaceFeed.items}
        initialHasMore={initialSpaceFeed.hasMore}
      />
    </section>
  );
}

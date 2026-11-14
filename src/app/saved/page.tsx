import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  type ClientSavedImageItem,
  SavedMultiPostStudio,
} from "@/components/saved/saved-studio";
import { getContainer } from "@/infrastructure/container";
import { getOptionalSessionUser } from "@/interfaces/http/api-helpers";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Saved Frames & Stories",
  description: "Manage your saved frames and personal visual journal entries.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function SavedPage({
  searchParams,
}: {
  searchParams: Promise<{ highlight?: string }>;
}) {
  const user = await getOptionalSessionUser();
  if (!user) {
    redirect("/login");
  }

  const { highlight } = await searchParams;
  const savedWithPosts =
    await getContainer().useCases.listMySavedImages.execute(user.id);

  const serialized: ClientSavedImageItem[] = savedWithPosts.map((item) => ({
    id: item.id,
    provider: item.provider,
    externalId: item.externalId,
    imageUrl: item.imageUrl,
    thumbUrl: item.thumbUrl,
    color: item.color,
    width: item.width,
    height: item.height,
    description: item.description,
    photographerUsername: item.photographerUsername,
    photographerName: item.photographerName,
    photographerAvatar: item.photographerAvatar,
    photographerUrl: item.photographerUrl,
    createdAt: item.createdAt.toISOString(),
    posts: item.posts,
  }));

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
          Saved Frames & Stories
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Select any saved frame to write multiple stories, edit notes, or
          switch visibility between Private and Public anytime.
        </p>
      </div>

      <SavedMultiPostStudio
        initialItems={serialized}
        initialHighlightId={highlight}
      />
    </section>
  );
}

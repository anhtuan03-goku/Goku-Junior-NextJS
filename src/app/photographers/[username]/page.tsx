import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Globe, MapPin } from "lucide-react";
import { MinimalImageCard } from "@/components/images/image-card";
import { Button } from "@/components/ui/button";
import { Badge, UserAvatarCircle } from "@/components/ui/primitives";
import { DomainError } from "@/domain/errors/domain-errors";
import { getContainer } from "@/infrastructure/container";
import { getOptionalSessionUser } from "@/interfaces/http/api-helpers";
import { autoTranslateMessage } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n-server";
import { SITE_CONFIG, getSiteUrl } from "@/lib/site-config";

// Hybrid ISR Data Cache (600s) + Dynamic Viewer Decoration (`savedByMe`)
export const dynamic = "force-dynamic";

const getCachedPublicPhotographerDetail = unstable_cache(
  async (username: string) =>
    getContainer().useCases.getPhotographerDetail.execute({
      username,
      viewerUserId: null,
    }),
  ["public-photographer-detail-v1"],
  { revalidate: 600 },
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const decodedUsername = decodeURIComponent(username);
  const canonicalPath = `/photographers/${encodeURIComponent(decodedUsername)}`;

  try {
    const detail = await getCachedPublicPhotographerDetail(decodedUsername);
    const title = `${detail.name} (@${detail.username}) — Photographer`;
    const description =
      detail.bio?.slice(0, 160) ||
      `Explore ${detail.totalPhotos.toLocaleString("en-US")} curated minimalist photographs by ${detail.name} (@${detail.username}) on ${SITE_CONFIG.name}.`;

    return {
      title,
      description,
      alternates: { canonical: canonicalPath },
      openGraph: {
        type: "profile",
        url: canonicalPath,
        title: `${title} · ${SITE_CONFIG.name}`,
        description,
        images: detail.avatarUrl ? [{ url: detail.avatarUrl }] : undefined,
      },
      twitter: {
        card: "summary_large_image",
        title: `${title} · ${SITE_CONFIG.name}`,
        description,
      },
    };
  } catch {
    return {
      title: `@${decodedUsername} — Photographer`,
      description: `Photographer profile and curated works on ${SITE_CONFIG.name}.`,
      alternates: { canonical: canonicalPath },
    };
  }
}

export default async function PhotographerDetailPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const decodedUsername = decodeURIComponent(username);
  const [viewer, locale] = await Promise.all([
    getOptionalSessionUser(),
    getRequestLocale(),
  ]);
  const isVi = locale === "vi";

  let detail: Awaited<
    ReturnType<
      ReturnType<typeof getContainer>["useCases"]["getPhotographerDetail"]["execute"]
    >
  > | null = null;
  let errorMessage: string | null = null;

  try {
    detail = viewer
      ? await getContainer().useCases.getPhotographerDetail.execute({
          username: decodedUsername,
          viewerUserId: viewer.id,
        })
      : await getCachedPublicPhotographerDetail(decodedUsername);
  } catch (err) {
    errorMessage =
      err instanceof DomainError
        ? autoTranslateMessage(err.message, locale)
        : isVi
          ? "Hiện không thể tải thông tin nhiếp ảnh gia."
          : "Unable to load photographer details right now.";
  }

  if (!detail) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center space-y-4">
        <p className="text-sm text-muted-foreground">{errorMessage}</p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/">
            <ArrowLeft className="size-3.5" />
            {isVi ? "Quay lại Khám phá" : "Back to Explore"}
          </Link>
        </Button>
      </div>
    );
  }

  const baseUrl = getSiteUrl().origin;
  const profileJsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    mainEntity: {
      "@type": "Person",
      name: detail.name,
      alternateName: `@${detail.username}`,
      description: detail.bio ?? undefined,
      image: detail.avatarUrl ?? undefined,
      url: `${baseUrl}/photographers/${encodeURIComponent(detail.username)}`,
    },
  };

  return (
    <section className="space-y-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(profileJsonLd).replace(/</g, "\\u003c"),
        }}
      />

      <div>
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="-ml-2 text-muted-foreground"
        >
          <Link href="/">
            <ArrowLeft className="size-3.5" />
            {isVi ? "Quay lại Khám phá" : "Back to Explore"}
          </Link>
        </Button>
      </div>

      {/* Minimalist Photographer Header */}
      <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            <UserAvatarCircle
              username={detail.name}
              avatarUrl={detail.avatarUrl}
              size="lg"
            />
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight">
                  {detail.name}
                </h1>
                <span className="text-xs text-muted-foreground">
                  @{detail.username}
                </span>
                {detail.isFallbackCache && (
                  <Badge variant="secondary">
                    {isVi ? "Đồng bộ từ bộ nhớ đệm" : "Synced from edge cache"}
                  </Badge>
                )}
              </div>

              {detail.bio && (
                <p className="max-w-2xl text-xs sm:text-sm leading-relaxed text-muted-foreground">
                  {detail.bio}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-muted-foreground">
                {detail.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3.5" />
                    {detail.location}
                  </span>
                )}
                {detail.portfolioUrl &&
                  /^https?:\/\//i.test(detail.portfolioUrl) && (
                    <a
                      href={detail.portfolioUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 hover:text-foreground underline underline-offset-4"
                    >
                      <Globe className="size-3.5" />
                      {detail.provider === "pixabay"
                        ? "Pixabay Source"
                        : "Portfolio"}
                    </a>
                  )}
                {detail.profileUrl &&
                  /^https?:\/\//i.test(detail.profileUrl) && (
                    <a
                      href={detail.profileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 hover:text-foreground underline underline-offset-4"
                    >
                      {detail.provider === "pixabay"
                        ? "Pixabay Profile"
                        : detail.provider === "picsum"
                          ? "Picsum Source"
                          : "Unsplash Profile"}
                      <ExternalLink className="size-3" />
                    </a>
                  )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 border-t sm:border-t-0 pt-4 sm:pt-0 text-center sm:text-right shrink-0">
            <div>
              <p className="text-lg font-semibold tabular-nums">
                {detail.totalPhotos.toLocaleString("en-US")}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {isVi ? "Tác phẩm" : "Photos"}
              </p>
            </div>
            <div>
              <p className="text-lg font-semibold tabular-nums">
                {detail.totalLikes.toLocaleString("en-US")}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {isVi ? "Lượt thích" : "Likes"}
              </p>
            </div>
            <div>
              <p className="text-lg font-semibold tabular-nums">
                {detail.totalCollections.toLocaleString("en-US")}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {isVi ? "Bộ sưu tập" : "Collections"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Photographer's Curated Gallery */}
      <div className="space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground">
          {isVi
            ? `Tác phẩm tiêu biểu (${detail.photos.length})`
            : `Featured Works (${detail.photos.length})`}
        </h2>

        {detail.photos.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-14 text-center text-xs text-muted-foreground">
            {isVi
              ? "Chưa có tác phẩm nào được lưu đệm cho nhiếp ảnh gia này."
              : "No cached photographs are available for this photographer yet."}
          </div>
        ) : (
          <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4">
            {detail.photos.map((photo) => (
              <MinimalImageCard
                key={`${photo.provider}:${photo.externalId}`}
                item={photo}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

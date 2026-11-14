import Link from "next/link";
import { ArrowLeft, ExternalLink, Globe, MapPin } from "lucide-react";
import { MinimalImageCard } from "@/components/images/image-card";
import { Badge, UserAvatarCircle } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { DomainError } from "@/domain/errors/domain-errors";
import { getContainer } from "@/infrastructure/container";
import { getOptionalSessionUser } from "@/interfaces/http/api-helpers";

export const dynamic = "force-dynamic";

export default async function PhotographerDetailPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const decodedUsername = decodeURIComponent(username);
  const viewer = await getOptionalSessionUser();

  let detail: Awaited<
    ReturnType<
      ReturnType<typeof getContainer>["useCases"]["getPhotographerDetail"]["execute"]
    >
  > | null = null;
  let errorMessage: string | null = null;

  try {
    detail = await getContainer().useCases.getPhotographerDetail.execute({
      username: decodedUsername,
      viewerUserId: viewer?.id ?? null,
    });
  } catch (err) {
    errorMessage =
      err instanceof DomainError
        ? err.message
        : "Không thể tải thông tin nhiếp ảnh gia lúc này.";
  }

  if (!detail) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center space-y-4">
        <p className="text-sm text-muted-foreground">{errorMessage}</p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/">
            <ArrowLeft className="size-3.5" />
            Quay về Khám phá
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <section className="space-y-8">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
          <Link href="/">
            <ArrowLeft className="size-3.5" />
            Quay lại Khám phá
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
                    Đồng bộ nhanh từ bộ nhớ đệm
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
                {detail.portfolioUrl && /^https?:\/\//i.test(detail.portfolioUrl) && (
                  <a
                    href={detail.portfolioUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-foreground underline underline-offset-4"
                  >
                    <Globe className="size-3.5" />
                    Portfolio
                  </a>
                )}
                {detail.profileUrl && /^https?:\/\//i.test(detail.profileUrl) && (
                  <a
                    href={detail.profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-foreground underline underline-offset-4"
                  >
                    Hồ sơ Unsplash
                    <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 border-t sm:border-t-0 pt-4 sm:pt-0 text-center sm:text-right shrink-0">
            <div>
              <p className="text-lg font-semibold tabular-nums">
                {detail.totalPhotos.toLocaleString("vi-VN")}
              </p>
              <p className="text-[11px] text-muted-foreground">Tác phẩm</p>
            </div>
            <div>
              <p className="text-lg font-semibold tabular-nums">
                {detail.totalLikes.toLocaleString("vi-VN")}
              </p>
              <p className="text-[11px] text-muted-foreground">Lượt thích</p>
            </div>
            <div>
              <p className="text-lg font-semibold tabular-nums">
                {detail.totalCollections.toLocaleString("vi-VN")}
              </p>
              <p className="text-[11px] text-muted-foreground">Bộ sưu tập</p>
            </div>
          </div>
        </div>
      </div>

      {/* Photographer's Curated Gallery */}
      <div className="space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground">
          Các tác phẩm tiêu biểu ({detail.photos.length})
        </h2>

        {detail.photos.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-14 text-center text-xs text-muted-foreground">
            Chưa có hình ảnh nào được lưu trong bộ sưu tập hiển thị của tác giả này.
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

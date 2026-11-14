import { InfiniteExploreFeed } from "@/components/images/infinite-explore-feed";
import { getContainer } from "@/infrastructure/container";
import { getOptionalSessionUser } from "@/interfaces/http/api-helpers";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const viewer = await getOptionalSessionUser();
  const initialFeed = await getContainer().useCases.browseInfiniteImages.execute({
    page: 1,
    viewerUserId: viewer?.id ?? null,
  });

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
          Khám phá khung hình
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Cuộn vô tận các tác phẩm nhiếp ảnh tối giản. Lưu lại khoảnh khắc chạm tới bạn và viết nên câu chuyện riêng.
        </p>
      </div>

      <InfiniteExploreFeed
        initialItems={initialFeed.items}
        initialHasMore={initialFeed.hasMore}
      />
    </section>
  );
}

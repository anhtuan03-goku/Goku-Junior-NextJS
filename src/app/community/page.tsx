import { CommunityPostsFeed } from "@/components/posts/community-feed";
import { getContainer } from "@/infrastructure/container";
import { getOptionalSessionUser } from "@/interfaces/http/api-helpers";

export const dynamic = "force-dynamic";

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
          Bài viết cộng đồng
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Không bình luận ồn ào, không thông báo làm phiền — chỉ những khung hình công khai và lượt thả tim ẩn danh.
        </p>
      </div>

      <CommunityPostsFeed
        initialPosts={initial.items}
        initialHasMore={initial.hasMore}
      />
    </section>
  );
}

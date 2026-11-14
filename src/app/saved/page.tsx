import { redirect } from "next/navigation";
import {
  type ClientSavedImageItem,
  SavedMultiPostStudio,
} from "@/components/saved/saved-studio";
import { getContainer } from "@/infrastructure/container";
import { getOptionalSessionUser } from "@/interfaces/http/api-helpers";

export const dynamic = "force-dynamic";

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
          Kho ảnh đã lưu & Bài viết của bạn
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Nhấn vào bất kỳ hình ảnh nào để viết thêm bài viết mới, chỉnh sửa nội dung hoặc chuyển đổi chế độ Private ↔ Public.
        </p>
      </div>

      <SavedMultiPostStudio
        initialItems={serialized}
        initialHighlightId={highlight}
      />
    </section>
  );
}

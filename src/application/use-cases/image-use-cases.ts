import type {
  SavedImage,
  SavedImageWithPosts,
} from "@/domain/entities/models";
import { NotFoundError, ValidationError } from "@/domain/errors/domain-errors";
import type {
  FeedResponseDTO,
  IImageFeedOrchestrator,
  ISavedImageRepository,
} from "@/domain/repositories/ports";

export class BrowseInfiniteImagesUseCase {
  constructor(private readonly orchestrator: IImageFeedOrchestrator) {}

  async execute(params: {
    page: number;
    query?: string;
    provider?: string;
    viewerUserId?: string | null;
  }): Promise<FeedResponseDTO> {
    const safePage = Number.isFinite(params.page) && params.page >= 1
      ? Math.min(Math.floor(params.page), 500)
      : 1;
    const cleanQuery = params.query?.trim().slice(0, 100) || undefined;

    return this.orchestrator.getInfiniteFeed({
      page: safePage,
      query: cleanQuery,
      provider: params.provider,
      viewerUserId: params.viewerUserId,
    });
  }
}

export class GetPhotographerDetailUseCase {
  constructor(private readonly orchestrator: IImageFeedOrchestrator) {}

  async execute(params: {
    username: string;
    viewerUserId?: string | null;
  }) {
    const cleanUsername = params.username.trim();
    if (!cleanUsername || cleanUsername.length > 64 || !/^[a-zA-Z0-9_.-]+$/.test(cleanUsername)) {
      throw new ValidationError("Username nhiếp ảnh gia không hợp lệ.");
    }

    return this.orchestrator.getPhotographerDetail({
      username: cleanUsername,
      viewerUserId: params.viewerUserId,
    });
  }
}

export class SaveImageUseCase {
  constructor(
    private readonly savedImageRepo: ISavedImageRepository,
    private readonly orchestrator: IImageFeedOrchestrator,
  ) {}

  async execute(input: {
    userId: string;
    provider: string;
    externalId: string;
    imageUrl: string;
    thumbUrl: string;
    color?: string | null;
    width: number;
    height: number;
    description?: string | null;
    photographerUsername?: string | null;
    photographerName?: string | null;
    photographerAvatar?: string | null;
    photographerUrl?: string | null;
    downloadLocation?: string | null;
  }): Promise<{ savedImage: SavedImage; alreadySaved: boolean }> {
    if (!input.externalId || !input.imageUrl || !input.thumbUrl) {
      throw new ValidationError("Thông tin hình ảnh không hợp lệ.");
    }

    const existing = await this.savedImageRepo.findByUserAndExternal(
      input.userId,
      input.provider,
      input.externalId,
    );
    if (existing) {
      return { savedImage: existing, alreadySaved: true };
    }

    const created = await this.savedImageRepo.create({
      userId: input.userId,
      provider: input.provider,
      externalId: input.externalId,
      imageUrl: input.imageUrl,
      thumbUrl: input.thumbUrl,
      color: input.color ?? null,
      width: Math.max(1, Math.floor(input.width || 800)),
      height: Math.max(1, Math.floor(input.height || 600)),
      description: input.description?.slice(0, 500) ?? null,
      photographerUsername: input.photographerUsername?.slice(0, 100) ?? null,
      photographerName: input.photographerName?.slice(0, 150) ?? null,
      photographerAvatar: input.photographerAvatar ?? null,
      photographerUrl: input.photographerUrl ?? null,
      downloadLocation: input.downloadLocation ?? null,
    });

    // Non-blocking, SSRF-validated & quota-governed Unsplash download trigger
    await this.orchestrator.enqueueDownloadTrigger({
      provider: created.provider,
      externalId: created.externalId,
      downloadLocation: created.downloadLocation,
    });

    return { savedImage: created, alreadySaved: false };
  }
}

export class UnsaveImageUseCase {
  constructor(private readonly savedImageRepo: ISavedImageRepository) {}

  async execute(input: { userId: string; savedImageId: string }): Promise<void> {
    const deleted = await this.savedImageRepo.deleteByIdAndUser(
      input.savedImageId,
      input.userId,
    );
    if (!deleted) {
      throw new NotFoundError("Không tìm thấy hình ảnh đã lưu hoặc bạn không có quyền xóa.");
    }
  }
}

export class ListMySavedImagesUseCase {
  constructor(private readonly savedImageRepo: ISavedImageRepository) {}

  async execute(userId: string): Promise<SavedImageWithPosts[]> {
    return this.savedImageRepo.listByUserWithPosts(userId);
  }
}

import type { SpaceFeedResponseDTO } from "@/domain/entities/models";
import type {
  INasaSpaceProvider,
  ISavedImageRepository,
} from "@/domain/repositories/ports";

/**
 * Dedicated use case for browsing cosmic imagery from the NASA Image and Video Library.
 * Strictly isolated from Unsplash, Pixabay, Picsum, and fallback pools:
 * when NASA returns no imagery, this use case returns an empty list with zero fallback.
 */
export class BrowseSpaceImagesUseCase {
  constructor(
    private readonly nasaProvider: INasaSpaceProvider,
    private readonly savedImageRepo: ISavedImageRepository,
  ) {}

  async execute(params: {
    page?: number;
    perPage?: number;
    query?: string;
    yearStart?: number;
    yearEnd?: number;
    viewerUserId?: string | null;
  }): Promise<SpaceFeedResponseDTO> {
    const safePage =
      params.page !== undefined &&
      Number.isFinite(params.page) &&
      params.page >= 1
        ? Math.min(Math.floor(params.page), 100)
        : 1;

    const safePerPage =
      params.perPage !== undefined &&
      Number.isFinite(params.perPage) &&
      params.perPage >= 1
        ? Math.min(Math.floor(params.perPage), 30)
        : 24;

    const cleanQuery = params.query?.trim().slice(0, 100) || undefined;

    const safeYearStart =
      params.yearStart !== undefined &&
      Number.isFinite(params.yearStart) &&
      params.yearStart >= 1920 &&
      params.yearStart <= 2100
        ? Math.floor(params.yearStart)
        : undefined;

    const safeYearEnd =
      params.yearEnd !== undefined &&
      Number.isFinite(params.yearEnd) &&
      params.yearEnd >= 1920 &&
      params.yearEnd <= 2100
        ? Math.floor(params.yearEnd)
        : undefined;

    const result = await this.nasaProvider.fetchSpacePage({
      page: safePage,
      perPage: safePerPage,
      query: cleanQuery,
      yearStart: safeYearStart,
      yearEnd: safeYearEnd,
    });

    // Strict zero-fallback guarantee: empty NASA response stays empty.
    if (result.items.length === 0) {
      return {
        items: [],
        page: safePage,
        hasMore: false,
      };
    }

    if (!params.viewerUserId) {
      return {
        items: result.items.map((item) => ({
          ...item,
          savedByMe: false,
          savedImageId: null,
        })),
        page: safePage,
        hasMore: result.hasMore,
      };
    }

    const savedMap = await this.savedImageRepo.findSavedExternalKeys(
      params.viewerUserId,
      result.items.map((i) => ({
        provider: i.provider,
        externalId: i.externalId,
      })),
    );

    return {
      items: result.items.map((item) => {
        const savedId =
          savedMap.get(`${item.provider}:${item.externalId}`) ?? null;
        return {
          ...item,
          savedByMe: savedId !== null,
          savedImageId: savedId,
        };
      }),
      page: safePage,
      hasMore: result.hasMore,
    };
  }
}

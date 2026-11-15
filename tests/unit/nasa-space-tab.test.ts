import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { SaveImageUseCase } from "@/application/use-cases/image-use-cases";
import { BrowseSpaceImagesUseCase } from "@/application/use-cases/space-use-cases";
import type { SavedImage } from "@/domain/entities/models";
import type {
  IImageFeedOrchestrator,
  ISavedImageRepository,
} from "@/domain/repositories/ports";
import {
  NasaSpaceImageProvider,
  resolveNasaImageCredit,
  sanitizeNasaAssetUrl,
} from "@/infrastructure/providers/nasa-provider";

const noopSavedRepo: ISavedImageRepository = {
  async findById() {
    return null;
  },
  async findByUserAndExternal() {
    return null;
  },
  async findSavedExternalKeys() {
    return new Map<string, string>();
  },
  async create(input) {
    return { ...input, id: "saved_nasa_1", createdAt: new Date() };
  },
  async deleteByIdAndUser() {
    return true;
  },
  async listByUserWithPosts() {
    return [];
  },
};

describe("NASA Space Tab — Archive Provider, UI Simplicity, Isolation & Zero-Fallback", () => {
  it("keeps Space tab UI focused solely on NASA Archive with zero sub-tab buttons (no APOD, no Mars Rovers, no NASA Archive tab switcher)", () => {
    const spaceFeedFile = path.resolve(
      import.meta.dirname,
      "../../src/components/space/nasa-space-feed.tsx",
    );
    const content = fs.readFileSync(spaceFeedFile, "utf8");

    expect(content).not.toContain("APOD");
    expect(content).not.toContain("Mars Rovers");
    expect(content).not.toContain("<span>NASA Archive</span>");
    expect(content).toContain("No space images available");
  });

  it("applies exact Section 3 credit fallback priority: copyright -> photographer -> center -> NASA / JPL-Caltech", () => {
    expect(
      resolveNasaImageCredit({
        copyright: "\n  John   Doe \n",
        photographer: "Apollo Crew",
        center: "JSC",
      }),
    ).toBe("John Doe");

    expect(
      resolveNasaImageCredit({
        copyright: null,
        photographer: "Neil Armstrong",
        center: "JSC",
      }),
    ).toBe("Neil Armstrong");

    expect(
      resolveNasaImageCredit({
        copyright: "",
        photographer: undefined,
        center: "JPL",
      }),
    ).toBe("JPL");

    expect(resolveNasaImageCredit({})).toBe("NASA / JPL-Caltech");
  });

  it("sanitizes NASA asset URLs, upgrades http://*.nasa.gov to https://, blocks TIFFs, and rejects untrusted hosts", () => {
    expect(
      sanitizeNasaAssetUrl(
        "http://images-assets.nasa.gov/image/PIA14417/PIA14417~medium.jpg",
      ),
    ).toBe(
      "https://images-assets.nasa.gov/image/PIA14417/PIA14417~medium.jpg",
    );

    // Rejects raw Hubble TIFF files
    expect(
      sanitizeNasaAssetUrl(
        "https://images-assets.nasa.gov/image/PIA12345/PIA12345~orig.tif",
      ),
    ).toBeNull();

    // Rejects non-NASA SSRF / untrusted domains
    expect(
      sanitizeNasaAssetUrl("https://evil.attacker.example/space.jpg"),
    ).toBeNull();
    expect(sanitizeNasaAssetUrl("http://169.254.169.254/meta")).toBeNull();
  });

  it("fetches NASA Image and Video Library, coalesces concurrent requests, caches results, and truncates long descriptions safely", async () => {
    const longDesc = "Cosmic dust pillars in infrared light. ".repeat(30);
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const u = new URL(String(input));
      expect(u.origin + u.pathname).toBe("https://images-api.nasa.gov/search");
      expect(u.searchParams.get("media_type")).toBe("image");
      expect(u.searchParams.get("q")).toBe("james webb");
      expect(u.searchParams.has("api_key")).toBe(false);

      return new Response(
        JSON.stringify({
          collection: {
            metadata: { total_hits: 120 },
            items: [
              {
                data: [
                  {
                    nasa_id: "WEBB_PILLARS_2024",
                    title: "Pillars of Creation",
                    description: `<b>${longDesc}</b>`,
                    center: "GSFC",
                    media_type: "image",
                  },
                ],
                links: [
                  {
                    href: "https://images-assets.nasa.gov/image/WEBB_PILLARS_2024/WEBB_PILLARS_2024~orig.tif",
                    rel: "canonical",
                    render: "image",
                    width: 28000,
                    height: 18000,
                  },
                  {
                    href: "https://images-assets.nasa.gov/image/WEBB_PILLARS_2024/WEBB_PILLARS_2024~large.jpg",
                    rel: "alternate",
                    render: "image",
                    width: 2048,
                    height: 1536,
                  },
                  {
                    href: "https://images-assets.nasa.gov/image/WEBB_PILLARS_2024/WEBB_PILLARS_2024~thumb.jpg",
                    rel: "preview",
                    render: "image",
                    width: 640,
                    height: 480,
                  },
                ],
              },
            ],
          },
        }),
        { status: 200 },
      );
    });

    const provider = new NasaSpaceImageProvider({
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });

    // Fire 6 concurrent calls -> Singleflight executes only 1 network request
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        provider.fetchSpacePage({
          page: 1,
          perPage: 24,
          query: "james webb",
        }),
      ),
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const first = results[0]!;
    expect(first.hasMore).toBe(true);
    expect(first.items).toHaveLength(1);

    const item = first.items[0]!;
    expect(item.provider).toBe("nasa");
    expect(item.externalId).toBe("lib_WEBB_PILLARS_2024");
    expect(item.imageUrl).toContain("~large.jpg");
    expect(item.thumbUrl).toContain("~thumb.jpg");
    expect(item.width).toBe(2048);
    expect(item.height).toBe(1536);
    expect(item.description!.length).toBeLessThanOrEqual(480);
    expect(item.description).not.toContain("<b>");
    expect(item.photographer?.name).toBe("GSFC");
  });

  it("returns empty items with ZERO fallback on empty results or 404/429/500/network errors", async () => {
    for (const status of [404, 429, 500]) {
      const failingProvider = new NasaSpaceImageProvider({
        fetchImpl: (async () =>
          new Response("Upstream unavailable", {
            status,
          })) as unknown as typeof fetch,
      });

      const useCase = new BrowseSpaceImagesUseCase(
        failingProvider,
        noopSavedRepo,
      );
      const emptyFeed = await useCase.execute({
        query: "nonexistent_galaxy_xyz",
        page: 1,
      });

      expect(emptyFeed).toEqual({
        items: [],
        page: 1,
        hasMore: false,
      });
    }
  });

  it("decorates savedByMe state and allows saving NASA Archive frames cleanly", async () => {
    const provider = new NasaSpaceImageProvider({
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            collection: {
              metadata: { total_hits: 1 },
              items: [
                {
                  data: [
                    {
                      nasa_id: "PIA04216",
                      title: "Ant Nebula",
                      center: "JPL",
                      media_type: "image",
                    },
                  ],
                  links: [
                    {
                      href: "https://images-assets.nasa.gov/image/PIA04216/PIA04216~orig.jpg",
                      rel: "canonical",
                      render: "image",
                      width: 1072,
                      height: 708,
                    },
                  ],
                },
              ],
            },
          }),
          { status: 200 },
        )) as unknown as typeof fetch,
    });

    const savedRepoWithMatch: ISavedImageRepository = {
      ...noopSavedRepo,
      async findSavedExternalKeys() {
        return new Map([["nasa:lib_PIA04216", "saved_uuid_99"]]);
      },
    };

    const browseUseCase = new BrowseSpaceImagesUseCase(
      provider,
      savedRepoWithMatch,
    );

    const feed = await browseUseCase.execute({
      query: "ant nebula",
      viewerUserId: "user_42",
    });
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0]?.savedByMe).toBe(true);
    expect(feed.items[0]?.savedImageId).toBe("saved_uuid_99");

    const enqueueSpy = vi.fn(async () => {});
    const mockOrchestrator = {
      enqueueDownloadTrigger: enqueueSpy,
      resolvePermanentImageUrls: async ({
        imageUrl,
        thumbUrl,
      }: {
        imageUrl: string;
        thumbUrl: string;
      }) => ({ imageUrl, thumbUrl }),
    } as unknown as IImageFeedOrchestrator;

    const savedRecords: SavedImage[] = [];
    const saveUseCase = new SaveImageUseCase(
      {
        ...noopSavedRepo,
        async create(input) {
          const rec: SavedImage = {
            ...input,
            id: "saved_nasa_ant",
            createdAt: new Date(),
          };
          savedRecords.push(rec);
          return rec;
        },
      },
      mockOrchestrator,
    );

    const savedRes = await saveUseCase.execute({
      userId: "user_42",
      provider: "nasa",
      externalId: "lib_PIA04216",
      imageUrl:
        "https://images-assets.nasa.gov/image/PIA04216/PIA04216~orig.jpg",
      thumbUrl:
        "https://images-assets.nasa.gov/image/PIA04216/PIA04216~orig.jpg",
      width: 1072,
      height: 708,
      description: "Ant Nebula",
      photographerName: "JPL",
    });

    expect(savedRes.alreadySaved).toBe(false);
    expect(savedRes.savedImage.provider).toBe("nasa");
    expect(savedRecords).toHaveLength(1);
  });
});

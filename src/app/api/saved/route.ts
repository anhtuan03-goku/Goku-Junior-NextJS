import { NextResponse } from "next/server";
import { z } from "zod";
import { ValidationError } from "@/domain/errors/domain-errors";
import { getContainer } from "@/infrastructure/container";
import { ALLOWED_NASA_ASSET_HOSTS } from "@/infrastructure/providers/nasa-provider";
import { isSafeUnsplashDownloadUrl } from "@/infrastructure/providers/unsplash-provider";
import { isLocalPixabayMediaUrl } from "@/infrastructure/storage/pixabay-media-storage";
import {
  mutationRateLimiter,
  verifyCsrfOrigin,
} from "@/infrastructure/security/request-guards";
import {
  handleApiError,
  requireSessionUser,
} from "@/interfaces/http/api-helpers";

const ALLOWED_IMAGE_HOSTS = new Set<string>([
  "images.unsplash.com",
  "plus.unsplash.com",
  "pixabay.com",
  "cdn.pixabay.com",
  "picsum.photos",
  "fastly.picsum.photos",
  "res.cloudinary.com",
  ...ALLOWED_NASA_ASSET_HOSTS,
]);

function assertSafeRemoteImageUrl(rawUrl: string): string {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new ValidationError("Invalid image URL.");
  }
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    !ALLOWED_IMAGE_HOSTS.has(u.hostname)
  ) {
    throw new ValidationError(
      "Image host is not in the trusted provider allowlist.",
    );
  }
  return u.toString();
}

function assertSafeSavedAssetUrl(rawUrl: string, provider: string): string {
  if (provider === "pixabay" && isLocalPixabayMediaUrl(rawUrl)) {
    return rawUrl;
  }
  return assertSafeRemoteImageUrl(rawUrl);
}

function assertSafeHttpsProfileUrl(rawUrl: string): string {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new ValidationError("Invalid photographer profile URL.");
  }
  if (u.protocol !== "https:" || u.username || u.password) {
    throw new ValidationError("Photographer profile URL must use secure HTTPS.");
  }
  return u.toString();
}

const saveImageSchema = z
  .object({
    provider: z
      .enum(["unsplash", "pixabay", "picsum", "nasa"])
      .default("unsplash"),
    externalId: z.string().min(1).max(128),
    imageUrl: z.string().min(1).max(2000),
    thumbUrl: z.string().min(1).max(2000),
    color: z.string().max(32).nullable().optional(),
    width: z.number().int().min(1).max(20000).default(1080),
    height: z.number().int().min(1).max(20000).default(1350),
    description: z.string().max(500).nullable().optional(),
    photographerUsername: z.string().max(100).nullable().optional(),
    photographerName: z.string().max(150).nullable().optional(),
    photographerAvatar: z.string().max(2000).nullable().optional(),
    photographerUrl: z.string().max(2000).nullable().optional(),
    downloadLocation: z.string().max(2000).nullable().optional(),
  })
  .strict();

export async function GET() {
  try {
    const user = await requireSessionUser();
    const items = await getContainer().useCases.listMySavedImages.execute(
      user.id,
    );
    return NextResponse.json({ items }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    verifyCsrfOrigin(request);
    const user = await requireSessionUser();
    mutationRateLimiter.consume(`save:${user.id}`);

    const body = await request.json();
    const parsed = saveImageSchema.parse(body);

    const safeImageUrl = assertSafeSavedAssetUrl(
      parsed.imageUrl,
      parsed.provider,
    );
    const safeThumbUrl = assertSafeSavedAssetUrl(
      parsed.thumbUrl,
      parsed.provider,
    );

    const safePhotographerAvatar = parsed.photographerAvatar
      ? assertSafeRemoteImageUrl(parsed.photographerAvatar)
      : null;

    const safePhotographerUrl = parsed.photographerUrl
      ? assertSafeHttpsProfileUrl(parsed.photographerUrl)
      : null;

    let safeDownloadLocation: string | null = null;
    if (parsed.downloadLocation !== undefined && parsed.downloadLocation !== null) {
      if (
        parsed.provider !== "unsplash" ||
        !isSafeUnsplashDownloadUrl(parsed.downloadLocation)
      ) {
        throw new ValidationError(
          "Invalid download_location URL or untrusted upstream host.",
        );
      }
      safeDownloadLocation = parsed.downloadLocation;
    }

    const result = await getContainer().useCases.saveImage.execute({
      userId: user.id,
      provider: parsed.provider,
      externalId: parsed.externalId,
      imageUrl: safeImageUrl,
      thumbUrl: safeThumbUrl,
      color: parsed.color ?? null,
      width: parsed.width,
      height: parsed.height,
      description: parsed.description ?? null,
      photographerUsername: parsed.photographerUsername ?? null,
      photographerName: parsed.photographerName ?? null,
      photographerAvatar: safePhotographerAvatar,
      photographerUrl: safePhotographerUrl,
      downloadLocation: safeDownloadLocation,
    });

    return NextResponse.json(result, {
      status: result.alreadySaved ? 200 : 201,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

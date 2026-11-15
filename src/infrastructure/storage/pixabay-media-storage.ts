import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { ValidationError } from "@/domain/errors/domain-errors";
import {
  type PixabayImageProvider,
  isSafePixabayAssetUrl,
} from "../providers/pixabay-provider";
import { detectSafeImageMime } from "./cloudinary-avatar-storage";

const MAX_PIXABAY_ASSET_BYTES = 15 * 1024 * 1024; // 15 MB safety ceiling
const MIME_TO_EXT: Record<"image/jpeg" | "image/png" | "image/webp", string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const EXT_TO_MIME: Record<string, "image/jpeg" | "image/png" | "image/webp"> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export type PixabayMediaVariant = "full" | "thumb";

export function isValidPixabayExternalId(externalId: string): boolean {
  return /^[0-9]{1,20}$/.test(externalId);
}

export function buildLocalPixabayMediaPath(
  externalId: string,
  variant: PixabayMediaVariant,
): string {
  return `/api/media/pixabay/${externalId}?variant=${variant}`;
}

export function isLocalPixabayMediaUrl(rawUrl: string): boolean {
  return /^\/api\/media\/pixabay\/[0-9]{1,20}\?variant=(full|thumb)$/.test(
    rawUrl,
  );
}

/**
 * Complies with Pixabay's Hotlinking Policy:
 * Pixabay's webformatURL / largeImageURL expire after 24 hours and must not be
 * permanently hotlinked for long-term saved items. When a user saves a Pixabay
 * frame (for Saved Collection & Stories), this service downloads, validates
 * binary magic bytes (JPEG/PNG/WebP), and persists the asset on server storage.
 */
export class PixabayServerMediaStorage {
  private readonly storageDir: string;
  private readonly fetchImpl: typeof fetch;
  private readonly inFlight = new Map<
    string,
    Promise<{ buffer: Buffer; mimeType: "image/jpeg" | "image/png" | "image/webp" }>
  >();

  constructor(options?: { storageDir?: string; fetchImpl?: typeof fetch }) {
    this.storageDir =
      options?.storageDir ??
      path.join(process.cwd(), ".data", "pixabay-media");
    this.fetchImpl = options?.fetchImpl ?? fetch;
  }

  private assertSafeId(externalId: string): string {
    const clean = externalId.trim();
    if (!isValidPixabayExternalId(clean)) {
      throw new ValidationError("Invalid Pixabay image identifier.");
    }
    return clean;
  }

  private async readFromDisk(
    externalId: string,
    variant: PixabayMediaVariant,
  ): Promise<{
    buffer: Buffer;
    mimeType: "image/jpeg" | "image/png" | "image/webp";
  } | null> {
    const cleanId = this.assertSafeId(externalId);
    for (const [ext, mimeType] of Object.entries(EXT_TO_MIME)) {
      const filePath = path.join(
        this.storageDir,
        `${cleanId}_${variant}.${ext}`,
      );
      try {
        const buf = await fs.readFile(filePath);
        if (buf.byteLength >= 12) {
          return { buffer: buf, mimeType };
        }
      } catch {
        // File with this extension does not exist; check next
      }
    }
    return null;
  }

  private async downloadAndStore(
    externalId: string,
    variant: PixabayMediaVariant,
    remoteUrl: string,
  ): Promise<{
    buffer: Buffer;
    mimeType: "image/jpeg" | "image/png" | "image/webp";
  }> {
    const cleanId = this.assertSafeId(externalId);
    if (!isSafePixabayAssetUrl(remoteUrl)) {
      throw new ValidationError("Untrusted Pixabay asset URL.");
    }

    const key = `${cleanId}:${variant}`;
    const active = this.inFlight.get(key);
    if (active) return active;

    const task = (async () => {
      // Strictly follow at most 1 hop within trusted Pixabay CDN hosts (blocks open-redirect SSRF)
      let currentUrl = remoteUrl;
      let response: Response | null = null;

      for (let hop = 0; hop < 2; hop += 1) {
        if (!isSafePixabayAssetUrl(currentUrl)) {
          throw new ValidationError("Blocked redirect to untrusted host.");
        }
        const res = await this.fetchImpl(currentUrl, {
          method: "GET",
          redirect: "manual",
          cache: "no-store",
        });

        if (
          res.status >= 300 &&
          res.status < 400 &&
          res.headers.get("location")
        ) {
          currentUrl = new URL(
            res.headers.get("location")!,
            currentUrl,
          ).toString();
          continue;
        }
        response = res;
        break;
      }

      if (!response || !response.ok) {
        throw new Error(
          `Failed to download Pixabay media asset (HTTP ${response?.status ?? 0})`,
        );
      }

      const contentLength = Number.parseInt(
        response.headers.get("content-length") ?? "0",
        10,
      );
      if (contentLength > MAX_PIXABAY_ASSET_BYTES) {
        throw new ValidationError("Pixabay image exceeds maximum safe size.");
      }

      const arrayBuf = await response.arrayBuffer();
      if (arrayBuf.byteLength > MAX_PIXABAY_ASSET_BYTES) {
        throw new ValidationError("Pixabay image exceeds maximum safe size.");
      }

      const buffer = Buffer.from(arrayBuf);
      const mimeType = detectSafeImageMime(buffer);
      const ext = MIME_TO_EXT[mimeType];

      await fs.mkdir(this.storageDir, { recursive: true });
      const targetPath = path.join(
        this.storageDir,
        `${cleanId}_${variant}.${ext}`,
      );
      await fs.writeFile(targetPath, buffer);

      return { buffer, mimeType };
    })().finally(() => {
      this.inFlight.delete(key);
    });

    this.inFlight.set(key, task);
    return task;
  }

  /**
   * Archives both full and thumbnail variants locally on the server when a user saves
   * a Pixabay frame, returning permanent internal `/api/media/pixabay/<id>` URLs.
   */
  async archiveSavedPair(params: {
    externalId: string;
    imageUrl: string;
    thumbUrl: string;
  }): Promise<{ imageUrl: string; thumbUrl: string }> {
    const cleanId = this.assertSafeId(params.externalId);
    const localFull = buildLocalPixabayMediaPath(cleanId, "full");
    const localThumb = buildLocalPixabayMediaPath(cleanId, "thumb");

    const tasks: Array<Promise<unknown>> = [];
    if (!isLocalPixabayMediaUrl(params.imageUrl)) {
      tasks.push(
        this.readFromDisk(cleanId, "full").then((hit) =>
          hit ? hit : this.downloadAndStore(cleanId, "full", params.imageUrl),
        ),
      );
    }
    if (!isLocalPixabayMediaUrl(params.thumbUrl)) {
      tasks.push(
        this.readFromDisk(cleanId, "thumb").then((hit) =>
          hit ? hit : this.downloadAndStore(cleanId, "thumb", params.thumbUrl),
        ),
      );
    }

    await Promise.all(tasks);
    return {
      imageUrl: localFull,
      thumbUrl: localThumb,
    };
  }

  /**
   * Serves archived Pixabay media from disk, or self-heals via Pixabay ID lookup
   * if local ephemeral storage was cleared across deployments.
   */
  async readOrHydrateMedia(params: {
    externalId: string;
    variant: PixabayMediaVariant;
    pixabayProvider?: PixabayImageProvider;
  }): Promise<{
    buffer: Buffer;
    mimeType: "image/jpeg" | "image/png" | "image/webp";
  } | null> {
    const cleanId = this.assertSafeId(params.externalId);
    const existing = await this.readFromDisk(cleanId, params.variant);
    if (existing) return existing;

    if (!params.pixabayProvider) return null;
    const item = await params.pixabayProvider.fetchPhotoById(cleanId);
    if (!item) return null;

    const remoteUrl =
      params.variant === "thumb" ? item.thumbUrl : item.imageUrl;
    if (!isSafePixabayAssetUrl(remoteUrl)) return null;

    return this.downloadAndStore(cleanId, params.variant, remoteUrl);
  }
}

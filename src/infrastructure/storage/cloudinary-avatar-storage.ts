import "server-only";
import crypto from "node:crypto";
import { ValidationError } from "@/domain/errors/domain-errors";
import type { IAvatarStorageService } from "@/domain/repositories/ports";
import {
  type CloudinaryCredentials,
  getCloudinaryCredentials,
} from "../config/env";

/**
 * Inspects actual binary magic bytes to prevent disguised SVG/HTML/Script XSS uploads.
 * Only JPEG, PNG, and WebP binary images are accepted.
 */
export function detectSafeImageMime(buffer: Buffer): "image/jpeg" | "image/png" | "image/webp" {
  if (buffer.byteLength < 12) {
    throw new ValidationError("Tệp hình ảnh bị hỏng hoặc quá nhỏ.");
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }

  throw new ValidationError(
    "Định dạng tệp không hợp lệ. Chỉ chấp nhận ảnh thật chuẩn WebP, JPEG hoặc PNG (không chấp nhận SVG).",
  );
}

export function signCloudinaryParams(
  params: Record<string, string>,
  apiSecret: string,
): string {
  const serialized = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return crypto
    .createHash("sha1")
    .update(`${serialized}${apiSecret}`)
    .digest("hex");
}

export class CloudinarySingleSlotStorage implements IAvatarStorageService {
  private readonly getCreds: () => CloudinaryCredentials;
  private readonly fetchImpl: typeof fetch;

  constructor(
    credsOverride?: CloudinaryCredentials,
    fetchOverride?: typeof fetch,
  ) {
    this.getCreds = credsOverride
      ? () => credsOverride
      : getCloudinaryCredentials;
    this.fetchImpl = fetchOverride ?? fetch;
  }

  static buildUserSlotPublicId(userId: string): string {
    const cleanId = userId.replace(/[^a-zA-Z0-9_-]/g, "");
    return `goku_avatars/user_${cleanId}`;
  }

  async uploadUserAvatar(params: {
    userId: string;
    fileBuffer: Buffer;
    mimeType: string;
    previousPublicId: string | null;
  }): Promise<{ avatarUrl: string; avatarPublicId: string }> {
    const verifiedMime = detectSafeImageMime(params.fileBuffer);
    const { cloudName, apiKey, apiSecret } = this.getCreds();
    const targetPublicId = CloudinarySingleSlotStorage.buildUserSlotPublicId(
      params.userId,
    );

    // Guarantee strictly 1 slot: if a legacy/previous public_id exists, destroy it first
    if (params.previousPublicId) {
      await this.deleteUserAvatar(params.previousPublicId);
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signableParams: Record<string, string> = {
      invalidate: "true",
      overwrite: "true",
      public_id: targetPublicId,
      timestamp,
    };

    const signature = signCloudinaryParams(signableParams, apiSecret);
    const dataUri = `data:${verifiedMime};base64,${params.fileBuffer.toString("base64")}`;

    const form = new FormData();
    form.append("file", dataUri);
    form.append("api_key", apiKey);
    form.append("timestamp", timestamp);
    form.append("public_id", targetPublicId);
    form.append("overwrite", "true");
    form.append("invalidate", "true");
    form.append("signature", signature);

    const response = await this.fetchImpl(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      {
        method: "POST",
        body: form,
      },
    );

    if (!response.ok) {
      throw new Error(`Cloudinary upload failed with HTTP ${response.status}`);
    }

    const data = (await response.json()) as {
      secure_url?: string;
      public_id?: string;
    };

    if (!data.secure_url || !data.public_id) {
      throw new Error("Cloudinary response missing secure_url or public_id");
    }

    return {
      avatarUrl: data.secure_url,
      avatarPublicId: data.public_id,
    };
  }

  async deleteUserAvatar(publicId: string | null): Promise<void> {
    if (!publicId) return;
    const { cloudName, apiKey, apiSecret } = this.getCreds();
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const signableParams: Record<string, string> = {
      invalidate: "true",
      public_id: publicId,
      timestamp,
    };
    const signature = signCloudinaryParams(signableParams, apiSecret);

    const form = new FormData();
    form.append("public_id", publicId);
    form.append("invalidate", "true");
    form.append("api_key", apiKey);
    form.append("timestamp", timestamp);
    form.append("signature", signature);

    try {
      await this.fetchImpl(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
        {
          method: "POST",
          body: form,
        },
      );
    } catch {
      // Best-effort cleanup so transient network blips do not corrupt user state
    }
  }
}

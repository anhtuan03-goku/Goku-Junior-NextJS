/**
 * Client-side avatar square cropper & WebP compressor.
 * Compresses user-selected images down to <= 512x512 WebP (~25-70KB)
 * before uploading to our single-slot Cloudinary endpoint.
 */
export async function compressAvatarToWebP(
  file: File,
  maxDimension = 512,
  quality = 0.82,
): Promise<File> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please select a valid image file (JPEG, PNG, or WebP).");
  }
  if (file.type === "image/svg+xml") {
    throw new Error("SVG files are not supported for security reasons.");
  }

  const bitmapUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Unable to decode the selected image."));
      el.src = bitmapUrl;
    });

    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = Math.floor((img.naturalWidth - side) / 2);
    const sy = Math.floor((img.naturalHeight - side) / 2);
    const targetSize = Math.min(side, maxDimension);

    const canvas = document.createElement("canvas");
    canvas.width = targetSize;
    canvas.height = targetSize;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Your browser does not support Canvas image compression.");
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, side, side, 0, 0, targetSize, targetSize);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) {
            resolve(b);
            return;
          }
          // Fallback to JPEG if WebP encoding is unavailable
          canvas.toBlob(
            (fallbackBlob) => {
              if (fallbackBlob) resolve(fallbackBlob);
              else reject(new Error("Failed to compress avatar image."));
            },
            "image/jpeg",
            quality,
          );
        },
        "image/webp",
        quality,
      );
    });

    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    return new File([blob], `avatar.${ext}`, {
      type: blob.type,
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

import { NextResponse } from "next/server";
import { getContainer } from "@/infrastructure/container";
import {
  type PixabayMediaVariant,
  isValidPixabayExternalId,
} from "@/infrastructure/storage/pixabay-media-storage";
import { handleApiError } from "@/interfaces/http/api-helpers";

export async function GET(
  request: Request,
  context: { params: Promise<{ externalId: string }> },
) {
  try {
    const { externalId } = await context.params;
    if (!isValidPixabayExternalId(externalId)) {
      return NextResponse.json(
        { error: "Invalid Pixabay media identifier." },
        { status: 400 },
      );
    }

    const { searchParams } = new URL(request.url);
    const rawVariant = searchParams.get("variant");
    const variant: PixabayMediaVariant =
      rawVariant === "thumb" ? "thumb" : "full";

    const container = getContainer();
    const asset = await container.pixabayMediaStorage.readOrHydrateMedia({
      externalId,
      variant,
      pixabayProvider: container.pixabayProvider,
    });

    if (!asset) {
      return NextResponse.json(
        { error: "Pixabay media asset not found." },
        { status: 404 },
      );
    }

    return new NextResponse(new Uint8Array(asset.buffer), {
      status: 200,
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Length": String(asset.buffer.byteLength),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

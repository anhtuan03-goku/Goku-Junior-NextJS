import { NextResponse } from "next/server";
import { getContainer } from "@/infrastructure/container";
import {
  getOptionalSessionUser,
  handleApiError,
} from "@/interfaces/http/api-helpers";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Number.parseInt(searchParams.get("page") ?? "1", 10);
    const query = searchParams.get("query") ?? undefined;
    const provider = searchParams.get("provider") ?? undefined;
    const rawSeed = searchParams.get("seed");
    const seed = rawSeed && /^\d{1,10}$/.test(rawSeed) ? Number(rawSeed) : undefined;

    const viewer = await getOptionalSessionUser();
    const feed = await getContainer().useCases.browseInfiniteImages.execute({
      page: Number.isFinite(page) && page >= 1 ? page : 1,
      query,
      provider,
      seed,
      viewerUserId: viewer?.id ?? null,
    });

    return NextResponse.json(feed, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

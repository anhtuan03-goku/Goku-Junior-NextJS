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

    const viewer = await getOptionalSessionUser();
    const feed = await getContainer().useCases.browseInfiniteImages.execute({
      page: Number.isFinite(page) && page >= 1 ? page : 1,
      query,
      provider,
      viewerUserId: viewer?.id ?? null,
    });

    return NextResponse.json(feed, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

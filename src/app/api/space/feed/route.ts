import { NextResponse } from "next/server";
import { getContainer } from "@/infrastructure/container";
import {
  getOptionalSessionUser,
  handleApiError,
} from "@/interfaces/http/api-helpers";

function parseOptionalInt(raw: string | null): number | undefined {
  if (raw === null || raw.trim() === "") return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseOptionalInt(searchParams.get("page")) ?? 1;
    const perPage = parseOptionalInt(searchParams.get("perPage")) ?? 24;
    const query = searchParams.get("query") ?? undefined;
    const yearStart = parseOptionalInt(searchParams.get("yearStart"));
    const yearEnd = parseOptionalInt(searchParams.get("yearEnd"));

    const viewer = await getOptionalSessionUser();
    const feed = await getContainer().useCases.browseSpaceImages.execute({
      page,
      perPage,
      query,
      yearStart,
      yearEnd,
      viewerUserId: viewer?.id ?? null,
    });

    return NextResponse.json(feed, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

import { NextResponse } from "next/server";
import { getContainer } from "@/infrastructure/container";
import {
  getOptionalSessionUser,
  handleApiError,
} from "@/interfaces/http/api-helpers";

export async function GET(
  _request: Request,
  context: { params: Promise<{ username: string }> },
) {
  try {
    const { username } = await context.params;
    const viewer = await getOptionalSessionUser();

    const detail = await getContainer().useCases.getPhotographerDetail.execute({
      username,
      viewerUserId: viewer?.id ?? null,
    });

    return NextResponse.json({ photographer: detail }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

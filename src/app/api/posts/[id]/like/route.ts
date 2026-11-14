import { NextResponse } from "next/server";
import { z } from "zod";
import { getContainer } from "@/infrastructure/container";
import {
  mutationRateLimiter,
  verifyCsrfOrigin,
} from "@/infrastructure/security/request-guards";
import {
  handleApiError,
  requireSessionUser,
} from "@/interfaces/http/api-helpers";

const postIdSchema = z.string().uuid("ID bài viết không hợp lệ.");

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    verifyCsrfOrigin(request);
    const user = await requireSessionUser();
    mutationRateLimiter.consume(`like:${user.id}`);

    const { id } = await context.params;
    const postId = postIdSchema.parse(id);

    // Strictly returns ONLY { likesCount, likedByMe }
    const result = await getContainer().useCases.togglePostLike.execute({
      postId,
      userId: user.id,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

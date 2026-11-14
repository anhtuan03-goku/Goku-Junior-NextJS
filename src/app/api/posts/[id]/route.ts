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

const updatePostSchema = z
  .object({
    content: z.string().min(1).max(2000).optional(),
    visibility: z.enum(["PRIVATE", "PUBLIC"]).optional(),
  })
  .strict();

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    verifyCsrfOrigin(request);
    const user = await requireSessionUser();
    mutationRateLimiter.consume(`post-update:${user.id}`);

    const { id } = await context.params;
    const postId = postIdSchema.parse(id);

    const body = await request.json();
    const parsed = updatePostSchema.parse(body);

    const post = await getContainer().useCases.updatePost.execute({
      userId: user.id,
      postId,
      content: parsed.content,
      visibility: parsed.visibility,
    });

    return NextResponse.json({ post }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    verifyCsrfOrigin(request);
    const user = await requireSessionUser();
    mutationRateLimiter.consume(`post-delete:${user.id}`);

    const { id } = await context.params;
    const postId = postIdSchema.parse(id);

    await getContainer().useCases.deletePost.execute({
      actorId: user.id,
      actorRole: user.role,
      postId,
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

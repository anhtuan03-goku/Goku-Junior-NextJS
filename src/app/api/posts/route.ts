import { NextResponse } from "next/server";
import { z } from "zod";
import { getContainer } from "@/infrastructure/container";
import {
  mutationRateLimiter,
  verifyCsrfOrigin,
} from "@/infrastructure/security/request-guards";
import {
  getOptionalSessionUser,
  handleApiError,
  requireSessionUser,
} from "@/interfaces/http/api-helpers";

const createPostSchema = z
  .object({
    savedImageId: z.string().uuid("ID hình ảnh đã lưu không hợp lệ."),
    content: z
      .string()
      .min(1, "Nội dung bài viết không được để trống.")
      .max(2000, "Nội dung bài viết tối đa 2000 ký tự."),
    visibility: z.enum(["PRIVATE", "PUBLIC"]).default("PRIVATE"),
  })
  .strict();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Number.parseInt(searchParams.get("page") ?? "1", 10);
    const limit = Number.parseInt(searchParams.get("limit") ?? "18", 10);

    const viewer = await getOptionalSessionUser();
    const result = await getContainer().useCases.listPublicPosts.execute({
      page: Number.isFinite(page) && page >= 1 ? page : 1,
      limit: Number.isFinite(limit) ? limit : 18,
      viewerUserId: viewer?.id ?? null,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    verifyCsrfOrigin(request);
    const user = await requireSessionUser();
    mutationRateLimiter.consume(`post:${user.id}`);

    const body = await request.json();
    const parsed = createPostSchema.parse(body);

    const post = await getContainer().useCases.createPost.execute({
      authorId: user.id,
      savedImageId: parsed.savedImageId,
      content: parsed.content,
      visibility: parsed.visibility,
    });

    return NextResponse.json({ post }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

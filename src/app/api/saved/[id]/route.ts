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

const idSchema = z.string().uuid("Invalid saved frame ID.");

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    verifyCsrfOrigin(request);
    const user = await requireSessionUser();
    mutationRateLimiter.consume(`unsave:${user.id}`);

    const { id } = await context.params;
    const validId = idSchema.parse(id);

    await getContainer().useCases.unsaveImage.execute({
      userId: user.id,
      savedImageId: validId,
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

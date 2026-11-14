import { NextResponse } from "next/server";
import { z } from "zod";
import { getContainer } from "@/infrastructure/container";
import {
  mutationRateLimiter,
  verifyCsrfOrigin,
} from "@/infrastructure/security/request-guards";
import {
  handleApiError,
  requireAdminUser,
} from "@/interfaces/http/api-helpers";

const userIdSchema = z.string().uuid("Invalid user ID.");

const adminUpdateUserSchema = z
  .object({
    role: z.enum(["USER", "ADMIN"]).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    verifyCsrfOrigin(request);
    const admin = await requireAdminUser();
    mutationRateLimiter.consume(`admin-user:${admin.id}`);

    const { id } = await context.params;
    const targetUserId = userIdSchema.parse(id);

    const body = await request.json();
    const parsed = adminUpdateUserSchema.parse(body);

    await getContainer().useCases.adminManageUser.execute({
      actor: admin,
      targetUserId,
      role: parsed.role,
      isActive: parsed.isActive,
    });

    return NextResponse.json({ ok: true }, { status: 200 });
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
    const admin = await requireAdminUser();
    mutationRateLimiter.consume(`admin-del:${admin.id}`);

    const { id } = await context.params;
    const targetUserId = userIdSchema.parse(id);

    await getContainer().useCases.adminDeleteUser.execute({
      actor: admin,
      targetUserId,
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

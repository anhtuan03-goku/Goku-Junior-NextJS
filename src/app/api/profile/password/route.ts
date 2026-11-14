import { NextResponse } from "next/server";
import { z } from "zod";
import { getContainer } from "@/infrastructure/container";
import {
  authRateLimiter,
  verifyCsrfOrigin,
} from "@/infrastructure/security/request-guards";
import {
  handleApiError,
  requireSessionUser,
  setSessionCookieOnResponse,
} from "@/interfaces/http/api-helpers";

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Please enter your current password.").max(128),
    newPassword: z.string().min(8, "New password must be at least 8 characters.").max(128),
  })
  .strict();

export async function PATCH(request: Request) {
  try {
    verifyCsrfOrigin(request);
    const user = await requireSessionUser();
    authRateLimiter.consume(`pwd:${user.id}`);

    const body = await request.json();
    const parsed = changePasswordSchema.parse(body);

    const result = await getContainer().useCases.changePassword.execute({
      userId: user.id,
      currentPassword: parsed.currentPassword,
      newPassword: parsed.newPassword,
    });

    const response = NextResponse.json({ user: result.user }, { status: 200 });
    return setSessionCookieOnResponse(response, result.token);
  } catch (error) {
    return handleApiError(error);
  }
}

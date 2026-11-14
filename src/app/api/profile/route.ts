import { NextResponse } from "next/server";
import { z } from "zod";
import { toSafeUserDTO } from "@/application/dtos/mappers";
import { ValidationError } from "@/domain/errors/domain-errors";
import { getContainer } from "@/infrastructure/container";
import {
  mutationRateLimiter,
  verifyCsrfOrigin,
} from "@/infrastructure/security/request-guards";
import {
  handleApiError,
  requireSessionUser,
  setSessionCookieOnResponse,
} from "@/interfaces/http/api-helpers";

// Strict schema prevents role/isActive privilege escalation injection!
const updateProfileSchema = z
  .object({
    username: z.string().min(3).max(32).optional(),
    showPhotographerInfo: z.boolean().optional(),
  })
  .strict();

export async function PATCH(request: Request) {
  try {
    verifyCsrfOrigin(request);
    const currentUser = await requireSessionUser();
    mutationRateLimiter.consume(`profile:${currentUser.id}`);

    const body = await request.json();
    const parsed = updateProfileSchema.parse(body);

    if (
      parsed.username === undefined &&
      parsed.showPhotographerInfo === undefined
    ) {
      throw new ValidationError("No profile fields provided to update.");
    }

    const container = getContainer();
    let latestUser = toSafeUserDTO(currentUser);
    let refreshedToken: string | null = null;

    if (parsed.username !== undefined) {
      const res = await container.useCases.updateUsername.execute({
        userId: currentUser.id,
        newUsername: parsed.username,
      });
      latestUser = res.user;
      refreshedToken = res.token;
    }

    if (parsed.showPhotographerInfo !== undefined) {
      latestUser = await container.useCases.updatePhotographerMode.execute({
        userId: currentUser.id,
        showPhotographerInfo: parsed.showPhotographerInfo,
      });
    }

    const response = NextResponse.json({ user: latestUser }, { status: 200 });
    return refreshedToken
      ? setSessionCookieOnResponse(response, refreshedToken)
      : response;
  } catch (error) {
    return handleApiError(error);
  }
}

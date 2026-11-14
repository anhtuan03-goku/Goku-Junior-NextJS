import { NextResponse } from "next/server";
import { z } from "zod";
import { getContainer } from "@/infrastructure/container";
import {
  authRateLimiter,
  getClientIp,
  verifyCsrfOrigin,
} from "@/infrastructure/security/request-guards";
import {
  handleApiError,
  setSessionCookieOnResponse,
} from "@/interfaces/http/api-helpers";

// Zero-PII strict schema: rejects any unexpected fields (email, role, etc.)
const registerSchema = z
  .object({
    username: z.string().min(3, "Username must be at least 3 characters.").max(32),
    password: z.string().min(8, "Password must be at least 8 characters.").max(128),
  })
  .strict();

export async function POST(request: Request) {
  try {
    verifyCsrfOrigin(request);
    authRateLimiter.consume(`register:${getClientIp(request)}`);

    const body = await request.json();
    const parsed = registerSchema.parse(body);

    const { user, token } = await getContainer().useCases.registerUser.execute(
      parsed,
    );

    const res = NextResponse.json({ user }, { status: 201 });
    return setSessionCookieOnResponse(res, token);
  } catch (error) {
    return handleApiError(error);
  }
}

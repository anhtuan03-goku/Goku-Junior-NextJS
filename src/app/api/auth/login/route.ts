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

const loginSchema = z
  .object({
    username: z.string().min(1, "Please enter your username.").max(64),
    password: z.string().min(1, "Please enter your password.").max(128),
  })
  .strict();

export async function POST(request: Request) {
  try {
    verifyCsrfOrigin(request);
    authRateLimiter.consume(`login:${getClientIp(request)}`);

    const body = await request.json();
    const parsed = loginSchema.parse(body);

    const { user, token } = await getContainer().useCases.loginUser.execute(
      parsed,
    );

    const res = NextResponse.json({ user }, { status: 200 });
    return setSessionCookieOnResponse(res, token);
  } catch (error) {
    return handleApiError(error);
  }
}

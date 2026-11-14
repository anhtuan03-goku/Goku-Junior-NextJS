import { NextResponse } from "next/server";
import { z } from "zod";
import { getContainer } from "@/infrastructure/container";
import {
  adminAuthRateLimiter,
  getClientIp,
  verifyCsrfOrigin,
} from "@/infrastructure/security/request-guards";
import {
  handleApiError,
  setSessionCookieOnResponse,
} from "@/interfaces/http/api-helpers";

const adminLoginSchema = z
  .object({
    username: z.string().min(1, "Please enter administrator username.").max(64),
    password: z
      .string()
      .min(1, "Please enter administrator password.")
      .max(128),
  })
  .strict();

export async function POST(request: Request) {
  try {
    verifyCsrfOrigin(request);
    adminAuthRateLimiter.consume(`admin-login:${getClientIp(request)}`);

    const body = await request.json();
    const parsed = adminLoginSchema.parse(body);

    const { user, token } = await getContainer().useCases.loginAdmin.execute(
      parsed,
    );

    const res = NextResponse.json({ user }, { status: 200 });
    return setSessionCookieOnResponse(res, token);
  } catch (error) {
    return handleApiError(error);
  }
}

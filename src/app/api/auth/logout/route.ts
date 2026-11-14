import { NextResponse } from "next/server";
import { verifyCsrfOrigin } from "@/infrastructure/security/request-guards";
import {
  clearSessionCookieOnResponse,
  handleApiError,
} from "@/interfaces/http/api-helpers";

export async function POST(request: Request) {
  try {
    verifyCsrfOrigin(request);
    const res = NextResponse.json({ ok: true }, { status: 200 });
    return clearSessionCookieOnResponse(res);
  } catch (error) {
    return handleApiError(error);
  }
}

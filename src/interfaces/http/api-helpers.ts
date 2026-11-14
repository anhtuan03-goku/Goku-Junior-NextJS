import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { toSafeUserDTO } from "@/application/dtos/mappers";
import type { SafeUserDTO, User } from "@/domain/entities/models";
import {
  DomainError,
  ForbiddenError,
  RateLimitError,
  UnauthorizedError,
} from "@/domain/errors/domain-errors";
import { getContainer } from "@/infrastructure/container";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/infrastructure/security/jwt-session";

export async function getOptionalSessionUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return getContainer().useCases.getAuthenticatedUser.execute(token);
}

export async function getOptionalSafeSessionUser(): Promise<SafeUserDTO | null> {
  const user = await getOptionalSessionUser();
  return user ? toSafeUserDTO(user) : null;
}

export async function requireSessionUser(): Promise<User> {
  const user = await getOptionalSessionUser();
  if (!user) {
    throw new UnauthorizedError("Please sign in to continue.");
  }
  return user;
}

export async function requireAdminUser(): Promise<User> {
  const user = await requireSessionUser();
  if (user.role !== "ADMIN") {
    throw new ForbiddenError("This area is restricted to Administrators.");
  }
  return user;
}

export function setSessionCookieOnResponse(
  response: NextResponse,
  token: string,
): NextResponse {
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

export function clearSessionCookieOnResponse(
  response: NextResponse,
): NextResponse {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof RateLimitError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      {
        status: 429,
        headers: {
          "Retry-After": String(error.retryAfterSeconds),
        },
      },
    );
  }

  if (error instanceof DomainError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode },
    );
  }

  if (error instanceof ZodError) {
    const firstIssue = error.issues[0];
    const msg = firstIssue
      ? `${firstIssue.message}`
      : "Invalid request payload.";
    return NextResponse.json(
      { error: msg, code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }

  // Never leak stack traces, DB connection strings, or secret values
  console.error("[API Unhandled Error]", error instanceof Error ? error.name : "UnknownError");
  return NextResponse.json(
    {
      error: "An unexpected server error occurred. Please try again shortly.",
      code: "INTERNAL_ERROR",
    },
    { status: 500 },
  );
}

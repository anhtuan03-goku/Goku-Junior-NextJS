import "server-only";
import { SignJWT, jwtVerify } from "jose";
import type {
  ISessionTokenService,
  SessionPayload,
} from "@/domain/repositories/ports";
import type { UserRole } from "@/domain/entities/models";
import { getEnv } from "../config/env";

export const SESSION_COOKIE_NAME = "goku_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export class JoseSessionTokenService implements ISessionTokenService {
  private readonly secretKey: Uint8Array;

  constructor(secretOverride?: string) {
    const rawSecret = secretOverride ?? getEnv().AUTH_SECRET;
    this.secretKey = new TextEncoder().encode(rawSecret);
  }

  async sign(payload: SessionPayload): Promise<string> {
    return new SignJWT({
      username: payload.username,
      role: payload.role,
      sv: payload.sv,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(payload.sub)
      .setIssuer("goku-junior-nextjs")
      .setAudience("goku-web")
      .setIssuedAt()
      .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
      .sign(this.secretKey);
  }

  async verify(token: string): Promise<SessionPayload | null> {
    try {
      const { payload } = await jwtVerify(token, this.secretKey, {
        issuer: "goku-junior-nextjs",
        audience: "goku-web",
        algorithms: ["HS256"],
      });

      if (
        typeof payload.sub !== "string" ||
        typeof payload.username !== "string" ||
        (payload.role !== "USER" && payload.role !== "ADMIN") ||
        typeof payload.sv !== "number"
      ) {
        return null;
      }

      return {
        sub: payload.sub,
        username: payload.username,
        role: payload.role as UserRole,
        sv: payload.sv,
      };
    } catch {
      return null;
    }
  }
}

import type { SafeUserDTO, User } from "@/domain/entities/models";
import { ValidationError } from "@/domain/errors/domain-errors";

const USERNAME_REGEX = /^[a-z0-9_.-]{3,32}$/;

export function normalizeAndValidateUsername(raw: string): string {
  const normalized = raw.trim().toLowerCase();
  if (!USERNAME_REGEX.test(normalized)) {
    throw new ValidationError(
      "Username must be 3–32 characters using only lowercase letters (a-z), numbers (0-9), and _ . -",
    );
  }
  return normalized;
}

export function validatePassword(raw: string): string {
  if (typeof raw !== "string" || raw.length < 8 || raw.length > 128) {
    throw new ValidationError("Password must be between 8 and 128 characters.");
  }
  return raw;
}

export function toSafeUserDTO(user: User): SafeUserDTO {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    isActive: user.isActive,
    showPhotographerInfo: user.showPhotographerInfo,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt.toISOString(),
  };
}

import type { SafeUserDTO, User } from "@/domain/entities/models";
import { ValidationError } from "@/domain/errors/domain-errors";

const USERNAME_REGEX = /^[a-z0-9_.-]{3,32}$/;

export function normalizeAndValidateUsername(raw: string): string {
  const normalized = raw.trim().toLowerCase();
  if (!USERNAME_REGEX.test(normalized)) {
    throw new ValidationError(
      "Tên đăng nhập phải từ 3–32 ký tự, chỉ gồm chữ thường (a-z), số (0-9) và các ký tự _ . -",
    );
  }
  return normalized;
}

export function validatePassword(raw: string): string {
  if (typeof raw !== "string" || raw.length < 8 || raw.length > 128) {
    throw new ValidationError("Mật khẩu phải có độ dài từ 8 đến 128 ký tự.");
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

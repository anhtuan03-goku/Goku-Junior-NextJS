import { z } from "zod";
import type { Locale } from "@/lib/i18n";

const USERNAME_ALLOWED_REGEX = /^[a-zA-Z0-9._-]+$/;
const LEADING_OR_TRAILING_SPECIAL_REGEX = /^[._-]|[._-]$/;
const CONSECUTIVE_SPECIAL_REGEX = /[._-]{2,}/;
const HAS_LETTER_REGEX = /[a-zA-Z]/;
const HAS_NUMBER_REGEX = /[0-9]/;
const EMAIL_PATTERN_REGEX =
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_PATTERN_REGEX = /(?:\+?\d[\d\s.-]{8,}\d)/;

const PERSONA_ID_VALUES = [
  "",
  "photographer",
  "designer",
  "collector",
  "student",
  "explorer",
] as const;

function buildUsernameSchema(locale: Locale) {
  const isVi = locale === "vi";
  return z
    .string()
    .superRefine((raw, ctx) => {
      const trimmed = raw.trim();
      if (trimmed.length === 0) {
        ctx.addIssue({
          code: "custom",
          message: isVi
            ? "Vui lòng nhập tên đăng nhập."
            : "Please enter a username.",
        });
        return;
      }
      if (/\s/.test(trimmed)) {
        ctx.addIssue({
          code: "custom",
          message: isVi
            ? "Tên đăng nhập không được chứa khoảng trắng."
            : "Username cannot contain spaces.",
        });
        return;
      }
      if (trimmed.length < 3) {
        ctx.addIssue({
          code: "custom",
          message: isVi
            ? "Tên đăng nhập phải có ít nhất 3 ký tự."
            : "Username must be at least 3 characters.",
        });
        return;
      }
      if (trimmed.length > 32) {
        ctx.addIssue({
          code: "custom",
          message: isVi
            ? "Tên đăng nhập không được vượt quá 32 ký tự."
            : "Username cannot exceed 32 characters.",
        });
        return;
      }
      if (!USERNAME_ALLOWED_REGEX.test(trimmed)) {
        ctx.addIssue({
          code: "custom",
          message: isVi
            ? "Chỉ cho phép chữ cái không dấu (a-z), chữ số (0-9) và ký tự . _ -"
            : "Only letters (a-z), numbers (0-9), and . _ - are allowed.",
        });
        return;
      }
      if (LEADING_OR_TRAILING_SPECIAL_REGEX.test(trimmed)) {
        ctx.addIssue({
          code: "custom",
          message: isVi
            ? "Tên đăng nhập phải bắt đầu và kết thúc bằng chữ cái hoặc chữ số."
            : "Username must start and end with a letter or number.",
        });
        return;
      }
      if (CONSECUTIVE_SPECIAL_REGEX.test(trimmed)) {
        ctx.addIssue({
          code: "custom",
          message: isVi
            ? "Không được đặt 2 ký tự đặc biệt (. _ -) liên tiếp."
            : "Consecutive special characters (. _ -) are not allowed.",
        });
      }
    });
}

function buildStrongPasswordSchema(locale: Locale) {
  const isVi = locale === "vi";
  return z.string().superRefine((val, ctx) => {
    if (val.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: isVi ? "Vui lòng nhập mật khẩu." : "Please enter a password.",
      });
      return;
    }
    if (/\s/.test(val)) {
      ctx.addIssue({
        code: "custom",
        message: isVi
          ? "Mật khẩu không được chứa khoảng trắng."
          : "Password cannot contain spaces.",
      });
      return;
    }
    if (val.length < 8) {
      ctx.addIssue({
        code: "custom",
        message: isVi
          ? "Mật khẩu phải có ít nhất 8 ký tự."
          : "Password must be at least 8 characters.",
      });
      return;
    }
    if (val.length > 128) {
      ctx.addIssue({
        code: "custom",
        message: isVi
          ? "Mật khẩu không được vượt quá 128 ký tự."
          : "Password cannot exceed 128 characters.",
      });
      return;
    }
    if (!HAS_LETTER_REGEX.test(val) || !HAS_NUMBER_REGEX.test(val)) {
      ctx.addIssue({
        code: "custom",
        message: isVi
          ? "Mật khẩu cần bao gồm ít nhất 1 chữ cái và 1 chữ số."
          : "Password must contain at least 1 letter and 1 number.",
      });
    }
  });
}

export function createRegisterFormSchema(locale: Locale = "vi") {
  const isVi = locale === "vi";

  return z
    .object({
      username: buildUsernameSchema(locale),
      password: buildStrongPasswordSchema(locale),
      confirmPassword: z.string().min(
        1,
        isVi
          ? "Vui lòng nhập lại mật khẩu xác nhận."
          : "Please confirm your password.",
      ),
      // Step 2: Optional "Bạn là ai?" fields (non-mandatory, stored locally only)
      persona: z.enum(PERSONA_ID_VALUES),
      favoriteThemes: z
        .array(z.string())
        .max(
          3,
          isVi
            ? "Chỉ được chọn tối đa 3 chủ đề yêu thích."
            : "Please select up to 3 favorite themes.",
        ),
      creativeNote: z
        .string()
        .max(
          120,
          isVi
            ? "Giới thiệu ngắn không được vượt quá 120 ký tự."
            : "Short note cannot exceed 120 characters.",
        )
        .superRefine((note, ctx) => {
          const trimmed = note.trim();
          if (!trimmed) return;
          if (
            EMAIL_PATTERN_REGEX.test(trimmed) ||
            PHONE_PATTERN_REGEX.test(trimmed)
          ) {
            ctx.addIssue({
              code: "custom",
              message: isVi
                ? "Để bảo vệ quyền riêng tư, vui lòng không nhập email hoặc số điện thoại cá nhân."
                : "To protect your privacy, please do not enter an email address or phone number.",
            });
          }
        }),
      showPhotographerInfo: z.boolean(),
    })
    .superRefine((data, ctx) => {
      const normalizedUser = data.username.trim().toLowerCase();
      if (
        normalizedUser.length >= 3 &&
        data.password.length > 0 &&
        data.password.toLowerCase() === normalizedUser
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["password"],
          message: isVi
            ? "Mật khẩu không được trùng với tên đăng nhập."
            : "Password must not be identical to your username.",
        });
      }

      if (
        data.confirmPassword.length > 0 &&
        data.password !== data.confirmPassword
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["confirmPassword"],
          message: isVi
            ? "Mật khẩu xác nhận không khớp với mật khẩu đã nhập."
            : "Confirmation password does not match.",
        });
      }
    });
}

export type RegisterFormValues = z.infer<
  ReturnType<typeof createRegisterFormSchema>
>;

export function createLoginFormSchema(locale: Locale = "vi") {
  const isVi = locale === "vi";
  return z.object({
    username: z
      .string()
      .superRefine((raw, ctx) => {
        const trimmed = raw.trim();
        if (trimmed.length === 0) {
          ctx.addIssue({
            code: "custom",
            message: isVi
              ? "Vui lòng nhập tên đăng nhập."
              : "Please enter your username.",
          });
          return;
        }
        if (/\s/.test(trimmed)) {
          ctx.addIssue({
            code: "custom",
            message: isVi
              ? "Tên đăng nhập không được chứa khoảng trắng."
              : "Username cannot contain spaces.",
          });
          return;
        }
        if (trimmed.length < 3 || trimmed.length > 64) {
          ctx.addIssue({
            code: "custom",
            message: isVi
              ? "Tên đăng nhập phải từ 3 đến 64 ký tự."
              : "Username must be between 3 and 64 characters.",
          });
        }
      }),
    password: z
      .string()
      .min(
        1,
        isVi ? "Vui lòng nhập mật khẩu." : "Please enter your password.",
      )
      .max(
        128,
        isVi
          ? "Mật khẩu không được vượt quá 128 ký tự."
          : "Password cannot exceed 128 characters.",
      ),
  });
}

export type LoginFormValues = z.infer<ReturnType<typeof createLoginFormSchema>>;

export function createUpdateUsernameSchema(locale: Locale = "vi") {
  return z.object({
    username: buildUsernameSchema(locale),
  });
}

export type UpdateUsernameFormValues = z.infer<
  ReturnType<typeof createUpdateUsernameSchema>
>;

export function createChangePasswordSchema(locale: Locale = "vi") {
  const isVi = locale === "vi";
  return z
    .object({
      currentPassword: z
        .string()
        .min(
          1,
          isVi
            ? "Vui lòng nhập mật khẩu hiện tại."
            : "Please enter your current password.",
        )
        .max(128),
      newPassword: buildStrongPasswordSchema(locale),
      confirmNewPassword: z
        .string()
        .min(
          1,
          isVi
            ? "Vui lòng xác nhận mật khẩu mới."
            : "Please confirm your new password.",
        ),
    })
    .superRefine((data, ctx) => {
      if (
        data.currentPassword.length > 0 &&
        data.newPassword === data.currentPassword
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["newPassword"],
          message: isVi
            ? "Mật khẩu mới phải khác với mật khẩu hiện tại."
            : "New password must be different from your current password.",
        });
      }
      if (
        data.confirmNewPassword.length > 0 &&
        data.newPassword !== data.confirmNewPassword
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["confirmNewPassword"],
          message: isVi
            ? "Mật khẩu xác nhận không khớp với mật khẩu mới."
            : "Confirmation password does not match your new password.",
        });
      }
    });
}

export type ChangePasswordFormValues = z.infer<
  ReturnType<typeof createChangePasswordSchema>
>;

export function createStoryPostSchema(locale: Locale = "vi") {
  const isVi = locale === "vi";
  return z.object({
    content: z
      .string()
      .superRefine((val, ctx) => {
        const trimmed = val.trim();
        if (trimmed.length === 0) {
          ctx.addIssue({
            code: "custom",
            message: isVi
              ? "Vui lòng viết cảm nhận hoặc câu chuyện trước khi lưu."
              : "Please write a note or story before saving.",
          });
          return;
        }
        if (val.length > 2000) {
          ctx.addIssue({
            code: "custom",
            message: isVi
              ? "Nội dung câu chuyện tối đa 2000 ký tự."
              : "Story content cannot exceed 2000 characters.",
          });
        }
      }),
    visibility: z.enum(["PRIVATE", "PUBLIC"]),
  });
}

export type StoryPostFormValues = z.infer<
  ReturnType<typeof createStoryPostSchema>
>;

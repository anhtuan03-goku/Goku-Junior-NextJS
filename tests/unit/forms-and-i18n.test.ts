import { describe, expect, it } from "vitest";
import {
  UI_STRINGS,
  autoTranslateMessage,
  detectLocaleFromAcceptLanguage,
  normalizeLocale,
} from "@/lib/i18n";
import {
  createChangePasswordSchema,
  createLoginFormSchema,
  createRegisterFormSchema,
  createStoryPostSchema,
} from "@/lib/validations/forms";

describe("DEV-FE-011 Form Validation Schemas & Bilingual (EN/VI) Engine", () => {
  it("validates multi-step registration edge cases with clear Vietnamese inline messages", () => {
    const schemaVi = createRegisterFormSchema("vi");

    // 1. Whitespace-only or spaces in username
    const spaceRes = schemaVi.safeParse({
      username: "naut user",
      password: "Password123",
      confirmPassword: "Password123",
      persona: "",
      favoriteThemes: [],
      creativeNote: "",
      showPhotographerInfo: true,
    });
    expect(spaceRes.success).toBe(false);
    if (!spaceRes.success) {
      expect(spaceRes.error.issues[0]?.message).toContain("khoảng trắng");
    }

    // 2. Consecutive or leading special chars in username
    const specialRes = schemaVi.safeParse({
      username: "_naut..user",
      password: "Password123",
      confirmPassword: "Password123",
      persona: "",
      favoriteThemes: [],
      creativeNote: "",
      showPhotographerInfo: true,
    });
    expect(specialRes.success).toBe(false);

    // 3. Password missing numbers or identical to username
    const samePassRes = schemaVi.safeParse({
      username: "nautuser1",
      password: "nautuser1",
      confirmPassword: "nautuser1",
      persona: "",
      favoriteThemes: [],
      creativeNote: "",
      showPhotographerInfo: true,
    });
    expect(samePassRes.success).toBe(false);
    if (!samePassRes.success) {
      expect(
        samePassRes.error.issues.some((iss) =>
          iss.message.includes("trùng với tên đăng nhập"),
        ),
      ).toBe(true);
    }

    // 4. Confirm password mismatch
    const mismatchRes = schemaVi.safeParse({
      username: "naut_frame",
      password: "Password123",
      confirmPassword: "Password999",
      persona: "",
      favoriteThemes: [],
      creativeNote: "",
      showPhotographerInfo: true,
    });
    expect(mismatchRes.success).toBe(false);
    if (!mismatchRes.success) {
      expect(
        mismatchRes.error.issues.some(
          (iss) =>
            iss.path[0] === "confirmPassword" &&
            iss.message.includes("không khớp"),
        ),
      ).toBe(true);
    }
  });

  it("treats Step 2 'Bạn là ai?' as completely optional while guarding privacy & bounds", () => {
    const schemaVi = createRegisterFormSchema("vi");

    // Skipping Step 2 completely is valid
    const skipped = schemaVi.safeParse({
      username: "naut_minimal",
      password: "SafePassword9",
      confirmPassword: "SafePassword9",
      persona: "",
      favoriteThemes: [],
      creativeNote: "",
      showPhotographerInfo: true,
    });
    expect(skipped.success).toBe(true);

    // Filling Step 2 with valid non-PII creative role & themes is valid
    const withPersona = schemaVi.safeParse({
      username: "naut_artist",
      password: "SafePassword9",
      confirmPassword: "SafePassword9",
      persona: "photographer",
      favoriteThemes: ["minimalism", "cosmos"],
      creativeNote: "Yêu thích nhiếp ảnh tối giản và bầu trời sao",
      showPhotographerInfo: false,
    });
    expect(withPersona.success).toBe(true);

    // Rejects > 3 themes
    const tooManyThemes = schemaVi.safeParse({
      username: "naut_artist",
      password: "SafePassword9",
      confirmPassword: "SafePassword9",
      persona: "designer",
      favoriteThemes: ["minimalism", "cosmos", "nature", "street"],
      creativeNote: "",
      showPhotographerInfo: true,
    });
    expect(tooManyThemes.success).toBe(false);

    // Rejects accidental email or phone number in creativeNote to preserve Zero-PII
    const accidentalEmail = schemaVi.safeParse({
      username: "naut_artist",
      password: "SafePassword9",
      confirmPassword: "SafePassword9",
      persona: "student",
      favoriteThemes: [],
      creativeNote: "Liên hệ mình qua test@gmail.com nhé",
      showPhotographerInfo: true,
    });
    expect(accidentalEmail.success).toBe(false);
    if (!accidentalEmail.success) {
      expect(accidentalEmail.error.issues[0]?.message).toContain(
        "quyền riêng tư",
      );
    }
  });

  it("validates login, change-password, and story composer schemas cleanly", () => {
    const loginVi = createLoginFormSchema("vi");
    expect(loginVi.safeParse({ username: "  ", password: "" }).success).toBe(
      false,
    );
    expect(
      loginVi.safeParse({ username: "naut_user", password: "secret" }).success,
    ).toBe(true);

    const passVi = createChangePasswordSchema("vi");
    // Blocks reusing current password as new password
    const reused = passVi.safeParse({
      currentPassword: "OldPassword1",
      newPassword: "OldPassword1",
      confirmNewPassword: "OldPassword1",
    });
    expect(reused.success).toBe(false);

    const storyVi = createStoryPostSchema("vi");
    expect(
      storyVi.safeParse({ content: "   ", visibility: "PRIVATE" }).success,
    ).toBe(false);
    expect(
      storyVi.safeParse({
        content: "Khoảnh khắc tĩnh lặng lúc hoàng hôn.",
        visibility: "PUBLIC",
      }).success,
    ).toBe(true);
  });

  it("detects locale from Accept-Language and auto-translates API messages to Vietnamese", () => {
    expect(normalizeLocale("vi-VN")).toBe("vi");
    expect(normalizeLocale("en-US")).toBe("en");
    expect(normalizeLocale("fr-FR")).toBeNull();

    expect(
      detectLocaleFromAcceptLanguage("vi-VN,vi;q=0.9,en-US;q=0.8"),
    ).toBe("vi");
    expect(detectLocaleFromAcceptLanguage("en-US,en;q=0.9,vi;q=0.6")).toBe(
      "en",
    );

    expect(autoTranslateMessage("Username is already taken.", "vi")).toContain(
      "Tên đăng nhập",
    );
    expect(autoTranslateMessage("Invalid username or password.", "en")).toBe(
      "Invalid username or password.",
    );

    expect(Object.keys(UI_STRINGS.vi)).toEqual(Object.keys(UI_STRINGS.en));
  });
});

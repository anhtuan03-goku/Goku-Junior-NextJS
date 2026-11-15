import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { SITE_CONFIG } from "@/lib/site-config";

const ROOT = path.resolve(import.meta.dirname, "../..");

describe("naut.frame Brand, Bilingual (EN/VI), SEO & UI Invariants", () => {
  it("uses naut.frame brand identity and ships complete bilingual EN/VI support", () => {
    expect(SITE_CONFIG.name).toBe("naut.frame");
    expect(SITE_CONFIG.title).toContain("naut.frame");

    const i18nFile = fs.readFileSync(
      path.join(ROOT, "src/lib/i18n.ts"),
      "utf8",
    );
    expect(i18nFile).toContain('export type Locale = "vi" | "en"');
    expect(i18nFile).toContain("autoTranslateMessage");
  });

  it("isolates Zero-PII policy to /privacy and removes it from Sign In / Sign Up UI", () => {
    const privacyPage = path.join(ROOT, "src/app/privacy/page.tsx");
    expect(fs.existsSync(privacyPage)).toBe(true);
    expect(fs.readFileSync(privacyPage, "utf8")).toContain(
      "Zero-PII Privacy Policy",
    );

    const authForm = fs.readFileSync(
      path.join(ROOT, "src/components/auth/auth-form.tsx"),
      "utf8",
    );
    expect(authForm).not.toContain("Zero-PII");
    expect(authForm).toContain("confirmPassword");
    expect(authForm).toContain("PolarBearMascot");
    expect(authForm).toContain("isCoveringEyes");
  });

  it("ships generated frame favicons and generated tab/auth icons in public/", () => {
    const requiredAssets = [
      "public/favicon.ico",
      "public/icon.png",
      "public/apple-icon.png",
      "public/icons/frame-mark.png",
      "public/icons/explore.png",
      "public/icons/community.png",
      "public/icons/login.png",
      "public/icons/register.png",
    ];

    for (const rel of requiredAssets) {
      const full = path.join(ROOT, rel);
      expect(fs.existsSync(full), `Missing asset: ${rel}`).toBe(true);
      expect(fs.statSync(full).size).toBeGreaterThan(100);
    }
  });

  it("exposes SEO robots.txt and sitemap.xml with public/private route rules", () => {
    const robotsConfig = robots();
    expect(robotsConfig.sitemap).toContain("/sitemap.xml");

    const entries = sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls.some((u) => u.endsWith("/"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/community"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/privacy"))).toBe(true);
  });

  it("keeps Explore tab distraction-free (no search bar, no provider switcher, no visible hero text) and uses toggle switch for Author", () => {
    const exploreFeed = fs.readFileSync(
      path.join(ROOT, "src/components/images/infinite-explore-feed.tsx"),
      "utf8",
    );
    expect(exploreFeed).not.toContain("searchInput");
    expect(exploreFeed).not.toContain("Picsum Random");

    const homePage = fs.readFileSync(
      path.join(ROOT, "src/app/page.tsx"),
      "utf8",
    );
    expect(homePage).toContain('className="sr-only"');

    const header = fs.readFileSync(
      path.join(ROOT, "src/components/layout/minimal-header.tsx"),
      "utf8",
    );
    expect(header).toContain('role="switch"');
    expect(header).toContain("naut");
    expect(header).not.toContain("goku");
  });

  it("constrains lightbox Dialog grid track and image max-w-full / h-auto to prevent horizontal overflow on wide ratios", () => {
    const dialog = fs.readFileSync(
      path.join(ROOT, "src/components/ui/dialog.tsx"),
      "utf8",
    );
    expect(dialog).toContain("grid-cols-[minmax(0,1fr)]");
    expect(dialog).toContain("overflow-x-hidden");

    const imageCard = fs.readFileSync(
      path.join(ROOT, "src/components/images/image-card.tsx"),
      "utf8",
    );
    expect(imageCard).toContain("max-w-full");
    expect(imageCard).toContain("h-auto");
    expect(imageCard).toContain("w-auto");
    expect(imageCard).toContain("object-contain");
  });
});

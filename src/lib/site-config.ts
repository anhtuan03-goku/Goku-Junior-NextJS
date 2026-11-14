export const SITE_CONFIG = {
  name: "naut.frame",
  shortName: "naut",
  title: "naut.frame — Minimalist Visual Journal & Curated Photography",
  description:
    "Explore curated minimalist photography in a distraction-free infinite stream, save inspiring frames, and write private or public visual stories with strict Zero-PII privacy.",
  keywords: [
    "naut.frame",
    "minimalist photography",
    "visual journal",
    "curated gallery",
    "zero-pii privacy",
    "anonymous appreciation",
    "photo collection",
    "unsplash minimalist",
  ],
} as const;

export function getSiteUrl(): URL {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000");

  try {
    return new URL(raw);
  } catch {
    return new URL("http://localhost:3000");
  }
}

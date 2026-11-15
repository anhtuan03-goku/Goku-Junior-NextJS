import "server-only";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(10, "DATABASE_URL is required"),
  DATABASE_URL_POOLED: z.string().min(10, "DATABASE_URL_POOLED is required"),
  AUTH_SECRET: z
    .string()
    .min(32, "AUTH_SECRET must be at least 32 characters long"),
  INITIAL_ADMIN_USERNAME: z.string().min(3).default("admin"),
  INITIAL_ADMIN_PASSWORD: z.string().min(8),
  UNSPLASH_ACCESS_KEY: z.string().min(10, "UNSPLASH_ACCESS_KEY is required"),
  UNSPLASH_APP_NAME: z.string().default("naut_frame"),
  CLOUDINARY_URL: z
    .string()
    .startsWith("cloudinary://", "CLOUDINARY_URL must start with cloudinary://"),
  PIXABAY_API_KEY: z
    .preprocess(
      (val) => (typeof val === "string" && val.trim() === "" ? undefined : val),
      z.string().trim().min(10, "PIXABAY_API_KEY must be at least 10 characters").optional(),
    ),
  NASA_API_KEY: z
    .preprocess(
      (val) => (typeof val === "string" && val.trim() === "" ? undefined : val),
      z.string().trim().min(8, "NASA_API_KEY must be at least 8 characters").optional(),
    ),
  ENABLE_SECONDARY_PROVIDER: z
    .enum(["true", "false"])
    .optional()
    .default("true"),
  ENABLE_TERTIARY_PROVIDER: z
    .enum(["true", "false"])
    .optional()
    .default("true"),
});

export interface CloudinaryCredentials {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

/**
 * Upgrades legacy sslmode=require/prefer/verify-ca to explicit sslmode=verify-full
 * so pg-connection-string enforces full TLS verification without emitting Node warnings
 * that trigger the Next.js 16 Dev Console Error overlay.
 */
export function normalizePgConnectionString(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const sslMode = parsed.searchParams.get("sslmode");
    if (
      (sslMode === "require" ||
        sslMode === "prefer" ||
        sslMode === "verify-ca") &&
      !parsed.searchParams.has("uselibpqcompat")
    ) {
      parsed.searchParams.set("sslmode", "verify-full");
      return parsed.toString();
    }
    return rawUrl;
  } catch {
    return rawUrl;
  }
}

let cachedEnv: z.infer<typeof envSchema> | null = null;
let cachedCloudinary: CloudinaryCredentials | null = null;

export function getEnv() {
  if (cachedEnv) return cachedEnv;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  cachedEnv = parsed.data;
  return cachedEnv;
}

export function getCloudinaryCredentials(): CloudinaryCredentials {
  if (cachedCloudinary) return cachedCloudinary;
  const raw = getEnv().CLOUDINARY_URL;
  // Format: cloudinary://<api_key>:<api_secret>@<cloud_name>
  const parsed = new URL(raw);
  const cloudName = parsed.hostname;
  const apiKey = decodeURIComponent(parsed.username);
  const apiSecret = decodeURIComponent(parsed.password);

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Malformed CLOUDINARY_URL credentials");
  }

  cachedCloudinary = { cloudName, apiKey, apiSecret };
  return cachedCloudinary;
}

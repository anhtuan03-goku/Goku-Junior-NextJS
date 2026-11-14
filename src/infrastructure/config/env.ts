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
  UNSPLASH_APP_NAME: z.string().default("goku_junior_nextjs"),
  CLOUDINARY_URL: z
    .string()
    .startsWith("cloudinary://", "CLOUDINARY_URL must start with cloudinary://"),
  ENABLE_SECONDARY_PROVIDER: z
    .enum(["true", "false"])
    .optional()
    .default("true"),
});

export interface CloudinaryCredentials {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
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

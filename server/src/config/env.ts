import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().default("mongodb://localhost:27017/crewforge?replicaSet=rs0"),
  JWT_SECRET: z.string().default("dev_jwt_secret_at_least_32_characters_long_for_test!"),
  JWT_REFRESH_SECRET: z.string().default("dev_refresh_secret_at_least_32_characters_for_test!"),
  JWT_ACCESS_EXPIRY: z.string().default("15m"),
  JWT_REFRESH_EXPIRY: z.string().default("7d"),
  COOKIE_SECRET: z.string().default("dev_cookie_secret_16chars"),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:5173"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

function loadEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("❌ Invalid environment configuration:");
    for (const [field, errors] of Object.entries(result.error.flatten().fieldErrors)) {
      console.error(`  ${field}: ${(errors as string[]).join(", ")}`);
    }
    process.exit(1);
  }

  const data = result.data;
  if (data.NODE_ENV === "production") {
    if (data.JWT_SECRET.startsWith("dev_") || data.COOKIE_SECRET.startsWith("dev_")) {
      throw new Error("Production deployment requires dedicated non-default JWT_SECRET and COOKIE_SECRET");
    }
  }

  return data;
}

export const env = loadEnv();
export type Env = typeof env;

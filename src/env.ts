import { z } from "zod";

/**
 * The only place in Keyren that reads `process.env`.
 *
 * Parsing happens once at module load so a misconfigured deployment fails
 * immediately and loudly rather than at the first verification request.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // 32 bytes hex = 64 chars. Anything shorter is rejected outright rather
  // than quietly weakening every license hash in the database.
  KEYREN_LICENSE_HMAC_SECRET: z
    .string()
    .min(32, "KEYREN_LICENSE_HMAC_SECRET must be at least 32 characters"),

  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),

  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),

  RATE_LIMIT_VERIFY_PER_MINUTE: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_VERIFY_PER_PRODUCT_PER_MINUTE: z.coerce
    .number()
    .int()
    .positive()
    .default(600),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    // Report which variables are wrong, never their values — this message
    // reaches logs and, during `next build`, the terminal.
    const names = result.error.issues
      .map((issue) => issue.path.join("."))
      .filter((name, index, all) => all.indexOf(name) === index)
      .join(", ");
    throw new Error(`Invalid environment configuration. Check: ${names}`);
  }

  return result.data;
}

export const env: Env = parseEnv(process.env);

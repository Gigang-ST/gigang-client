import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    REVALIDATE_SECRET: z.string().min(1),
    KAKAO_CHAT_PASSWORD: z.string().optional(),
    NODE_ENV: z.enum(["development", "production", "test"]),
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
    NEXT_PUBLIC_DEBUG_DATE: z.string().optional(),
    NEXT_PUBLIC_ENABLE_DEV_MODE: z
      .string()
      .transform((v) => v === "true")
      .optional(),
  },
  runtimeEnv: {
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    REVALIDATE_SECRET: process.env.REVALIDATE_SECRET,
    KAKAO_CHAT_PASSWORD: process.env.KAKAO_CHAT_PASSWORD,
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_DEBUG_DATE: process.env.NEXT_PUBLIC_DEBUG_DATE,
    NEXT_PUBLIC_ENABLE_DEV_MODE: process.env.NEXT_PUBLIC_ENABLE_DEV_MODE,
  },
  /** CI 환경(GitHub Actions 등)이거나 SKIP_ENV_VALIDATION=true면 검증 스킵 */
  skipValidation:
    !!process.env.SKIP_ENV_VALIDATION || !!process.env.CI,
  emptyStringAsUndefined: true,
});

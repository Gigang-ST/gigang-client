import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    REVALIDATE_SECRET: z.string().min(1),
    KAKAO_CHAT_PASSWORD: z.string().optional(),
    // 뉴비 온보딩 미참석 넛지 크론(app/api/cron/newbie-nudge) 인증용.
    // optional: 미설정 시 크론 라우트가 503으로 스스로 막는다(발송 사고 방지, 앱 기동은 막지 않음).
    CRON_SECRET: z.string().min(1).optional(),
    GEMINI_API_KEY: z.string().min(1).optional(),
    NODE_ENV: z.enum(["development", "production", "test"]),
    // 웹 푸시(VAPID) — 서버에서 발송 시 사용. NEXT_PUBLIC_ 금지(비밀키)
    // optional: 환경변수 미설정(빌드/일부 환경)에서도 앱이 떠야 하므로. 미설정이면 발송만 스킵.
    VAPID_PRIVATE_KEY: z.string().min(1).optional(),
    // web-push 요구: mailto: 또는 https:// 형식만 (애플은 그 외 형식에 403)
    VAPID_SUBJECT: z
      .string()
      .regex(/^(mailto:|https:\/\/)/, "mailto: 또는 https:// 로 시작해야 합니다")
      .optional(),
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
    NEXT_PUBLIC_ENABLE_DEV_MODE: z
      .string()
      .transform((v) => v === "true")
      .optional(),
    // 웹 푸시(VAPID) 공개키 — 클라이언트에서 구독 발급 시 사용
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  },
  runtimeEnv: {
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    REVALIDATE_SECRET: process.env.REVALIDATE_SECRET,
    KAKAO_CHAT_PASSWORD: process.env.KAKAO_CHAT_PASSWORD,
    CRON_SECRET: process.env.CRON_SECRET,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    NODE_ENV: process.env.NODE_ENV,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_ENABLE_DEV_MODE: process.env.NEXT_PUBLIC_ENABLE_DEV_MODE,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  },
  /** CI 환경(GitHub Actions 등)이거나 SKIP_ENV_VALIDATION=true면 검증 스킵 */
  skipValidation:
    !!process.env.SKIP_ENV_VALIDATION || !!process.env.CI,
  emptyStringAsUndefined: true,
});

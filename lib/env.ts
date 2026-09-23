import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    REVALIDATE_SECRET: z.string().min(1),
    KAKAO_CHAT_PASSWORD: z.string().optional(),
    // 카톡 브리지(n8n) 웹훅 — 모임 등록·수정·취소를 단톡방에 알린다(lib/kakao/notify.ts).
    // 셋 다 optional: 미설정이면 발송만 꺼진다. 로컬·preview가 실제 톡방에 쏘지 않게 하는
    // 안전장치가 이 "미설정 = 비활성"이라, 값을 넣은 환경에서만 발송된다.
    KAKAO_WEBHOOK_URL: z.url().optional(),
    KAKAO_WEBHOOK_SECRET: z.string().min(1).optional(),
    KAKAO_ROOM: z.string().min(1).optional(),
    // 뉴비 온보딩 미참석 넛지 크론(app/api/cron/newbie-nudge) 인증용.
    // optional: 미설정 시 크론 라우트가 503으로 스스로 막는다(발송 사고 방지, 앱 기동은 막지 않음).
    CRON_SECRET: z.string().min(1).optional(),
    GEMINI_API_KEY: z.string().min(1).optional(),
    NODE_ENV: z.enum(["development", "production", "test"]),
    // ── 점검 모드 ──────────────────────────────────────────────
    // 정작 켜고 끄는 스위치는 여기 없다. Vercel Global Config 에 있다
    // (lib/maintenance-config.ts) — 환경변수는 바꿀 때마다 재배포가 필요해서
    // "장애 났을 때 즉시 켠다"는 목적에 못 쓴다. 아래 셋은 보조 수단이다.
    //
    // 점검 중 운영자만 원래 앱을 보는 우회 열쇠(?bypass=<값> → 쿠키).
    // **미설정이면 우회가 통째로 닫힌다** — 빈 값끼리 맞아떨어져 문이 열리지 않게.
    MAINTENANCE_BYPASS_SECRET: z.string().min(1).optional(),
    // Global Config 없이 로컬·프리뷰에서 점검 화면만 확인할 때 쓰는 우회로.
    // "1" 또는 "true" 일 때만 켜지고, 그 외 값이면 Global Config 판정으로 넘어간다.
    MAINTENANCE_MODE: z.string().optional(),
    // 위와 짝. 종료 예정 시각을 **한국시간 그대로** 'YYYY-MM-DD HH:mm' 으로 적는다.
    MAINTENANCE_UNTIL: z.string().optional(),
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
    KAKAO_WEBHOOK_URL: process.env.KAKAO_WEBHOOK_URL,
    KAKAO_WEBHOOK_SECRET: process.env.KAKAO_WEBHOOK_SECRET,
    KAKAO_ROOM: process.env.KAKAO_ROOM,
    CRON_SECRET: process.env.CRON_SECRET,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    NODE_ENV: process.env.NODE_ENV,
    MAINTENANCE_BYPASS_SECRET: process.env.MAINTENANCE_BYPASS_SECRET,
    MAINTENANCE_MODE: process.env.MAINTENANCE_MODE,
    MAINTENANCE_UNTIL: process.env.MAINTENANCE_UNTIL,
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

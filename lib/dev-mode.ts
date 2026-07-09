import { env } from "@/lib/env";

/**
 * 개발 전용 기능(이메일 로그인, 온보딩 완료 화면 미리보기 등)을 켤지 여부.
 * - 로컬: `pnpm dev` (NODE_ENV=development)면 자동 true
 * - Vercel 개발계: `NEXT_PUBLIC_ENABLE_DEV_MODE=true`
 * 운영 프로젝트에는 변수를 두지 않으면 false.
 *
 * 서버·클라이언트 공용(이 모듈은 "use client" 없음) — 양쪽이 같은 판정을 쓰도록 한 곳에 둔다.
 * 환경변수는 lib/env.ts를 통해서만 접근한다(process.env 직접 접근 금지 — 프로젝트 규칙).
 */
export function isDevModeEnabled(): boolean {
  if (env.NODE_ENV === "development") return true;
  return env.NEXT_PUBLIC_ENABLE_DEV_MODE === true;
}

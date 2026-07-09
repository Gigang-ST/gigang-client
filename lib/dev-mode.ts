import { env } from "@/lib/env";

/**
 * 개발 전용 기능(이메일 로그인, 온보딩 완료 화면 미리보기 등)을 켤지 여부.
 * - 로컬: `pnpm dev` (NODE_ENV=development)면 자동 true
 * - Vercel 개발계: `NEXT_PUBLIC_ENABLE_DEV_MODE=true`
 * 운영 프로젝트에는 변수를 두지 않으면 false.
 *
 * 서버·클라이언트 공용(이 모듈은 "use client" 없음) — 양쪽이 같은 판정을 쓰도록 한 곳에 둔다.
 *
 * NODE_ENV는 `process.env.NODE_ENV`로 직접 읽는다(예외). t3-env의 `env.NODE_ENV`는
 * server 스코프라 클라이언트 컴포넌트(login-form·member-onboarding-form)에서 접근하면
 * "서버 변수를 클라에서 접근" 에러로 런타임이 터진다. 반면 Next.js는 `process.env.NODE_ENV`를
 * 빌드 시 클라 번들에 인라인해줘 클라에서도 안전하다(프로젝트의 process.env 금지 규칙은
 * 커스텀 변수 대상이고, NODE_ENV는 Next 표준이라 예외). NEXT_PUBLIC_*은 client 스코프라 env로 OK.
 */
export function isDevModeEnabled(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  return env.NEXT_PUBLIC_ENABLE_DEV_MODE === true;
}

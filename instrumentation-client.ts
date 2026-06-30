import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // 광고 차단기 우회 — 같은 도메인 API로 프록시
  tunnel: "/api/sentry-tunnel",

  // 개발 환경 100%, 운영 환경 10%
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  integrations: [Sentry.replayIntegration()],

  // 일반 세션 10%, 에러 발생 세션 100% 리플레이 캡처
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

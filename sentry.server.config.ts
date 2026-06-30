import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // 개발 환경 100%, 운영 환경 10%
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});

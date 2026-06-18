"use client";

import { useEffect } from "react";

/**
 * Service Worker 등록 컴포넌트.
 * 프로덕션 환경에서만 동작하며, 브라우저가 SW를 지원하는 경우에만 등록.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      process.env.NODE_ENV === "production" &&
      "serviceWorker" in navigator
    ) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => {
          console.log("[SW] 등록 완료:", registration.scope);
        })
        .catch((error) => {
          console.error("[SW] 등록 실패:", error);
        });
    }
  }, []);

  return null;
}

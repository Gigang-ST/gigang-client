"use client";

import { useEffect } from "react";

/**
 * 푸시 수신 전용 서비스워커(/sw.js)를 앱 로드 시 등록한다.
 *
 * 구독 자체는 lib/push/client.ts가 사용자 제스처에서 처리하지만,
 * 이미 구독한 사용자의 push 이벤트 수신이 끊기지 않도록 SW는 진입 시 항상 등록해 둔다.
 * (캐싱/오프라인 용도 아님 — push/notificationclick만 처리하는 얇은 SW)
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // 등록 실패는 치명적이지 않음 (푸시 미지원 환경 등) — 조용히 무시
    });
  }, []);

  return null;
}

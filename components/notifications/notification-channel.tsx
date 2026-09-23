"use client";

import { useEffect } from "react";

import { refreshNotifications, startNotificationSession } from "@/lib/notifications/refresh";

/**
 * 루트에서 최초 진입·앱 복귀·푸시 수신에만 백그라운드 조회한다.
 * 페이지 렌더를 기다리게 하지 않고, Realtime 구독이나 주기 조회도 하지 않는다.
 */
export function NotificationChannel({ memberId }: { memberId: string }) {
  useEffect(() => {
    const stop = startNotificationSession(memberId);
    const resume = () => { void refreshNotifications(memberId, "resume"); };
    const receivePush = (event: MessageEvent) => {
      if (event.data?.type === "NOTIFICATIONS_CHANGED") {
        void refreshNotifications(memberId, "push");
      }
    };

    void refreshNotifications(memberId, "initial");
    // 둘 다 건다 — 덮는 사건이 다르다. 데스크톱에서 다른 앱에 갔다 오면 탭은 계속 `visible`이라
    // `visibilitychange`가 안 뜨고(`focus`만), 탭 전환·모바일 앱 복귀는 반대다. 겹쳐서 두 번
    // 터지는 건 `RESUME_THROTTLE_MS`가 합친다(§lib/notifications/refresh).
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    navigator.serviceWorker?.addEventListener("message", receivePush);
    return () => {
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
      navigator.serviceWorker?.removeEventListener("message", receivePush);
      stop();
    };
  }, [memberId]);

  return null;
}

"use client";

import { useEffect } from "react";

import {
  getRealtimeEpoch,
  isLoaded,
  prependNotification,
  resetNotifications,
  setNotifications,
  syncUnreadCount,
  updateNotification,
} from "@/lib/notifications/store";
import type { Notification } from "@/lib/queries/notification";
import { createClient } from "@/lib/supabase/client";

/**
 * 알림의 **채널 소유자** — 아무것도 그리지 않는다.
 *
 * 루트 레이아웃(`app/layout.tsx`)에 한 번 붙어 앱을 닫을 때까지 산다.
 * 하는 일은 둘이고, 결과는 전부 `lib/notifications/store.ts`로 들어간다:
 *
 * 1. **목록 1회 백그라운드 로드** — 마운트 뒤 조용히 받아 둔다. 서버 렌더를 안 막으므로
 *    페이지 HTML이 먼저 나가고, 사용자가 벨을 누를 때쯤이면 이미 도착해 있다.
 * 2. **Realtime 구독** — 새 알림·읽음 전환을 받아 store를 갱신한다.
 *
 * **왜 벨이 아니라 여기인가**(§lib/notifications/store.ts): 벨은 각 탭 헤더 안에 있어
 * 탭을 옮길 때마다 죽고 다시 태어난다. 채널을 벨이 들고 있으면 이동마다 구독이 끊겼다
 * 붙고 목록도 다시 받는다. 루트는 클라이언트 네비게이션에 안 죽으므로 둘 다 1회로 끝난다.
 * `PresenceLayerGate`가 같은 이유로 같은 자리에 있다.
 *
 * **뱃지 숫자도 여기서 받는다** — `/api/notifications` 첫 장 응답이 목록과 함께 준다.
 * 예전엔 `HeaderActions`(서버 컴포넌트)가 읽었는데, 그러면 여섯 지면의 모든 렌더가 알림
 * 조회를 기다린다. **알림은 페이지 렌더와 무관해야 한다** — 그 원칙이 이 컴포넌트가 있는
 * 이유 전부다. 대가는 세션당 한 번 뱃지가 잠깐 늦게 뜨는 것뿐이고, 탭 이동에는 store에
 * 이미 있어 안 깜빡인다.
 */
export function NotificationChannel({ memberId }: { memberId: string }) {
  // ── 목록 1회 백그라운드 로드 ──
  useEffect(() => {
    // 이미 받아 뒀으면 건너뛴다 — 정체가 그대로인 한 다시 받을 이유가 없다.
    if (isLoaded()) return;

    let cancelled = false;
    // fetch가 도는 동안 도착한 Realtime 알림이 서버 카운트에 덮이지 않게 눈금을 적어 둔다.
    const epoch = getRealtimeEpoch();
    void (async () => {
      try {
        const res = await fetch("/api/notifications?limit=20");
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        setNotifications((json.notifications ?? []) as Notification[]);
        // 첫 장 응답엔 안읽음 수가 함께 온다 — 뱃지가 여기서 켜진다(§app/api/notifications).
        if (typeof json.unreadCount === "number") syncUnreadCount(json.unreadCount, epoch);
      } catch {
        // 알림은 없어도 화면이 도는 부가 기능이다 — 실패하면 벨을 열 때 다시 시도한다
        // (`loaded`가 false로 남으므로). 여기서 토스트를 띄우진 않는다.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [memberId]);

  // ── Realtime 구독 ──
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`noti_mst_${memberId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "noti_mst",
          filter: `mem_id=eq.${memberId}`,
        },
        (payload) => prependNotification(payload.new as Notification),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "noti_mst",
          filter: `mem_id=eq.${memberId}`,
        },
        (payload) => updateNotification(payload.new as Notification),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [memberId]);

  // ── 정체가 바뀌면 남의 알림을 버린다 ──
  useEffect(() => {
    return () => {
      // memberId가 바뀌거나 언마운트될 때 비운다. 안 비우면 계정 전환 직후
      // 이전 사용자의 알림이 잠깐 보인다.
      resetNotifications();
    };
  }, [memberId]);

  return null;
}

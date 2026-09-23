"use client";

import {
  getNotificationRevision,
  PAGE_SIZE,
  resetNotifications,
  setNotifications,
  syncUnreadCount,
} from "@/lib/notifications/store";
import type { Notification } from "@/lib/queries/notification";

type Session = {
  memberId: string;
  controller: AbortController;
  request: Promise<boolean> | null;
  queued: boolean;
  mutations: number;
  lastResume: number;
};

let session: Session | null = null;

/**
 * 복귀 조회 최소 간격.
 *
 * 한 번의 복귀에서 `focus`와 `visibilitychange`가 함께 터지는 걸 합치는 게 1차 목적이지만,
 * **둘은 덮는 사건이 달라 어느 하나도 뺄 수 없다** — 데스크톱에서 다른 앱으로 갔다 오면
 * 탭은 계속 `visible`이라 `visibilitychange`가 안 뜨고(`focus`만 뜬다), 모바일 앱 복귀·탭
 * 전환은 반대다. 그래서 리스너는 둘 다 두고 **간격으로 줄인다.** 1초였을 땐 알트탭·DevTools
 * 왕복마다 service-role 쿼리 2개짜리 조회가 나갔다 — 거의 안 변하는 뱃지에 치르기엔 비싸다.
 */
const RESUME_THROTTLE_MS = 30_000;

/** 루트에서 세션 수명을 관리해 로그아웃·계정 전환 전의 응답을 버린다. */
export function startNotificationSession(memberId: string): () => void {
  session?.controller.abort();
  resetNotifications();
  const current: Session = {
    memberId,
    controller: new AbortController(),
    request: null,
    queued: false,
    mutations: 0,
    lastResume: -Infinity,
  };
  session = current;
  return () => {
    current.controller.abort();
    if (session === current) {
      session = null;
      resetNotifications();
    }
  };
}

export function getNotificationSession(memberId: string): object | null {
  return session?.memberId === memberId ? session : null;
}

export function isNotificationMutationPending(): boolean {
  return (session?.mutations ?? 0) > 0;
}

/** 타이머 없이 최초 진입·복귀·알림창 열기·푸시 수신 때만 최신 첫 장을 받는다. */
export function refreshNotifications(
  memberId: string,
  reason: "open" | "resume" | "push" | "initial" = "open",
): Promise<boolean> {
  const current = session;
  if (!current || current.memberId !== memberId || document.visibilityState === "hidden") {
    return Promise.resolve(false);
  }
  if (reason === "resume") {
    const now = performance.now();
    if (now - current.lastResume < RESUME_THROTTLE_MS) return current.request ?? Promise.resolve(true);
    current.lastResume = now;
  }
  if (current.mutations > 0) {
    current.queued = true;
    return Promise.resolve(true);
  }
  if (current.request) {
    // 이미 뜬 서버 스냅샷에는 나중에 받은 푸시가 없을 수 있으므로 한 번 더 받는다.
    if (reason === "push") current.queued = true;
    return current.request;
  }

  current.request = (async () => {
    let ok = false;
    do {
      current.queued = false;
      const revision = getNotificationRevision();
      try {
        const response = await fetch(`/api/notifications?limit=${PAGE_SIZE}`, {
          signal: current.controller.signal,
          cache: "no-store",
        });
        // ⚠️ 이 API는 실패해도 `{ error }`라는 **정상 JSON**을 돌려준다 — `ok`를 안 보면
        // `json.notifications`가 undefined → 빈 목록으로 읽혀 "아직 알림이 없어요"가 뜬다.
        if (!response.ok) throw new Error("알림 조회 실패");
        const json = await response.json();
        // 정체가 바뀐 뒤 도착한 응답 — 새 세션은 자기 상태를 따로 들고 있으므로 그냥 버린다.
        if (session !== current) return false;
        if (revision === getNotificationRevision() && current.mutations === 0) {
          setNotifications((json.notifications ?? []) as Notification[]);
          if (typeof json.unreadCount === "number") syncUnreadCount(json.unreadCount);
        }
        ok = true;
      } catch {
        // ⚠️ **여기서 빠져나가지 않는다.** `return`(또는 `break`)이면 `while` 재검사를 건너뛰어
        // 조회 중 도착한 푸시가 세워 둔 `queued`가 그대로 버려진다 — `.finally`가 `request`를
        // 비우고 나면 그 플래그를 읽을 사람이 없고, 다음 조회는 루프 첫 줄에서 false로 덮는다.
        // 그러면 그 푸시 건은 다음 복귀·알림창 열기까지 뱃지에 안 올라온다. 아래 조건으로
        // 떨어뜨려 **queued가 서 있을 때만** 한 번 더 받게 한다(없으면 그대로 종료).
        ok = false;
      }
    } while (
      current.queued && session === current && current.mutations === 0 &&
      document.visibilityState !== "hidden"
    );
    return ok;
  })().finally(() => {
    current.request = null;
  });
  return current.request;
}

/**
 * 낙관적 쓰기가 끝날 때까지 재조회를 보류한다. 실패하면 서버 값으로 복원한다.
 *
 * ⚠️ **세션이 없어도 쓰기는 그대로 한다.** 세션은 루트 `NotificationChannel`이 마운트돼야
 * 생기는데, 그 관문은 자기 Suspense 경계 안이라 페이지 본문보다 늦게 붙을 수 있고
 * `getCurrentMember()`가 실패하면 **아예 안 붙는다**(§notification-channel-gate).
 * 세션 유무로 여기서 빠져나가면 그 동안 읽음·삭제가 **서버 호출도 없이 조용히 성공**한다 —
 * 행은 그대로 남고 promise는 resolve라 토스트도 안 뜬다. 관문이 격리하려던 건 알림 조회
 * 실패이지 쓰기 무력화가 아니다. 세션은 "재조회를 언제까지 미룰지" 적는 장부일 뿐이므로
 * 없으면 **장부만** 건너뛴다.
 */
export async function mutateNotifications(
  optimistic: () => void,
  action: () => Promise<unknown>,
): Promise<void> {
  const current = session;
  if (current) {
    current.mutations += 1;
    if (current.request) current.queued = true;
  }
  try {
    // ⚠️ `optimistic()`도 **try 안이다.** 밖에 두면 여기서 던졌을 때 아래 `finally`의
    // `mutations -= 1`이 안 돌아 카운터가 1에 굳는다. 그러면 `refreshNotifications`가
    // 영영 `queued`만 세우고 끝나고 벨의 무한스크롤도 같이 막혀, 새로고침 전까지
    // 목록·뱃지가 얼어붙는다. 호출부가 넘기는 함수(store 갱신·React setState)라
    // 동기 리스너를 그 자리에서 돌린다 — 던질 수 있는 코드다.
    optimistic();
    await action();
  } catch (error) {
    if (current) current.queued = true;
    throw error;
  } finally {
    if (current) {
      current.mutations -= 1;
      if (session === current && current.mutations === 0 && current.queued) {
        if (current.request) {
          void current.request.then(() => {
            if (session === current && current.queued) void refreshNotifications(current.memberId);
          });
        } else {
          void refreshNotifications(current.memberId);
        }
      }
    }
  }
}

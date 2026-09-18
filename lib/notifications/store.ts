"use client";

import { useSyncExternalStore } from "react";

import type { Notification } from "@/lib/queries/notification";

/**
 * 알림의 **단일 출처**.
 *
 * 채널을 소유한 전역 컴포넌트(`components/notifications/notification-channel.tsx`)가 여기에
 * 쓰고, 각 탭 헤더의 벨(`notification-bell-icon.tsx`)이 여기서 읽는다.
 * `lib/presence/store.ts`와 **같은 패턴·같은 이유**다.
 *
 * **왜 컴포넌트 state가 아닌가**: 벨은 헤더 안에 있는데 헤더는 탭마다 제목이 달라
 * (`PageHeader`의 `action` 슬롯 / 전광판은 제호의 `mastheadActions`) 레이아웃으로 못 올린다.
 * 그래서 **탭을 옮길 때마다 벨이 통째로 새로 태어난다** — `useState`에 담아 두면 목록도
 * Realtime 채널도 같이 죽고, 새 탭에서 처음부터 다시 받는다(실측 하루 약 280회 재조회 +
 * 같은 횟수의 재구독). 모듈 store는 컴포넌트와 무관하게 앱이 켜져 있는 동안 살아 있으므로
 * 벨이 몇 번 죽고 태어나든 데이터가 유지된다.
 *
 * **왜 Provider가 아닌가**: `AGENTS.md`가 Context/Provider를 쓰지 않는다고 못박고 있고,
 * 같은 문제를 같은 방식으로 푼 선례가 둘 있다 — `lib/presence/store.ts`,
 * `components/app-width-control.tsx`.
 *
 * ⚠️ **스냅샷은 같은 참조를 유지해야 한다.** `useSyncExternalStore`는 `Object.is`로 비교하므로
 * 매번 새 배열을 만들면 무한 리렌더가 된다. 바뀔 때만 갈아끼운다.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

let notifications: Notification[] = [];
let unreadCount = 0;
/** 목록을 한 번이라도 받아왔는가 — 탭을 옮겨도 재조회하지 않게 하는 가드 */
let loaded = false;
/** 더 받을 게 남았는가 (무한스크롤) */
let hasMore = true;
/** 다음 페이지 커서 — 마지막 항목의 `crt_at` */
let cursor: string | null = null;
/**
 * 안읽음 수가 **이 store 안에서** 움직인 누적 증감.
 *
 * 서버가 안읽음 수를 센 **뒤**, 목록 fetch가 **끝나기 전**에 새 알림이 도착하면 서버 값은
 * 이미 그만큼 낡았다. fetch를 시작할 때 이 눈금을 적어 두고(`getUnreadDelta`), 돌아왔을 때
 * **벌어진 차이만큼 서버 값에 더한다**(`syncUnreadCount`).
 *
 * ⚠️ **어긋났다고 서버 값을 버리면 안 된다.** 한때 그렇게 했는데, 첫 로드엔 기준값이 0이라
 * 버리는 순간 뱃지가 "그 사이 도착한 1건"만 세게 된다 — 안읽음 5건이 **1**로 보였다.
 *
 * 로컬 낙관적 처리(읽음·삭제)도 여기에 반영한다. 안 하면 fetch가 도는 동안 "모두 읽음"을
 * 누른 사람에게 **뒤늦게 도착한 서버 스냅샷이 옛 숫자를 되살린다.**
 */
let unreadDelta = 0;

/**
 * 첫 로드가 끝나기 전에 Realtime으로 도착한 알림 — 응답과 병합한다.
 *
 * 서버가 목록을 뜬 뒤에 도착한 알림은 그 응답에 **없다.** 그냥 버리면(예전 동작) 다음
 * 재조회 때까지 목록에서 사라진 채로 남는다 — 뱃지만 오르고 열어 보면 없는 상태.
 */
let pendingInserts: Notification[] = [];

/** 서버 스냅샷용 고정 빈 배열 — 매번 `[]`를 만들면 참조가 달라져 무한 리렌더가 된다 */
const EMPTY: Notification[] = [];

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ── 읽기 (컴포넌트용 훅) ──────────────────────────────────────────────

export function useNotifications(): Notification[] {
  return useSyncExternalStore(
    subscribe,
    () => notifications,
    () => EMPTY,
  );
}

export function useUnreadCount(): number {
  return useSyncExternalStore(
    subscribe,
    () => unreadCount,
    () => 0,
  );
}

export function useHasMore(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => hasMore,
    () => true,
  );
}

/**
 * 목록을 이미 받아왔는가 — 벨이 "로딩 중"과 "정말 비었음"을 가르는 데 쓴다.
 *
 * 이 구분이 없으면 아직 안 받아온 상태에서 **"아직 알림이 없어요"가 잘못 뜬다.**
 */
export function useNotificationsLoaded(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => loaded,
    () => false,
  );
}

// ── 쓰기 ────────────────────────────────────────────────────────────

export function isLoaded(): boolean {
  return loaded;
}

export function getCursor(): string | null {
  return cursor;
}

export function getHasMore(): boolean {
  return hasMore;
}

/**
 * 첫 로드 — 목록을 통째로 갈아끼운다.
 *
 * fetch가 도는 동안 Realtime으로 온 알림(`pendingInserts`)을 **앞에 되붙인다.** 서버가
 * 목록을 뜬 뒤에 도착한 것이라 응답에는 없고, 안 붙이면 뱃지만 오르고 목록엔 없는 상태가
 * 다음 재조회까지 간다.
 */
export function setNotifications(next: Notification[]): void {
  notifications =
    pendingInserts.length > 0
      ? [
          ...pendingInserts.filter((p) => !next.some((n) => n.noti_id === p.noti_id)),
          ...next,
        ]
      : next;
  pendingInserts = EMPTY;
  loaded = true;
  // 커서·더보기 판정은 **서버가 준 장(next)** 기준이다. 끼워 넣은 pending까지 세면
  // 다음 장 커서가 어긋나거나 20건이 안 되는 장을 "더 있다"로 읽는다.
  cursor = next.length > 0 ? next[next.length - 1].crt_at : null;
  hasMore = next.length >= 20;
  emit();
}

/** 무한스크롤 다음 장 — 뒤에 잇는다 */
export function appendNotifications(next: Notification[]): void {
  if (next.length > 0) {
    notifications = [...notifications, ...next];
    cursor = next[next.length - 1].crt_at;
  }
  hasMore = next.length >= 20;
  emit();
}

/**
 * Realtime INSERT — 맨 앞에 끼운다.
 *
 * **목록을 아직 안 받아온 상태면 목록엔 넣지 않는다.** 넣어 버리면 나중에 첫 로드가 통째로
 * 갈아끼우기 전까지 "달랑 1건만 있는 목록"이 보인다. 대신 **버리지도 않고**
 * `pendingInserts`에 재워 뒀다가 첫 로드 응답과 병합한다(§setNotifications).
 */
export function prependNotification(noti: Notification): void {
  if (loaded) {
    if (!notifications.some((n) => n.noti_id === noti.noti_id)) {
      notifications = [noti, ...notifications];
    }
  } else if (!pendingInserts.some((n) => n.noti_id === noti.noti_id)) {
    pendingInserts = [noti, ...pendingInserts];
  }
  unreadCount += 1;
  unreadDelta += 1;
  emit();
}

/** Realtime UPDATE — 같은 id를 갈아끼우고 읽음 전환이면 카운트를 보정한다 */
export function updateNotification(updated: Notification): void {
  // 첫 로드 중이면 대상이 `pendingInserts`에 있을 수 있다(도착 직후 읽힌 경우).
  const existing =
    notifications.find((n) => n.noti_id === updated.noti_id) ??
    pendingInserts.find((n) => n.noti_id === updated.noti_id);
  // 모르는 알림의 UPDATE — 바뀌는 게 없으니 리렌더도 일으키지 않는다.
  if (!existing) return;

  if (!existing.read_yn && updated.read_yn) {
    unreadCount = Math.max(0, unreadCount - 1);
    unreadDelta -= 1;
  } else if (existing.read_yn && !updated.read_yn) {
    unreadCount += 1;
    unreadDelta += 1;
  }
  const merge = (n: Notification) =>
    n.noti_id === updated.noti_id ? { ...n, ...updated } : n;
  notifications = notifications.map(merge);
  if (pendingInserts.length > 0) pendingInserts = pendingInserts.map(merge);
  emit();
}

/**
 * 낙관적 읽음 처리 — 서버 응답을 기다리지 않는다.
 *
 * 줄어든 만큼 `unreadDelta`도 내린다 — 조회가 도는 동안 눌렀을 때 **뒤늦게 오는 서버
 * 스냅샷이 옛 숫자를 되살리지 않게**(아래 셋 모두 같은 이유).
 */
export function markRead(notiId: string): void {
  const target = notifications.find((n) => n.noti_id === notiId);
  if (target && !target.read_yn) {
    unreadCount = Math.max(0, unreadCount - 1);
    unreadDelta -= 1;
  }
  notifications = notifications.map((n) =>
    n.noti_id === notiId ? { ...n, read_yn: true } : n,
  );
  emit();
}

export function markAllRead(): void {
  notifications = notifications.map((n) => ({ ...n, read_yn: true }));
  unreadDelta -= unreadCount;
  unreadCount = 0;
  emit();
}

export function removeNotification(notiId: string): void {
  const target = notifications.find((n) => n.noti_id === notiId);
  if (target && !target.read_yn) {
    unreadCount = Math.max(0, unreadCount - 1);
    unreadDelta -= 1;
  }
  notifications = notifications.filter((n) => n.noti_id !== notiId);
  emit();
}

export function clearAll(): void {
  notifications = EMPTY;
  pendingInserts = EMPTY;
  unreadDelta -= unreadCount;
  unreadCount = 0;
  cursor = null;
  hasMore = false;
  emit();
}

/**
 * 안읽음 수를 서버 실측값으로 맞춘다 — `/api/notifications` 첫 장 응답이 목록과 함께 준다.
 *
 * **서버 렌더에서 받지 않는다**: 뱃지 숫자를 서버 컴포넌트가 읽으면 여섯 지면의 모든 렌더가
 * 알림 조회를 기다리게 된다. 알림은 페이지 렌더와 무관해야 하므로 목록과 같은 요청에 실어
 * 클라이언트가 받는다. 대가는 **세션당 한 번, 뱃지가 잠깐 늦게 뜨는 것**뿐이다
 * (탭 이동에는 store에 이미 있어 안 깜빡인다).
 *
 * 값이 같으면 알리지 않는다(헛된 리렌더 방지).
 *
 * **서버 값을 그대로 쓰지 않고 그 사이 벌어진 차이를 더한다** — 이유는 `unreadDelta` 주석.
 */
export function syncUnreadCount(next: number, deltaAtFetchStart?: number): void {
  const drift = deltaAtFetchStart === undefined ? 0 : unreadDelta - deltaAtFetchStart;
  const resolved = Math.max(0, next + drift);
  if (unreadCount === resolved) return;
  unreadCount = resolved;
  emit();
}

/** fetch를 시작할 때 눈금을 적어 두고, 끝나면 `syncUnreadCount`에 되돌려준다 */
export function getUnreadDelta(): number {
  return unreadDelta;
}

/**
 * 정체가 바뀌었을 때(로그아웃·계정 전환) 전부 버린다.
 * 안 버리면 남의 알림이 잠깐 보인다.
 */
export function resetNotifications(): void {
  notifications = EMPTY;
  pendingInserts = EMPTY;
  unreadCount = 0;
  unreadDelta = 0;
  loaded = false;
  hasMore = true;
  cursor = null;
  emit();
}

"use client";

import { useSyncExternalStore } from "react";

import type { Notification } from "@/lib/queries/notification";

/**
 * 알림의 **단일 출처**.
 *
 * 조회·쓰기 조율은 `lib/notifications/refresh.ts`가 하고, 이 파일은 **상태만** 들고 있다.
 * 루트의 `notification-channel.tsx`가 세션을 열어 조회를 걸고, 각 탭 헤더의 벨
 * (`notification-bell-icon.tsx`)이 여기서 읽는다. `lib/presence/store.ts`와 같은 패턴이다.
 *
 * **왜 컴포넌트 state가 아닌가**: 벨은 헤더 안에 있는데 헤더는 탭마다 제목이 달라
 * (`PageHeader`의 `action` 슬롯 / 전광판은 제호의 `mastheadActions`) 레이아웃으로 못 올린다.
 * 그래서 **탭을 옮길 때마다 벨이 통째로 새로 태어난다** — `useState`에 담아 두면 목록이 같이
 * 죽고 새 탭에서 처음부터 다시 받는다(실측 하루 약 280회 재조회). 모듈 store는 컴포넌트와
 * 무관하게 앱이 켜져 있는 동안 살아 있으므로 벨이 몇 번 죽고 태어나든 데이터가 유지된다.
 *
 * **왜 Provider가 아닌가**: `AGENTS.md`가 Context/Provider를 쓰지 않는다고 못박고 있고,
 * 같은 문제를 같은 방식으로 푼 선례가 둘 있다 — `lib/presence/store.ts`,
 * `components/app-width-control.tsx`.
 *
 * ⚠️ **`noti_mst` Realtime 구독은 없다**(2026-09-23 제거). 예전엔 이 store가 INSERT/UPDATE를
 * 받아 목록에 끼워 넣었고, 그래서 "서버가 센 뒤 fetch가 끝나기 전에 도착한 알림"을 보정하는
 * 누산기(`unreadDelta`)와 대기 버퍼(`pendingInserts`)가 있었다. 지금은 최초 진입·복귀·푸시
 * 수신·알림창 열기에만 조회하고, **낡은 응답은 보정하는 대신 `revision`으로 버린다** — 그래서
 * 그 둘이 통째로 사라졌다. 되살릴 땐 구독 코드를 새로 짜야 한다(등록과 구독은 별개다).
 *
 * ⚠️ **스냅샷은 같은 참조를 유지해야 한다.** `useSyncExternalStore`는 `Object.is`로 비교하므로
 * 매번 새 배열을 만들면 무한 리렌더가 된다. 바뀔 때만 갈아끼운다.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

let notifications: Notification[] = [];
let unreadCount = 0;
/** 목록을 한 번이라도 받아왔는가 — 벨이 "받는 중"과 "정말 비었음"을 가르는 데 쓴다 */
let loaded = false;
/** 더 받을 게 남았는가 (무한스크롤) */
let hasMore = true;
/** 다음 페이지 커서 — 마지막 항목의 `crt_at` */
let cursor: string | null = null;
/**
 * 목록이 바뀐 횟수 — **조회를 띄운 뒤 그 결과가 아직 유효한지** 대조하는 눈금.
 *
 * 조회는 왕복하는 동안 사용자가 읽음·삭제를 누를 수 있다. 응답이 그 뒤에 도착해 그대로
 * 덮이면 방금 지운 알림이 되살아난다. 조회 시작 때 이 값을 적어 두고 돌아와서 달라졌으면
 * **응답을 버린다**(§refresh.ts) — 예전 `unreadDelta` 보정을 대신하는 장치다.
 */
let revision = 0;

export function getNotificationRevision(): number {
  return revision;
}

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

export function getCursor(): string | null {
  return cursor;
}

/**
 * 첫 장 — 목록을 통째로 갈아끼운다.
 *
 * ⚠️ **무한스크롤로 더 받아 둔 장은 여기서 사라진다.** 목록이 20건으로 접히면서 커서도
 * 첫 장 기준으로 돌아간다. 읽던 중 복귀·푸시 조회가 끼면 눈에 보이는 결함이라 알고 있는
 * 한계이고, 제대로 고치려면 "첫 장 교체 + 뒷장 유지 + 서버에서 지워진 것 제거"를 병합으로
 * 풀어야 해서 따로 다룬다. 지금은 **`revision`을 올려 최소한 조회가 서로를 덮지는 않게** 한다.
 */
export function setNotifications(next: Notification[]): void {
  revision += 1;
  notifications = next;
  loaded = true;
  cursor = next.length > 0 ? next[next.length - 1].crt_at : null;
  hasMore = next.length >= 20;
  emit();
}

/**
 * 무한스크롤 다음 장 — 뒤에 잇는다.
 *
 * `revision`을 올린다: 이걸 안 올리면 **떠 있는 첫 장 조회가 방금 붙인 장을 모르고** 돌아와
 * 목록을 통째로 덮는다(그 가드가 revision 비교다). 올려 두면 늦게 온 응답이 버려진다.
 */
export function appendNotifications(next: Notification[]): void {
  revision += 1;
  if (next.length > 0) {
    notifications = [...notifications, ...next];
    cursor = next[next.length - 1].crt_at;
  }
  hasMore = next.length >= 20;
  emit();
}

/**
 * 낙관적 읽음 처리 — 서버 응답을 기다리지 않는다.
 *
 * `revision`을 올려 **조회가 도는 동안 누른 것을 뒤늦은 서버 스냅샷이 되돌리지 않게** 한다
 * (아래 셋 모두 같은 이유).
 */
export function markRead(notiId: string): void {
  revision += 1;
  const target = notifications.find((n) => n.noti_id === notiId);
  if (target && !target.read_yn) {
    unreadCount = Math.max(0, unreadCount - 1);
  }
  notifications = notifications.map((n) =>
    n.noti_id === notiId ? { ...n, read_yn: true } : n,
  );
  emit();
}

export function markAllRead(): void {
  revision += 1;
  notifications = notifications.map((n) => ({ ...n, read_yn: true }));
  unreadCount = 0;
  emit();
}

export function removeNotification(notiId: string): void {
  revision += 1;
  const target = notifications.find((n) => n.noti_id === notiId);
  if (target && !target.read_yn) {
    unreadCount = Math.max(0, unreadCount - 1);
  }
  notifications = notifications.filter((n) => n.noti_id !== notiId);
  emit();
}

export function clearAll(): void {
  revision += 1;
  notifications = EMPTY;
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
 * 호출부가 `revision`으로 **낡은 응답을 아예 걸러 주므로** 여기서 보정하지 않는다 — 값이
 * 같으면 알리지도 않는다(헛된 리렌더 방지).
 */
export function syncUnreadCount(next: number): void {
  const resolved = Math.max(0, next);
  if (unreadCount === resolved) return;
  unreadCount = resolved;
  emit();
}

/**
 * 정체가 바뀌었을 때(로그아웃·계정 전환) 전부 버린다.
 * 안 버리면 남의 알림이 잠깐 보인다.
 */
export function resetNotifications(): void {
  revision += 1;
  notifications = EMPTY;
  unreadCount = 0;
  loaded = false;
  hasMore = true;
  cursor = null;
  emit();
}

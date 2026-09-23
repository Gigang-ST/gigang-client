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

/**
 * 한 장의 크기 — **조회 쪽 `limit`과 반드시 같은 값이어야 한다.**
 *
 * 이 값은 "받아온 장이 꽉 찼는가"로 `hasMore`와 첫 장 병합 여부를 판정하는 데 쓴다.
 * 조회가 15개만 달라 오면 꽉 찬 장도 `hasMore = false`가 되어 무한스크롤이 조용히 끝나고,
 * 첫 장이 "서버에 이게 전부"로 오판돼 뒷장이 통째로 사라진다. 그래서 상수를 여기 두고
 * `refresh.ts`·벨이 **이걸 가져다 쓴다** — 양쪽에 숫자를 따로 적으면 언젠가 갈라진다.
 */
export const PAGE_SIZE = 20;

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
 * 첫 장 — 새로 받은 장을 앞에 놓고 **그보다 오래된 것만** 뒤에 남긴다.
 *
 * 통째로 갈아끼우면 무한스크롤로 받아 둔 장이 사라진다 — 60건까지 내려 읽던 중 복귀·푸시
 * 조회가 끼면 목록이 20건으로 접히면서 읽던 자리를 잃는다. 새 첫 장은 **그 구간의 정본**이라
 * 그 안의 변화(새 알림·읽음·삭제)는 그대로 반영되고, 뒷장은 손대지 않아 자리가 유지된다.
 *
 * **이어붙이지 않고 갈아끼우는 경우가 둘 있다**(§`resolveTail`) — 둘 다 이으면 목록이
 * 거짓말을 하게 되는 경우라, 자리를 잃더라도 정확한 쪽을 택한다.
 *
 * ⚠️ 뒷장은 이 조회가 확인해 준 범위가 아니다. 거기서 지워지거나 읽힌 건 그 장을 다시
 * 받을 때까지 옛 상태로 남는다 — 화면 위쪽은 항상 최신이고 아래로 갈수록 오래된, 받아들인
 * 대가다. 통째로 갈아끼우던 옛 동작은 이 어긋남이 없는 대신 **읽던 자리를 매번 잃었다.**
 */
export function setNotifications(next: Notification[]): void {
  revision += 1;
  const tail = resolveTail(next);
  notifications = tail.length > 0 ? [...next, ...tail] : next;
  loaded = true;
  const last = notifications[notifications.length - 1];
  cursor = last ? last.crt_at : null;
  // 뒷장을 살렸으면 그 **뒤에** 더 있는지는 이 조회가 답하지 않는다 — 그때 판정한 값 그대로다.
  if (tail.length === 0) hasMore = next.length >= PAGE_SIZE;
  emit();
}

/**
 * 새 첫 장 뒤에 남길 기존 항목 — 없으면 통째로 갈아끼운다는 뜻이다.
 *
 * 남기지 않는 두 경우:
 *
 * 1. **첫 장이 꽉 차지 않았다** → 서버에 그게 전부다. 들고 있던 뒷장은 지워진 것이므로
 *    남기면 화면에만 있는 유령이 된다.
 * 2. **새 첫 장이 기존 목록과 한 건도 안 겹친다** → 그 사이에 우리가 못 본 알림이 있을 수
 *    있다(자리를 비운 사이 한 장 넘게 쌓인 경우). 그대로 이으면 **가운데가 빈 목록**이
 *    되는데, 빠진 알림은 스크롤해도 영영 안 나온다. 한 건이라도 겹치면 그 항목보다 새로운
 *    건 전부 이 장 안에 있으므로 사이가 비지 않는다.
 *
 * ⚠️ **경계를 `crt_at` 비교로 잡지 않는다.** 두 목록 다 최신순이고 새 첫 장은 그 앞부분이라,
 * **겹치는 마지막 자리**가 곧 이 장이 덮는 끝이다. 시각으로 자르면 `crt_at`(timestamptz)
 * 문자열이 늘 같은 폭으로 온다는 데 기대게 되는데(소수 자릿수가 행마다 다르다) 그 가정이
 * 깨지는 날 목록이 조용히 어긋난다. 자리로 자르면 그런 가정이 아예 필요 없다.
 *
 * 겹치는 자리보다 **앞인데 새 장에 없는 항목은 지워진 것이다** — 새 장은 최신 한 장이므로,
 * 살아 있다면 거기 들어 있어야 한다. 그래서 자연히 떨어져 나간다.
 */
function resolveTail(next: Notification[]): Notification[] {
  if (next.length < PAGE_SIZE || notifications.length === 0) return EMPTY;
  const fresh = new Set(next.map((n) => n.noti_id));
  let lastShared = -1;
  for (let i = 0; i < notifications.length; i++) {
    if (fresh.has(notifications[i].noti_id)) lastShared = i;
  }
  if (lastShared === -1) return EMPTY;
  // `filter`는 보수적 안전장치다 — 같은 `noti_id`가 두 번 들어가면 React key가 충돌한다.
  return notifications.slice(lastShared + 1).filter((n) => !fresh.has(n.noti_id));
}

/**
 * 무한스크롤 다음 장 — 뒤에 잇는다.
 *
 * `revision`을 올려 **떠 있던 첫 장 조회를 버린다.** 그 응답은 이 장이 붙기 전의 스냅샷이라
 * 자기가 못 본 목록을 두고 뒷장 경계를 정하게 된다 — 특히 그 장이 꽉 차지 않았으면
 * (`resolveTail`의 첫 조건) 방금 붙인 장을 "지워진 것"으로 보고 걷어낸다. 버려도 손해는
 * 뱃지 동기화 한 번을 건너뛰는 정도이고, 다음 복귀·푸시·알림창 열기가 다시 채운다.
 */
export function appendNotifications(next: Notification[]): void {
  revision += 1;
  if (next.length > 0) {
    notifications = [...notifications, ...next];
    cursor = next[next.length - 1].crt_at;
  }
  hasMore = next.length >= PAGE_SIZE;
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

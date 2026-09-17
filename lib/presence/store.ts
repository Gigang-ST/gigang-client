"use client";

import { useSyncExternalStore } from "react";

/**
 * 접속자 명단의 **단일 출처**.
 *
 * 채널을 소유한 전역 레이어(`components/presence/presence-layer.tsx`)가 여기에 쓰고,
 * 전광판의 `지금 보는 중 N명` 라벨이 여기서 읽는다.
 *
 * **왜 Provider가 아닌가**: `AGENTS.md`가 Context/Provider 패턴을 쓰지 않는다고 못박고 있고,
 * 이 코드베이스엔 같은 문제를 같은 방식으로 푼 선례가 있다 — `components/app-width-control.tsx`
 * (셸 폭)가 `useSyncExternalStore`로 DOM·localStorage를 진실로 삼는다. 모듈 store면 트리
 * 어디서든 읽히고 루트에 Provider가 하나 더 늘지 않는다.
 *
 * **왜 명단이 컴포넌트 state가 아닌가**: 채널은 루트에 한 번 붙어 앱을 닫을 때까지 살아 있고,
 * 라벨은 전광판에만 있다. 둘이 부모-자식이 아니라 state로는 못 잇는다. 라벨이 자기 채널을
 * 따로 붙이면 같은 key로 두 번 track하게 된다.
 */

/** 접속자 한 명 — presence로 실어 나르는 표시정보 */
export type Presence = {
  mem_id: string;
  mem_nm: string;
  avatar_url: string | null;
};

type Listener = () => void;

const listeners = new Set<Listener>();

/**
 * 스냅샷은 **같은 참조를 유지**해야 한다 — `useSyncExternalStore`는 `Object.is`로 비교하므로
 * 매번 새 배열을 만들면 무한 리렌더가 된다. 바뀔 때만 갈아끼운다.
 */
let presenceList: Presence[] = [];

/**
 * 지금 화면이 공을 그리는 화면인가 — `(main)` 5탭(하단 탭바가 있는 곳)이면 true.
 *
 * `(info)`·`(protected)`에는 탭바가 없어 바닥이 안전영역까지 내려가는데, 거기가 폼 제출
 * 버튼이 사는 자리다. 게다가 관리자 표 편집·약관 같은 "일하는 화면"에 공이 굴러다닐 이유가
 * 없다. **채널은 그대로 살아 있고 그리기만 끈다** — 채널까지 끊으면 남의 화면에서 내 공이
 * 사라졌다 새로 떨어진다.
 */
let drawing = false;

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 전역 레이어가 presence sync를 받을 때마다 부른다 */
export function setPresenceList(next: Presence[]): void {
  presenceList = next;
  emit();
}

export function getPresenceList(): Presence[] {
  return presenceList;
}

/**
 * 탭바가 있는 화면에 들어왔다/나갔다 — `components/presence/presence-floor.tsx`가 부른다.
 *
 * 같은 값이면 알리지 않는다. 라우트 이동마다 헛된 리렌더가 붙는 걸 막는다.
 */
export function setPresenceDrawing(next: boolean): void {
  if (drawing === next) return;
  drawing = next;
  emit();
}

/**
 * 접속자 수 — 전광판 라벨이 쓴다.
 *
 * 배열이 아니라 **숫자를 돌려준다**: 숫자는 값 비교라 스냅샷 참조 안정성을 신경 쓸 필요가
 * 없고, 라벨이 필요한 것도 개수뿐이다.
 *
 * 서버 스냅샷은 0 — 첫 렌더에 라벨이 안 뜨고 채널이 붙으면 나타난다(하이드레이션 안전).
 */
export function usePresenceCount(): number {
  return useSyncExternalStore(
    subscribe,
    () => presenceList.length,
    () => 0,
  );
}

/** 지금 공을 그리는 화면인가 — 전역 레이어가 렌더와 rAF 루프를 둘 다 이걸로 건너뛴다 */
export function usePresenceDrawing(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => drawing,
    () => false,
  );
}

/** 명단 자체가 필요한 곳(전역 레이어)용 — 참조가 유지되므로 그대로 구독해도 안전하다 */
export function usePresenceList(): Presence[] {
  return useSyncExternalStore(
    subscribe,
    getPresenceList,
    () => EMPTY,
  );
}

/** 서버 스냅샷용 고정 빈 배열 — 매번 `[]`를 만들면 참조가 달라져 무한 리렌더가 된다 */
const EMPTY: Presence[] = [];

"use client";

import { useEffect, useRef } from "react";

/**
 * 다이얼로그/드로어가 열릴 때 히스토리 항목을 하나 쌓아,
 * 모바일(안드로이드) 뒤로가기 버튼이 앱 종료 대신 다이얼로그 닫기로 동작하게 한다.
 *
 * - 뒤로가기로 닫힘: 쌓아둔 항목이 소비되며 onClose 호출 (페이지는 그대로).
 * - X버튼·취소 등 프로그램적으로 닫힘: 쌓아둔 항목을 history.back()으로 회수해
 *   다음 뒤로가기가 "한 번 씹히는" 문제를 막는다.
 * - 여러 다이얼로그가 중첩되면(폼 위 팝업 등) 모듈 스택으로 가장 위의 것부터 닫는다.
 */

type StackEntry = { id: number; close: () => void };

// 모듈 싱글턴 — 열린 다이얼로그 스택과 popstate 처리 상태
const stack: StackEntry[] = [];
/** history.back()을 우리가 호출한 경우, 곧 도착할 popstate를 무시하기 위한 카운터 */
let pendingProgrammaticBack = 0;
/** 뒤로가기(popstate)로 닫힌 다이얼로그 id들 — cleanup에서 back() 회수를 건너뛰기 위함.
 *  빠른 더블 백으로 cleanup 전에 popstate가 연속 도착해도 유실되지 않도록 Set으로 누적. */
const popClosedIds = new Set<number>();
let nextId = 0;
let listenerAttached = false;

function handlePopState() {
  if (pendingProgrammaticBack > 0) {
    pendingProgrammaticBack--;
    return;
  }
  const top = stack[stack.length - 1];
  if (top) {
    popClosedIds.add(top.id);
    top.close();
  }
}

export function useDialogHistoryBack(open: boolean, onClose: () => void) {
  // onClose가 매 렌더 새 함수여도 effect가 재실행되지 않도록 ref로 고정
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    if (!listenerAttached) {
      window.addEventListener("popstate", handlePopState);
      listenerAttached = true;
    }
    const id = ++nextId;
    stack.push({ id, close: () => onCloseRef.current() });
    history.pushState({ dialog: id }, "");

    return () => {
      const idx = stack.findIndex((e) => e.id === id);
      // LIFO 가정 위반 감지 — 스택 중간 항목이 먼저 닫히면 back()이 다른 다이얼로그의
      // 히스토리 항목을 소비해 상태가 어긋난다. 현 사용처(모달 중첩)에선 발생하지 않지만
      // 범용 훅이므로 향후 오용을 개발 중에 바로 알아차릴 수 있게 경고한다.
      if (process.env.NODE_ENV !== "production" && idx !== -1 && idx !== stack.length - 1) {
        console.warn(
          "[useDialogHistoryBack] 스택 중간 다이얼로그가 먼저 닫혔습니다 — 뒤로가기 동작이 어긋날 수 있습니다.",
        );
      }
      if (idx !== -1) stack.splice(idx, 1);
      if (popClosedIds.has(id)) {
        // 뒤로가기로 닫힘 — 히스토리 항목은 이미 소비됨
        popClosedIds.delete(id);
      } else if (
        // 현재 히스토리 항목이 내 것일 때만 회수한다 — 열린 채로 Root가
        // 교체(리마운트)되는 등 스택이 어긋난 상태에서 back()을 호출하면
        // 페이지 진입 이전 사이트까지 이탈할 수 있다. 고아 항목이 하나 남는
        // 쪽이 페이지를 벗어나는 것보다 안전하다.
        // 단 pendingProgrammaticBack > 0 이면 같은 커밋에서 위 다이얼로그의
        // back()이 큐만 되고 아직 착지 전이라 history.state가 잠시 낡은
        // 값이다(중첩 동시 닫힘). 이때는 큐 순서상 내 항목이 곧 현재가
        // 되므로 정상 회수한다.
        pendingProgrammaticBack > 0 ||
        (history.state as { dialog?: number } | null)?.dialog === id
      ) {
        // 프로그램적으로 닫힘(X·취소·제출) — 쌓아둔 항목 회수
        pendingProgrammaticBack++;
        history.back();
      }
    };
  }, [open]);
}

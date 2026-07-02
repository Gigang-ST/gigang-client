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
      if (idx !== -1) stack.splice(idx, 1);
      if (popClosedIds.has(id)) {
        // 뒤로가기로 닫힘 — 히스토리 항목은 이미 소비됨
        popClosedIds.delete(id);
      } else {
        // 프로그램적으로 닫힘(X·취소·제출) — 쌓아둔 항목 회수
        pendingProgrammaticBack++;
        history.back();
      }
    };
  }, [open]);
}

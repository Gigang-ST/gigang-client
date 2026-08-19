"use client";

import { useState } from "react";

import { requestReactivation } from "@/app/actions/member/request-reactivation";

/**
 * "관리자에게 문의하기" 한 번의 동작 — 보냄/보내는 중/이미 접수됨.
 *
 * 이걸 쓰는 자리가 둘이다: 참여 게이트 다이얼로그(`InactiveGateDialog`)와 프로필탭 전면
 * 차단 화면(`ReactivationRequestButton`). **그리는 모양은 다르지만 동작은 같아야 한다** —
 * 특히 실패가 아닌 실패("오늘 이미 문의를 보냈어요")를 어떻게 접는지가 한쪽만 달라지면
 * 같은 버튼이 자리에 따라 다르게 군다. 그래서 그림은 각자, 동작은 여기 하나로 둔다.
 */
export function useReactivationRequest() {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = async () => {
    setSending(true);
    setError(null);
    const res = await requestReactivation();
    if (res.ok) {
      setSent(true);
    } else {
      // "이미 문의를 보냈어요" 도 여기로 — 실패라기보다 이미 접수된 상태 안내
      setError(res.message);
    }
    setSending(false);
  };

  /** 다이얼로그가 닫힐 때처럼 처음 화면부터 다시 보여야 할 때 */
  const reset = () => {
    setSent(false);
    setError(null);
    setSending(false);
  };

  return { sending, sent, error, request, reset };
}

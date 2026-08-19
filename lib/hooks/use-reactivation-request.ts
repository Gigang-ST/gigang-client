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
    try {
      const res = await requestReactivation();
      if (res.ok) {
        setSent(true);
      } else {
        // "이미 문의를 보냈어요" 도 여기로 — 실패라기보다 이미 접수된 상태 안내
        setError(res.message);
      }
    } catch {
      // 액션이 던지는 경우가 실제로 있다 — 세션이 끊기면 withMember 가 throw하고, 전송 자체가
      // 실패할 수도 있다. 여기서 안 받으면 finally 도 못 가 **버튼이 영영 비활성으로 굳는다**
      // (사용자에겐 "눌러도 아무 일이 안 일어남"으로 보인다).
      setError("잠시 후 다시 시도해 주세요");
    } finally {
      setSending(false);
    }
  };

  /** 다이얼로그가 닫힐 때처럼 처음 화면부터 다시 보여야 할 때 */
  const reset = () => {
    setSent(false);
    setError(null);
    setSending(false);
  };

  return { sending, sent, error, request, reset };
}

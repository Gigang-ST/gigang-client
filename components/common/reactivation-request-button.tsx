"use client";

import { Check } from "lucide-react";

import { useReactivationRequest } from "@/lib/hooks/use-reactivation-request";
import { REACTIVATION_COPY, REACTIVATION_SENT_DESC } from "@/lib/inactive-notice";

import { Caption } from "@/components/common/typography";
import { Button } from "@/components/ui/button";

/**
 * 프로필탭 전면 차단 화면의 요청 버튼.
 *
 * 이 화면은 **참여 게이트 다이얼로그로 갈 길이 없는 유일한 차단면**이라, 사유만 보여 주고
 * 끝나면 요청을 보낼 방법이 아예 없다. 동작은 다이얼로그와 같은 훅
 * (`useReactivationRequest`)을 써 하루 1회 제한·"이미 접수됨" 처리까지 똑같이 간다.
 *
 * **말은 상태마다 다르다** — 비활성은 "문의"(풀어 달라), 탈퇴는 "재가입 요청"(다시 넣어
 * 달라)이다. 문구는 `REACTIVATION_COPY`(`lib/inactive-notice`) 하나를 게이트 다이얼로그와
 * 함께 본다 — 같은 액션을 부르는 두 차단면이 다른 말을 하면 안 된다.
 *
 * 다이얼로그처럼 성공 화면으로 판을 갈아치우지는 않는다 — 거긴 닫기 버튼이 있어 화면을
 * 통째로 바꿔도 빠져나갈 길이 있지만, 여긴 탭 본문이라 남은 안내(사유·설정으로)를 지우면
 * 요청 한 번에 화면이 비어 버린다. 버튼 자리만 접수 문구로 바뀐다.
 */
export function ReactivationRequestButton({
  kind = "inactive",
}: {
  kind?: "inactive" | "left";
}) {
  const { sending, sent, error, request } = useReactivationRequest();
  const copy = REACTIVATION_COPY[kind];

  if (sent) {
    return (
      <div className="flex items-center justify-center gap-1.5">
        <Check className="size-4 shrink-0 text-success" />
        <Caption>
          {copy.sentTitle} · {REACTIVATION_SENT_DESC}
        </Caption>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <Button size="sm" onClick={request} disabled={sending}>
        {sending ? "보내는 중..." : copy.cta}
      </Button>
      {error && <Caption className="font-medium text-warning">{error}</Caption>}
    </div>
  );
}

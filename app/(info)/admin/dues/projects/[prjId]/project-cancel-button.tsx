"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { cancelTransaction } from "@/app/actions/dues/cancel-transaction";

import { Button } from "@/components/ui/button";

/**
 * 프로젝트 명단 행에서 바로 귀속을 취소한다 — '처리됨' 화면을 거치지 않는 지름길.
 * cancelTransaction 이 확정을 해제해 거래를 인박스로 되돌리므로, 명단에서 사라지고
 * (is_cfm_yn=false 필터) 모금액도 그만큼 줄어든다. 되돌린 행은 인박스에 분류·귀속·회원이
 * 그대로 남아 재확정만 하면 복구된다.
 */
export function ProjectCancelButton({
  txnId,
  rawName,
  amt,
}: {
  txnId: string;
  rawName: string;
  amt: number;
}) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  function onCancel() {
    if (
      !confirm(
        `${rawName} ${amt.toLocaleString()}원의 프로젝트 귀속을 취소하시겠습니까?\n거래가 처리 대기(인박스)로 돌아갑니다.`,
      )
    )
      return;
    setErr(null);
    startTransition(async () => {
      const res = await cancelTransaction(txnId);
      if (res.ok) {
        router.refresh();
      } else {
        setErr(res.message);
        alert(res.message);
      }
    });
  }

  return (
    <Button
      type="button"
      size="xs"
      variant="outline"
      disabled={pending}
      onClick={onCancel}
      aria-label={err ?? undefined}
    >
      {pending ? "취소 중…" : "취소"}
    </Button>
  );
}

"use client";

import { useRef, useState, useTransition } from "react";

import { toast } from "sonner";

import { cn } from "@/lib/utils";

import { toggleGatheringAttendance } from "@/app/actions/gathering/toggle-attendance";

import { Button } from "@/components/ui/button";

type Props = {
  gthrId: string;
  initialAttending: boolean;
  maxPrtCnt: number | null;
  currentAttdCount: number;
};

export function GatheringAttendButton({ gthrId, initialAttending, maxPrtCnt, currentAttdCount }: Props) {
  const [attending, setAttending] = useState(initialAttending);
  const [attdCount, setAttdCount] = useState(currentAttdCount);
  const [, startTransition] = useTransition();
  // 동기적 재진입 가드 — isPending(리렌더 의존)은 같은 렌더 내 연타를 못 막으므로 ref로 막는다.
  const togglingRef = useRef(false);

  const isFull = !attending && maxPrtCnt !== null && attdCount >= maxPrtCnt;

  function handleToggle() {
    if (isFull || togglingRef.current) return; // 처리 중이면 재클릭 무시(중복 방지) — 버튼은 흐려지지 않음
    togglingRef.current = true;
    startTransition(async () => {
      const prev = attending;
      setAttending(!prev);
      setAttdCount((c) => (!prev ? c + 1 : c - 1));
      try {
        const result = await toggleGatheringAttendance(gthrId);
        setAttending(result.attending);
        // 참석 등록 시에만 담백한 횟수 피드백(취소는 조용히)
        if (result.attending && result.monthlyAttendCnt) {
          toast.success(`이번 달 ${result.monthlyAttendCnt}회 참여!`);
        }
      } catch {
        setAttending(prev);
        setAttdCount((c) => (prev ? c - 1 : c + 1));
      } finally {
        togglingRef.current = false;
      }
    });
  }

  return (
    <Button
      onClick={handleToggle}
      // 처리 중(isPending)엔 disabled 대신 handleToggle 가드로 재클릭만 막아 버튼이 흐려지지 않게 한다.
      // 낙관적 업데이트로 색이 즉시 바뀌므로 사용자는 "바로 눌렸다"고 느낀다.
      disabled={isFull}
      variant={attending ? "default" : "outline"}
      className={cn(
        "w-full",
        attending && "bg-success hover:bg-success/90 border-success",
      )}
    >
      {isFull ? "인원 마감" : attending ? "✅ 참석" : "참석하기"}
    </Button>
  );
}

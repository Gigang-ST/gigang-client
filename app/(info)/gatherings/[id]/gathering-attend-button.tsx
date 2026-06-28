"use client";

import { useState, useTransition } from "react";

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
  const [isPending, startTransition] = useTransition();

  const isFull = !attending && maxPrtCnt !== null && attdCount >= maxPrtCnt;

  function handleToggle() {
    if (isFull) return;
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
      }
    });
  }

  return (
    <Button
      onClick={handleToggle}
      disabled={isPending || isFull}
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

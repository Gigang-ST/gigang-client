"use client";

import { useState, useTransition } from "react";

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
      } catch {
        setAttending(prev);
        setAttdCount((c) => (prev ? c + 1 : c - 1));
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

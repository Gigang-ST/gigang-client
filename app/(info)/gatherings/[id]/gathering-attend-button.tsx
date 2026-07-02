"use client";

import { useRef, useState, useTransition } from "react";

import { Lock } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

import { toggleGatheringAttendance } from "@/app/actions/gathering/toggle-attendance";

import { Button } from "@/components/ui/button";

type Props = {
  gthrId: string;
  initialAttending: boolean;
  maxPrtCnt: number | null;
  currentAttdCount: number;
  /** 지난 모임(KST) — 참석/해제 잠금 (관리자는 서버 페이지에서 false로 내려옴) */
  pastLocked?: boolean;
};

export function GatheringAttendButton({ gthrId, initialAttending, maxPrtCnt, currentAttdCount, pastLocked }: Props) {
  const [attending, setAttending] = useState(initialAttending);
  const [attdCount, setAttdCount] = useState(currentAttdCount);
  const [, startTransition] = useTransition();
  // 동기적 재진입 가드 — isPending(리렌더 의존)은 같은 렌더 내 연타를 못 막으므로 ref로 막는다.
  const togglingRef = useRef(false);

  const isFull = !attending && maxPrtCnt !== null && attdCount >= maxPrtCnt;

  function handleToggle() {
    if (isFull || pastLocked || togglingRef.current) return; // 처리 중이면 재클릭 무시(중복 방지) — 버튼은 흐려지지 않음
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
      } catch (e) {
        setAttending(prev);
        // 낙관적 업데이트(!prev ? +1 : -1)의 역방향으로 롤백
        setAttdCount((c) => (prev ? c + 1 : c - 1));
        // 서버 거절 사유(지난 모임·인원 마감 등)를 안내 — 무음 롤백이면 버튼 고장으로 오인한다
        toast.error(e instanceof Error ? e.message : "참석 처리에 실패했습니다.");
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
      disabled={isFull || pastLocked}
      variant={attending ? "default" : "outline"}
      className={cn(
        "w-full",
        attending && "bg-success hover:bg-success/90 border-success",
      )}
    >
      {/* 지난 모임: 문구 변경 없이 잠금 아이콘 + disabled 흐림으로만 표시 */}
      {pastLocked && <Lock className="size-3.5" />}
      {!pastLocked && isFull ? "인원 마감" : attending ? "✅ 참석" : "참석하기"}
    </Button>
  );
}

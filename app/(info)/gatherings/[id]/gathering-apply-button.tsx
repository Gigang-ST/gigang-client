"use client";

import { useRef, useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { Lock } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

import {
  applyToGatheringAction,
  cancelMyApplicationAction,
} from "@/app/actions/gathering/manage-application";

import { Micro } from "@/components/common/typography";
import { Button } from "@/components/ui/button";

import { GatheringCancelDialog } from "./gathering-cancel-dialog";

/**
 * 승인제 모임의 참가 버튼 — 신청 → 대기 → 확정/반려.
 *
 * 승인제가 아닌 모임은 기존 `GatheringAttendButton` 이 그대로 맡는다. 두 버튼을 하나로
 * 합치지 않는 이유는 흐름 자체가 달라서다 — 저쪽은 원탭 토글이고 이쪽은 상태 기계다.
 *
 * 설계: docs/superpowers/specs/2026-08-25-모임-참여조건-승인제-design.md §6.2
 */

export type MyApplicationState = "none" | "pending" | "approved" | "rejected" | "canceled";

type Props = {
  gthrId: string;
  state: MyApplicationState;
  /** 반려 사유 — 왜 떨어졌는지 모르면 같은 이유로 다시 신청한다 */
  rejectReason?: string | null;
  /** 참여조건을 모두 충족했는가. 미달이면 신청 버튼이 잠긴다(서버도 거부한다). */
  conditionsOk: boolean;
  /** 확정 인원이 정원에 찼는가 — 신청은 계속 받되 안내한다 */
  full: boolean;
  sttAt: string;
  pastLocked?: boolean;
  /**
   * 상태가 바뀐 뒤 호출 — 일정탭 다이얼로그처럼 **서버 렌더가 아닌** 자리에서 쓴다.
   * 모임 상세 페이지는 `router.refresh()` 로 서버 컴포넌트를 다시 그리면 되지만,
   * 다이얼로그는 자기 상태를 스스로 다시 받아와야 한다.
   */
  onChanged?: () => void;
};

export function GatheringApplyButton({
  gthrId,
  state,
  rejectReason,
  conditionsOk,
  full,
  sttAt,
  pastLocked,
  onChanged,
}: Props) {
  const router = useRouter();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [, startTransition] = useTransition();
  // 동기 재진입 가드 — isPending 은 리렌더 의존이라 같은 렌더 내 연타를 못 막는다.
  const busyRef = useRef(false);

  const canApply = state === "none" || state === "rejected" || state === "canceled";
  const locked = pastLocked || (canApply && !conditionsOk);

  async function run(fn: () => Promise<{ ok: boolean; message?: string }>, onOk: () => void) {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.message ?? "처리에 실패했습니다.");
        return;
      }
      onOk();
      // 모임 상세 페이지(서버 컴포넌트)는 refresh 로, 다이얼로그는 onChanged 로 각자 갱신한다.
      router.refresh();
      onChanged?.();
    } finally {
      busyRef.current = false;
    }
  }

  /**
   * 신청은 **한 번 누르면 끝난다.**
   *
   * 한때 여기에 "남길 말(입금자명)" 모달이 있었는데 걷어냈다 — 입금 확인은 송년회 한
   * 사례일 뿐이고 승인제는 그 말고도 여러 이유로 쓴다. 항상 필요하지도 않은 입력을
   * 모두에게 한 단계 더 세우면, 버튼 하나로 끝날 일이 매번 모달을 닫는 일이 된다.
   * (`gthr_aply_rel.aply_memo_txt` 와 액션의 memo 인자는 남겨 둔다 — 필요해지면 그때
   *  그 모임에서만 받으면 되고, 지금 지우면 마이그레이션만 왕복한다.)
   */
  function submitApply() {
    startTransition(() =>
      run(
        () => applyToGatheringAction(gthrId),
        () => toast.success("신청했어요. 운영진이 확인하면 알려드릴게요."),
      ),
    );
  }

  function cancelPending() {
    startTransition(() =>
      run(
        () => cancelMyApplicationAction(gthrId),
        () => toast.success("신청을 취소했어요."),
      ),
    );
  }

  /** 확정 후 취소 — 자리를 반납하므로 기존 참석 취소와 같은 사유 모달을 거친다. */
  async function cancelApproved(reason?: string) {
    const r = await cancelMyApplicationAction(gthrId, reason);
    if (!r.ok) throw new Error(r.message ?? "취소에 실패했습니다.");
    setCancelOpen(false);
    router.refresh();
    onChanged?.();
  }

  return (
    <div className="flex flex-col gap-2">
      {state === "pending" && (
        <>
          <Button disabled variant="outline" className="w-full">
            승인 대기 중
          </Button>
          <Button variant="ghost" className="w-full" onClick={cancelPending}>
            신청 취소
          </Button>
        </>
      )}

      {state === "approved" && (
        <Button
          onClick={() => !pastLocked && setCancelOpen(true)}
          disabled={pastLocked}
          className="w-full border-success bg-success hover:bg-success/90"
        >
          {pastLocked && <Lock className="size-3.5" />}✅ 참가 확정
        </Button>
      )}

      {canApply && (
        <Button
          onClick={submitApply}
          disabled={locked}
          variant="outline"
          className={cn("w-full")}
        >
          {locked && !pastLocked && <Lock className="size-3.5" />}
          {state === "rejected" ? "다시 신청하기" : "참가 신청"}
        </Button>
      )}

      {state === "rejected" && (
        <Micro className="text-destructive">
          신청이 반려됐어요{rejectReason ? ` — ${rejectReason}` : ""}
        </Micro>
      )}

      {canApply && !conditionsOk && !pastLocked && (
        <Micro>참여 조건을 채우면 신청할 수 있어요.</Micro>
      )}

      {full && canApply && conditionsOk && !pastLocked && (
        <Micro>정원이 찼어요. 신청은 받지만 자리가 나야 승인될 수 있어요.</Micro>
      )}


      <GatheringCancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        sttAt={sttAt}
        onConfirm={cancelApproved}
      />
    </div>
  );
}

"use client";

import { useState } from "react";

import { toast } from "sonner";

import { isCancelReasonRequired } from "@/lib/gathering/cancel-imminent";
import { GATHERING_CANCEL_REASON_MAX_LENGTH, validateCancelReason } from "@/lib/gathering/cancel-reason";

import { Caption } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 모임 시작 시각(UTC ISO) — 사유 필수 여부(시작 5시간 전부터) 판정용 */
  sttAt: string;
  /** 취소 확정 — 실패 시 throw 하면 이 모달이 에러 토스트를 띄우고 제출 상태를 푼다(모달은 열린 채 유지) */
  onConfirm: (reason?: string) => Promise<void>;
};

/**
 * 참석 취소 확인 모달.
 * 임박(모임 시작 5시간 이내) 여부에 따라 사유 필수/선택 안내와 제출 가능 여부가 달라진다.
 * 판정은 서버(toggleGatheringAttendance)에서도 동일 기준으로 재검증한다 — 여기 값은 UX용.
 */
export function GatheringCancelDialog({ open, onOpenChange, sttAt, onConfirm }: Props) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 모달이 열려 있는 동안 시간이 흘러도 렌더마다 재계산 — 값이 굳지 않게 한다.
  const reasonRequired = isCancelReasonRequired(sttAt);
  const reasonCheck = validateCancelReason(reason);
  const normalizedReason = reasonCheck.ok ? reasonCheck.value : null;
  const canSubmit = !submitting && reasonCheck.ok && (!reasonRequired || !!normalizedReason);

  function handleOpenChange(next: boolean) {
    if (submitting) return; // 제출 중엔 닫기 방지
    onOpenChange(next);
    if (!next) setReason(""); // 닫힐 때 입력 초기화
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onConfirm(normalizedReason ?? undefined);
      setReason("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "참석 취소에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>참석을 취소할까요?</DialogTitle>
          <DialogDescription>
            취소하면 모임장에게 알림이 전송되지만,{" "}
            <span className="font-semibold text-foreground">채팅방에서 직접 알려주세요</span> :)
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Caption className={reasonRequired ? "text-destructive" : "text-muted-foreground"}>
            {reasonRequired
              ? "곧 시작하는 모임이라 취소 사유를 꼭 남겨주세요!"
              : "(선택) 모임장의 멘탈을 위해 취소 사유를 남겨주세요🥹"}
          </Caption>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="예) 갑자기 야근이 잡혀서 참석이 어려워요"
            maxLength={GATHERING_CANCEL_REASON_MAX_LENGTH}
            rows={3}
            disabled={submitting}
          />
          <Caption className="self-end text-muted-foreground">
            {reason.length}/{GATHERING_CANCEL_REASON_MAX_LENGTH}
          </Caption>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            닫기
          </Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? "취소 처리 중..." : "취소하기"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

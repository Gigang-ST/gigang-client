"use client";

import { useState } from "react";

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
import { GATHERING_CANCEL_REASON_MAX_LENGTH } from "@/lib/gathering/cancel-reason";
import { NOSHOW_DEFAULT_REASON } from "@/lib/gathering/noshow";

export type AttendanceRemoveMode = "cancel" | "noshow";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: AttendanceRemoveMode;
  memName: string;
  /** 「7/12(토) 정기런」 같은 한 줄 모임 표시. */
  gatheringLabel: string;
  /** 노쇼 모드에서 이 회원의 지금까지 노쇼 횟수 — 아직 모르면 null. */
  noshowCount: number | null;
  pending: boolean;
  onSubmit: (reason: string) => void;
};

/**
 * 관리자 모임 화면의 참석 빼기 모달 — **참석 취소**(사유 선택)와 **노쇼 처리**(사유 필수) 한 판.
 *
 * 예전엔 참석 취소 사유를 `window.prompt` 로 받았는데, 자동화 브라우저(Aside 등)에서는 prompt 가 뜨지 않아
 * 사유가 빈 값으로 넘어갔다(#759). 화면 안 입력 칸이면 사람도 자동화도 같은 길로 사유를 넣는다.
 * 사유 필수는 안내용 검증이고, 서버(`markGatheringNoshow`)가 다시 강제한다.
 */
export function AttendanceRemoveDialog({ open, onOpenChange, ...form }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => !form.pending && onOpenChange(v)}>
      <DialogContent>
        {/* DialogContent 는 닫히면 언마운트되므로 폼 상태(사유)는 열 때마다 기본값으로 시작한다 */}
        <RemoveForm {...form} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function RemoveForm({
  mode,
  memName,
  gatheringLabel,
  noshowCount,
  pending,
  onSubmit,
  onClose,
}: Omit<Props, "open" | "onOpenChange"> & { onClose: () => void }) {
  const isNoshow = mode === "noshow";
  // 노쇼는 "노쇼"를 미리 채워 두고, 취소는 비워 둔다.
  const [reason, setReason] = useState(isNoshow ? NOSHOW_DEFAULT_REASON : "");

  const trimmed = reason.trim();
  const canSubmit = !pending && (!isNoshow || trimmed.length > 0);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isNoshow ? "노쇼 처리" : "참석 취소"}</DialogTitle>
        <DialogDescription>
          {memName}님을 {gatheringLabel} 참석에서 뺍니다.
          {isNoshow
            ? " 참석에서 빠지고 노쇼로 기록돼요. 알림은 가지 않아요."
            : " 취소 사유는 팀 멤버에게 공개돼요."}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-2">
        <label htmlFor="attendance-remove-reason">
          <Caption className="text-foreground">{isNoshow ? "사유 (필수)" : "취소 사유 (선택)"}</Caption>
        </label>
        <Textarea
          id="attendance-remove-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={GATHERING_CANCEL_REASON_MAX_LENGTH}
          rows={3}
          placeholder={isNoshow ? NOSHOW_DEFAULT_REASON : "사유를 남길 수 있어요"}
        />
        {isNoshow && noshowCount !== null && (
          <Caption>
            지금까지 노쇼 {noshowCount}회 · 이번 처리로 {noshowCount + 1}회가 돼요.
          </Caption>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          닫기
        </Button>
        <Button
          variant={isNoshow ? "destructive" : "default"}
          onClick={() => onSubmit(trimmed)}
          disabled={!canSubmit}
        >
          {isNoshow ? "노쇼 처리" : "참석 취소"}
        </Button>
      </DialogFooter>
    </>
  );
}

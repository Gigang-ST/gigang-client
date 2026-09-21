"use client";

import { dayjs } from "@/lib/dayjs";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Caption, Body } from "@/components/common/typography";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gthrNm: string;
  locTxt: string;
  /** datetime-local 문자열(YYYY-MM-DDTHH:mm) — 폼 입력 필드와 같은 표기로 그대로 포맷 */
  sttAt: string;
  onConfirm: () => void;
  submitting: boolean;
  confirmLabel: string;
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <Caption>{label}</Caption>
      <Body className="font-semibold">{value}</Body>
    </div>
  );
}

/**
 * 대충 올리는 사람들 때문에 도입 — 제출 직전 제목·장소·시간을 한 번 더 보여주고
 * 확정 여부를 되묻는다. 두 모임 등록 폼(페이지·다이얼로그)이 함께 쓴다.
 */
export function GatheringConfirmDialog({
  open,
  onOpenChange,
  gthrNm,
  locTxt,
  sttAt,
  onConfirm,
  submitting,
  confirmLabel,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) onOpenChange(v); }}>
      <DialogContent className="flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pb-3 pt-5">
          <DialogTitle>등록 전 확인해 주세요</DialogTitle>
        </DialogHeader>

        <Separator />

        <div className="flex flex-col gap-4 px-5 py-4">
          <p className="text-[13px] text-muted-foreground">
            다른 멤버들에게 정확한 시간과 장소를 안내할 수 있도록 다시 한번 확인해 주세요.
          </p>
          <div className="flex flex-col gap-3 rounded-md border border-border p-3">
            <Row label="제목" value={gthrNm} />
            <Row label="시작일시" value={sttAt ? dayjs(sttAt).format("YYYY-MM-DD(ddd) HH:mm") : ""} />
            <Row label="장소" value={locTxt} />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 pb-5">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            다시 확인할게요
          </Button>
          <Button type="button" onClick={onConfirm} disabled={submitting}>
            {submitting ? "처리 중..." : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

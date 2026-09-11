"use client";

import { waitConfirmCopy } from "@/lib/gathering/waitlist";
import { cn } from "@/lib/utils";

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

/**
 * 본문만 따로 떼어 둔다.
 *
 * Radix 다이얼로그 껍데기는 `<body>`로 포털돼 renderToStaticMarkup 으로 찍히지 않는데,
 * 정작 회귀로 못박아야 하는 건 **문구와 강조 위치**다. 이 컴포넌트가 그 표면이다.
 */
export function WaitConfirmBody({ openToAll }: { openToAll: boolean }) {
  const { lines } = waitConfirmCopy(openToAll);

  return (
    <ul className="flex flex-col gap-2">
      {lines.map((line, i) => (
        <li key={line} className="flex gap-1.5">
          <Caption aria-hidden className="shrink-0">
            ·
          </Caption>
          {/* 둘째 줄이 경고다(waitConfirmCopy 의 계약) — 네 줄이 같은 무게면 아무것도 안 읽힌다. */}
          <Caption className={cn("text-foreground", i === 1 && "font-semibold")}>{line}</Caption>
        </li>
      ))}
    </ul>
  );
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 시작 2시간 전부터인가 — 대기(순번)인지 빈 자리 알림 요청인지가 갈린다 */
  openToAll: boolean;
  /** 확인 — 실제 등록은 호출부의 기존 낙관적 토글이 그대로 맡는다 */
  onConfirm: () => void;
};

/**
 * 대기 신청(또는 빈 자리 알림 요청) 확인 모달.
 *
 * **누르기 전에** 무슨 일이 일어나는지 알리는 것이 이 모달의 전부다 — 자리가 나면
 * 자동으로 참석자가 되는데, 그건 되돌리기 번거로운 일이라(임박 취소는 사유가 필수다)
 * 사후 토스트로는 늦다. 설계 §4-2.
 *
 * 자리가 있어 바로 참석하는 경로에는 띄우지 않는다 — 확인할 것이 없고 1탭이 유지돼야 한다.
 */
export function WaitConfirmDialog({ open, onOpenChange, openToAll, onConfirm }: Props) {
  const { title, confirmLabel } = waitConfirmCopy(openToAll);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {/* 본문이 목록이라 DialogDescription 안에 넣으면 <p> 안의 <ul> 이 된다.
              설명은 스크린리더용 한 줄로 두고 목록은 밖에 세운다. */}
          <DialogDescription className="sr-only">
            신청 후 어떻게 되는지 안내합니다.
          </DialogDescription>
        </DialogHeader>

        <WaitConfirmBody openToAll={openToAll} />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useEffect, useState } from "react";

import { AlertCircle, Check } from "lucide-react";

import { getMyInactiveReason } from "@/app/actions/member/get-inactive-reason";

import { useReactivationRequest } from "@/lib/hooks/use-reactivation-request";

import { InactiveReasonNote } from "@/components/common/inactive-reason-note";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// 비활성/탈퇴 회원이 크루 참여를 시도할 때 뜨는 공통 안내 팝업.
//
// 참여 지점(모임·대회·기록·프로젝트·댓글) 어디서든 이 하나를 열어 같은 모양·문구를 쓴다.
// "관리자에게 문의하기" → requestReactivation → 관리자 알림(하루 1회). 문의 후엔 성공
// 상태로 전환해 눌렀는지 헷갈리지 않게 한다.
//
// 열릴 때 본인 비활성 사유(getMyInactiveReason)를 한 번 물어 안내문 아래 붙인다 — "왜 막혔는지"를
// 모른 채 문의만 보내면 관리자가 같은 답을 매번 되풀이한다. 탈퇴 사유는 돌려주지 않는다(액션 주석 참조).
// ---------------------------------------------------------------------------

/** left 도 클라이언트에선 inactive 로 뭉쳐 오지만, 서버가 실제 상태를 알므로 문구만 분기 */
type InactiveKind = "inactive" | "left";

const COPY: Record<InactiveKind, { title: string; desc: string }> = {
  inactive: {
    title: "지금은 활동할 수 없어요",
    desc: "회원님은 현재 비활성 상태예요. 다시 활동하려면 관리자 승인이 필요해요.",
  },
  left: {
    title: "탈퇴한 상태예요",
    desc: "회원님은 현재 탈퇴 처리된 상태예요. 다시 활동하려면 관리자 승인이 필요해요.",
  },
};

export function InactiveGateDialog({
  open,
  onOpenChange,
  kind = "inactive",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind?: InactiveKind;
}) {
  // 문의 동작은 프로필탭 차단 화면과 공유한다 — 그림은 달라도 동작은 같아야 한다.
  const { sending, sent, error, request, reset } = useReactivationRequest();
  const [reason, setReason] = useState<string | null>(null);

  const copy = COPY[kind];

  // 열릴 때마다 다시 묻고, **닫히면 버린다.**
  //
  // 값을 들고 있으면 노출 규칙(`getVisibleInactiveReason`)보다 오래 사는 캐시가 된다 — 이 컴포넌트는
  // 페이지 트리에 `open={false}`로 계속 떠 있어서, 한 번 받은 사유가 세션 내내 남는다. 그 사이
  // 관리자가 사유를 지우거나 재활성화해도 다음에 열면 없어진 사유가 먼저 뜬다(잠시 뒤 사라진다).
  // 사유가 뒤늦게 들어오며 버튼을 한 번 미는 건 감수한다 — 여는 순간 손가락은 아직 방아쇠 쪽에 있다.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getMyInactiveReason()
      .then((res) => {
        if (!cancelled) setReason(res.reason);
      })
      // 사유는 곁들이는 정보라 실패해도 안내 자체는 서야 한다(비로그인이면 액션이 throw한다).
      .catch(() => {});
    return () => {
      cancelled = true;
      setReason(null);
    };
  }, [open]);

  // 닫힐 때 상태 초기화 — 다시 열면 처음 화면부터
  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="sr-only">{copy.title}</DialogTitle>
        </DialogHeader>

        {sent ? (
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-success/10">
              <Check className="size-6 text-success" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-base font-bold text-foreground">문의를 보냈어요</p>
              <p className="text-[13px] text-muted-foreground">
                관리자가 확인하면 다시 활동할 수 있어요.
              </p>
            </div>
            <Button
              variant="ghost"
              className="mt-1 w-full text-muted-foreground"
              onClick={() => handleOpenChange(false)}
            >
              닫기
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-warning/10">
              <AlertCircle className="size-6 text-warning" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-base font-bold text-foreground">{copy.title}</p>
              <p className="text-[13px] leading-relaxed text-muted-foreground">{copy.desc}</p>
            </div>

            <InactiveReasonNote reason={reason} />

            {error && <p className="text-[13px] font-medium text-warning">{error}</p>}

            <div className="mt-1 flex w-full flex-col gap-2">
              <Button className="w-full" onClick={request} disabled={sending}>
                {sending ? "보내는 중..." : "관리자에게 문의하기"}
              </Button>
              <Button
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={() => handleOpenChange(false)}
              >
                닫기
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

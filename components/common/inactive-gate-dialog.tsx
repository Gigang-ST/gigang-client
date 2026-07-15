"use client";

import { useState } from "react";

import { AlertCircle, Check } from "lucide-react";

import { requestReactivation } from "@/app/actions/member/request-reactivation";

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
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = COPY[kind];

  const handleRequest = async () => {
    setSending(true);
    setError(null);
    const res = await requestReactivation();
    if (res.ok) {
      setSent(true);
    } else {
      // "이미 문의를 보냈어요" 도 여기로 — 실패라기보다 이미 접수된 상태 안내
      setError(res.message);
    }
    setSending(false);
  };

  // 닫힐 때 상태 초기화 — 다시 열면 처음 화면부터
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSent(false);
      setError(null);
      setSending(false);
    }
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

            {error && <p className="text-[13px] font-medium text-warning">{error}</p>}

            <div className="mt-1 flex w-full flex-col gap-2">
              <Button className="w-full" onClick={handleRequest} disabled={sending}>
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

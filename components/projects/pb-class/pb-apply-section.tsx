"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { toast } from "sonner";

import { joinPbClass } from "@/app/actions/pb-class";
import { analytics } from "@/lib/analytics";
import { feesForJoinWeek, isLateJoin, requiredAttdCnt, type PbClassCfg } from "@/lib/pb-class";

import { InactiveGateDialog } from "@/components/common/inactive-gate-dialog";
import { SectionHeader } from "@/components/common/section-header";
import { Caption } from "@/components/common/typography";
import { AccountCopyButton } from "@/components/projects/account-copy-button";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import { formatWon } from "./format";

type PbApplySectionProps = {
  evtId: string;
  cfg: PbClassCfg;
  /** 서버가 잰 오늘(KST) 기준 프로젝트 주차 — 낼 금액이 이 값으로 갈린다 */
  currentWkNo: number;
  /** 비활성/탈퇴 회원 — true면 신청 시 공통 안내 게이트를 연다(마일리지런 신청과 같은 규칙) */
  isInactive?: boolean;
  inactiveKind?: "inactive" | "left";
};

/**
 * 참가 신청 — 지금 주차에 합류하면 얼마를 내는지 먼저 보여 주고 누르게 한다.
 *
 * 금액은 `feesForJoinWeek` 한 곳에서 낸다(서버 액션·관리자 표와 같은 함수). 다만 이 화면이
 * 보여 주는 건 "지금 눌렀을 때"의 값이라, 주 경계(수 00:00)를 넘겨 눌렀다면 서버가 다시 재서
 * 정한 금액이 이긴다 — 승인 대기 카드가 서버가 확정한 금액을 그대로 보여 준다.
 */
export function PbApplySection({
  evtId,
  cfg,
  currentWkNo,
  isInactive = false,
  inactiveKind,
}: PbApplySectionProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [inactiveGateOpen, setInactiveGateOpen] = useState(false);

  const { depositAmt, entryFeeAmt } = feesForJoinWeek(currentWkNo, cfg);
  const total = depositAmt + entryFeeAmt;
  const late = isLateJoin(currentWkNo, cfg);
  // 정식(W1)은 규칙 카드가 이미 말한다 — 중간 합류(W2~)만 "내 기준"이 달라지므로 따로 짚는다
  const required = currentWkNo >= 2 && !late ? requiredAttdCnt(currentWkNo, cfg) : null;

  function handleJoin() {
    if (isInactive) {
      setInactiveGateOpen(true);
      return;
    }
    analytics.projectJoinStarted(evtId);
    startTransition(async () => {
      try {
        const res = await joinPbClass(evtId);
        if (!res.ok) {
          toast.error(res.message ?? "신청하지 못했어요. 다시 시도해 주세요.");
          return;
        }
        analytics.projectJoinCompleted(evtId);
        toast.success(res.message ?? "신청했어요. 입금 확인 후 승인돼요.");
        router.refresh();
      } catch {
        toast.error("신청하지 못했어요. 다시 시도해 주세요.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader label="JOIN" />
      <CardItem className="flex flex-col gap-4 p-5">
        {late && (
          <Caption className="leading-relaxed text-foreground">
            지금 합류하면 보증금 없이 참가비 {formatWon(entryFeeAmt)} — 환급·팀전 대상이 아니에요.
          </Caption>
        )}
        {required !== null && (
          <Caption className="leading-relaxed text-foreground">
            W{currentWkNo} 합류라 {required}회 출석하면 보증금을 전액 돌려받아요.
          </Caption>
        )}

        <div className="flex flex-col gap-2 rounded-xl bg-muted p-4">
          <div className="flex justify-between">
            <Caption>보증금</Caption>
            <Caption className="text-foreground">{depositAmt.toLocaleString()}원</Caption>
          </div>
          <div className="flex justify-between">
            <Caption>참가비</Caption>
            <Caption className="text-foreground">{entryFeeAmt.toLocaleString()}원</Caption>
          </div>
          <div className="flex justify-between border-t border-border pt-2">
            <Caption className="font-semibold text-foreground">합계</Caption>
            <Caption className="font-semibold text-foreground">{total.toLocaleString()}원</Caption>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-xl bg-muted p-4 text-center">
          <Caption className="block font-semibold text-foreground">
            신청 후 모임 계좌로 입금해 주세요
          </Caption>
          <AccountCopyButton />
        </div>

        <Button
          onClick={handleJoin}
          disabled={pending}
          className="h-[52px] w-full rounded-xl text-base font-semibold"
        >
          {pending ? "신청 중..." : "참가 신청"}
        </Button>
      </CardItem>

      <InactiveGateDialog
        open={inactiveGateOpen}
        onOpenChange={setInactiveGateOpen}
        kind={inactiveKind}
      />
    </div>
  );
}

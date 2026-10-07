"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { toast } from "sonner";

import { joinPbClass } from "@/app/actions/pb-class";
import { analytics } from "@/lib/analytics";
import { feesForJoinWeek, isLateJoin, requiredAttdCnt, wkLabel, type PbClassCfg } from "@/lib/pb-class";

import { InactiveGateDialog } from "@/components/common/inactive-gate-dialog";
import { Body, Caption, Micro } from "@/components/common/typography";
import { AccountCopyButton } from "@/components/projects/account-copy-button";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import { formatWon } from "./format";
import { PbZone } from "./pb-zone";

type PbApplySectionProps = {
  evtId: string;
  cfg: PbClassCfg;
  /** 서버가 잰 오늘(KST) 기준 프로젝트 주차 — 낼 금액이 이 값으로 갈린다 */
  currentWkNo: number;
  /** 마일리지런 참가자인가 — 보증금 할인을 미리 보여 준다(확정은 서버 액션이 다시 판정) */
  mlgAlumni: boolean;
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
 *
 * 마일리지런 할인은 **원래 금액을 지운 줄 + 할인 사유**로 보여 준다. 깎인 금액만 적으면 다른 사람과
 * 금액이 달라 "내가 잘못 봤나"를 묻게 되고, 사유를 적어야 그게 혜택이라는 게 읽힌다.
 */
export function PbApplySection({
  evtId,
  cfg,
  currentWkNo,
  mlgAlumni,
  isInactive = false,
  inactiveKind,
}: PbApplySectionProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [inactiveGateOpen, setInactiveGateOpen] = useState(false);

  const { depositAmt, entryFeeAmt, depositDcAmt } = feesForJoinWeek(currentWkNo, cfg, { mlgAlumni });
  const total = depositAmt + entryFeeAmt;
  const late = isLateJoin(currentWkNo, cfg);
  const required = late ? null : requiredAttdCnt(currentWkNo, cfg);

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

  // 리드문 — 이 사람이 지금 들어오면 무엇이 달라지는가를 한 줄로
  const lead = late
    ? `${wkLabel(currentWkNo)} 합류 — 보증금 없이 참가비만 내요`
    : currentWkNo >= 2
      ? `${wkLabel(currentWkNo)} 합류 — ${required}회 나오면 보증금 전액`
      : `${required}회 나오면 보증금을 전액 돌려받아요`;

  return (
    <PbZone label="Join" lead={lead}>
      <CardItem className="flex flex-col gap-4 p-5">
        <div className="flex flex-col rounded-xl bg-muted px-4 py-1">
          {!late && (
            <div className="rule-row flex items-start justify-between gap-3 py-3">
              <span className="flex flex-col gap-0.5">
                <Caption className="font-medium text-foreground">보증금</Caption>
                {depositDcAmt > 0 && (
                  <Micro className="font-semibold text-primary">
                    마일리지런 참가자 보증금 −{depositDcAmt.toLocaleString()}원
                  </Micro>
                )}
              </span>
              {/* 정가(취소선)와 할인가는 한 덩어리로 — 375px에서 "원"만 다음 줄로 떨어지던 것 */}
              <span className="flex shrink-0 items-baseline gap-1.5 whitespace-nowrap tabular-nums">
                {depositDcAmt > 0 && (
                  <Micro className="line-through">{(depositAmt + depositDcAmt).toLocaleString()}원</Micro>
                )}
                <Body>{depositAmt.toLocaleString()}원</Body>
              </span>
            </div>
          )}
          <div className="rule-row flex items-baseline justify-between gap-3 py-3">
            <Caption className="font-medium text-foreground">참가비</Caption>
            <Body className="tabular-nums">{entryFeeAmt.toLocaleString()}원</Body>
          </div>
          <div className="flex items-baseline justify-between gap-3 py-3">
            <Caption className="font-semibold text-foreground">합계</Caption>
            <span className="font-numeric text-2xl font-medium tabular-nums text-foreground">
              {total.toLocaleString()}
              <span className="ml-0.5 text-base text-muted-foreground">원</span>
            </span>
          </div>
        </div>

        {late && (
          <Caption className="break-keep leading-relaxed">
            {formatWon(entryFeeAmt)}만 내고 함께 훈련해요. 환급·팀전 대상은 아니에요.
          </Caption>
        )}

        <div className="flex flex-col gap-3 rounded-xl bg-muted p-4 text-center">
          <Caption className="block font-semibold text-foreground">신청 후 모임 계좌로 입금해 주세요</Caption>
          <AccountCopyButton />
        </div>

        <Button onClick={handleJoin} disabled={pending} className="h-[52px] w-full rounded-xl text-base font-semibold">
          {pending ? "신청 중..." : `${total.toLocaleString()}원으로 참가 신청`}
        </Button>
      </CardItem>

      <InactiveGateDialog open={inactiveGateOpen} onOpenChange={setInactiveGateOpen} kind={inactiveKind} />
    </PbZone>
  );
}

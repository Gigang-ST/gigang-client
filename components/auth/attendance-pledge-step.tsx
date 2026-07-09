"use client";

import { useState } from "react";

import { Users } from "lucide-react";

import { dayjs } from "@/lib/dayjs";
import type { PledgeGathering } from "@/lib/queries/onboarding-gatherings";

import { Body, Caption, H2 } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";

type AttendancePledgeStepProps = {
  gatherings: PledgeGathering[];
  onComplete: (pledgeGthrId: string | null) => void | Promise<void>;
  submitting: boolean;
};

/**
 * 6단계: 참석 약속.
 * 화면 A(안내) → 화면 B(모임 목록에서 행별 참석 신청 / 빈 상태)로 내부 전환.
 */
export function AttendancePledgeStep({
  gatherings,
  onComplete,
  submitting,
}: AttendancePledgeStepProps) {
  const [screen, setScreen] = useState<"intro" | "select">("intro");

  if (screen === "intro") {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-3xl">
          🏃
        </div>
        <div className="flex flex-col gap-2">
          <H2>
            가입 후 한 달 안에
            <br />
            모임에 한번 나와주세요!
          </H2>
          <Body className="text-muted-foreground">
            정기런(격주 수요일)을 추천해요. <br/>처음엔 다들 어색하지만, 한 번
            나오면 달라져요.
          </Body>
        </div>
        <Button
          className="h-12 w-full text-base font-semibold"
          onClick={() => setScreen("select")}
        >
          네, 참석할게요!
        </Button>
      </div>
    );
  }

  // 화면 B: 모임 선택 — 열린 모임이 없으면 안내
  if (gatherings.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <CardItem variant="dashed" className="text-center">
          <Body className="text-muted-foreground">
            다음 정기런이 열리면 가장 먼저 알려드릴게요 🏃
            <br />
            정기런은{" "}
            <span className="font-semibold text-foreground">
              격주 수요일 저녁
            </span>
            에 열려요.
          </Body>
        </CardItem>
        <Button
          className="h-12 w-full text-base font-semibold"
          disabled={submitting}
          onClick={() => onComplete(null)}
        >
          {submitting ? "처리 중..." : "확인했어요, 꼭 참석할게요"}
        </Button>
      </div>
    );
  }

  // 모임 목록: 각 행에서 바로 참석 신청. 하단엔 "나중에 참석" 링크.
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 text-center">
        <H2>어떤 모임에 참석하실래요?</H2>
        <Caption>
          참석할 모임의 버튼을 눌러주세요.
          <br />
          맞는 일정이 없으면 나중에 참석해도 돼요.
        </Caption>
      </div>

      <div className="flex flex-col gap-2">
        {gatherings.map((g) => (
          <div
            key={g.gthrId}
            className="flex items-center justify-between gap-3 rounded-xl border-[1.5px] border-border px-4 py-3"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <Body className="truncate font-semibold">{g.gthrNm}</Body>
              <Caption>
                {dayjs(g.sttAt).format("M/D(ddd) HH:mm")}
                {g.locTxt ? ` · ${g.locTxt}` : ""}
              </Caption>
              <Caption className="flex items-center gap-1 text-primary">
                <Users className="size-3" />
                {g.maxPrtCnt !== null
                  ? `${g.attdCnt}/${g.maxPrtCnt}명 참석`
                  : `${g.attdCnt}명 참석`}
              </Caption>
            </div>
            <Button
              type="button"
              size="sm"
              className="shrink-0"
              disabled={submitting}
              onClick={() => onComplete(g.gthrId)}
            >
              참석
            </Button>
          </div>
        ))}
      </div>

      <button
        type="button"
        disabled={submitting}
        onClick={() => onComplete(null)}
        className="text-center text-sm text-muted-foreground underline underline-offset-2 disabled:opacity-50"
      >
        일정을 확인하고 나중에 꼭 참석할게요.
      </button>
    </div>
  );
}

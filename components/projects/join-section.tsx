"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { joinProject } from "@/app/actions/mileage-run";
import {
  countMonths,
  DEPOSIT_PER_MONTH,
  ENTRY_FEE,
  ENTRY_FEE_WITH_SINGLET,
} from "@/lib/mileage";
import { currentMonthKST } from "@/lib/dayjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardItem } from "@/components/ui/card";
import { Caption } from "@/components/common/typography";

type JoinSectionProps = {
  evtId: string;
  evtStartMonth: string; // "2026-05-01"
  evtEndMonth: string;   // "2026-09-01"
  existingPrt: {
    approve_yn: boolean;
  } | null;
};

type GoalPreset = "50" | "100" | "custom";

export function JoinSection({
  evtId,
  evtStartMonth,
  evtEndMonth,
  existingPrt,
}: JoinSectionProps) {
  const router = useRouter();
  const [goalPreset, setGoalPreset] = useState<GoalPreset>("50");
  const [customGoal, setCustomGoal] = useState("");
  const [hasSinglet, setHasSinglet] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 승인 대기 중
  if (existingPrt && !existingPrt.approve_yn) {
    return (
      <CardItem className="p-5 text-center">
        <Caption className="text-foreground font-semibold block mb-1">
          참여 신청 완료!
        </Caption>
        <Caption>운영진 승인을 기다려주세요.</Caption>
      </CardItem>
    );
  }

  // 이미 승인된 경우는 상위 컴포넌트에서 처리
  if (existingPrt) return null;

  const initGoal =
    goalPreset === "custom" ? parseInt(customGoal) || 0 : parseInt(goalPreset);

  // 보증금은 이벤트 시작월부터 계산 (연습기간 제외)
  const now = currentMonthKST();
  const depositStart = now < evtStartMonth ? evtStartMonth : now;
  const months = countMonths(depositStart, evtEndMonth);
  const depositTotal = months * DEPOSIT_PER_MONTH;
  const entryFee = hasSinglet ? ENTRY_FEE_WITH_SINGLET : ENTRY_FEE;
  const totalAmount = depositTotal + entryFee;

  async function handleJoin() {
    if (goalPreset === "custom") {
      const parsed = parseInt(customGoal);
      if (!parsed || parsed < 1) {
        alert("목표를 1 이상의 숫자로 입력해 주세요.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const result = await joinProject(evtId, initGoal, hasSinglet);
      if (!result.ok) {
        alert(result.message ?? "오류가 발생했습니다. 다시 시도해 주세요.");
      } else {
        router.refresh();
      }
    } catch {
      alert("오류가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CardItem className="p-5 space-y-5">
      {/* 목표 선택 */}
      <div className="space-y-3">
        <Label className="text-sm font-semibold">초기 목표 설정</Label>
        <div className="space-y-2">
          {(
            [
              { value: "50", label: "초보 — 50 km/월" },
              { value: "100", label: "고수 — 100 km/월" },
              { value: "custom", label: "자유 입력" },
            ] as { value: GoalPreset; label: string }[]
          ).map(({ value, label }) => (
            <label
              key={value}
              className="flex items-center gap-3 cursor-pointer"
            >
              <input
                type="radio"
                name="goal-preset"
                value={value}
                checked={goalPreset === value}
                onChange={() => setGoalPreset(value)}
                className="accent-primary"
              />
              <Caption className="text-foreground">{label}</Caption>
            </label>
          ))}
        </div>

        {goalPreset === "custom" && (
          <div className="flex items-center gap-2 pt-1">
            <Input
              type="number"
              min={1}
              placeholder="목표 마일리지"
              value={customGoal}
              onChange={(e) => setCustomGoal(e.target.value)}
              className="h-12 rounded-xl border-[1.5px] text-[15px]"
            />
            <Caption className="shrink-0">km/월</Caption>
          </div>
        )}
      </div>

      {/* 싱글렛 보유 여부 */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={hasSinglet}
          onChange={(e) => setHasSinglet(e.target.checked)}
          className="accent-primary w-4 h-4"
        />
        <Caption className="text-foreground">
          기강 싱글렛을 이미 보유하고 있어요
        </Caption>
      </label>

      {/* 보증금 계산 */}
      <div className="rounded-xl bg-muted p-4 space-y-2">
        <div className="flex justify-between">
          <Caption>월별 보증금 ({months}개월)</Caption>
          <Caption className="text-foreground">
            {depositTotal.toLocaleString()}원
          </Caption>
        </div>
        <div className="flex justify-between">
          <Caption>참가비{hasSinglet ? " (싱글렛 보유)" : ""}</Caption>
          <Caption className="text-foreground">
            {entryFee.toLocaleString()}원
          </Caption>
        </div>
        <div className="flex justify-between pt-2 border-t border-border">
          <Caption className="text-foreground font-semibold">합계</Caption>
          <Caption className="text-foreground font-semibold">
            {totalAmount.toLocaleString()}원
          </Caption>
        </div>
      </div>

      {/* 참여하기 버튼 */}
      <Button
        onClick={handleJoin}
        disabled={
          submitting || (goalPreset === "custom" && !customGoal)
        }
        className="h-[52px] w-full rounded-xl text-base font-semibold"
      >
        {submitting ? "신청 중..." : "참여하기"}
      </Button>
    </CardItem>
  );
}

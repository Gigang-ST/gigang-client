"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { joinProject } from "@/app/actions/mileage-run";

type Props = {
  project: { id: string; name: string; start_month: string; end_month: string };
  participation: { deposit_confirmed: boolean } | null;
};

/**
 * 프로젝트 start_month ~ end_month 사이의 개월 수 계산.
 * 중도 참여 시 현재 월부터 end_month까지의 잔여 개월 수를 반환.
 */
function calcRemainingMonths(startMonth: string, endMonth: string): number {
  const now = new Date();
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const currentYear = kst.getFullYear();
  const currentMonth = kst.getMonth() + 1; // 1-indexed
  const currentMonthStr = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;

  // 시작 기준: 프로젝트 시작월과 현재 월 중 더 늦은 쪽
  const effectiveStart = currentMonthStr > startMonth ? currentMonthStr : startMonth;

  const [sy, sm] = effectiveStart.split("-").map(Number);
  const [ey, em] = endMonth.split("-").map(Number);

  const months = (ey - sy) * 12 + (em - sm) + 1;
  return Math.max(months, 0);
}

export function JoinSection({ project, participation }: Props) {
  const [goal, setGoal] = useState<string>("50");
  const [customGoal, setCustomGoal] = useState<string>("");
  const [singlet, setSinglet] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (participation && !participation.deposit_confirmed) {
    return (
      <div className="rounded-xl border p-6 text-center space-y-2">
        <p className="font-semibold">참여 신청 완료</p>
        <p className="text-sm text-muted-foreground">
          운영진이 보증금 입금을 확인하면 활성화됩니다.
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="rounded-xl border p-6 text-center space-y-2">
        <p className="font-semibold">신청 완료 🎉</p>
        <p className="text-sm text-muted-foreground">
          운영진이 입금 확인 후 승인합니다.
        </p>
      </div>
    );
  }

  const effectiveGoal =
    goal === "custom" ? parseInt(customGoal) || 0 : parseInt(goal);

  async function handleJoin() {
    if (goal === "custom") {
      const parsed = parseInt(customGoal);
      if (!parsed || parsed < 1) {
        setError("목표를 1 이상의 숫자로 입력해 주세요.");
        return;
      }
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await joinProject(project.id, effectiveGoal, singlet);
      if (result.error) {
        setError(result.error);
      } else {
        setDone(true);
      }
    } catch {
      setError("오류가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  const months = calcRemainingMonths(project.start_month, project.end_month);
  const depositAmount = months * 10000;
  const participationFee = singlet ? 10000 : 20000;
  const totalAmount = depositAmount + participationFee;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border p-6 space-y-4">
        <h2 className="font-semibold text-lg">참여 신청</h2>

        <div className="space-y-2">
          <Label>초기 목표 설정</Label>
          <Select value={goal} onValueChange={setGoal}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="50">초보 (50 km/월)</SelectItem>
              <SelectItem value="100">고수 (100 km/월)</SelectItem>
              <SelectItem value="custom">초고수 (자유 설정)</SelectItem>
            </SelectContent>
          </Select>
          {goal === "custom" && (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                placeholder="목표 마일리지"
                value={customGoal}
                onChange={(e) => setCustomGoal(e.target.value)}
                className="w-full"
              />
              <span className="shrink-0 text-sm text-muted-foreground">
                km/월
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="singlet"
            checked={singlet}
            onCheckedChange={(v) => setSinglet(!!v)}
          />
          <Label htmlFor="singlet" className="font-normal cursor-pointer">
            기강 싱글렛 보유 (보유 시 참가비 1만원 할인)
          </Label>
        </div>

        <div className="rounded-lg bg-muted/50 p-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <span>월별 보증금 ({months}개월)</span>
            <span>{depositAmount.toLocaleString()}원</span>
          </div>
          <div className="flex justify-between">
            <span>참가비{singlet ? " (싱글렛 할인)" : ""}</span>
            <span>{participationFee.toLocaleString()}원</span>
          </div>
          <div className="flex justify-between font-bold border-t pt-1 mt-1">
            <span>합계</span>
            <span>{totalAmount.toLocaleString()}원</span>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          className="w-full"
          onClick={handleJoin}
          disabled={submitting || (goal === "custom" && !customGoal)}
        >
          {submitting ? "신청 중..." : "참여하기"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        입금 계좌는 운영진에게 문의하세요. 보증금 확인 후 활성화됩니다.
      </p>
    </div>
  );
}

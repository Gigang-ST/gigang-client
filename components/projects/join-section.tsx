"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
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
  project: { id: string; name: string };
  participation: { deposit_confirmed: boolean } | null;
};

export function JoinSection({ project, participation }: Props) {
  const [goal, setGoal] = useState<string>("50");
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

  async function handleJoin() {
    setSubmitting(true);
    setError(null);
    try {
      const result = await joinProject(project.id, parseInt(goal), singlet);
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

  const months = 5; // 5~9월, TODO: 실제 프로젝트 기간에서 계산
  const depositAmount = months * 10000;
  const participationFee = 10000;
  const singletFee = singlet ? 0 : 10000;
  const totalAmount = depositAmount + participationFee + singletFee;

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
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            초고수는 운영진에게 문의하세요.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="singlet"
            checked={singlet}
            onCheckedChange={(v) => setSinglet(!!v)}
          />
          <Label htmlFor="singlet" className="font-normal cursor-pointer">
            싱글렛 보유 (미보유 시 1만원 추가)
          </Label>
        </div>

        <div className="rounded-lg bg-muted/50 p-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <span>월별 보증금 ({months}개월)</span>
            <span>{depositAmount.toLocaleString()}원</span>
          </div>
          <div className="flex justify-between">
            <span>참가비</span>
            <span>{participationFee.toLocaleString()}원</span>
          </div>
          {!singlet && (
            <div className="flex justify-between">
              <span>싱글렛비</span>
              <span>{singletFee.toLocaleString()}원</span>
            </div>
          )}
          <div className="flex justify-between font-bold border-t pt-1 mt-1">
            <span>합계</span>
            <span>{totalAmount.toLocaleString()}원</span>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button className="w-full" onClick={handleJoin} disabled={submitting}>
          {submitting ? "신청 중..." : "참여하기"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        입금 계좌는 운영진에게 문의하세요. 보증금 확인 후 활성화됩니다.
      </p>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { toast } from "sonner";

import { setMyPbGoal } from "@/app/actions/pb-class";
import { wkLabel } from "@/lib/pb-class";
import { formatSec, parseTimeInput } from "@/lib/pb-class-score";

import { StatCard } from "@/components/common/stat-card";
import { Caption } from "@/components/common/typography";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatLimit } from "./format";
import { PbZone } from "./pb-zone";

/**
 * 10K 10분 미만은 사람이 낼 수 있는 기록이 아니다(세계기록이 26분대).
 * "55"처럼 분을 쓰려다 초로 읽혀 55초 목표가 저장되는 오타만 막는 바닥값이라 규칙 설정이 아니다.
 * 상한(`goalMaxSec`)은 관리자 설정값이라 props 로 받는다.
 */
const GOAL_FLOOR_SEC = 600;

type PbGoalCardProps = {
  evtId: string;
  goalSec: number | null;
  /** 목표 상한(초) — `rule.goalMaxSec` */
  goalMaxSec: number;
  /** 마지막으로 고칠 수 있는 주차 — `rule.goalEditUntilWk` */
  editUntilWk: number;
  /** `canEditGoal(currentWkNo, rule)` — 판정은 서버·코어가 하고 여기는 보여 줄 뿐이다 */
  editable: boolean;
  /** 측정 10K가 목표 이내 — 정식 참가자도 늦은 합류자도 이 배지는 받는다 */
  achieved: boolean;
};

/**
 * 내 목표 기록 — 정해진 주차까지만 고칠 수 있고 그 뒤엔 확정된다.
 *
 * 늦은 합류자도 목표는 정할 수 있다(점수는 없지만 「목표 달성」 배지는 받는다).
 * 입력 검증은 안내용이다 — 상한·잠금은 서버 액션이 다시 판정한다.
 */
export function PbGoalCard({ evtId, goalSec, goalMaxSec, editUntilWk, editable, achieved }: PbGoalCardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  function openEdit() {
    setDraft(goalSec ? formatSec(goalSec) : "");
    setError(null);
    setEditing(true);
  }

  function save() {
    const raw = draft.trim();
    // 빈 입력은 "목표 지우기"다 — 목표를 정하지 않고 가는 선택도 있다
    let next: number | null = null;
    if (raw) {
      next = parseTimeInput(raw);
      if (next === null || next < GOAL_FLOOR_SEC) {
        setError("분:초 형식으로 입력해 주세요 (예: 55:00)");
        return;
      }
      if (next > goalMaxSec) {
        setError(`${formatLimit(goalMaxSec)} 이내로 정해 주세요`);
        return;
      }
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await setMyPbGoal(evtId, next);
        if (!res.ok) {
          setError(res.message ?? "저장하지 못했어요. 다시 시도해 주세요.");
          return;
        }
        toast.success(res.message ?? "목표를 저장했어요");
        setEditing(false);
        router.refresh();
      } catch {
        toast.error("저장하지 못했어요. 다시 시도해 주세요.");
      }
    });
  }

  return (
    <PbZone label="Goal" lead="측정일의 10K, 얼마에 끊을까요">
      <StatCard
        className="tabular-nums"
        label="10K 목표 기록"
        value={
          <span className="flex flex-wrap items-center gap-2">
            {goalSec ? (
              formatSec(goalSec)
            ) : (
              <span className="text-base font-medium text-muted-foreground">아직 정하지 않았어요</span>
            )}
            {achieved && (
              <Badge variant="outline" className="border-success/40 bg-success/10 text-success">
                목표 달성
              </Badge>
            )}
          </span>
        }
      />

      {editable && !editing && (
        <Button variant="outline" className="h-11 w-full rounded-xl" onClick={openEdit}>
          {goalSec ? "목표 고치기" : "목표 정하기"}
        </Button>
      )}

      {editable && editing && (
        <CardItem asChild className="flex flex-col gap-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <div className="flex gap-2">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="예) 55:00 또는 5500"
                aria-label="10K 목표 기록"
                aria-invalid={error !== null}
                autoComplete="off"
                autoFocus
                className="h-11 flex-1"
              />
              <Button type="submit" disabled={pending} className="h-11 rounded-xl px-5">
                {pending ? "저장 중" : "저장"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                className="h-11 rounded-xl px-3"
                onClick={() => setEditing(false)}
              >
                취소
              </Button>
            </div>
            {error && (
              <Caption role="alert" className="text-destructive">
                {error}
              </Caption>
            )}
          </form>
        </CardItem>
      )}

      <Caption className="leading-relaxed">
        {editable
          ? `${wkLabel(editUntilWk)}까지 고칠 수 있어요 · ${formatLimit(goalMaxSec)} 이내`
          : "목표가 확정됐어요"}
      </Caption>
    </PbZone>
  );
}

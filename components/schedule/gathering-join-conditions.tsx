import { Check, Lock } from "lucide-react";

import type { JoinCondition } from "@/lib/gathering/join-condition";
import { cn } from "@/lib/utils";

import { Caption, Micro } from "@/components/common/typography";

/**
 * 모임 참여조건 표시 — 서버 페이지와 다이얼로그가 함께 쓴다(클라이언트 전용 아님).
 *
 * `JoinConditionResult.conditions` 배열을 그대로 그린다. 조건이 늘어도(회원등급제 등)
 * 이 컴포넌트는 안 고친다 — 배열에 항목이 하나 더 들어올 뿐이다.
 */
export function GatheringJoinConditions({
  conditions,
  className,
}: {
  conditions: JoinCondition[];
  className?: string;
}) {
  if (conditions.length === 0) return null;

  return (
    <div className={cn("flex flex-col gap-2 rounded-xl bg-secondary/50 px-4 py-3", className)}>
      <Micro className="text-muted-foreground">참여 조건</Micro>
      {conditions.map((c) => (
        <div key={c.cd} className="flex items-start gap-2">
          {c.met ? (
            <Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
          ) : (
            <Lock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <Caption className={cn(c.met ? "text-foreground" : "text-muted-foreground")}>
            {c.label}
            {/* 현재 상태는 미달일 때 특히 필요하다 — 얼마나 남았는지 모르면 문의로 온다 */}
            {c.current && <span className="text-muted-foreground"> · {c.current}</span>}
          </Caption>
        </div>
      ))}
    </div>
  );
}

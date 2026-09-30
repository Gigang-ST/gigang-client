"use client";

import { HelpTip } from "@/components/common/help-tip";
import { StatCard } from "@/components/common/stat-card";
import { SectionLabel } from "@/components/common/typography";

// ---------------------------------------------------------------------------
// 참여 탭 — 모임 취소 요약
//
// 요약 카드 둘만 두고, 누르면 아래 회원별 명단이 그 조건으로 필터되며 취소 많은 순으로
// 정렬된다(참여 탭의 "사람 수가 적힌 건 탭하면 명단 필터" 규칙 그대로). 사유는 명단 행 →
// 회원 상세 시트의 취소 내역에서 본다 — 여기 목록을 따로 두면 같은 정보가 두 곳에 선다.
// 집계 기준(본인·운영진 취소 모두·직전=5시간 이내·기간=취소한 시각)은 lib/gathering/cancel-stats.ts.
// ---------------------------------------------------------------------------

const CLICKABLE = "cursor-pointer transition-transform active:scale-[0.98]";

export function CancelSection({
  periodLabel,
  cancelTotal,
  cancelMembers,
  imminentTotal,
  imminentMembers,
  onFilter,
}: {
  periodLabel: string;
  cancelTotal: number;
  cancelMembers: number;
  imminentTotal: number;
  imminentMembers: number;
  onFilter: (kind: "canceled" | "imminent") => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <SectionLabel>모임 취소</SectionLabel>
        <HelpTip title="모임 취소">
          본인이 취소한 것과 운영진이 대신 뺀 것(대개 불참 정리)을 모두 세요. 직전은 모임 시작 5시간 이내
          취소예요. 기간은 취소한 날 기준이에요. 카드를 누르면 아래 명단이 취소 많은 순으로
          걸러지고, 회원을 누르면 사유까지 보여요.
        </HelpTip>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          value={`${cancelTotal}건`}
          label={`${periodLabel} 취소 · ${cancelMembers}명`}
          className={CLICKABLE}
          onClick={() => onFilter("canceled")}
        />
        <StatCard
          value={`${imminentTotal}건`}
          label={`직전 취소(5시간 이내) · ${imminentMembers}명`}
          valueClassName={imminentTotal > 0 ? "text-destructive" : undefined}
          className={CLICKABLE}
          onClick={() => onFilter("imminent")}
        />
      </div>
    </div>
  );
}

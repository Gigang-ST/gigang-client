import { Check, Square } from "lucide-react";

import { dayjs } from "@/lib/dayjs";
import type { ExemptionResult } from "@/lib/dues/calc-exemption";
import { cn } from "@/lib/utils";

import { Body, Caption, Micro } from "@/components/common/typography";
import { CardItem } from "@/components/ui/card";

type Props = {
  /** 'YYYY-MM' 당월 */
  ym: string;
  /** get_member_monthly_activity(당월) → calcExemption 결과 */
  result: ExemptionResult;
  /** 최종 티어 참석 임계값(진행 바 만점 기준). 예: 8 */
  maxAttendCnt: number;
};

/**
 * 조건 행 — [체크 아이콘] 라벨 ... [우측 상태] + 하위 콘텐츠로 구조 통일.
 * ①②는 순차 단계가 아니라 "둘 다 충족해야 하는 독립 조건"이므로 대등하게 그린다(순서 없음).
 */
function ConditionRow({
  no,
  label,
  met,
  status,
  detail,
  children,
}: {
  no: "①" | "②";
  label: string;
  met: boolean;
  status: string;
  detail?: string;
  children?: React.ReactNode;
}) {
  const Icon = met ? Check : Square;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Icon className={cn("h-4 w-4 shrink-0", met ? "text-success" : "text-muted-foreground")} />
        <Caption className="text-foreground font-medium">
          {no} {label}
        </Caption>
        <Caption className={cn("ml-auto", met ? "text-success font-medium" : "text-muted-foreground")}>{status}</Caption>
      </div>
      {detail && <Micro className="text-muted-foreground pl-5">{detail}</Micro>}
      {children && <div className="pl-5">{children}</div>}
    </div>
  );
}

/**
 * 참여 회비 감면 퀘스트 카드 — 당월 실시간 진행도(설계 §7.1).
 * 면제 row 는 월 마감 배치 때 생기지만, 이 카드가 실시간 집계로 "달성 여부 + 예상 감면"을 즉시 보여준다.
 *
 * ①(정모 참석 또는 벙 개설)·②(참석 N회 이상)는 **둘 다 충족해야 하는 독립 조건(AND)**이다.
 * 어느 쪽을 먼저 채워도 되며(예: 3회 참석 후 벙 1개 개설 → 개설1·참석4 동시 충족), 선후 관계가 없다.
 * 그래서 ②를 게이트와 무관하게 참석 횟수만으로 표시하고, 잠금/선행 표현은 쓰지 않는다.
 */
export function DuesQuestCard({ ym, result, maxAttendCnt }: Props) {
  const { gatePassed, gateDetail, attendCnt, exmAmt, nextTier, tiers } = result;
  const monthLabel = dayjs(`${ym}-01`).format("M월");

  // ② 참석 조건: 첫 티어(최소 감면 기준) 이상이면 충족으로 본다.
  const minTier = tiers[0]?.attendCnt ?? maxAttendCnt;
  const tierMet = attendCnt >= minTier;
  const tierDone = !nextTier; // 최종 티어 도달(참석 기준)
  const progressRatio = Math.min(attendCnt / maxAttendCnt, 1);
  const attendStatus = attendCnt >= maxAttendCnt ? `${maxAttendCnt}회+` : `${attendCnt}/${maxAttendCnt}회`;

  return (
    <CardItem className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <Body className="font-semibold">이번 달 참여 감면</Body>
        <Caption className="text-muted-foreground">{monthLabel}</Caption>
      </div>

      {/* ① 정모 참여 또는 벙 개설 */}
      <ConditionRow
        no="①"
        label="정모 참여 또는 벙 개설"
        met={gatePassed}
        status={gatePassed ? "충족" : "미충족"}
        detail={
          gatePassed
            ? `정모 ${gateDetail.regularAttend} · 개설 ${gateDetail.hosted}`
            : "정모 1회 참여 또는 벙 1회 개설"
        }
      />

      {/* ② 참여 횟수 (게이트와 무관하게 진행도 표시 — 순서 없음) */}
      <ConditionRow no="②" label={`참여 ${minTier}회 이상`} met={tierMet} status={attendStatus}>
        <div className="mt-1 flex flex-col gap-1.5">
          {/* 진행 바 + 티어 지점 마커 */}
          <div className="relative h-2 w-full">
            <div className="bg-muted absolute inset-0 overflow-hidden rounded-full">
              <div
                className="bg-success h-full rounded-full transition-all"
                style={{ width: `${progressRatio * 100}%` }}
              />
            </div>
            {tiers.map((t) => (
              <span
                key={t.attendCnt}
                className={cn(
                  "absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2",
                  t.reached ? "border-success bg-success" : "border-muted-foreground/40 bg-background",
                )}
                style={{ left: `${Math.min((t.attendCnt / maxAttendCnt) * 100, 100)}%` }}
              />
            ))}
          </div>
          {/* 티어별 금액 라벨 (마커 위치에 정렬) */}
          <div className="relative h-7">
            {tiers.map((t) => {
              const pct = Math.min((t.attendCnt / maxAttendCnt) * 100, 100);
              // 양 끝 라벨이 카드 밖으로 넘치지 않도록 정렬 보정
              const align = pct >= 100 ? "-translate-x-full items-end" : pct <= 0 ? "translate-x-0 items-start" : "-translate-x-1/2 items-center";
              const labelColor = t.reached ? "text-success font-medium" : "text-muted-foreground";
              return (
                <div key={t.attendCnt} className={cn("absolute flex flex-col", align)} style={{ left: `${pct}%` }}>
                  <Micro className={labelColor}>{t.attendCnt}회</Micro>
                  <Micro className={labelColor}>{t.exmAmt.toLocaleString()}원</Micro>
                </div>
              );
            })}
          </div>
        </div>
      </ConditionRow>

      {/* 현재 감면액 + 안내 */}
      <div className="border-border flex items-center justify-between border-t pt-3">
        <Caption className="text-muted-foreground">현재 감면 (마감 후 반영)</Caption>
        <Body className={cn("font-bold", exmAmt > 0 ? "text-success" : "text-muted-foreground")}>
          {exmAmt.toLocaleString()}원
        </Body>
      </div>
      {/* 감면 0원인데 참석은 채운 경우 등 — 두 조건이 AND 임을 안내 */}
      {exmAmt === 0 && (
        <Micro className="text-muted-foreground -mt-1.5 text-right">①·② 두 조건을 모두 충족해야 감면이 적용돼요</Micro>
      )}
      {exmAmt > 0 && nextTier && (
        <Micro className="text-muted-foreground -mt-1.5 text-right">
          {nextTier.remaining}회 더 참여하면 {nextTier.exmAmt.toLocaleString()}원 감면
        </Micro>
      )}
      {exmAmt > 0 && tierDone && <Micro className="text-success -mt-1.5 text-right">최대 감면 달성! 🎉</Micro>}
    </CardItem>
  );
}

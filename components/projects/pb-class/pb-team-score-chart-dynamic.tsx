"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

import type { PbTeamScoreChartProps } from "./pb-team-score-chart";

/**
 * recharts 는 무겁다 — 크루 출석 그래프(`pb-crew-chart-dynamic.tsx`)처럼 클라이언트에서만, 필요할 때 불러온다.
 * 스켈레톤 높이 = 차트 높이(200). 범례는 서버가 위에 먼저 그려 두므로 여기 포함하지 않는다 — 그래프가
 * 들어설 때 아래 섹션이 밀리지 않는다.
 */
export const PbTeamScoreChartDynamic = dynamic<PbTeamScoreChartProps>(
  () => import("./pb-team-score-chart").then((m) => m.PbTeamScoreChart),
  { loading: () => <Skeleton className="h-[200px] w-full rounded-2xl" />, ssr: false },
);

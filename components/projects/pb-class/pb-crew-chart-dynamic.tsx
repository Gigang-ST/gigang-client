"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

import type { PbCrewChartProps } from "./pb-crew-chart";

/**
 * recharts 는 무겁다 — 마일리지 차트(`crew-progress-chart-dynamic.tsx`)처럼 클라이언트에서만, 필요할 때 불러온다.
 * 스켈레톤 높이 = 범례 한 줄(16) + 간격(8) + 차트(200). 그래프가 들어설 때 아래 줄이 밀리지 않게 맞춘다.
 */
export const PbCrewChartDynamic = dynamic<PbCrewChartProps>(
  () => import("./pb-crew-chart").then((m) => m.PbCrewChart),
  { loading: () => <Skeleton className="h-56 w-full rounded-2xl" />, ssr: false },
);

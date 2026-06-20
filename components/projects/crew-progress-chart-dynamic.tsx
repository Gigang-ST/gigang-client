"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

import type { CrewProgressChartProps } from "./crew-progress-chart";

export const CrewProgressChartDynamic = dynamic<CrewProgressChartProps>(
  () => import("./crew-progress-chart").then((m) => m.CrewProgressChart),
  { loading: () => <Skeleton className="h-64 w-full rounded-2xl" />, ssr: false },
);

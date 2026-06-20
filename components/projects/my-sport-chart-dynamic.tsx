"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

import type { SportChartData } from "./my-sport-chart";

type Props = { data: SportChartData[] };

export const MySportChartClientDynamic = dynamic<Props>(
  () => import("./my-sport-chart").then((m) => m.MySportChartClient),
  { loading: () => <Skeleton className="h-40 w-full rounded-2xl" />, ssr: false },
);

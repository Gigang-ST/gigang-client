"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

type Props = {
  records: {
    event_type: string;
    record_time_sec: number;
    race_name: string;
    race_date: string;
  }[];
};

export const PaceChartDynamic = dynamic<Props>(
  () => import("./pace-chart").then((m) => m.PaceChart),
  { loading: () => <Skeleton className="h-64 w-full rounded-2xl" />, ssr: false },
);

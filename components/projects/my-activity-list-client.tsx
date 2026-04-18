"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import { Body, Caption, Micro } from "@/components/common/typography";
import { MILEAGE_SPORT_LABELS, type MileageSport } from "@/lib/mileage";
import { ChevronRight } from "lucide-react";

export type ActivityRecord = {
  act_id: string;
  act_dt: string;
  sport_cd: string;
  distance_km: number;
  elevation_m: number;
  base_mlg: number;
  applied_mults: { mult_id: string; mult_nm: string; mult_val: number }[];
  final_mlg: number;
  review: string | null;
};

type Props = {
  initialRecords: ActivityRecord[];
  evtId: string;
  memId: string;
  month: string;
  totalCount: number;
};

export function MyActivityListClient({
  initialRecords,
  totalCount,
}: Props) {
  if (initialRecords.length === 0) {
    return (
      <Caption className="py-4 text-center block">
        이번 달 기록이 없습니다.
      </Caption>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Caption className="font-semibold text-foreground">내 기록</Caption>
        <Caption>{totalCount}건</Caption>
      </div>

      <ul className="flex flex-col gap-2">
        {initialRecords.map((record) => (
          <li key={record.act_id}>
            <CardItem className="flex items-center justify-between gap-3 py-3">
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  <Caption className="text-foreground">{record.act_dt}</Caption>
                  <Badge variant="secondary" className="text-[11px]">
                    {MILEAGE_SPORT_LABELS[record.sport_cd as MileageSport] ?? record.sport_cd}
                  </Badge>
                </div>
                {record.review && (
                  <Micro className="italic truncate">&ldquo;{record.review}&rdquo;</Micro>
                )}
              </div>
              <div className="flex flex-col items-end shrink-0">
                <Body className="font-semibold">{record.final_mlg.toFixed(1)}</Body>
                <Caption>{record.distance_km.toFixed(1)} km</Caption>
              </div>
            </CardItem>
          </li>
        ))}
      </ul>

      <Button variant="outline" asChild className="w-full rounded-xl gap-1">
        <Link href="/projects/records">
          전체 기록 보기
          <ChevronRight className="size-4" />
        </Link>
      </Button>
    </div>
  );
}

"use client";

import { useState } from "react";

import type { PbCrewAttd } from "@/lib/pb-class-chart";

import { SegmentControl } from "@/components/common/segment-control";
import { PbCrewChartDynamic } from "./pb-crew-chart-dynamic";
import { PbCrewTable } from "./pb-crew-table";

type View = "chart" | "table";

const SEGMENTS: { value: View; label: string }[] = [
  { value: "chart", label: "누적 출석" },
  { value: "table", label: "출석표" },
];

/**
 * 그래프 ↔ 출석표 전환 — 마일리지 차트의 「마일리지 · 달성률 · 전체 통계」와 같은 자리의 세그먼트.
 *
 * 기본은 그래프다(흐름과 내 위치를 먼저). 이름으로 「누가 나왔나」를 찾을 때 출석표로 넘긴다.
 * 선택은 URL 에 싣지 않는다: 이 화면은 `?view=` 로 탭을 서버가 고르는데, 거기 섞으면 탭 링크가
 * 이 값까지 옮겨 다닌다. 리마운트될 일도 없어(마일리지 차트는 월 이동마다 리마운트) state 로 충분하다.
 * 출석표는 서버에서 미리 그려 보내지 않고 같은 데이터로 여기서 그린다 — 40명 × 13칸 마크업을
 * 안 볼 수도 있는데 RSC 로 실어 보내는 것보다 몇 KB 짜리 데이터 한 벌이 가볍다.
 */
export function PbCrewViews({ crew }: { crew: PbCrewAttd }) {
  const [view, setView] = useState<View>("chart");
  return (
    <>
      <SegmentControl segments={SEGMENTS} value={view} onValueChange={setView} />
      {view === "chart" ? <PbCrewChartDynamic crew={crew} /> : <PbCrewTable crew={crew} />}
    </>
  );
}

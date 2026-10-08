"use client";

import { useState, type ReactNode } from "react";

import { SegmentControl } from "@/components/common/segment-control";

type View = "crew" | "team";

const SEGMENTS: { value: View; label: string }[] = [
  { value: "crew", label: "누적 출석" },
  { value: "team", label: "팀 점수" },
];

/**
 * 누적 출석 ↔ 팀 점수 전환 — 마일리지 차트의 「마일리지 · 달성률 · 전체 통계」와 같은 자리의 세그먼트.
 *
 * 두 면은 서버가 그려 슬롯으로 넘긴다(누적 출석은 전원 보드 조회라 Suspense 로 흘러온다). 여기는 어느 쪽을
 * 붙일지만 고른다 — 데이터를 클라이언트에서 다시 만들지 않는다.
 * 기본은 누적 출석(오너 2026-10-08: 「누적출석하고 팀점수그래프 위치하게」 — 순서도 그대로).
 * 선택은 URL 에 싣지 않는다: 이 화면은 `?view=` 로 탭을 서버가 고르는데, 거기 섞으면 탭 링크가 이 값까지
 * 옮겨 다닌다. 고를 때마다 그 면만 붙어 그래프가 처음부터 그려진다(팀 선이 왼쪽에서 달려 나오는 게 이 면의 첫인상이다).
 */
export function PbFlowViews({ crew, team }: { crew: ReactNode; team: ReactNode }) {
  const [view, setView] = useState<View>("crew");
  return (
    <>
      <SegmentControl segments={SEGMENTS} value={view} onValueChange={setView} />
      {view === "crew" ? crew : team}
    </>
  );
}

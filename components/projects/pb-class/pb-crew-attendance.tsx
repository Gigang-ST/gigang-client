import { buildPbCrewAttd, crewGlance, type PbCrewGlance } from "@/lib/pb-class-chart";
import type { PbClassBoard } from "@/lib/queries/pb-class";

import { EmptyState } from "@/components/common/empty-state";
import { Body } from "@/components/common/typography";
import { Skeleton } from "@/components/ui/skeleton";
import { PbCrewChartDynamic } from "./pb-crew-chart-dynamic";

/** 그래프 위 한 줄 — 크루가 지금 어떤지를 먼저 말한다. 숫자만 진하게 */
function Glance({ g }: { g: PbCrewGlance }) {
  const num = "font-semibold tabular-nums text-foreground";
  return (
    <Body className="break-keep text-muted-foreground">
      {g.label}엔{" "}
      {g.all ? (
        <>
          <span className={num}>{g.eligibleCnt}명</span> 모두 나왔어요
        </>
      ) : g.attdCnt === 0 ? (
        <>아무도 못 나왔어요</>
      ) : (
        <>
          {g.eligibleCnt}명 중 <span className={num}>{g.attdCnt}명</span>이 나왔어요
        </>
      )}
      {g.fullCnt > 0 && (
        <>
          {" · "}전액 확보 <span className={num}>{g.fullCnt}명</span>
        </>
      )}
    </Body>
  );
}

/**
 * 크루 누적 출석 — 점수판 맨 아래 「Week by Week」 칸의 「누적 출석」 면(`PbFlowZone`).
 *
 * 마일리지런의 크루 진행 차트와 같은 자리다(「개인별 참여도를 보는 그래프」 — 오너 요청).
 * 예전엔 출석표(이름 × 회차)도 옆 세그먼트에 있었는데 오너가 걷었다(2026-10-08 —
 * 「출석표는 빼버리고 그 자리에 팀 점수 그래프 넣어」). 이 그래프는 이름을 늘어놓지 않는다.
 *
 * **승인된 참가자에게만**: 남의 출석 흐름이 실리므로 점수판(`PbScoreboard`)이 `me`가 있을 때만 이 면을 넘긴다.
 * 입금 대기자는 아직 참가자가 아니라 선에서 뺀다(`buildPbCrewAttd`).
 * 계산은 전부 `lib/pb-class-chart.ts`(순수·테스트됨)가 하고 여기선 그 결과를 넘기기만 한다.
 */
export function PbCrewAttendance({ board, myMemId }: { board: PbClassBoard; myMemId: string }) {
  const crew = buildPbCrewAttd({
    sessions: board.sessions,
    participants: board.participants,
    cfg: board.cfg,
    myMemId,
  });
  const glance = crewGlance(crew);
  if (crew.heldCnt === 0 || !glance) return <PbCrewEmpty />;

  return (
    <>
      <Glance g={glance} />
      <PbCrewChartDynamic crew={crew} />
    </>
  );
}

/** 첫 공식훈련 전 — 그릴 선이 없다. 보드 조회 없이 바로 선다(열린 회차가 없으면 부를 이유가 없다) */
export function PbCrewEmpty() {
  return <EmptyState variant="card" message="첫 공식훈련이 끝나면 그려져요" />;
}

/** 보드 조회가 흔들렸을 때 — 세그먼트 아래가 빈칸이면 고장 난 화면처럼 보인다. 정산은 돈이라 실패를 그대로 올린다 */
export function PbCrewFailed() {
  return <EmptyState variant="card" message="출석 기록을 불러오지 못했어요" />;
}

/** 스트리밍 폴백 — 한 줄 요약(22) · 범례+차트(224)를 같은 높이로 잡아 세그먼트 아래가 튀지 않게 */
export function PbCrewSkeleton() {
  return (
    <>
      <Skeleton className="h-[22px] w-56" />
      <Skeleton className="h-56 w-full rounded-2xl" />
    </>
  );
}

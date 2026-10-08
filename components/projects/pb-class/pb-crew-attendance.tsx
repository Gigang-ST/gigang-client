import type { ReactNode } from "react";

import { buildPbCrewAttd, crewGlance, type PbCrewGlance } from "@/lib/pb-class-chart";
import type { PbClassBoard } from "@/lib/queries/pb-class";

import { EmptyState } from "@/components/common/empty-state";
import { HelpTip } from "@/components/common/help-tip";
import { Body } from "@/components/common/typography";
import { Skeleton } from "@/components/ui/skeleton";
import { PbCrewViews } from "./pb-crew-views";
import { PbZone } from "./pb-zone";

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
 * 크루 출석 — 승인된 참가자 전원의 회차별 출석을 그래프(누적)와 출석표(이름 × 회차)로.
 *
 * 마일리지런의 크루 진행 차트와 같은 자리다(「개인별 참여도를 보는 그래프」 — 오너 요청).
 * **승인된 참가자에게만**: 점수판 탭에 서지만(오너 2026-10-08 — 내 현황에서 옮겼다) 점수판은 구경꾼도 연다.
 * 남의 출석을 이름과 함께 싣기 때문에 점수판(`PbScoreboard`)이 `me`(승인된 참가자)가 있을 때만 이 섹션을 그린다.
 * 입금 대기자는 아직 참가자가 아니라 행에서 뺀다(`buildPbCrewAttd`).
 *
 * 계산은 전부 `lib/pb-class-chart.ts`(순수·테스트됨)가 하고 여기선 그 결과를 넘기기만 한다.
 * 첫 공식훈련이 열리기 전엔 그릴 선이 없어 빈 상태가 선다.
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
    <PbCrewZone>
      <Glance g={glance} />
      <PbCrewViews crew={crew} />
    </PbCrewZone>
  );
}

/** 섹션 머리 — 본문·빈 상태·스켈레톤이 같은 머리를 쓴다(스트리밍 중에도 머리는 자리를 지킨다) */
function PbCrewZone({ children }: { children: ReactNode }) {
  return (
    <PbZone
      label="Crew"
      lead="같이 나온 기록"
      action={
        <HelpTip title="크루 출석">
          공식훈련·측정에 나온 횟수를 회차마다 쌓았어요. 합류 전 회차는 세지 않고, 취소된 회차는 누구의
          출석에도 들어가지 않아요.
        </HelpTip>
      }
    >
      {children}
    </PbZone>
  );
}

/** 첫 공식훈련 전 — 그릴 선이 없다. 보드 조회 없이 바로 선다(열린 회차가 없으면 부를 이유가 없다) */
export function PbCrewEmpty() {
  return (
    <PbCrewZone>
      <EmptyState variant="card" message="첫 공식훈련이 끝나면 그려져요" />
    </PbCrewZone>
  );
}

/** 스트리밍 폴백 — 한 줄 요약(22) · 세그먼트(42) · 범례+차트(224)를 같은 높이로 잡아 아래 섹션이 밀리지 않게 */
export function PbCrewSkeleton() {
  return (
    <PbCrewZone>
      <Skeleton className="h-[22px] w-56" />
      <Skeleton className="h-[42px] w-full rounded-xl" />
      <Skeleton className="h-56 w-full rounded-2xl" />
    </PbCrewZone>
  );
}

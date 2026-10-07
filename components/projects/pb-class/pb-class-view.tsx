import { Suspense } from "react";

import { nowKST } from "@/lib/dayjs";
import { canEditGoal, goalEditLastWk } from "@/lib/pb-class-score";
import { loadMyPbClass, loadPbClassBoard, type MyPbClass } from "@/lib/queries/pb-class";
import { loadPbGame, type PbGame } from "@/lib/queries/pb-class-game";
import { getCurrentMember } from "@/lib/queries/member";

import { EmptyState } from "@/components/common/empty-state";
import { Caption, H2 } from "@/components/common/typography";
import { Skeleton } from "@/components/ui/skeleton";

import { formatPeriod } from "./format";
import { PbApplySection } from "./pb-apply-section";
import { PbGoalCard } from "./pb-goal-card";
import { PbGuide } from "./pb-guide";
import { PbHero, pbPhaseOf } from "./pb-hero";
import { PbMyStatus } from "./pb-my-status";
import { PbMyTeam } from "./pb-my-team";
import { PbPendingCard } from "./pb-pending-card";
import { PbRecordsCard } from "./pb-records-card";
import { PbScoreboard } from "./pb-scoreboard";
import { PbSessionStrip } from "./pb-session-strip";
import { PbSettlement } from "./pb-settlement";
import { PbTraining } from "./pb-training";
import { PbViewTabs, pbGuideTop, resolvePbView } from "./pb-view-tabs";

/**
 * 게임(팀·목표·기록·점수) 조회 — 실패해도 출석·환급 화면은 서야 한다.
 *
 * 돈이 걸린 건 `loadMyPbClass` 쪽이고 게임 층은 그 위에 얹힌 보조 정보다. 점수판 조회 하나가
 * 흔들렸다고 보증금 환급 현황까지 에러 화면으로 막으면 사람 입장에선 더 큰 사고다.
 * 대신 조용히 삼키지 않고 로그를 남긴다.
 */
async function loadGameSafely(
  db: Parameters<typeof loadPbGame>[0],
  evtId: string,
  nowIso: string,
): Promise<PbGame | null> {
  try {
    return await loadPbGame(db, evtId, nowIso);
  } catch (e) {
    console.error("[pb-class] loadPbGame 실패", e);
    return null;
  }
}

/**
 * 정산 — 전원 출석을 읽는 무거운 조회라 본문을 막지 않게 따로 흘려 보낸다(Suspense).
 * 위쪽 출석·점수 화면이 먼저 그려지고 이 구간만 스켈레톤으로 남는다.
 */
async function PbSettlementSection({ evtId, myMemId, nowIso }: { evtId: string; myMemId: string; nowIso: string }) {
  const { supabase } = await getCurrentMember();
  const board = await loadPbClassBoard(supabase, evtId, nowIso);
  if (!board) return null;
  return <PbSettlement board={board} myMemId={myMemId} />;
}

/** 조회 전·크루 밖일 때의 제목 — 히어로를 세울 데이터가 없을 때만 쓴다 */
function BareTitle({ event }: { event: PbClassViewProps["event"] }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <H2 className="break-keep">{event.evt_nm}</H2>
      <Caption className="tabular-nums">{formatPeriod(event.stt_dt, event.end_dt)}</Caption>
    </div>
  );
}

type PbClassViewProps = {
  event: { evt_id: string; evt_nm: string; stt_dt: string; end_dt: string };
  /** `?view=` 원문 — 볼 수 없는 값이면 기본 탭으로 떨어진다(`resolvePbView`) */
  view?: string;
  /**
   * 종료된 프로젝트를 보관용으로 여는 중 — 신청·목표 수정·대구 입력 등 **쓰기 어포던스를 전부** 거둔다.
   * 서버 액션도 종료 프로젝트를 막아야 하지만, 화면이 버튼을 세워 두면 누르고 나서야 거절당한다.
   */
  readOnly?: boolean;
  /** 비활성/탈퇴 회원 — 신청 시 공통 안내 게이트를 연다 */
  isInactive: boolean;
  inactiveKind?: "inactive" | "left";
};

/**
 * 프로젝트 탭의 겨울 10K PB 클래스 뷰 — **히어로 + 탭(내 현황 · 훈련 · 점수판 · 안내)**.
 *
 * 예전엔 한 지면에 출석·팀·목표·기록·점수판·정산·규칙이 세로로 다 쌓여, 훈련 내용을 보러 온 사람도
 * 정산 표까지 내려가야 했다. 「지금 어디인가」(히어로)는 늘 위에 두고 나머지는 물으러 온 질문별로 탭을 갈랐다.
 * 탭은 URL(`?view=`)이라 서버가 **보는 탭 하나만** 그린다 — 정산(전원 출석 조회)은 내 현황 탭에서만 돈다.
 */
export async function PbClassView({ event, view, readOnly = false, isInactive, inactiveKind }: PbClassViewProps) {
  const { member, supabase } = await getCurrentMember();

  // 로그인했지만 크루 가입 전 — 신청 대상이 아니다(참가자 행이 mem_id에 걸린다)
  if (!member) {
    return (
      <>
        <BareTitle event={event} />
        <EmptyState variant="card" message="크루 가입을 마치면 참가 신청할 수 있어요." />
      </>
    );
  }

  // 두 조회는 서로 기다릴 이유가 없다 — 나란히 보낸다
  const nowIso = nowKST().toISOString();
  const [data, game] = await Promise.all([
    loadMyPbClass(supabase, event.evt_id, member.id, nowIso),
    loadGameSafely(supabase, event.evt_id, nowIso),
  ]);
  if (!data) {
    return (
      <>
        <BareTitle event={event} />
        <EmptyState variant="card" message="프로젝트 정보를 불러오지 못했어요." />
      </>
    );
  }

  const { evt, cfg, sessions, me } = data;
  const approved = me?.aprvYn === true;
  const { tabs, active } = resolvePbView(view, approved);
  const phase = pbPhaseOf(evt, cfg, nowIso);
  const gameMe = game?.participants.find((p) => p.memId === member.id) ?? null;
  const trnGrpCd = approved ? (gameMe?.trnGrpCd ?? null) : null;

  return (
    <>
      <div className="flex flex-col gap-5">
        <PbHero evt={evt} cfg={cfg} sessions={sessions} nowIso={nowIso} me={approved ? me : null} />
        <PbViewTabs evtId={evt.evtId} tabs={tabs} active={active} />
      </div>

      {active === "status" && approved && me && (
        <StatusTab
          data={data}
          game={game}
          memId={member.id}
          nowIso={nowIso}
          readOnly={readOnly}
          gameMe={gameMe}
        />
      )}

      {active === "training" && (
        <PbTraining
          plans={data.sessPlans ?? []}
          evt={evt}
          cfg={cfg}
          sessions={sessions}
          phase={phase}
          me={approved ? me : null}
          trnGrpCd={trnGrpCd}
        />
      )}

      {active === "score" &&
        (game ? (
          <PbScoreboard
            scoreboard={game.scoreboard}
            rule={game.rule}
            myGrpId={approved ? (gameMe?.grpId ?? null) : null}
            me={approved && gameMe ? { memId: member.id, late: gameMe.late } : null}
          />
        ) : (
          <EmptyState variant="card" message="점수판을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요." />
        ))}

      {active === "guide" && (
        <>
          {/* 안내 탭이 기본인 사람(미신청·대기)에게 지금 할 일은 맨 위에 — 안내를 다 읽고 내려와 찾게 하지 않는다 */}
          {pbGuideTop(readOnly, me) === "apply" && (
            <PbApplySection
              evtId={evt.evtId}
              cfg={cfg}
              currentWkNo={data.currentWkNo}
              mlgAlumni={data.mlgAlumni ?? false}
              isInactive={isInactive}
              inactiveKind={inactiveKind}
            />
          )}
          {pbGuideTop(readOnly, me) === "pending" && me && <PbPendingCard me={me} />}
          <PbGuide
            evt={evt}
            cfg={cfg}
            rule={game?.rule ?? null}
            mlgAlumni={data.mlgAlumni ?? false}
            me={me}
            trnGrpCd={trnGrpCd}
          />
        </>
      )}
    </>
  );
}

/** 내 현황 — 출석·환급 → 회차 → 팀 → 목표 → 기록 → 정산. 돈과 출석이 위, 게임이 아래 */
function StatusTab({
  data,
  game,
  gameMe,
  memId,
  nowIso,
  readOnly,
}: {
  data: MyPbClass;
  game: PbGame | null;
  gameMe: PbGame["participants"][number] | null;
  memId: string;
  nowIso: string;
  readOnly: boolean;
}) {
  const { evt, cfg, sessions, me } = data;
  if (!me) return null;
  const myScore = game?.scoreboard.members.find((m) => m.memId === memId);

  return (
    <>
      <PbMyStatus me={me} cfg={cfg} />
      <PbSessionStrip me={me} sessions={sessions} cfg={cfg} />

      {game && gameMe && (
        <>
          <PbMyTeam groups={game.groups} me={gameMe} />
          <PbGoalCard
            evtId={evt.evtId}
            goalSec={gameMe.goalSec}
            goalMaxSec={game.rule.goalMaxSec}
            editUntilWk={goalEditLastWk(game.rule, gameMe.joinWkNo)}
            editable={!readOnly && canEditGoal(game.currentWkNo, game.rule, gameMe.joinWkNo)}
            achieved={myScore?.goalAchieved ?? false}
          />
          <PbRecordsCard
            evtId={evt.evtId}
            recs={gameMe.recs}
            joinWkNo={gameMe.joinWkNo}
            late={gameMe.late}
            midWkNo={game.rule.midWkNo}
            readOnly={readOnly}
          />
        </>
      )}

      <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
        <PbSettlementSection evtId={evt.evtId} myMemId={memId} nowIso={nowIso} />
      </Suspense>
    </>
  );
}

/** 페이지 Suspense 폴백 — 히어로·탭·첫 섹션 자리를 실제와 같은 높이로 잡아 둔다(레이아웃 밀림 방지) */
export function PbClassSkeleton() {
  return (
    <div className="flex flex-col gap-7" aria-hidden>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-[72px] w-full rounded-2xl" />
        </div>
        <Skeleton className="h-[54px] w-full rounded-xl" />
      </div>
      <Skeleton className="h-48 w-full rounded-2xl" />
      <Skeleton className="h-32 w-full rounded-2xl" />
    </div>
  );
}

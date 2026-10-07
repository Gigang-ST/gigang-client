import { Suspense } from "react";

import { nowKST, parseEventTime } from "@/lib/dayjs";
import { canEditGoal, goalEditLastWk } from "@/lib/pb-class-score";
import { loadMyPbClass, loadPbClassBoard } from "@/lib/queries/pb-class";
import { loadPbGame, type PbGame } from "@/lib/queries/pb-class-game";
import { getCurrentMember } from "@/lib/queries/member";

import { EmptyState } from "@/components/common/empty-state";
import { Caption } from "@/components/common/typography";
import { CardItem } from "@/components/ui/card";
import { SectionHeader } from "@/components/common/section-header";
import { Skeleton } from "@/components/ui/skeleton";

import { PbApplySection } from "./pb-apply-section";
import { PbGoalCard } from "./pb-goal-card";
import { PbMyStatus } from "./pb-my-status";
import { PbMyTeam } from "./pb-my-team";
import { PbPendingCard } from "./pb-pending-card";
import { PbRecordsCard } from "./pb-records-card";
import { PbRulesButton } from "./pb-rules-button";
import { PbRulesContent } from "./pb-rules-content";
import { PbScoreboard } from "./pb-scoreboard";
import { PbSessionStrip } from "./pb-session-strip";
import { PbSettlement } from "./pb-settlement";

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

type PbClassViewProps = {
  event: { evt_id: string; evt_nm: string; stt_dt: string; end_dt: string };
  /** 비활성/탈퇴 회원 — 신청 시 공통 안내 게이트를 연다 */
  isInactive: boolean;
  inactiveKind?: "inactive" | "left";
};

/**
 * 프로젝트 탭의 겨울 10K PB 클래스 뷰 — 미신청 / 입금 대기 / 승인(출석·환급) 세 갈래.
 *
 * 기간제 마일리지런과 달리 월 이동도 차트도 없다. 출석(공식훈련 벙 참석)이 곧 실적이라
 * 1단계 화면은 짧다. 2·3단계(팀·목표·기록·점수판·정산)는 승인된 참가자에게 그 아래로 이어 붙고,
 * 점수판만은 구경하는 사람에게도 열린다.
 */
export async function PbClassView({ event, isInactive, inactiveKind }: PbClassViewProps) {
  const { member, supabase } = await getCurrentMember();

  const title = (
    <div className="flex min-w-0 flex-col gap-1">
      <h2 className="min-w-0 truncate whitespace-nowrap text-lg font-bold tracking-tight sm:text-xl">
        {event.evt_nm}
      </h2>
      {/* date 컬럼(_dt)이라 그대로 찍어도 어느 타임존에서나 같은 날짜다 */}
      <Caption>
        {parseEventTime(event.stt_dt).format("YYYY.M.D")} ~ {parseEventTime(event.end_dt).format("YYYY.M.D")}
      </Caption>
    </div>
  );

  // 로그인했지만 크루 가입 전 — 신청 대상이 아니다(참가자 행이 mem_id에 걸린다)
  if (!member) {
    return (
      <>
        {title}
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
        {title}
        <EmptyState variant="card" message="프로젝트 정보를 불러오지 못했어요." />
      </>
    );
  }

  const { cfg, sessions, me, currentWkNo } = data;

  // 점수판은 구경하는 사람(미신청·입금 대기)에게도 연다 — 팀이 발표되기 전엔 그릴 게 없어 접는다
  const watchBoard =
    game && game.scoreboard.groups.length > 0 ? (
      <PbScoreboard scoreboard={game.scoreboard} rule={game.rule} myGrpId={null} me={null} />
    ) : null;

  // 미신청 — 규칙 요약 + 신청
  if (!me) {
    return (
      <>
        {title}
        <div className="flex flex-col gap-4">
          <SectionHeader label="RULES" />
          <CardItem className="p-5">
            <PbRulesContent cfg={cfg} />
          </CardItem>
        </div>
        <PbApplySection
          evtId={event.evt_id}
          cfg={cfg}
          currentWkNo={currentWkNo}
          isInactive={isInactive}
          inactiveKind={inactiveKind}
        />
        {watchBoard}
      </>
    );
  }

  // 신청 완료 · 입금 확인 대기
  if (!me.aprvYn) {
    return (
      <>
        {title}
        <PbPendingCard amount={me.depositAmt + me.entryFeeAmt} />
        <PbRulesButton cfg={cfg} />
        {watchBoard}
      </>
    );
  }

  // 승인 — 출석·환급 + 회차 띠 + (게임) 팀·목표·기록·점수 + 정산
  const gameMe = game?.participants.find((p) => p.memId === member.id) ?? null;
  const myScore = game?.scoreboard.members.find((m) => m.memId === member.id);

  return (
    <>
      {title}
      <PbMyStatus me={me} cfg={cfg} />
      <PbSessionStrip me={me} sessions={sessions} cfg={cfg} />

      {game && gameMe && (
        <>
          <PbMyTeam groups={game.groups} me={gameMe} />
          <PbGoalCard
            evtId={event.evt_id}
            goalSec={gameMe.goalSec}
            goalMaxSec={game.rule.goalMaxSec}
            editUntilWk={goalEditLastWk(game.rule, gameMe.joinWkNo)}
            editable={canEditGoal(game.currentWkNo, game.rule, gameMe.joinWkNo)}
            achieved={myScore?.goalAchieved ?? false}
          />
          <PbRecordsCard
            evtId={event.evt_id}
            recs={gameMe.recs}
            joinWkNo={gameMe.joinWkNo}
            late={gameMe.late}
            midWkNo={game.rule.midWkNo}
          />
        </>
      )}
      {game && (
        <PbScoreboard
          scoreboard={game.scoreboard}
          rule={game.rule}
          myGrpId={gameMe?.grpId ?? null}
          me={gameMe ? { memId: member.id, late: gameMe.late } : null}
        />
      )}

      <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
        <PbSettlementSection evtId={event.evt_id} myMemId={member.id} nowIso={nowIso} />
      </Suspense>

      <PbRulesButton cfg={cfg} />
    </>
  );
}

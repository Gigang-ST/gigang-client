import { Suspense } from "react";

import { prevMonthStr, currentMonthKST } from "@/lib/dayjs";
import { getCurrentMember } from "@/lib/queries/member";

import { Skeleton } from "@/components/ui/skeleton";
import { MileageIntro } from "@/components/projects/mileage-intro";
import { MileageRulesButton } from "@/components/projects/mileage-rules-button";
import { MonthNavigator } from "@/components/projects/month-navigator";
import { MonthTransitionProvider, TransitionOverlay } from "@/components/projects/month-transition";
import { CrewProgressChartServer } from "@/components/projects/crew-progress-chart-server";
import { JoinSection } from "@/components/projects/join-section";
import { RandomReview } from "@/components/projects/random-review";
import { CrewMonthlyStats } from "@/components/projects/crew-monthly-stats";
import { MyStatus } from "@/components/projects/my-status";
import { RefundStatus } from "@/components/projects/refund-status";
import { MySportChart } from "@/components/projects/my-sport-chart-server";
import { MyActivityList } from "@/components/projects/my-activity-list";
import { ActivityLogFab } from "@/components/projects/activity-log-fab";

type MileageProjectViewProps = {
  event: { evt_id: string; evt_nm: string; stt_dt: string; end_dt: string };
  /** `?month=` 쿼리 원문 — 범위 검증은 여기서 한다 */
  month?: string;
  isInactive: boolean;
  inactiveKind?: "inactive" | "left";
};

/**
 * 프로젝트 탭의 마일리지런 뷰.
 *
 * `/projects` 페이지 본문이 통째로 옮겨온 것이다 — 동작은 그대로다. 달라진 건 두 가지뿐:
 * ① ACTIVE 프로젝트가 여럿일 수 있어(PB 클래스와 공존) 이벤트 조회는 페이지가 하고,
 *    **내 참여 정보는 이 뷰가 자기 이벤트로 따로 조회**한다(예전엔 이벤트 쿼리에 left join으로 얹었다).
 * ② 월 이동·차트 탭이 `window.location.search`를 복사해 쓰므로(`MonthNavigator`·`CrewProgressChart`)
 *    `?evt=`가 자연히 보존된다 — 월을 넘겨도 다른 프로젝트로 튀지 않는다.
 */
export async function MileageProjectView({
  event,
  month,
  isInactive,
  inactiveKind,
}: MileageProjectViewProps) {
  const { member, supabase } = await getCurrentMember();

  // 내 참여 정보 — 이 이벤트 한정. 미가입(member 없음)이면 조회할 mem_id가 없어 건너뛴다.
  const { data: prtRows } = member
    ? await supabase
        .from("evt_team_prt_rel")
        .select("aprv_yn")
        .eq("evt_id", event.evt_id)
        .eq("mem_id", member.id)
        .limit(1)
    : { data: null };
  const participation = prtRows?.[0] ?? null;
  const isParticipant = participation !== null && participation.aprv_yn === true;

  // 월 결정 — 연습월(시작 -1)부터 종료월까지
  const currentKST = currentMonthKST();
  const practiceMonth = prevMonthStr(event.stt_dt);

  const selectedMonth =
    month && month >= practiceMonth && month <= event.end_dt
      ? month
      : currentKST >= practiceMonth && currentKST <= event.end_dt
        ? currentKST
        : event.stt_dt;

  // 페이지가 비로그인을 막으므로 여기선 항상 로그인 상태 — 참여자가 아니면 신청 섹션을 연다
  const showJoin = !isParticipant;

  return (
    <MonthTransitionProvider>
      {/* 이벤트명 + 월 네비게이터 */}
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h2 className="min-w-0 flex-1 truncate whitespace-nowrap text-lg font-bold tracking-tight sm:text-xl">
          {event.evt_nm}
        </h2>
        <MonthNavigator
          currentMonth={selectedMonth}
          startMonth={event.stt_dt}
          endMonth={event.end_dt}
        />
      </div>

      {/* 미참여 시 소개 */}
      {!isParticipant && <MileageIntro />}

      {/* 참여 신청 섹션 */}
      {showJoin && (
        <JoinSection
          evtId={event.evt_id}
          evtStartMonth={event.stt_dt}
          evtEndMonth={event.end_dt}
          existingPrt={participation}
          isInactive={isInactive}
          inactiveKind={inactiveKind}
        />
      )}

      {/* 월별 동적 콘텐츠 — 전환 시 opacity 처리 */}
      <TransitionOverlay className="-mt-2 flex flex-col gap-7">
        <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
          <CrewProgressChartServer
            key={selectedMonth}
            evtId={event.evt_id}
            memId={isParticipant ? member!.id : undefined}
            month={selectedMonth}
            evtStartMonth={event.stt_dt}
            evtEndMonth={event.end_dt}
          />
        </Suspense>
        {isParticipant && member && (
          <Suspense fallback={<Skeleton className="h-40 w-full rounded-2xl" />}>
            <MyStatus evtId={event.evt_id} memId={member.id} month={selectedMonth} evtStartMonth={event.stt_dt} evtEndMonth={event.end_dt} />
          </Suspense>
        )}
        <Suspense fallback={null}>
          <RandomReview evtId={event.evt_id} />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-32 w-full rounded-2xl" />}>
          <CrewMonthlyStats evtId={event.evt_id} month={selectedMonth} evtStartMonth={event.stt_dt} evtEndMonth={event.end_dt} />
        </Suspense>

        {/* 참여자 전용 */}
        {isParticipant && member && (
          <>
            <Suspense fallback={<Skeleton className="h-20 w-full rounded-2xl" />}>
              <RefundStatus
                evtId={event.evt_id}
                memId={member.id}
                evtStartMonth={event.stt_dt}
                evtEndMonth={event.end_dt}
                month={selectedMonth}
              />
            </Suspense>
            <Suspense fallback={<Skeleton className="h-40 w-full rounded-2xl" />}>
              <MySportChart evtId={event.evt_id} memId={member.id} month={selectedMonth} evtStartMonth={event.stt_dt} evtEndMonth={event.end_dt} />
            </Suspense>
            <Suspense fallback={<Skeleton className="h-48 w-full rounded-2xl" />}>
              <MyActivityList evtId={event.evt_id} memId={member.id} month={selectedMonth} evtStartMonth={event.stt_dt} evtEndMonth={event.end_dt} isInactive={isInactive} inactiveKind={inactiveKind} />
            </Suspense>
            <ActivityLogFab evtId={event.evt_id} memId={member.id} isInactive={isInactive} inactiveKind={inactiveKind} />
          </>
        )}
      </TransitionOverlay>

      <MileageRulesButton />
    </MonthTransitionProvider>
  );
}

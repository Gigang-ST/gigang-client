import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/common/page-header";
import { getCurrentMember } from "@/lib/queries/member";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentMonthKST, prevMonthStr } from "@/lib/dayjs";
import { ensureAllCurrentMonthGoals } from "@/app/actions/mileage-run";
import { MileageIntro } from "@/components/projects/mileage-intro";
import { MileageRulesButton } from "@/components/projects/mileage-rules-button";
import { MonthNavigator } from "@/components/projects/month-navigator";
import { JoinSection } from "@/components/projects/join-section";
import { ChartModeProvider } from "@/components/projects/chart-mode-context";
import { CrewProgressChart } from "@/components/projects/crew-progress-chart";
import { RandomReview } from "@/components/projects/random-review";
import { CrewMonthlyStats } from "@/components/projects/crew-monthly-stats";
import { MyStatus } from "@/components/projects/my-status";
import { RefundStatus } from "@/components/projects/refund-status";
import { MySportChart } from "@/components/projects/my-sport-chart-server";
import { MyActivityList } from "@/components/projects/my-activity-list";
import { ActivityLogFab } from "@/components/projects/activity-log-fab";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { user, member } = await getCurrentMember();
  const db = createAdminClient();

  // ACTIVE 이벤트 조회 (1개)
  const { data: event } = await db
    .from("evt_team_mst")
    .select("evt_id, evt_nm, stt_dt, end_dt, status_cd")
    .eq("status_cd", "ACTIVE")
    .maybeSingle();

  // 이벤트 없음 — 소개 + 규칙만 표시
  if (!event) {
    return (
      <div className="flex flex-col gap-0">
        <PageHeader title="프로젝트" />
        <div className="flex flex-col gap-7 px-6 pb-24">
          <MileageIntro />
          <MileageRulesButton />
        </div>
      </div>
    );
  }

  // 월 결정 — 연습월(시작 -1)부터 종료월까지
  const params = await searchParams;
  const currentKST = currentMonthKST();
  const practiceMonth = prevMonthStr(event.stt_dt);

  const selectedMonth =
    params.month &&
    params.month >= practiceMonth &&
    params.month <= event.end_dt
      ? params.month
      : currentKST >= practiceMonth && currentKST <= event.end_dt
        ? currentKST
        : event.stt_dt;

  // 로그인한 멤버의 참여 정보 조회
  let participation: { approve_yn: boolean } | null = null;
  if (member) {
    const { data: prt } = await db
      .from("evt_team_prt_rel")
      .select("approve_yn")
      .eq("evt_id", event.evt_id)
      .eq("mem_id", member.id)
      .maybeSingle();
    participation = prt ?? null;
  }

  const isParticipant = participation !== null && participation.approve_yn === true;

  // 승인된 참여자이면 당월 목표 자동 생성 (fire-and-forget 형태로 await)
  if (isParticipant && member) {
    await ensureAllCurrentMonthGoals(event.evt_id, event.end_dt);
  }

  // 비로그인이면 신청 섹션 미표시
  const showJoin = user !== null && !isParticipant;

  return (
    <div className="flex flex-col gap-0">
      <PageHeader title="프로젝트" />
      <div className="flex flex-col gap-7 px-6 pb-24">
        {/* 이벤트명 + 월 네비게이터 */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">{event.evt_nm}</h2>
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
          />
        )}

        {/* 크루 진행현황 */}
        <ChartModeProvider>
          <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
            <CrewProgressChart
              evtId={event.evt_id}
              memId={isParticipant ? member!.id : undefined}
              month={selectedMonth}
            />
          </Suspense>
          <Suspense fallback={null}>
            <RandomReview evtId={event.evt_id} />
          </Suspense>
          <Suspense fallback={<Skeleton className="h-32 w-full rounded-2xl" />}>
            <CrewMonthlyStats evtId={event.evt_id} month={selectedMonth} />
          </Suspense>
        </ChartModeProvider>

        {/* 참여자 전용 */}
        {isParticipant && member && (
          <>
            <Suspense fallback={<Skeleton className="h-40 w-full rounded-2xl" />}>
              <MyStatus evtId={event.evt_id} memId={member.id} month={selectedMonth} />
            </Suspense>
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
              <MySportChart evtId={event.evt_id} memId={member.id} month={selectedMonth} />
            </Suspense>
            <Suspense fallback={<Skeleton className="h-48 w-full rounded-2xl" />}>
              <MyActivityList evtId={event.evt_id} memId={member.id} month={selectedMonth} />
            </Suspense>
            <ActivityLogFab evtId={event.evt_id} memId={member.id} />
          </>
        )}

        <MileageRulesButton />
      </div>
    </div>
  );
}

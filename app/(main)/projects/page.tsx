import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/common/page-header";
import { getCurrentMember } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { currentMonthKST, prevMonthStr } from "@/lib/dayjs";
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

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const [{ user, member, supabase }, { teamId }] = await Promise.all([
    getCurrentMember(),
    getRequestTeamContext(),
  ]);
  if (!user) redirect("/auth/login");

  // ACTIVE 이벤트 + 내 참여 정보를 단일 쿼리로 조회 (왕복 2→1)
  const { data: event } = await supabase
    .from("evt_team_mst")
    .select(`
      evt_id, evt_nm, stt_dt, end_dt, stts_enm,
      evt_team_prt_rel!left(aprv_yn, mem_id)
    `)
    .eq("team_id", teamId)
    .eq("stts_enm", "ACTIVE")
    .eq("evt_team_prt_rel.mem_id", member?.id ?? "")
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

  // join으로 함께 가져온 참여 정보 추출
  const prtRows = event.evt_team_prt_rel ?? [];
  const participation = prtRows.length > 0 ? prtRows[0] : null;

  const isParticipant = participation !== null && participation.aprv_yn === true;

  // 비로그인이면 신청 섹션 미표시
  const showJoin = user !== null && !isParticipant;

  // 비활성/탈퇴 회원 — 참여 신청·기록 입력 등 쓰기 폼에서 공통 안내 게이트를 띄우기 위한 신호
  const isInactive = member !== null && member.status !== "active";
  // 비활성/탈퇴 세부 구분 — InactiveGateDialog 문구 분기용 (isInactive가 아니면 의미 없음)
  const inactiveKind: "inactive" | "left" | undefined = isInactive
    ? member!.status === "left"
      ? "left"
      : "inactive"
    : undefined;

  return (
    <div className="flex flex-col gap-0">
      <PageHeader title="프로젝트" />
      <div className="flex flex-col gap-7 px-6 pb-24">
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
      </div>
    </div>
  );
}

import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/server";
import { currentMonthKST } from "@/lib/mileage";
import { validateUUID } from "@/lib/utils";
import { MonthNavigator } from "@/components/projects/month-navigator";
import { CrewProgressChart } from "@/components/projects/crew-progress-chart";
import { CrewMonthlyStats } from "@/components/projects/crew-monthly-stats";
import { MyStatus } from "@/components/projects/my-status";
import { RefundStatus } from "@/components/projects/refund-status";
import { MyActivityList } from "@/components/projects/my-activity-list";
import { MySportChart } from "@/components/projects/my-sport-chart";
import { ActivityLogFab } from "@/components/projects/activity-log-fab";
import { MileageRulesButton } from "@/components/projects/mileage-rules-button";
import { JoinSection } from "@/components/projects/join-section";
import { ensureAllCurrentMonthGoals } from "@/app/actions/mileage-run";
import { ChartModeProvider } from "@/components/projects/chart-mode-context";
import { RandomReview } from "@/components/projects/random-review";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: project } = await supabase
    .from("project")
    .select("id, name, start_month, end_month, status")
    .eq("status", "active")
    .maybeSingle();

  if (!project) {
    return (
      <div className="flex min-h-svh items-center justify-center px-6">
        <p className="text-muted-foreground">진행 중인 프로젝트가 없습니다.</p>
      </div>
    );
  }

  // 현재 월 결정 — 시작월 1달 전(연습 기간)부터 조회 가능
  const params = await searchParams;
  const currentKSTMonth = currentMonthKST();
  const [sy, sm] = (project.start_month as string).split("-").map(Number);
  const practiceMonth = `${new Date(sy, sm - 2, 1).getFullYear()}-${String(new Date(sy, sm - 2, 1).getMonth() + 1).padStart(2, "0")}-01`;
  const selectedMonth =
    params.month && params.month >= practiceMonth && params.month <= project.end_month
      ? params.month
      : currentKSTMonth >= practiceMonth && currentKSTMonth <= project.end_month
        ? currentKSTMonth
        : project.start_month;

  // 로그인 사용자의 참여 정보 조회
  let participation: {
    id: string;
    start_month: string;
    initial_goal: number;
    deposit_confirmed: boolean;
  } | null = null;

  if (user) {
    validateUUID(user.id);

    const { data: member } = await supabase
      .from("member")
      .select("id")
      .or(`kakao_user_id.eq.${user.id},google_user_id.eq.${user.id}`)
      .maybeSingle();

    if (member) {
      const { data } = await supabase
        .from("project_participation")
        .select("id, start_month, initial_goal, deposit_confirmed")
        .eq("project_id", project.id)
        .eq("member_id", member.id)
        .maybeSingle();
      participation = data;
    }
  }

  const isParticipant = participation?.deposit_confirmed === true;

  // 참여자가 있으면 전체 목표 일괄 생성
  if (isParticipant) {
    await ensureAllCurrentMonthGoals(project.id, project.end_month);
  }

  // 참가 신청 필요 여부: 로그인했고 아직 신청 안 했거나 미승인
  const showJoin = user && !isParticipant;

  return (
    <div className="mx-auto max-w-3xl px-6 pb-24 pt-6 space-y-8">
      {/* 제목 + 월 네비게이터 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{project.name}</h1>
        <MonthNavigator
          currentMonth={selectedMonth}
          startMonth={project.start_month}
          endMonth={project.end_month}
        />
      </div>

      {/* 참가 신청 (미신청자만) */}
      {showJoin && (
        <JoinSection project={project} participation={participation} />
      )}

      {/* 진행현황 그래프 + N월 진행현황 */}
      <ChartModeProvider>
        <section className="rounded-xl border p-5 space-y-4">
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <CrewProgressChart
              projectId={project.id}
              participationId={isParticipant ? participation!.id : undefined}
              month={selectedMonth}
              refreshKey={Date.now()}
            />
          </Suspense>
          <Suspense fallback={null}>
            <RandomReview projectId={project.id} />
          </Suspense>
          <Suspense fallback={<Skeleton className="h-32 w-full" />}>
            <CrewMonthlyStats
              projectId={project.id}
              month={selectedMonth}
              projectStartMonth={project.start_month}
            />
          </Suspense>
        </section>
      </ChartModeProvider>

      {/* 참여자 전용 영역 */}
      {isParticipant && (
        <>
          {/* 내 현황 + 환급/회식지원비 */}
          <Suspense fallback={<Skeleton className="h-40 w-full rounded-xl" />}>
            <MyStatus
              participationId={participation!.id}
              projectId={project.id}
              month={selectedMonth}
              projectStartMonth={project.start_month}
            />
          </Suspense>

          {/* 종목별 마일리지 차트 */}
          <Suspense fallback={<Skeleton className="h-40 w-full rounded-xl" />}>
            <MySportChart participationId={participation!.id} month={selectedMonth} />
          </Suspense>

          {/* 내 기록 (최신 5개 + 더보기) */}
          <Suspense fallback={<Skeleton className="h-48 w-full rounded-xl" />}>
            <MyActivityList participationId={participation!.id} projectId={project.id} month={selectedMonth} />
          </Suspense>

          <ActivityLogFab participationId={participation!.id} projectId={project.id} />
        </>
      )}

      <MileageRulesButton />
    </div>
  );
}

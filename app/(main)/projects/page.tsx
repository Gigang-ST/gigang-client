import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/server";
import { MonthNavigator } from "@/components/projects/month-navigator";

// TODO: DB 연동 후 제거 — 임시 하드코딩 프로젝트 정보
const MOCK_PROJECT = {
  id: "00000000-0000-0000-0000-000000000000",
  name: "마일리지런",
  start_month: "2026-05-01",
  end_month: "2026-09-01",
  status: "active" as const,
};

/** KST 기준 현재 월 (yyyy-MM-01) */
function currentMonthKST() {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }),
  );
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // TODO: DB 연동 후 실제 프로젝트 조회로 교체
  // const { data: project } = await supabase
  //   .from("project")
  //   .select("id, name, start_month, end_month, status")
  //   .eq("status", "active")
  //   .maybeSingle();
  const project = MOCK_PROJECT;

  // 현재 월 결정 — 시작월 1달 전(연습 기간)부터 조회 가능
  const params = await searchParams;
  const currentKST = currentMonthKST();
  const [sy, sm] = project.start_month.split("-").map(Number);
  const practiceMonth = `${new Date(sy, sm - 2, 1).getFullYear()}-${String(new Date(sy, sm - 2, 1).getMonth() + 1).padStart(2, "0")}-01`;
  const selectedMonth =
    params.month &&
    params.month >= practiceMonth &&
    params.month <= project.end_month
      ? params.month
      : currentKST >= practiceMonth && currentKST <= project.end_month
        ? currentKST
        : project.start_month;

  // TODO: DB 연동 후 참여 정보 조회
  // 현재는 무조건 미참여 상태로 처리
  const isParticipant = false;

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

      {/* TODO: 참가 신청 섹션 (#105) */}
      {user && !isParticipant && (
        <section className="rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground">
          참가 신청 섹션 (구현 예정)
        </section>
      )}

      {/* TODO: 크루 진행현황 그래프 + 통계/후기 (#106, #107) */}
      <section className="rounded-xl border p-5 space-y-4">
        <Skeleton className="h-64 w-full" />
        <p className="text-sm text-muted-foreground text-center">
          크루 진행현황 (구현 예정)
        </p>
      </section>

      {/* 참여자 전용 영역 */}
      {isParticipant && (
        <>
          {/* TODO: 내 현황 + 환급/회식비 (#108) */}
          <Skeleton className="h-40 w-full rounded-xl" />

          {/* TODO: 종목별 마일리지 차트 (#109) */}
          <Skeleton className="h-40 w-full rounded-xl" />

          {/* TODO: 내 기록 목록 (#110) */}
          <Skeleton className="h-48 w-full rounded-xl" />
        </>
      )}

      {/* TODO: 마일리지런 규칙 Sheet (#111) */}
    </div>
  );
}

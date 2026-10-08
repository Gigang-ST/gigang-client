import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { HeaderActions } from "@/components/common/header-actions";
import { PageHeader } from "@/components/common/page-header";
import { getCurrentMember } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { PB_CLASS_TYPE } from "@/lib/pb-class";
import { MileageIntro } from "@/components/projects/mileage-intro";
import { MileageRulesButton } from "@/components/projects/mileage-rules-button";
import { MileageProjectView } from "@/components/projects/mileage-project-view";
import { PbClassSkeleton, PbClassView } from "@/components/projects/pb-class/pb-class-view";
import { ArchivedBanner, ProjectArchive } from "@/components/projects/project-archive";
import { ProjectSwitcher } from "@/components/projects/project-switcher";

/**
 * 비로그인은 `/auth/login`으로 튕기는 지면이다 — 크롤러는 내용을 볼 수 없다.
 * 색인시키면 로그인 화면이 "프로젝트"라는 제목으로 검색결과에 남는다.
 */
export const metadata: Metadata = {
  title: "프로젝트",
  description: "기강 러닝크루의 마일리지런·PB 클래스 등 기간제 활동. 크루원 로그인이 필요합니다.",
  robots: { index: false, follow: false },
};

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; evt?: string; view?: string }>;
}) {
  const [{ user, member, supabase }, { teamId }, params] = await Promise.all([
    getCurrentMember(),
    getRequestTeamContext(),
    searchParams,
  ]);
  if (!user) redirect("/auth/login");

  // 진행 중(ACTIVE)과 지난(CLOSED) 프로젝트를 한 번에 읽는다 — 마일리지런과 PB 클래스가 공존할 수 있다.
  // 준비 중(READY)은 회원에게 안 보인다(운영진이 열기 전 설정 단계). 최신 시작이 앞에 와서
  // `?evt=`가 없을 때의 기본 선택이 된다.
  const { data: rows } = await supabase
    .from("evt_team_mst")
    .select("evt_id, evt_nm, evt_type_cd, stt_dt, end_dt, stts_enm")
    .eq("team_id", teamId)
    .in("stts_enm", ["ACTIVE", "CLOSED"])
    .order("stt_dt", { ascending: false });

  const events = (rows ?? []).filter((e) => e.stts_enm === "ACTIVE");
  const closed = (rows ?? []).filter((e) => e.stts_enm === "CLOSED");

  // 선택 — `?evt=`가 지난 프로젝트면 **보관용(읽기 전용)**으로 연다. 진행 중 목록에 있으면 그것,
  // 아니면(없거나 삭제된 id) 진행 중 첫 번째. 종료 프로젝트를 기본으로 고르진 않는다 — 지금 할 일이 아니라서.
  const archived = closed.find((e) => e.evt_id === params.evt) ?? null;
  const event = archived ?? events.find((e) => e.evt_id === params.evt) ?? events[0] ?? null;

  const header = <PageHeader variant="editorial" label="Projects" title="프로젝트" action={<HeaderActions />} />;

  // 진행 중 프로젝트 없음 — 소개 + 규칙 + (있으면) 지난 프로젝트
  if (!event) {
    return (
      <div className="flex flex-col gap-0">
        {header}
        <div className="flex flex-col gap-7 px-6 pb-24">
          <MileageIntro />
          <MileageRulesButton />
          <ProjectArchive events={closed} />
        </div>
      </div>
    );
  }

  // 비활성/탈퇴 회원 — 참여 신청·기록 입력 등 쓰기 폼에서 공통 안내 게이트를 띄우기 위한 신호
  const isInactive = member !== null && member.status !== "active";
  // 비활성/탈퇴 세부 구분 — InactiveGateDialog 문구 분기용 (isInactive가 아니면 의미 없음)
  const inactiveKind: "inactive" | "left" | undefined = isInactive
    ? member!.status === "left"
      ? "left"
      : "inactive"
    : undefined;
  const isPb = event.evt_type_cd === PB_CLASS_TYPE;
  const readOnly = archived !== null;

  return (
    <div className="flex flex-col gap-0">
      {header}
      <div className="flex flex-col gap-7 px-6 pb-24">
        {readOnly ? (
          <ArchivedBanner hasActive={events.length > 0} />
        ) : (
          events.length > 1 && <ProjectSwitcher events={events} selectedId={event.evt_id} />
        )}

        {/* 뷰마다 자기 데이터를 직접 조회한다 — 전환 시 key가 달라 이전 프로젝트의 상태가 남지 않는다.
            탭(`?view=`)은 key 에 넣지 않는다: 탭을 넘길 때 폴백으로 지면이 통째로 깜빡이지 않고
            이전 탭을 그대로 둔 채 새 탭을 받아 갈아 끼운다(누른 탭엔 진행 막대가 선다). */}
        <Suspense
          key={event.evt_id}
          fallback={isPb ? <PbClassSkeleton /> : <Skeleton className="h-64 w-full rounded-2xl" />}
        >
          {isPb ? (
            <PbClassView
              event={event}
              view={params.view}
              readOnly={readOnly}
              isInactive={isInactive}
              inactiveKind={inactiveKind}
            />
          ) : (
            <MileageProjectView
              event={event}
              month={params.month}
              readOnly={readOnly}
              isInactive={isInactive}
              inactiveKind={inactiveKind}
            />
          )}
        </Suspense>

        <ProjectArchive events={closed} currentId={archived?.evt_id} />
      </div>
    </div>
  );
}

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
import { PbClassView } from "@/components/projects/pb-class/pb-class-view";
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
  searchParams: Promise<{ month?: string; evt?: string }>;
}) {
  const [{ user, member, supabase }, { teamId }] = await Promise.all([
    getCurrentMember(),
    getRequestTeamContext(),
  ]);
  if (!user) redirect("/auth/login");

  // 진행 중(ACTIVE) 프로젝트를 **전부** 읽는다 — 마일리지런과 PB 클래스가 공존할 수 있다.
  // 예전엔 `.maybeSingle()`이라 ACTIVE가 둘이면 에러 → 소개 화면으로 떨어졌다.
  // 최신 시작이 앞에 와서 `?evt=`가 없을 때의 기본 선택이 된다.
  const { data: events } = await supabase
    .from("evt_team_mst")
    .select("evt_id, evt_nm, evt_type_cd, stt_dt, end_dt")
    .eq("team_id", teamId)
    .eq("stts_enm", "ACTIVE")
    .order("stt_dt", { ascending: false });

  // 이벤트 없음 — 소개 + 규칙만 표시
  if (!events || events.length === 0) {
    return (
      <div className="flex flex-col gap-0">
        <PageHeader
          variant="editorial"
          label="Projects"
          title="프로젝트"
          action={<HeaderActions />}
        />
        <div className="flex flex-col gap-7 px-6 pb-24">
          <MileageIntro />
          <MileageRulesButton />
        </div>
      </div>
    );
  }

  // 선택 — `?evt=`가 목록에 있으면 그것, 아니면(없거나 종료·삭제된 id) 첫 번째
  const params = await searchParams;
  const event = events.find((e) => e.evt_id === params.evt) ?? events[0];

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
      <PageHeader
        variant="editorial"
        label="Projects"
        title="프로젝트"
        action={<HeaderActions />}
      />
      <div className="flex flex-col gap-7 px-6 pb-24">
        {events.length > 1 && <ProjectSwitcher events={events} selectedId={event.evt_id} />}

        {/* 뷰마다 자기 데이터를 직접 조회한다 — 전환 시 key가 달라 이전 프로젝트의 상태가 남지 않는다 */}
        <Suspense
          key={event.evt_id}
          fallback={<Skeleton className="h-64 w-full rounded-2xl" />}
        >
          {event.evt_type_cd === PB_CLASS_TYPE ? (
            <PbClassView event={event} isInactive={isInactive} inactiveKind={inactiveKind} />
          ) : (
            <MileageProjectView
              event={event}
              month={params.month}
              isInactive={isInactive}
              inactiveKind={inactiveKind}
            />
          )}
        </Suspense>
      </div>
    </div>
  );
}

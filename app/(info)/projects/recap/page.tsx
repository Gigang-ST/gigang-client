import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/common/empty-state";
import { RecapPage } from "@/components/projects/recap/recap-page";
import { Button } from "@/components/ui/button";
import { dayjs, nowKST } from "@/lib/dayjs";
import { RECAP_SEASON_EXTRAS } from "@/lib/mileage-recap-seasons";
import { getCurrentMember } from "@/lib/queries/member";
import { getLatestMileageRecap, getRecapParty } from "@/lib/queries/mileage-recap";
import { getRequestTeamContext } from "@/lib/queries/request-team";

/**
 * 크루원 전용 지면 — 사람별 기록·한마디·사진이 이름과 함께 실린다(프로젝트 탭과 같은 문턱).
 * 색인시키면 로그인 화면이 이 제목으로 검색결과에 남는다.
 */
export const metadata: Metadata = {
  title: "마일리지런 돌아보기",
  description: "기강 마일리지런 시즌을 재미로 돌아보는 지면. 크루원 로그인이 필요합니다.",
  robots: { index: false, follow: false },
};

/**
 * 마일리지런 시즌 돌아보기 — **가장 최근에 끝난 시즌** 하나를 크루 전체가 스크롤로 훑는다.
 * 진입은 기강이야기 리드 첫 칸("시즌 완주")이다(종료 후 30일). 그 뒤에도 주소는 살아 있다.
 */
export default async function MileageRecapPage() {
  const [{ user, member }, { teamId }] = await Promise.all([
    getCurrentMember(),
    getRequestTeamContext(),
  ]);
  if (!user) redirect("/auth/login?next=/projects/recap");
  if (!member) redirect("/onboarding?next=/projects/recap");

  const recap = await getLatestMileageRecap(teamId).catch((error: unknown) => {
    console.error("[MileageRecapPage] 돌아보기 조회 실패", error);
    return null;
  });

  if (!recap) {
    return (
      <div className="flex flex-col gap-4 px-6 pt-10">
        <EmptyState variant="card" message="아직 돌아볼 시즌이 없어요. 시즌이 끝나면 여기서 만나요." />
        <Button asChild variant="outline" className="self-center rounded-full">
          <Link href="/projects">프로젝트 탭으로</Link>
        </Button>
      </div>
    );
  }

  // 시즌별 덧붙임 — 회식은 아직 안 열렸을 때만 초대한다(두 절대시각 비교라 KST 날짜 경계와 무관)
  const extras = RECAP_SEASON_EXTRAS[recap.event.evt_id];
  const party = extras?.partyGthrId ? await getRecapParty(teamId, extras.partyGthrId) : null;
  const upcomingParty = party && nowKST().isBefore(dayjs(party.stt_at)) ? party : null;

  return (
    <RecapPage
      recap={recap}
      myMemId={member.id}
      party={upcomingParty}
      groupPhotoUrls={extras?.groupPhotoUrls ?? []}
    />
  );
}

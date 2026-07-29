import { Suspense } from "react";

import Link from "next/link";
import { redirect } from "next/navigation";

import { getCachedCmmCdRows } from "@/lib/queries/cmm-cd-cached";
import { getCurrentMember } from "@/lib/queries/member";
import { getPublicMemberCard } from "@/lib/queries/member-card";
import { getRequestTeamContext } from "@/lib/queries/request-team";

import { HeaderActions } from "@/components/common/header-actions";
import { PageHeader } from "@/components/common/page-header";
import { Body, Caption } from "@/components/common/typography";
import { ProfileTabCard } from "@/components/profile/profile-tab-card";
import type { MemberStatus } from "@/components/races/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

async function ProfileContent() {
  const { user, member, supabase } = await getCurrentMember();
  const { teamId } = await getRequestTeamContext();

  if (!user) {
    redirect("/auth/login?next=/profile");
  }

  if (!member) {
    redirect("/onboarding?next=/profile");
  }

  // 카드 본문은 공개 카드 RPC 한 번으로 전부 받는다 — 남이 보는 카드와 **같은 데이터**라야
  // 두 화면이 어긋나지 않는다. 서버에서 부르는 게 중요한데, 클라이언트 조회로 옮기면
  // 편집 액션들의 `revalidatePath("/profile")`이 통째로 무력화된다.
  const [card, { data: utmbProfile }, cmmCdRows, { data: titleRows }] =
    await Promise.all([
      getPublicMemberCard(supabase, member.id, teamId),
      supabase
        .from("mem_utmb_prf")
        .select("utmb_prf_url, utmb_idx, rct_race_nm, rct_race_rec")
        .eq("mem_id", member.id)
        .eq("vers", 0)
        .eq("del_yn", false)
        .maybeSingle(),
      getCachedCmmCdRows(),
      supabase
        .from("mem_ttl_rel")
        .select("ttl_id, is_prmy_yn, ttl_mst(rarity_level, ttl_ctgr_cd)")
        .eq("team_mem_id", member.team_mem_id)
        .eq("vers", 0)
        .eq("del_yn", false),
    ]);

  // RPC는 `mem_st_cd = 'active'`만 돌려준다 — 비활성·탈퇴 상태면 카드가 통째로 비므로
  // 빈 화면 대신 사유를 말한다(예전 프로필탭은 이 상태에서도 화면을 보여줬다).
  if (!card) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <div className="flex flex-col gap-1.5">
          <Body className="font-semibold">계정이 비활성 상태예요</Body>
          <Caption>
            프로필 카드는 활동 중인 기강인에게만 보여요. 운영진에게 문의해 주세요.
          </Caption>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/settings">설정으로</Link>
        </Button>
      </div>
    );
  }

  // 컬렉션 시트가 요구하는 값 — 대표 칭호 id와 해금 기준 최고 등급.
  const allTitles = (titleRows ?? []) as {
    ttl_id: string;
    is_prmy_yn: boolean;
    ttl_mst: { rarity_level: number; ttl_ctgr_cd: string } | null;
  }[];
  const primaryTtlId = allTitles.find((t) => t.is_prmy_yn)?.ttl_id ?? null;
  const maxRarityLevel = allTitles.reduce((max, t) => {
    if (t.ttl_mst?.ttl_ctgr_cd === "event") return max; // Event 칭호는 해금에 영향 없음
    const lvl = t.ttl_mst?.rarity_level ?? 1;
    return lvl > max ? lvl : max;
  }, 1);

  // 비활성/탈퇴 회원도 프로필은 볼 수 있지만, 대회 등록·기록 저장 등 쓰기는 차단해야 하므로
  // 실제 회원 상태를 그대로 반영한다(app/(main)/page.tsx와 동일 패턴).
  const competitionRegisterMemberStatus: MemberStatus =
    member.status !== "active"
      ? {
          status: "inactive",
          userId: user.id,
          memberId: member.id,
          memberSt: member.status === "left" ? "left" : "inactive",
        }
      : {
          status: "ready",
          userId: user.id,
          memberId: member.id,
          fullName: member.full_name,
          email: user.email ?? null,
          admin: member.admin,
        };

  return (
    <div className="px-6">
      <ProfileTabCard
        memId={member.id}
        teamMemId={member.team_mem_id}
        teamId={teamId}
        card={card}
        utmb={
          utmbProfile?.utmb_prf_url && utmbProfile?.utmb_idx != null
            ? {
                utmb_profile_url: utmbProfile.utmb_prf_url,
                utmb_index: utmbProfile.utmb_idx,
                recent_race_name: utmbProfile.rct_race_nm,
                recent_race_record: utmbProfile.rct_race_rec,
              }
            : null
        }
        primaryTtlId={primaryTtlId}
        maxRarityLevel={maxRarityLevel}
        cmmCdRows={cmmCdRows}
        competitionRegisterMemberStatus={competitionRegisterMemberStatus}
      />
    </div>
  );
}

/** 실제 레이아웃(전폭 스크린 존 + 섹션들)을 모사한 스켈레톤 */
function ProfileSkeleton() {
  return (
    <div className="flex flex-col">
      {/* 스크린 존 — 전폭이라 좌우 패딩 밖으로 나간다 */}
      <div className="flex flex-col items-center gap-2.5 bg-board px-6 py-6">
        <Skeleton className="size-24 rounded-full bg-board-line" />
        <Skeleton className="h-6 w-28 rounded bg-board-line" />
        <Skeleton className="h-5 w-40 rounded bg-board-line" />
        <Skeleton className="h-4 w-32 rounded bg-board-line" />
      </div>
      <div className="flex flex-col gap-5 px-6 py-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-20 rounded" />
            <Skeleton className="h-4 w-full rounded" />
            <Skeleton className="h-4 w-4/5 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Page() {
  // ProfileContent와 동일한 데이터를 쓰므로 Suspense fallback 렌더와 동시에 fetch 선제 시작
  void getCurrentMember();
  void getRequestTeamContext();

  return (
    <div className="flex flex-col gap-0">
      <PageHeader
        variant="editorial"
        label="Profile"
        title="프로필"
        action={<HeaderActions />}
      />
      <Suspense fallback={<ProfileSkeleton />}>
        <ProfileContent />
      </Suspense>
    </div>
  );
}

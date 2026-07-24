import { Suspense } from "react";

import Link from "next/link";
import { redirect } from "next/navigation";

import { CreditCard, MessageSquare, Settings, UserPen, Wallet } from "lucide-react";

import { dayjs } from "@/lib/dayjs";
import { getCachedCmmCdRows } from "@/lib/queries/cmm-cd-cached";
import { getCurrentMember } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";

import { H1 } from "@/components/common/typography";
import { PaceChartDynamic } from "@/components/profile/pace-chart-dynamic";
import { PersonalBestGrid } from "@/components/profile/personal-best-grid";
import { ProfileCard } from "@/components/profile/profile-card";
import type { MemberStatus } from "@/components/races/types";
import { CardItem } from "@/components/ui/card";
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

  const [{ data: raceResults }, { data: utmbProfile }, cmmCdRows, { data: primaryTitle }, { data: balSnap }] = await Promise.all([
    supabase
      .from("rec_race_hist")
      .select("comp_evt_cfg(comp_evt_type), rec_time_sec, race_nm, race_dt")
      .eq("mem_id", member.id)
      .eq("vers", 0)
      .eq("del_yn", false),
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
      .select("ttl_id, is_prmy_yn, ttl_mst(ttl_nm, ttl_desc, desc_visibility, rarity_level, ttl_ctgr_cd)")
      .eq("team_mem_id", member.team_mem_id)
      .eq("vers", 0)
      .eq("del_yn", false),
    supabase
      .from("fee_mem_bal_snap")
      .select("bal_amt")
      .eq("team_id", teamId)
      .eq("mem_id", member.id)
      .eq("vers", 0)
      .eq("del_yn", false)
      .maybeSingle(),
  ]);

  // Build best records map: for each event_type, pick the one with lowest record_time_sec
  const bestRecords: Record<string, { record_time_sec: number; race_name: string; race_dt: string | null }> = {};
  (raceResults ?? []).forEach((r) => {
    const evt = (Array.isArray(r.comp_evt_cfg) ? r.comp_evt_cfg[0] : r.comp_evt_cfg)?.comp_evt_type?.toUpperCase() ?? "";
    if (!["FULL", "HALF", "10K"].includes(evt)) return;
    const existing = bestRecords[evt];
    if (!existing || r.rec_time_sec < existing.record_time_sec) {
      bestRecords[evt] = { record_time_sec: r.rec_time_sec, race_name: r.race_nm, race_dt: r.race_dt ?? null };
    }
  });

  const joinedDate = member.joined_at
    ? dayjs(member.joined_at).format("YY.MM.DD")
    : "";

  // 보유 칭호 목록에서 대표 칭호와 최고 등급 계산
  const allTitles = (primaryTitle ?? []) as { ttl_id: string; is_prmy_yn: boolean; ttl_mst: { ttl_nm: string; ttl_desc?: string | null; desc_visibility?: string; rarity_level: number; ttl_ctgr_cd: string } | null }[];
  const primaryTitleRow = allTitles.find((t) => t.is_prmy_yn);
  const primaryTtlNm = primaryTitleRow?.ttl_mst?.ttl_nm ?? null;
  const primaryTtlDesc = primaryTitleRow?.ttl_mst?.ttl_desc ?? null;
  const primaryTtlDescVisibility = (primaryTitleRow?.ttl_mst?.desc_visibility ?? "others") as "always" | "others" | "held" | "never";
  const primaryTtlId = primaryTitleRow?.ttl_id ?? null;
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
    <div className="flex flex-col gap-4 px-6 pb-6">
        {/* Profile Card */}
        <ProfileCard
          fullName={member.full_name}
          avatarUrl={member.avatar_url}
          memId={member.id}
          joinedDate={joinedDate}
          teamMemId={member.team_mem_id}
          teamId={teamId}
          primaryTtlId={primaryTtlId}
          primaryTtlNm={primaryTtlNm}
          primaryTtlDesc={primaryTtlDesc}
          primaryTtlDescVisibility={primaryTtlDescVisibility}
          selectedBadgeEffect={member.selected_badge_effect}
          selectedFrameCd={member.selected_frame_cd}
          maxRarityLevel={maxRarityLevel}
          introTxt={member.intro_txt}
        />

        {/* 바로가기 */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { href: "/profile/edit", icon: UserPen, label: "내 정보", dot: false },
            { href: "/profile/bank", icon: CreditCard, label: "내 계좌", dot: false },
            { href: "/profile/dues", icon: Wallet, label: "회비", dot: (balSnap?.bal_amt ?? 0) < 0 },
            { href: "/profile/feedback", icon: MessageSquare, label: "건의", dot: false },
          ].map(({ href, icon: Icon, label, dot }) => (
            <Link key={href} href={href}>
              <div className="relative flex items-center justify-center gap-2 rounded-xl border border-border py-2.5">
                <Icon className="size-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{label}</span>
                {dot && (
                  <span className="absolute right-2 top-2 size-1.5 rounded-full bg-destructive" />
                )}
              </div>
            </Link>
          ))}
        </div>

        {/* Personal Best */}
        <PersonalBestGrid
          bestRecords={bestRecords}
          utmbData={utmbProfile?.utmb_prf_url && utmbProfile?.utmb_idx != null ? { utmb_profile_url: utmbProfile.utmb_prf_url, utmb_index: utmbProfile.utmb_idx, recent_race_name: utmbProfile.rct_race_nm, recent_race_record: utmbProfile.rct_race_rec } : null}
          memberId={member.id}
          teamId={teamId}
          cmmCdRows={cmmCdRows}
          competitionRegisterMemberStatus={competitionRegisterMemberStatus}
        />

        {/* 페이스 그래프 */}
        <PaceChartDynamic records={(raceResults ?? []).map((r) => ({ event_type: (Array.isArray(r.comp_evt_cfg) ? r.comp_evt_cfg[0] : r.comp_evt_cfg)?.comp_evt_type?.toUpperCase() ?? "", record_time_sec: r.rec_time_sec, race_name: r.race_nm, race_date: r.race_dt }))} />


      </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-6 pb-6">
      {/* Profile Card */}
      <CardItem className="flex items-center gap-4 p-5">
        <Skeleton className="size-16 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="h-8 w-12 rounded-lg" />
      </CardItem>
      {/* Personal Best */}
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-28" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      </div>
      {/* UTMB */}
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-20 rounded-2xl" />
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
      <div className="flex h-14 items-center justify-between px-6">
        <H1 className="font-semibold">내 프로필</H1>
        <Link href="/settings">
          <Settings className="size-[22px] text-muted-foreground" />
        </Link>
      </div>
      <Suspense fallback={<ProfileSkeleton />}>
        <ProfileContent />
      </Suspense>
    </div>
  );
}

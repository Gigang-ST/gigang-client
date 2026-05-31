import { Suspense } from "react";

import Link from "next/link";

import { secondsToTime, todayKST } from "@/lib/dayjs";
import { env } from "@/lib/env";
import { getCachedCmmCdRows } from "@/lib/queries/cmm-cd-cached";
import { getCurrentMember } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFrameCls } from "@/lib/title-effects";
import { cn } from "@/lib/utils";

import { TitleBadge } from "@/components/common/title-badge";
import { SectionLabel } from "@/components/common/typography";
import { H1 } from "@/components/common/typography";
import { UpcomingRaces } from "@/components/home/upcoming-races";
import type { CompetitionRegistration, MemberStatus } from "@/components/races/types";
import { SocialLinksGrid } from "@/components/social-links";
import { CardItem } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";


type UpcomingRace = {
  id: string;
  title: string;
  start_date: string;
  location: string | null;
  sport: string | null;
  event_types: string[] | null;
  /** 참가자들이 참가 시 입력한 이벤트 타입 (표시용, 없으면 event_types 사용) */
  registered_event_types?: string[];
  regCount?: number;
  label?: string;
};

/** 같은 날이거나 같은 주말(토-일)이면 true */
function isSameSlot(dateA: string, dateB: string) {
  if (dateA === dateB) return true;
  const a = new Date(dateA);
  const b = new Date(dateB);
  const dayA = a.getDay(); // 0=일, 6=토
  const dayB = b.getDay();
  const diff = Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
  // 토-일 or 일-토, 1일 차이
  return diff <= 1 && ((dayA === 6 && dayB === 0) || (dayA === 0 && dayB === 6));
}

async function HomeContent() {
  const { user, member: currentMember, supabase } = await getCurrentMember();
  const admin = createAdminClient();
  const { teamId } = await getRequestTeamContext();
  const today = todayKST();

  let initialMemberStatus: MemberStatus = { status: "signed-out" };

  const [
    { data: memberStats },
    { data: teamComps },
    { count: upcomingCount },
    { data: recentRecordsRaw },
    cmmCdRows,
  ] = await Promise.all([
    admin.rpc("get_public_team_member_stats", { p_team_id: teamId }),
    supabase.rpc("get_public_team_competitions", { p_team_id: teamId, p_start: today }),
    supabase
      .from("comp_mst")
      .select("*", { count: "exact", head: true })
      .eq("vers", 0)
      .eq("del_yn", false)
      .gte("stt_dt", today),
    supabase.rpc("get_public_team_recent_records", { p_team_id: teamId, p_limit: 2 }),
    getCachedCmmCdRows(),
  ]);

  const memberCount = memberStats?.[0]?.active_count ?? 0;

  // 기강대회: 등록자 1명 이상, 중복 제거 + 참가자 등록 event_type 수집
  const seenIds = new Set<string>();
  const gigangRaces: UpcomingRace[] = (teamComps ?? [])
    .filter((row) => (row.reg_count ?? 0) > 0)
    .map((row) => {
      const regs = (row.reg_evt_types ?? []).map((evt) => ({ evt_cd: evt }));
      const registered_event_types = [
        ...new Set(regs.map((re) => re.evt_cd).filter((et): et is string => Boolean(et?.trim()))),
      ].sort();
      return {
        id: row.comp_id,
        title: row.comp_nm,
        start_date: row.stt_dt,
        location: row.loc_nm,
        sport: row.comp_sprt_cd,
        event_types: (row.comp_evt_types ?? []).map((e) => e?.toUpperCase()).filter(Boolean),
        regCount: row.reg_count ?? 0,
        registered_event_types: registered_event_types.length > 0 ? registered_event_types : undefined,
      } as UpcomingRace;
    })
    .filter((r) => {
      const regs = r.regCount ?? 0;
      if (regs === 0) return false;
      if (seenIds.has(r.id)) return false;
      seenIds.add(r.id);
      return true;
    });

  // 기강대회 1번 카드: 가장 가까운 것 (같은 주말이면 참여 인원 많은 것)
  let topGigang: UpcomingRace | null = null;
  if (gigangRaces.length > 0) {
    const first = gigangRaces[0];
    // 같은 슬롯(같은 날 or 같은 주말)에 있는 대회들 모으기
    const weekendGroup = gigangRaces.filter(
      (r) => isSameSlot(r.start_date, first.start_date),
    );
    // 참여 인원 많은 순
    weekendGroup.sort((a, b) => (b.regCount ?? 0) - (a.regCount ?? 0));
    topGigang = weekendGroup[0];
  }

  // 내가 참가하는 대회 가져오기
  let myRaces: UpcomingRace[] = [];
  let myRegistrations: CompetitionRegistration[] = [];
  let isMember = false;
  if (user) {
    if (currentMember) {
      const member = currentMember;
      isMember = true;
      initialMemberStatus = {
        status: "ready",
        userId: user.id,
        memberId: member.id,
        fullName: member.full_name ?? null,
        email: member.email ?? null,
        admin: member.admin ?? false,
      };
      const { data: myRegs } = await supabase
        .from("comp_reg_rel")
        .select(
          "comp_reg_id, mem_id, prt_role_cd, crt_at, team_comp_plan_rel!inner(comp_id, comp_mst!inner(comp_id, comp_nm, stt_dt, loc_nm, comp_sprt_cd, comp_evt_cfg(comp_evt_type))), comp_evt_cfg(comp_evt_type)",
        )
        .eq("mem_id", member.id)
        .eq("team_comp_plan_rel.team_id", teamId)
        .eq("vers", 0)
        .eq("del_yn", false);
      myRegistrations = (myRegs ?? []).map((r) => ({
        id: r.comp_reg_id,
        competition_id: (Array.isArray(r.team_comp_plan_rel) ? r.team_comp_plan_rel[0] : r.team_comp_plan_rel).comp_id,
        member_id: r.mem_id,
        role: r.prt_role_cd,
        event_type: (Array.isArray(r.comp_evt_cfg) ? r.comp_evt_cfg[0] : r.comp_evt_cfg)?.comp_evt_type?.toUpperCase() ?? null,
        created_at: r.crt_at,
      })) as CompetitionRegistration[];
      myRaces = (myRegs ?? [])
        .map((r) => {
          const plan = Array.isArray(r.team_comp_plan_rel) ? r.team_comp_plan_rel[0] : r.team_comp_plan_rel;
          const comp = Array.isArray(plan.comp_mst) ? plan.comp_mst[0] : plan.comp_mst;
          return {
            id: comp.comp_id,
            title: comp.comp_nm,
            start_date: comp.stt_dt,
            location: comp.loc_nm,
            sport: comp.comp_sprt_cd,
            event_types: (comp.comp_evt_cfg ?? []).map((e: { comp_evt_type: string | null }) => e.comp_evt_type?.toUpperCase()).filter(Boolean),
          } as UpcomingRace;
        })
        .filter((c) => c && c.start_date >= today)
        .sort((a, b) => a.start_date.localeCompare(b.start_date));
      // 내 대회 각 competition에 대해 참가자들이 등록한 event_type 수집
      if (myRaces.length > 0) {
        const { data: regsByComp } = await supabase
          .from("comp_reg_rel")
          .select("team_comp_plan_rel!inner(comp_id), comp_evt_cfg(comp_evt_type)")
          .eq("team_comp_plan_rel.team_id", teamId)
          .in("team_comp_plan_rel.comp_id", myRaces.map((r) => r.id));
        const byCompId = new Map<string, Set<string>>();
        (regsByComp ?? []).forEach((row) => {
          const compId = (Array.isArray(row.team_comp_plan_rel) ? row.team_comp_plan_rel[0] : row.team_comp_plan_rel)?.comp_id;
          const evtCd = (Array.isArray(row.comp_evt_cfg) ? row.comp_evt_cfg[0] : row.comp_evt_cfg)?.comp_evt_type;
          if (!compId || !evtCd?.trim()) return;
          let set = byCompId.get(compId);
          if (!set) { set = new Set(); byCompId.set(compId, set); }
          set.add(evtCd.trim().toUpperCase());
        });
        myRaces = myRaces.map((r) => {
          const set = byCompId.get(r.id);
          const registered_event_types = set ? [...set].sort() : undefined;
          return { ...r, registered_event_types };
        });
      }
    } else {
      // 인증됐지만 member가 없으면 온보딩 필요
      initialMemberStatus = { status: "needs-onboarding", userId: user.id };
    }
  }

  // 2개 카드 결정
  const upcomingCards: UpcomingRace[] = [];

  // 카드 1: 기강대회 중 가장 가까운 것
  if (topGigang) {
    upcomingCards.push({ ...topGigang, label: "기강 대회" });
  }

  // 카드 2: 내가 나가는 대회 (카드1과 다른 슬롯인 것)
  const isDifferentSlot = (r: UpcomingRace) =>
    !topGigang || !isSameSlot(r.start_date, topGigang.start_date);

  const myNext = myRaces.find((r) => isDifferentSlot(r));
  if (myNext) {
    upcomingCards.push({ ...myNext, label: "내 대회" });
  } else if (myRaces.length > 0 && !isDifferentSlot(myRaces[0])) {
    // 내 대회가 기강1번과 같은 슬롯뿐 → 기강대회 다음 슬롯
    const nextGigang = gigangRaces.find((r) => isDifferentSlot(r));
    if (nextGigang) {
      upcomingCards.push({ ...nextGigang, label: "기강 대회" });
    }
  } else if (!currentMember) {
    // 비로그인 또는 미가입: 기강대회 다음 슬롯
    const nextGigang = gigangRaces.find((r) => isDifferentSlot(r));
    if (nextGigang) {
      upcomingCards.push({ ...nextGigang, label: "기강 대회" });
    }
  }

  const initialRegistrationsByCompetitionId: Record<string, CompetitionRegistration> = {};
  myRegistrations.forEach((reg) => {
    if (upcomingCards.some((card) => card.id === reg.competition_id)) {
      initialRegistrationsByCompetitionId[reg.competition_id] = reg;
    }
  });

  const recentRecords = recentRecordsRaw ?? [];

  // 최근 기록 멤버들의 칭호/프레임 조회
  const recentMemberIds = recentRecords.map((r) => r.mem_id).filter((id): id is string => Boolean(id));
  const memberTitleMap = new Map<string, { ttl_nm: string; ttl_desc: string | null; desc_visibility: string; badge_effect: string; frame_cd: string }>();
  if (recentMemberIds.length > 0) {
    const { data: titleData } = await admin
      .from("mem_ttl_rel")
      .select("team_mem_rel!inner(mem_id, selected_badge_effect, selected_frame_cd), ttl_mst!inner(ttl_nm, ttl_desc, desc_visibility)")
      .in("team_mem_rel.mem_id", recentMemberIds)
      .eq("team_mem_rel.team_id", teamId)
      .eq("is_prmy_yn", true)
      .eq("vers", 0)
      .eq("del_yn", false);
    for (const row of titleData ?? []) {
      const rel = Array.isArray(row.team_mem_rel) ? row.team_mem_rel[0] : row.team_mem_rel;
      const ttl = Array.isArray(row.ttl_mst) ? row.ttl_mst[0] : row.ttl_mst;
      if (rel?.mem_id && ttl?.ttl_nm) {
        const r = rel as { mem_id: string; selected_badge_effect?: string | null; selected_frame_cd?: string | null };
        const t = ttl as { ttl_nm: string; ttl_desc?: string | null; desc_visibility?: string };
        memberTitleMap.set(r.mem_id, {
          ttl_nm: t.ttl_nm,
          ttl_desc: t.ttl_desc ?? null,
          desc_visibility: t.desc_visibility ?? "others",
          badge_effect: r.selected_badge_effect ?? "none",
          frame_cd: r.selected_frame_cd ?? "frame-none",
        });
      }
    }
  }

  return (
    <div className="flex flex-col gap-7 px-6 pb-6">
        {/* Team Overview */}
        <div className="flex flex-col gap-4">
          <SectionLabel>TEAM OVERVIEW</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <CardItem className="flex flex-col gap-1">
              <span className="text-2xl font-bold text-foreground">
                {memberCount ?? 0}
              </span>
              <span className="text-xs text-muted-foreground">활동 멤버</span>
            </CardItem>
            <CardItem className="flex flex-col gap-1">
              <span className="text-2xl font-bold text-foreground">
                {upcomingCount ?? 0}
              </span>
              <span className="text-xs text-muted-foreground">
                예정 대회 중 {gigangRaces.length}개 참가
              </span>
            </CardItem>
          </div>
        </div>

        {/* Upcoming Races */}
        <UpcomingRaces
          teamId={teamId}
          cmmCdRows={cmmCdRows}
          races={upcomingCards}
          initialMemberStatus={initialMemberStatus}
          initialRegistrationsByCompetitionId={initialRegistrationsByCompetitionId}
        />

        {/* Recent Records */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <SectionLabel>RECENT RECORDS</SectionLabel>
            <Link
              href="/records"
              className="text-xs font-medium text-primary"
            >
              모두 보기
            </Link>
          </div>
          {recentRecords.length === 0 ? (
            <CardItem variant="dashed" className="py-8 text-center text-sm text-muted-foreground">
              등록된 기록이 없습니다.
            </CardItem>
          ) : (
            recentRecords.map((rec) => {
              const title = rec.mem_id ? memberTitleMap.get(rec.mem_id) : undefined;
              const frameCls = getFrameCls(title?.frame_cd);
              return (
                <CardItem
                  key={`${rec.mem_id}-${rec.race_nm}`}
                  className={cn("flex items-center justify-between", frameCls)}
                >
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[15px] font-semibold text-foreground">
                        {rec.mem_nm ?? "멤버"}
                      </span>
                      {title && (
                        <TitleBadge
                          name={title.ttl_nm}
                          effect={title.badge_effect}
                          size="xs"
                          tooltip={{ desc: title.ttl_desc, visibility: title.desc_visibility as "always" | "others" | "held" | "never", isHeld: true, isOwner: false }}
                        />
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {(rec.evt_cd ?? "UNKNOWN").toUpperCase()} · {rec.race_nm}
                    </span>
                  </div>
                  <span className="font-mono text-lg font-bold text-foreground">
                    {secondsToTime(rec.rec_time_sec ?? 0)}
                  </span>
                </CardItem>
              );
            })
          )}
        </div>

        {/* Social Links */}
        <SocialLinksGrid
          kakaoChatPassword={isMember ? (env.KAKAO_CHAT_PASSWORD ?? "") : undefined}
        />
      </div>
  );
}


function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-7 px-6 pb-6">
      {/* Team Overview */}
      <div className="flex flex-col gap-4">
        <Skeleton className="h-3.5 w-28" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
        </div>
      </div>
      {/* Social Links */}
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-2xl" />
        ))}
      </div>
      {/* Upcoming Races */}
      <div className="flex flex-col gap-4">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="flex flex-col gap-0">
      <div className="flex h-14 items-center px-6">
        <H1>기강</H1>
      </div>
      <Suspense fallback={<HomeSkeleton />}>
        <HomeContent />
      </Suspense>
    </div>
  );
}

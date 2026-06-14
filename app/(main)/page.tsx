import { Suspense } from "react";

import { todayKST, currentMonthKST, monthLastDay } from "@/lib/dayjs";
import { env } from "@/lib/env";
import { hasUnreadBoardPost } from "@/lib/queries/board";
import { getCachedCmmCdRows } from "@/lib/queries/cmm-cd-cached";
import { getCurrentMember, getMyTitleNames } from "@/lib/queries/member";
import { getUnreadNotificationCount } from "@/lib/queries/notification";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

import { BoardPopoverIcon } from "@/components/board/board-popover-icon";
import { H1 } from "@/components/common/typography";
import { MiniCalendar } from "@/components/home/mini-calendar";
import type { CalendarRace } from "@/components/home/mini-calendar";
import { RecentJoiners } from "@/components/home/recent-joiners";
import type { RecentJoiner } from "@/components/home/recent-joiners";
import { RecentRecordsGrid } from "@/components/home/recent-records-grid";
import type { RecentRecord, RecordTitleInfo } from "@/components/home/recent-records-grid";
import { RecentTitles } from "@/components/home/recent-titles";
import type { RecentTitleGrant } from "@/components/home/recent-titles";
import { UpcomingRaces } from "@/components/home/upcoming-races";
import { NotificationBellIcon } from "@/components/notifications/notification-bell-icon";
import type { CompetitionRegistration, MemberStatus } from "@/components/races/types";
import { SocialLinksGrid } from "@/components/social-links";
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

const SHOW_EXTRA_SECTIONS = false;

async function HomeHeader() {
  const { member: currentMember } = await getCurrentMember();
  const { teamId } = await getRequestTeamContext();

  const [unreadNotiCount, hasUnreadNotice, hasUnreadUpdate] = await Promise.all([
    getUnreadNotificationCount(currentMember?.id),
    hasUnreadBoardPost(currentMember?.id, teamId, "notice"),
    hasUnreadBoardPost(currentMember?.id, teamId, "update"),
  ]);

  return (
    <div className="relative flex h-20 items-center px-6">
      <div className="flex flex-1 items-center">
        <H1>기강</H1>
      </div>
      <div className="absolute left-0 right-0 flex flex-col items-center justify-center pointer-events-none">
        <p className="font-sans text-[6px] uppercase tracking-[0.15em] text-muted-foreground">
          Since 2024.04.23
        </p>
        <p className="font-sans text-[13px] font-black italic uppercase leading-tight tracking-[-0.03em] text-foreground">
          No time to be weak
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <BoardPopoverIcon
          hasUnreadNotice={hasUnreadNotice}
          hasUnreadUpdate={hasUnreadUpdate}
          memberId={currentMember?.id}
        />
        <NotificationBellIcon
          initialCount={unreadNotiCount}
          memberId={currentMember?.id}
          disabled={!currentMember}
        />
      </div>
    </div>
  );
}

async function HomeContent() {
  const { user, member: currentMember, supabase } = await getCurrentMember();
  const admin = createAdminClient();
  const { teamId } = await getRequestTeamContext();
  const today = todayKST();
  const monthStart = currentMonthKST();

  // 이번 달 마지막 날 계산
  const [yearStr, monthStr] = monthStart.split("-");
  const monthLastDayStr = monthLastDay(parseInt(yearStr, 10), parseInt(monthStr, 10));

  let initialMemberStatus: MemberStatus = { status: "signed-out" };

  const [
    { data: teamComps },
    { data: recentRecordsRaw },
    { data: calendarComps },
    { data: recentJoinersRaw },
    { data: recentTitleGrantsRaw },
    cmmCdRows,
    myTitleNames,
  ] = await Promise.all([
    supabase.rpc("get_public_team_competitions", { p_team_id: teamId, p_start: today }),
    SHOW_EXTRA_SECTIONS
      ? supabase.rpc("get_public_team_recent_records", { p_team_id: teamId, p_limit: 12 })
      : Promise.resolve({ data: null }),
    supabase.rpc("get_public_team_competitions", { p_team_id: teamId, p_start: monthStart, p_end: monthLastDayStr }),
    SHOW_EXTRA_SECTIONS
      ? admin
          .from("team_mem_rel")
          .select("mem_id, join_dt, mem_mst!inner(mem_nm)")
          .eq("team_id", teamId)
          .eq("mem_st_cd", "active")
          .eq("vers", 0)
          .eq("del_yn", false)
          .order("join_dt", { ascending: false })
          .limit(10)
      : Promise.resolve({ data: null }),
    SHOW_EXTRA_SECTIONS
      ? admin
          .from("mem_ttl_rel")
          .select("grnt_at, ttl_mst!inner(ttl_nm, ttl_desc, desc_visibility), team_mem_rel!inner(mem_id, selected_badge_effect, mem_mst!inner(mem_nm))")
          .eq("team_id", teamId)
          .eq("vers", 0)
          .eq("del_yn", false)
          .order("grnt_at", { ascending: false })
          .limit(10)
      : Promise.resolve({ data: null }),
    getCachedCmmCdRows(),
    getMyTitleNames(),
  ]);

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
    const weekendGroup = gigangRaces.filter(
      (r) => isSameSlot(r.start_date, first.start_date),
    );
    weekendGroup.sort((a, b) => (b.regCount ?? 0) - (a.regCount ?? 0));
    topGigang = weekendGroup[0];
  }

  // sch_post (이번 달)
  const { data: schPostRows } = await supabase
    .from("sch_post")
    .select("sch_post_id, sch_nm, post_type, evt_stt_at, evt_end_at, url, cont_txt, crt_by")
    .eq("team_id", teamId)
    .gte("evt_stt_at", monthStart)
    .lte("evt_stt_at", monthLastDayStr)
    .eq("del_yn", false)
    .order("evt_stt_at", { ascending: true });

  const calendarSchPosts: CalendarRace[] = (schPostRows ?? []).map((row) => ({
    id: row.sch_post_id,
    title: row.sch_nm,
    start_date: row.evt_stt_at.slice(0, 10),
    type: "schedule" as const,
    post_type: row.post_type,
    end_date: row.evt_end_at,
    evt_stt_at: row.evt_stt_at,
    evt_end_at: row.evt_end_at,
    url: row.url,
    cont_txt: row.cont_txt,
    crt_by: row.crt_by,
  }));

  // 캘린더용 기강 대회 (이번 달)
  const calendarGigangSeenIds = new Set<string>();
  const calendarGigangRaces: CalendarRace[] = (calendarComps ?? [])
    .filter((row) => (row.reg_count ?? 0) > 0 && row.stt_dt <= monthLastDayStr)
    .filter((row) => {
      if (calendarGigangSeenIds.has(row.comp_id)) return false;
      calendarGigangSeenIds.add(row.comp_id);
      return true;
    })
    .map((row) => ({
      id: row.comp_id,
      title: row.comp_nm,
      start_date: row.stt_dt,
      type: "gigang" as const,
      location: row.loc_nm ?? null,
      regCount: row.reg_count ?? 0,
    }));

  // 내가 참가하는 대회 가져오기
  let myRaces: UpcomingRace[] = [];
  let myRegistrations: CompetitionRegistration[] = [];
  let isMember = false;
  let calendarMyRaces: CalendarRace[] = [];

  if (user) {
    if (currentMember) {
      const member = currentMember;
      isMember = true;
      initialMemberStatus = member.status !== "active"
        ? { status: "inactive", userId: user.id }
        : {
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
        competition_id: (
          Array.isArray(r.team_comp_plan_rel)
            ? r.team_comp_plan_rel[0]
            : r.team_comp_plan_rel
        ).comp_id,
        member_id: r.mem_id,
        role: r.prt_role_cd,
        event_type:
          (
            Array.isArray(r.comp_evt_cfg) ? r.comp_evt_cfg[0] : r.comp_evt_cfg
          )?.comp_evt_type?.toUpperCase() ?? null,
        created_at: r.crt_at,
      })) as CompetitionRegistration[];
      myRaces = (myRegs ?? [])
        .map((r) => {
          const plan = Array.isArray(r.team_comp_plan_rel)
            ? r.team_comp_plan_rel[0]
            : r.team_comp_plan_rel;
          const comp = Array.isArray(plan.comp_mst) ? plan.comp_mst[0] : plan.comp_mst;
          return {
            id: comp.comp_id,
            title: comp.comp_nm,
            start_date: comp.stt_dt,
            location: comp.loc_nm,
            sport: comp.comp_sprt_cd,
            event_types: (comp.comp_evt_cfg ?? [])
              .map((e: { comp_evt_type: string | null }) => e.comp_evt_type?.toUpperCase())
              .filter(Boolean),
          } as UpcomingRace;
        })
        .filter((c) => c && c.start_date >= today)
        .sort((a, b) => a.start_date.localeCompare(b.start_date));

      // 캘린더용 내 대회 (이번 달) — today 필터 없이 myRegs 원본에서 직접 추출
      const calendarCompsRegCountMap = new Map<string, number>(
        (calendarComps ?? []).map((row) => [row.comp_id, row.reg_count ?? 0]),
      );
      calendarMyRaces = (myRegs ?? [])
        .flatMap((r) => {
          const plan = Array.isArray(r.team_comp_plan_rel) ? r.team_comp_plan_rel[0] : r.team_comp_plan_rel;
          const comp = Array.isArray(plan.comp_mst) ? plan.comp_mst[0] : plan.comp_mst;
          if (!comp) return [];
          const race: CalendarRace = { id: comp.comp_id, title: comp.comp_nm, start_date: comp.stt_dt, type: "mine", location: comp.loc_nm ?? null, regCount: calendarCompsRegCountMap.get(comp.comp_id) ?? 0 };
          return race.start_date >= monthStart && race.start_date <= monthLastDayStr ? [race] : [];
        });

      // 내 대회 각 competition에 대해 참가자들이 등록한 event_type 수집
      if (myRaces.length > 0) {
        const { data: regsByComp } = await supabase
          .from("comp_reg_rel")
          .select("team_comp_plan_rel!inner(comp_id), comp_evt_cfg(comp_evt_type)")
          .eq("team_comp_plan_rel.team_id", teamId)
          .in(
            "team_comp_plan_rel.comp_id",
            myRaces.map((r) => r.id),
          );
        const byCompId = new Map<string, Set<string>>();
        (regsByComp ?? []).forEach((row) => {
          const compId = (
            Array.isArray(row.team_comp_plan_rel)
              ? row.team_comp_plan_rel[0]
              : row.team_comp_plan_rel
          )?.comp_id;
          const evtCd = (
            Array.isArray(row.comp_evt_cfg) ? row.comp_evt_cfg[0] : row.comp_evt_cfg
          )?.comp_evt_type;
          if (!compId || !evtCd?.trim()) return;
          let set = byCompId.get(compId);
          if (!set) {
            set = new Set();
            byCompId.set(compId, set);
          }
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

  // 업커밍 카드 결정 (기존 로직 유지)
  const upcomingCards: UpcomingRace[] = [];

  if (topGigang) {
    upcomingCards.push({ ...topGigang, label: "기강 대회" });
  }

  const isDifferentSlot = (r: UpcomingRace) =>
    !topGigang || !isSameSlot(r.start_date, topGigang.start_date);

  const myNext = myRaces.find((r) => isDifferentSlot(r));
  if (myNext) {
    upcomingCards.push({ ...myNext, label: "내 대회" });
  } else if (myRaces.length > 0 && !isDifferentSlot(myRaces[0])) {
    const nextGigang = gigangRaces.find((r) => isDifferentSlot(r));
    if (nextGigang) {
      upcomingCards.push({ ...nextGigang, label: "기강 대회" });
    }
  } else if (!currentMember) {
    const nextGigang = gigangRaces.find((r) => isDifferentSlot(r));
    if (nextGigang) {
      upcomingCards.push({ ...nextGigang, label: "기강 대회" });
    }
  }

  const initialRegistrationsByCompetitionId: Record<string, CompetitionRegistration> = {};
  myRegistrations.forEach((reg) => {
    initialRegistrationsByCompetitionId[reg.competition_id] = reg;
  });

  const recentRecords: RecentRecord[] = (recentRecordsRaw ?? []).map((r) => ({
    mem_id: r.mem_id ?? null,
    mem_nm: r.mem_nm ?? null,
    race_nm: r.race_nm ?? null,
    evt_cd: r.evt_cd ?? null,
    rec_time_sec: r.rec_time_sec ?? null,
  }));

  // 최근 기록 멤버들의 칭호/프레임 조회
  const recentMemberIds = recentRecords
    .map((r) => r.mem_id)
    .filter((id): id is string => Boolean(id));
  const titleMap: Record<string, RecordTitleInfo> = {};
  if (recentMemberIds.length > 0) {
    const { data: titleData } = await admin
      .from("mem_ttl_rel")
      .select(
        "team_mem_rel!inner(mem_id, selected_badge_effect, selected_frame_cd), ttl_mst!inner(ttl_nm, ttl_desc, desc_visibility)",
      )
      .in("team_mem_rel.mem_id", recentMemberIds)
      .eq("team_mem_rel.team_id", teamId)
      .eq("is_prmy_yn", true)
      .eq("vers", 0)
      .eq("del_yn", false);
    for (const row of titleData ?? []) {
      const rel = Array.isArray(row.team_mem_rel) ? row.team_mem_rel[0] : row.team_mem_rel;
      const ttl = Array.isArray(row.ttl_mst) ? row.ttl_mst[0] : row.ttl_mst;
      if (rel?.mem_id && ttl?.ttl_nm) {
        const r = rel as {
          mem_id: string;
          selected_badge_effect?: string | null;
          selected_frame_cd?: string | null;
        };
        const t = ttl as {
          ttl_nm: string;
          ttl_desc?: string | null;
          desc_visibility?: string;
        };
        titleMap[r.mem_id] = {
          ttl_nm: t.ttl_nm,
          ttl_desc: t.ttl_desc ?? null,
          desc_visibility: (t.desc_visibility ?? "others") as
            | "always"
            | "others"
            | "held"
            | "never",
          badge_effect: r.selected_badge_effect ?? "none",
          frame_cd: r.selected_frame_cd ?? "frame-none",
        };
      }
    }
  }

  // 최근 가입자 가공
  const recentJoiners: RecentJoiner[] = (recentJoinersRaw ?? []).map((row) => {
    const mem = Array.isArray(row.mem_mst) ? row.mem_mst[0] : row.mem_mst;
    return {
      mem_id: row.mem_id as string,
      mem_nm: (mem as { mem_nm: string })?.mem_nm ?? "멤버",
      join_dt: row.join_dt as string,
    };
  });

  // 최근 칭호 획득 가공
  const recentTitleGrants: RecentTitleGrant[] = (recentTitleGrantsRaw ?? []).map((row) => {
    const rel = Array.isArray(row.team_mem_rel) ? row.team_mem_rel[0] : row.team_mem_rel;
    const ttl = Array.isArray(row.ttl_mst) ? row.ttl_mst[0] : row.ttl_mst;
    const memInfo = rel as { mem_id: string; selected_badge_effect?: string | null; mem_mst: { mem_nm: string } | { mem_nm: string }[] } | null;
    const memMst = memInfo ? (Array.isArray(memInfo.mem_mst) ? memInfo.mem_mst[0] : memInfo.mem_mst) : null;
    const ttlInfo = ttl as { ttl_nm: string; ttl_desc?: string | null; desc_visibility?: string } | null;
    return {
      mem_id: memInfo?.mem_id ?? "",
      mem_nm: (memMst as { mem_nm: string } | null)?.mem_nm ?? "멤버",
      ttl_nm: ttlInfo?.ttl_nm ?? "",
      ttl_desc: ttlInfo?.ttl_desc ?? null,
      desc_visibility: (ttlInfo?.desc_visibility ?? "others") as "always" | "others" | "held" | "never",
      badge_effect: memInfo?.selected_badge_effect ?? "none",
      grnt_at: row.grnt_at as string,
    };
  }).filter((g) => g.mem_id && g.ttl_nm);

  return (
    <div className="flex flex-col gap-0">

      <div className="flex flex-col gap-7 px-6 pb-6">
      {/* 2. SCHEDULE 캘린더 */}
      <MiniCalendar
        gigangRaces={calendarGigangRaces}
        myRaces={calendarMyRaces}
        schPosts={calendarSchPosts}
        teamId={teamId}
        memberId={currentMember?.id}
        cmmCdRows={cmmCdRows}
        initialMemberStatus={initialMemberStatus}
        initialRegistrationsByCompetitionId={initialRegistrationsByCompetitionId}
      />

      {/* 3. UPCOMING RACES 압축 리스트 */}
      <UpcomingRaces
        teamId={teamId}
        cmmCdRows={cmmCdRows}
        races={upcomingCards}
        initialMemberStatus={initialMemberStatus}
        initialRegistrationsByCompetitionId={initialRegistrationsByCompetitionId}
      />

      {/* 4. RECENT RECORDS + 최근 가입자 + 최근 칭호 (기획 재설계 전까지 비노출) */}
      {SHOW_EXTRA_SECTIONS && (
        <>
          <RecentRecordsGrid
            records={recentRecords}
            titleMap={titleMap}
            myTitleNames={[...myTitleNames]}
            initialCount={2}
          />
          <div className="grid grid-cols-2 gap-4">
            <RecentJoiners joiners={recentJoiners} initialCount={4} />
            <RecentTitles grants={recentTitleGrants} initialCount={4} myTitleNames={[...myTitleNames]} />
          </div>
        </>
      )}

      {/* 7. Social Links */}
      <SocialLinksGrid
        kakaoChatPassword={isMember ? (env.KAKAO_CHAT_PASSWORD ?? "") : undefined}
      />
      </div>
    </div>
  );
}


function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-0">
      {/* 헤더 스켈레톤 */}
      <div className="flex flex-col gap-2 px-6 pb-6 pt-4">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="flex flex-col gap-7 px-6 pb-6">
      {/* 캘린더 */}
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
      {/* Upcoming */}
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-10 rounded-lg" />
        <Skeleton className="h-10 rounded-lg" />
      </div>
      {/* Social Links */}
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-2xl" />
        ))}
      </div>
      </div>
    </div>
  );
}

function HomeHeaderSkeleton() {
  return (
    <div className="relative flex h-20 items-center px-6">
      <div className="flex flex-1 items-center">
        <H1>기강</H1>
      </div>
      <div className="absolute left-0 right-0 flex flex-col items-center justify-center pointer-events-none">
        <p className="font-sans text-[6px] uppercase tracking-[0.15em] text-muted-foreground">
          Since 2024.04.23
        </p>
        <p className="font-sans text-[13px] font-black italic uppercase leading-tight tracking-[-0.03em] text-foreground">
          No time to be weak
        </p>
      </div>
      <div className="size-8 shrink-0" />
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="flex flex-col gap-0">
      <Suspense fallback={<HomeHeaderSkeleton />}>
        <HomeHeader />
      </Suspense>
      <Suspense fallback={<HomeSkeleton />}>
        <HomeContent />
      </Suspense>
    </div>
  );
}

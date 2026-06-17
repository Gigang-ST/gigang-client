import { Suspense } from "react";

import { dayjs, currentMonthKST, monthLastDay } from "@/lib/dayjs";
import { env } from "@/lib/env";
import { hasUnreadBoardPost } from "@/lib/queries/board";
import { getCachedCmmCdRows } from "@/lib/queries/cmm-cd-cached";
import { getCurrentMember } from "@/lib/queries/member";
import { getNotifications, getUnreadNotificationCount } from "@/lib/queries/notification";
import { getRequestTeamContext } from "@/lib/queries/request-team";

import { BoardPopoverIcon } from "@/components/board/board-popover-icon";
import { H1 } from "@/components/common/typography";
import { MiniCalendar } from "@/components/home/mini-calendar";
import type { CalendarRace } from "@/components/home/mini-calendar";
import { NotificationBellIcon } from "@/components/notifications/notification-bell-icon";
import type { CompetitionRegistration, MemberStatus } from "@/components/races/types";
import { SocialLinksGrid } from "@/components/social-links";
import { Skeleton } from "@/components/ui/skeleton";


async function HomeHeader() {
  const { member: currentMember } = await getCurrentMember();
  const { teamId } = await getRequestTeamContext();

  const [unreadNotiCount, hasUnreadNotice, hasUnreadUpdate, initialNotifications] = await Promise.all([
    getUnreadNotificationCount(currentMember?.id),
    hasUnreadBoardPost(currentMember?.id, teamId, "notice"),
    hasUnreadBoardPost(currentMember?.id, teamId, "update"),
    currentMember ? getNotifications(currentMember.id, { limit: 20 }) : Promise.resolve([]),
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
          initialNotifications={initialNotifications}
          memberId={currentMember?.id}
          disabled={!currentMember}
        />
      </div>
    </div>
  );
}

async function HomeContent() {
  const { user, member: currentMember, supabase } = await getCurrentMember();
  const { teamId } = await getRequestTeamContext();
  const monthStart = currentMonthKST();

  const [yearStr, monthStr] = monthStart.split("-");
  const monthLastDayStr = monthLastDay(parseInt(yearStr, 10), parseInt(monthStr, 10));

  let initialMemberStatus: MemberStatus = { status: "signed-out" };

  const [
    { data: calendarComps },
    cmmCdRows,
    { data: schPostRows },
    myRegsResult,
  ] = await Promise.all([
    supabase.rpc("get_public_team_competitions", { p_team_id: teamId, p_start: monthStart, p_end: monthLastDayStr }),
    getCachedCmmCdRows(),
    supabase.rpc("get_public_team_sch_posts", {
      p_team_id: teamId,
      p_start: monthStart,
      p_end: monthLastDayStr,
    }),
    currentMember
      ? supabase
          .from("comp_reg_rel")
          .select(
            "comp_reg_id, mem_id, prt_role_cd, crt_at, team_comp_plan_rel!inner(comp_id, comp_mst!inner(comp_id, comp_nm, stt_dt, loc_nm, comp_sprt_cd, comp_evt_cfg(comp_evt_type))), comp_evt_cfg(comp_evt_type)",
          )
          .eq("mem_id", currentMember.id)
          .eq("team_comp_plan_rel.team_id", teamId)
          .eq("vers", 0)
          .eq("del_yn", false)
      : Promise.resolve({ data: null }),
  ]);

  const calendarSchPosts: CalendarRace[] = (schPostRows ?? []).map((row) => ({
    id: row.sch_post_id,
    short_id: row.short_id ?? null,
    title: row.sch_nm,
    start_date: dayjs(row.evt_stt_at).tz("Asia/Seoul").format("YYYY-MM-DD"),
    type: "schedule" as const,
    post_type: row.post_type,
    end_date: row.evt_end_at,
    evt_stt_at: row.evt_stt_at,
    evt_end_at: row.evt_end_at,
    url: row.url,
    cont_txt: row.cont_txt,
    crt_by: row.crt_by,
    crt_by_nm: row.crt_by_nm ?? null,
    cmntCount: row.cmnt_count ? Number(row.cmnt_count) : undefined,
  }));

  const calendarGigangRaces: CalendarRace[] = (calendarComps ?? [])
    .filter((row) => (row.reg_count ?? 0) > 0 && row.stt_dt <= monthLastDayStr)
    .map((row) => ({
      id: row.comp_id,
      title: row.comp_nm,
      start_date: row.stt_dt,
      type: "gigang" as const,
      location: row.loc_nm ?? null,
      regCount: row.reg_count ?? 0,
      cmntCount: row.cmnt_count ? Number(row.cmnt_count) : undefined,
    }));

  let myRegistrations: CompetitionRegistration[] = [];
  let isMember = false;
  let calendarMyRaces: CalendarRace[] = [];

  if (user) {
    if (currentMember) {
      isMember = true;
      initialMemberStatus = currentMember.status !== "active"
        ? { status: "inactive", userId: user.id }
        : {
            status: "ready",
            userId: user.id,
            memberId: currentMember.id,
            fullName: currentMember.full_name ?? null,
            email: currentMember.email ?? null,
            admin: currentMember.admin ?? false,
          };

      const myRegs = myRegsResult?.data ?? null;

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

      const calendarCompsMetaMap = new Map<string, { regCount: number; cmntCount: number }>();
      for (const row of calendarComps ?? []) {
        calendarCompsMetaMap.set(row.comp_id, {
          regCount: row.reg_count ?? 0,
          cmntCount: row.cmnt_count ? Number(row.cmnt_count) : 0,
        });
      }
      calendarMyRaces = (myRegs ?? [])
        .flatMap((r) => {
          const plan = Array.isArray(r.team_comp_plan_rel) ? r.team_comp_plan_rel[0] : r.team_comp_plan_rel;
          const comp = Array.isArray(plan.comp_mst) ? plan.comp_mst[0] : plan.comp_mst;
          if (!comp) return [];
          const meta = calendarCompsMetaMap.get(comp.comp_id);
          const race: CalendarRace = { id: comp.comp_id, title: comp.comp_nm, start_date: comp.stt_dt, type: "mine", location: comp.loc_nm ?? null, regCount: meta?.regCount ?? 0, cmntCount: meta?.cmntCount || undefined };
          return race.start_date >= monthStart && race.start_date <= monthLastDayStr ? [race] : [];
        });
    } else {
      initialMemberStatus = { status: "needs-onboarding", userId: user.id };
    }
  }

  const initialRegistrationsByCompetitionId: Record<string, CompetitionRegistration> = {};
  myRegistrations.forEach((reg) => {
    initialRegistrationsByCompetitionId[reg.competition_id] = reg;
  });

  return (
    <div className="flex flex-col gap-0">
      <div className="flex flex-col gap-7 px-6 pb-6">
        <Suspense>
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
        </Suspense>

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
      <div className="flex flex-col gap-7 px-6 pb-6">
        {/* MiniCalendar 영역 */}
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
        {/* SocialLinksGrid 영역 */}
        <div className="flex flex-col gap-4">
          <Skeleton className="h-3 w-12" />
          <div className="grid grid-cols-4 gap-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[72px] rounded-2xl" />
            ))}
          </div>
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
      <div className="flex shrink-0 items-center gap-1">
        <div className="size-8 shrink-0" />
        <div className="size-8 shrink-0" />
      </div>
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

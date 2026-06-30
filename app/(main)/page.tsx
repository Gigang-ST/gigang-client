import { Suspense } from "react";

import { dayjs, currentMonthKST, gridDateRange } from "@/lib/dayjs";
import { hasUnreadBoardPosts } from "@/lib/queries/board";
import { getCachedCmmCdRows } from "@/lib/queries/cmm-cd-cached";
import { getCachedHomeCalendar } from "@/lib/queries/home-calendar";
import { getCurrentMember } from "@/lib/queries/member";
import { getNotifications, getUnreadNotificationCount } from "@/lib/queries/notification";
import { getRequestTeamContext } from "@/lib/queries/request-team";

import { BoardPopoverIcon } from "@/components/board/board-popover-icon";
import { H1 } from "@/components/common/typography";
import { MiniCalendar } from "@/components/home/mini-calendar";
import type { CalendarRace } from "@/components/home/mini-calendar";
import { NotificationBellIcon } from "@/components/notifications/notification-bell-icon";
import type { MemberStatus } from "@/components/races/types";
import { SocialLinksGrid } from "@/components/social-links";
import { Skeleton } from "@/components/ui/skeleton";


async function HomeHeader() {
  const { member: currentMember } = await getCurrentMember();
  const { teamId } = await getRequestTeamContext();

  const [unreadNotiCount, { notice: hasUnreadNotice, update: hasUnreadUpdate }, initialNotifications] = await Promise.all([
    getUnreadNotificationCount(currentMember?.id),
    hasUnreadBoardPosts(currentMember?.id, teamId),
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
  const { user, member: currentMember } = await getCurrentMember();
  const { teamId } = await getRequestTeamContext();
  const monthStart = currentMonthKST();

  const [yearStr, monthStr] = monthStart.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const { end: gridEnd } = gridDateRange(year, month);

  // 캐시된 공개 데이터 조회 — DB 쿼리 0개 (캐시 히트 시)
  const [{ comps: calendarComps, schPosts: schPostRows, gatherings: gthrRows }, cmmCdRows] =
    await Promise.all([
      getCachedHomeCalendar(teamId, year, month),
      getCachedCmmCdRows(),
    ]);

  // memberStatus 판별 (기존 로직 유지)
  let initialMemberStatus: MemberStatus = { status: "signed-out" };
  if (user) {
    if (currentMember) {
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
    } else {
      initialMemberStatus = { status: "needs-onboarding", userId: user.id };
    }
  }

  // 공개 데이터 변환 — 유저별 로직 제거 (gathering은 항상 "gathering", is_attending은 클라이언트에서 overlay)
  const calendarGatherings: CalendarRace[] = gthrRows.map((row) => ({
    id: row.gthr_id,
    short_id: row.short_id ?? null,
    title: row.gthr_nm,
    start_date: dayjs(row.stt_at).tz("Asia/Seoul").format("YYYY-MM-DD"),
    end_date: row.end_at ? dayjs(row.end_at).tz("Asia/Seoul").format("YYYY-MM-DD") : null,
    type: "gathering" as const,
    post_type: row.gthr_type_enm,
    sprt_cd: row.sprt_cd ?? null,
    location: row.loc_txt ?? null,
    cont_txt: row.desc_txt ?? null,
    evt_stt_at: row.stt_at,
    evt_end_at: row.end_at ?? null,
    crt_by: row.crt_by,
    crt_by_nm: row.crt_by_nm ?? null,
    regCount: row.attd_count ? Number(row.attd_count) : 0,
    cmntCount: row.cmnt_count ? Number(row.cmnt_count) : undefined,
  }));

  const calendarSchPosts: CalendarRace[] = schPostRows.map((row) => ({
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

  const calendarGigangRaces: CalendarRace[] = calendarComps
    .filter((row) => (row.reg_count ?? 0) > 0 && row.stt_dt <= gridEnd)
    .map((row) => ({
      id: row.comp_id,
      title: row.comp_nm,
      start_date: row.stt_dt,
      type: "gigang" as const,
      location: row.loc_nm ?? null,
      regCount: row.reg_count ?? 0,
      cmntCount: row.cmnt_count ? Number(row.cmnt_count) : undefined,
    }));

  return (
    <div className="flex flex-col gap-0">
      <div className="flex flex-col gap-7 px-6 pb-6">
        <Suspense>
          <MiniCalendar
            gigangRaces={calendarGigangRaces}
            myRaces={[]}
            schPosts={calendarSchPosts}
            gatherings={calendarGatherings}
            teamId={teamId}
            memberId={currentMember?.id}
            memberAvatarUrl={currentMember?.avatar_url ?? null}
            cmmCdRows={cmmCdRows}
            initialMemberStatus={initialMemberStatus}
            initialRegistrationsByCompetitionId={{}}
          />
        </Suspense>
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
  // 두 컴포넌트가 같은 데이터를 쓰므로 렌더 시작 시점에 미리 워밍업
  // React cache()가 같은 렌더 내 중복 호출을 막아주므로 실제 쿼리는 1번만 실행됨
  void getCurrentMember();
  void getRequestTeamContext();

  return (
    <div className="flex flex-col gap-0">
      <Suspense fallback={<HomeHeaderSkeleton />}>
        <HomeHeader />
      </Suspense>
      <Suspense fallback={<HomeSkeleton />}>
        <HomeContent />
      </Suspense>
      <div className="px-6 pb-6">
        <SocialLinksGrid />
      </div>
    </div>
  );
}

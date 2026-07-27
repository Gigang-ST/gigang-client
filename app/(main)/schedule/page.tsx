import { Suspense } from "react";


import { dayjs, currentMonthKST, gridDateRange } from "@/lib/dayjs";
import { getCachedCmmCdRows } from "@/lib/queries/cmm-cd-cached";
import { getCachedHomeCalendar } from "@/lib/queries/home-calendar";
import { getCurrentMember } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";

import { HeaderActions } from "@/components/common/header-actions";
import { PageHeader } from "@/components/common/page-header";
import { HeaderTicker, type HeaderUpcoming } from "@/components/home/header-ticker";
import { MiniCalendar } from "@/components/home/mini-calendar";
import type { CalendarRace } from "@/components/home/mini-calendar";
import type { MemberStatus } from "@/components/races/types";
import { Skeleton } from "@/components/ui/skeleton";


async function HomeHeader() {
  const { member: currentMember, supabase } = await getCurrentMember();
  const { teamId } = await getRequestTeamContext();

  // 헤더 롤링용: 내가 참석 등록한 D-5 이내 다음 모임 1건 (없으면 슬로건 고정)
  const now = dayjs();
  const upcomingPromise = currentMember
    ? supabase
        .from("gthr_mst")
        .select("gthr_id, short_id, gthr_nm, stt_at, gthr_attd_rel!inner(mem_id)")
        .eq("team_id", teamId)
        .eq("del_yn", false)
        .eq("gthr_attd_rel.mem_id", currentMember.id)
        .gte("stt_at", now.toISOString())
        .lte("stt_at", now.add(5, "day").toISOString())
        .order("stt_at", { ascending: true })
        .limit(1)
        .maybeSingle()
    : Promise.resolve({ data: null });

  const { data: upcomingRow } = await upcomingPromise;

  let upcoming: HeaderUpcoming | null = null;
  if (upcomingRow) {
    const stt = dayjs(upcomingRow.stt_at).tz("Asia/Seoul");
    const dayDiff = stt.startOf("day").diff(dayjs().tz("Asia/Seoul").startOf("day"), "day");
    upcoming = {
      // uuid를 쓰면 딥링크가 마스터+상세+참석 병렬 1 RTT 패스트패스를 탄다 (short_id는 조회 선행 필요)
      // 목적지는 /schedule 고정 — ?gthr= 를 읽는 건 MiniCalendar이고 그건 이 페이지에만 있다.
      // 홈(/)은 HOME_PAGE에 따라 전광판일 수 있어, /로 보내면 모임 상세가 안 열린다.
      href: `/schedule?gthr=${upcomingRow.gthr_id}`,
      dLabel: dayDiff <= 0 ? "오늘" : dayDiff === 1 ? "내일" : `D-${dayDiff}`,
      timeLabel: stt.format("ddd HH:mm"),
      title: upcomingRow.gthr_nm,
    };
  }

  // 일정 헤더도 다른 탭과 같은 editorial 양식(제목 + 괘선)을 쓴다. 다른 점은 제목·액션
  // 사이 가운데 슬롯(center)에 티커(슬로건 ↔ 다음 모임 칩)를 얹는 것 — 슬로건은 이 탭의
  // 정체성 문구라 자리를 지킨다. 티커는 스스로 절대배치로 가운데 정렬하므로 슬롯 안에
  // 위치 기준만 잡아주는 얇은 래퍼(h-8 relative)에 담는다.
  return (
    <PageHeader
      variant="editorial"
      label="Schedule"
      title="일정"
      action={<HeaderActions />}
      center={
        <div className="relative h-8 w-full">
          <HeaderTicker upcoming={upcoming} />
        </div>
      }
    />
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
        ? {
            status: "inactive",
            userId: user.id,
            memberId: currentMember.id,
            memberSt: currentMember.status === "left" ? "left" : "inactive",
          }
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
    maxPrtCnt: row.max_prt_cnt ?? null,
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
  // 본 헤더와 같은 editorial 골격 + 가운데 슬로건. 데이터가 오기 전(티커의 다음 모임
  // 조회 중)에도 높이·간격이 동일해 로딩→로드 전환에 헤더가 튀지 않는다.
  return (
    <PageHeader
      variant="editorial"
      label="Schedule"
      title="일정"
      action={
        <div className="flex shrink-0 items-center gap-1">
          <div className="size-8 shrink-0" />
          <div className="size-8 shrink-0" />
        </div>
      }
      center={
        <div className="flex h-8 flex-col items-center justify-center">
          <p className="font-sans text-[length:var(--text-slogan-eyebrow)] uppercase tracking-[var(--tracking-slogan-eyebrow)] text-muted-foreground">
            Since 2024.04.23
          </p>
          <p className="font-sans text-[length:var(--text-label)] font-black italic uppercase leading-tight tracking-[var(--tracking-slogan)] text-foreground">
            No time to be weak
          </p>
        </div>
      }
    />
  );
}

/** 일정(달력) 지면 — 예전 홈(`/`). 홈 자리는 전광판이 가져갔다. */
export default function SchedulePage() {
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
    </div>
  );
}

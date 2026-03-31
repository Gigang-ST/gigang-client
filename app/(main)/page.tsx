import { Skeleton } from "@/components/ui/skeleton";
import { CardItem } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { secondsToTime, validateUUID } from "@/lib/utils";
import { Suspense } from "react";
import Link from "next/link";
import { SocialLinksGrid } from "@/components/social-links";
import { UpcomingRaces } from "@/components/home/upcoming-races";
import type { CompetitionRegistration, MemberStatus } from "@/components/races/types";


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
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  // 현재 유저 확인
  const { data: { user } } = await supabase.auth.getUser();
  let initialMemberStatus: MemberStatus = { status: "signed-out" };

  const [
    { count: memberCount },
    { data: gigangRacesRaw },
    { count: upcomingCount },
    { data: recentRecords },
  ] = await Promise.all([
    supabase
      .from("member")
      .select("*", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("competition")
      .select("id, title, start_date, location, sport, event_types, competition_registration(id, event_type)")
      .gte("start_date", today)
      .order("start_date", { ascending: true }),
    supabase
      .from("competition")
      .select("*", { count: "exact", head: true })
      .gte("start_date", today),
    supabase
      .from("personal_best")
      .select(
        "member_id, event_type, record_time_sec, race_name, updated_at, member:member_id(full_name)",
      )
      .order("updated_at", { ascending: false })
      .limit(2),
  ]);

  // 기강대회: 등록자 1명 이상, 중복 제거 + 참가자 등록 event_type 수집
  type RegRow = { id: string; event_type: string | null };
  const seenIds = new Set<string>();
  const gigangRaces: UpcomingRace[] = (gigangRacesRaw ?? [])
    .filter((r) => {
      const regs = r.competition_registration as unknown as RegRow[] | null;
      if (!regs || regs.length === 0) return false;
      if (seenIds.has(r.id)) return false;
      seenIds.add(r.id);
      return true;
    })
    .map(({ competition_registration, ...rest }) => {
      const regs = (competition_registration ?? []) as unknown as RegRow[];
      const registered_event_types = [
        ...new Set(regs.map((re) => re.event_type).filter((et): et is string => Boolean(et?.trim()))),
      ].sort();
      return {
        ...rest,
        regCount: regs.length,
        registered_event_types: registered_event_types.length > 0 ? registered_event_types : undefined,
      };
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
    validateUUID(user.id);
    const { data: member } = await supabase
      .from("member")
      .select("id, full_name, email, admin")
      .or(`kakao_user_id.eq.${user.id},google_user_id.eq.${user.id}`)
      .maybeSingle();
    if (member) {
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
        .from("competition_registration")
        .select(
          "id, competition_id, member_id, role, event_type, created_at, competition:competition_id(id, title, start_date, location, sport, event_types)",
        )
        .eq("member_id", member.id);
      myRegistrations = (myRegs ?? []).map((r) => ({
        id: r.id,
        competition_id: r.competition_id,
        member_id: r.member_id,
        role: r.role,
        event_type: r.event_type,
        created_at: r.created_at,
      })) as CompetitionRegistration[];
      myRaces = (myRegs ?? [])
        .map((r) => r.competition as unknown as UpcomingRace)
        .filter((c) => c && c.start_date >= today)
        .sort((a, b) => a.start_date.localeCompare(b.start_date));
      // 내 대회 각 competition에 대해 참가자들이 등록한 event_type 수집
      if (myRaces.length > 0) {
        const { data: regsByComp } = await supabase
          .from("competition_registration")
          .select("competition_id, event_type")
          .in("competition_id", myRaces.map((r) => r.id));
        const byCompId = new Map<string, Set<string>>();
        (regsByComp ?? []).forEach((row) => {
          if (!row.event_type?.trim()) return;
          let set = byCompId.get(row.competition_id);
          if (!set) { set = new Set(); byCompId.set(row.competition_id, set); }
          set.add(row.event_type!.trim());
        });
        myRaces = myRaces.map((r) => {
          const set = byCompId.get(r.id);
          const registered_event_types = set ? [...set].sort() : undefined;
          return { ...r, registered_event_types };
        });
      }
    } else {
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
  } else if (!user) {
    // 비로그인: 기강대회 다음 슬롯
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

  return (
    <div className="flex flex-col gap-7 px-6 pb-6">
        {/* Team Overview */}
        <div className="flex flex-col gap-4">
          <span className="text-xs font-semibold tracking-widest text-muted-foreground">
            TEAM OVERVIEW
          </span>
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
          races={upcomingCards}
          initialMemberStatus={initialMemberStatus}
          initialRegistrationsByCompetitionId={initialRegistrationsByCompetitionId}
        />

        {/* Recent Records */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-widest text-muted-foreground">
              RECENT RECORDS
            </span>
            <Link
              href="/records"
              className="text-xs font-medium text-primary"
            >
              모두 보기
            </Link>
          </div>
          {(recentRecords ?? []).length === 0 ? (
            <CardItem variant="dashed" className="py-8 text-center text-sm text-muted-foreground">
              등록된 기록이 없습니다.
            </CardItem>
          ) : (
            (recentRecords ?? []).map((rec) => {
              const member = rec.member as unknown as { full_name: string } | null;
              return (
                <CardItem
                  key={`${rec.member_id}-${rec.event_type}`}
                  className="flex items-center justify-between"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[15px] font-semibold text-foreground">
                      {member?.full_name ?? "멤버"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {rec.event_type} · {rec.race_name}
                    </span>
                  </div>
                  <span className="font-mono text-lg font-bold text-foreground">
                    {secondsToTime(rec.record_time_sec)}
                  </span>
                </CardItem>
              );
            })
          )}
        </div>

        {/* Social Links */}
        <SocialLinksGrid
          kakaoChatPassword={isMember ? (process.env.KAKAO_CHAT_PASSWORD ?? "") : undefined}
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
        <h1 className="text-[28px] font-bold tracking-tight text-foreground">
          기강
        </h1>
      </div>
      <Suspense fallback={<HomeSkeleton />}>
        <HomeContent />
      </Suspense>
    </div>
  );
}

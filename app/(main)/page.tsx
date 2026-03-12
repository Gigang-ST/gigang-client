import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/server";
import { Suspense } from "react";
import { Calendar, MapPin } from "lucide-react";
import Link from "next/link";
import { SocialLinksGrid } from "@/components/social-links";

function formatDDay(dateStr: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const diff = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "D-DAY";
  if (diff > 0) return `D-${diff}`;
  return `D+${Math.abs(diff)}`;
}

type UpcomingRace = {
  id: string;
  title: string;
  start_date: string;
  location: string | null;
  sport: string | null;
  event_types: string[] | null;
  regCount?: number;
  label?: string;
};

/** 같은 주말(토-일)이면 true */
function isSameWeekend(dateA: string, dateB: string) {
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
      .select("id, title, start_date, location, sport, event_types, competition_registration(id)")
      .gte("start_date", today)
      .order("start_date", { ascending: true }),
    supabase
      .from("competition")
      .select("*", { count: "exact", head: true })
      .gte("start_date", today),
    supabase
      .from("personal_best")
      .select(
        "event_type, record_time_sec, race_name, updated_at, member:member_id(full_name)",
      )
      .order("updated_at", { ascending: false })
      .limit(2),
  ]);

  // 기강대회: 등록자 1명 이상, 중복 제거
  const seenIds = new Set<string>();
  const gigangRaces: UpcomingRace[] = (gigangRacesRaw ?? [])
    .filter((r) => {
      const regs = r.competition_registration as unknown as { id: string }[];
      if (!regs || regs.length === 0) return false;
      if (seenIds.has(r.id)) return false;
      seenIds.add(r.id);
      return true;
    })
    .map(({ competition_registration, ...rest }) => ({
      ...rest,
      regCount: (competition_registration as unknown as { id: string }[]).length,
    }));

  // 기강대회 1번 카드: 가장 가까운 것 (같은 주말이면 참여 인원 많은 것)
  let topGigang: UpcomingRace | null = null;
  if (gigangRaces.length > 0) {
    const first = gigangRaces[0];
    // 같은 주말에 있는 대회들 모으기
    const weekendGroup = gigangRaces.filter(
      (r) => r.start_date === first.start_date || isSameWeekend(r.start_date, first.start_date),
    );
    // 참여 인원 많은 순
    weekendGroup.sort((a, b) => (b.regCount ?? 0) - (a.regCount ?? 0));
    topGigang = weekendGroup[0];
  }

  // 내가 참가하는 대회 가져오기
  let myRaces: UpcomingRace[] = [];
  if (user) {
    const { data: member } = await supabase
      .from("member")
      .select("id")
      .or(`kakao_user_id.eq.${user.id},google_user_id.eq.${user.id}`)
      .maybeSingle();
    if (member) {
      const { data: myRegs } = await supabase
        .from("competition_registration")
        .select("competition:competition_id(id, title, start_date, location, sport, event_types)")
        .eq("member_id", member.id);
      myRaces = (myRegs ?? [])
        .map((r) => r.competition as unknown as UpcomingRace)
        .filter((c) => c && c.start_date >= today)
        .sort((a, b) => a.start_date.localeCompare(b.start_date));
    }
  }

  // 2개 카드 결정
  const upcomingCards: UpcomingRace[] = [];

  // 카드 1: 기강대회 중 가장 가까운 것
  if (topGigang) {
    upcomingCards.push({ ...topGigang, label: "기강 대회" });
  }

  // 카드 2: 내가 나가는 대회 (카드1과 다른 것)
  const myNext = myRaces.find((r) => r.id !== topGigang?.id);
  if (myNext) {
    upcomingCards.push({ ...myNext, label: "내 대회" });
  } else if (myRaces.length > 0 && myRaces[0].id === topGigang?.id) {
    // 내 대회가 기강1번과 같으면 → 기강대회 그 다음 것
    const nextGigang = gigangRaces.find((r) => r.id !== topGigang?.id);
    if (nextGigang) {
      upcomingCards.push({ ...nextGigang, label: "기강 대회" });
    }
  } else if (!user) {
    // 비로그인: 기강대회 두 번째
    const nextGigang = gigangRaces.find((r) => r.id !== topGigang?.id);
    if (nextGigang) {
      upcomingCards.push({ ...nextGigang, label: "기강 대회" });
    }
  }

  function secondsToTime(sec: number) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  return (
    <div className="flex flex-col gap-7 px-6 pb-6">
        {/* Team Overview */}
        <div className="flex flex-col gap-4">
          <span className="text-xs font-semibold tracking-widest text-muted-foreground">
            TEAM OVERVIEW
          </span>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1 rounded-2xl border-[1.5px] border-border p-4">
              <span className="text-2xl font-bold text-foreground">
                {memberCount ?? 0}
              </span>
              <span className="text-xs text-muted-foreground">활동 멤버</span>
            </div>
            <div className="flex flex-col gap-1 rounded-2xl border-[1.5px] border-border p-4">
              <span className="text-2xl font-bold text-foreground">
                {upcomingCount ?? 0}
              </span>
              <span className="text-xs text-muted-foreground">예정 대회</span>
            </div>
          </div>
        </div>

        {/* Social Links */}
        <SocialLinksGrid />

        {/* Upcoming Races */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-widest text-muted-foreground">
              UPCOMING RACES
            </span>
            <Link
              href="/races"
              className="text-xs font-medium text-primary"
            >
              모두 보기
            </Link>
          </div>
          {upcomingCards.length === 0 ? (
            <p className="rounded-2xl border-[1.5px] border-dashed border-border py-8 text-center text-sm text-muted-foreground">
              예정된 대회가 없습니다
            </p>
          ) : (
            upcomingCards.map((race) => (
              <div
                key={race.id}
                className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-border p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex flex-col gap-1">
                    {race.label && (
                      <span className="text-[11px] font-semibold text-primary">
                        {race.label}
                      </span>
                    )}
                    <span className="text-[15px] font-semibold text-foreground">
                      {race.title}
                    </span>
                  </div>
                  <span className="shrink-0 rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-bold text-destructive">
                    {formatDDay(race.start_date)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="size-3" />
                    {race.start_date}
                  </span>
                  {race.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="size-3" />
                      {race.location}
                    </span>
                  )}
                </div>
                {race.event_types && race.event_types.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {race.event_types.map((et: string) => (
                      <span
                        key={et}
                        className="rounded-full bg-foreground px-2.5 py-0.5 text-[11px] font-bold text-background"
                      >
                        {et}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

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
            <p className="rounded-2xl border-[1.5px] border-dashed border-border py-8 text-center text-sm text-muted-foreground">
              등록된 기록이 없습니다
            </p>
          ) : (
            (recentRecords ?? []).map((rec, i) => {
              const member = rec.member as unknown as { full_name: string } | null;
              return (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-2xl border-[1.5px] border-border p-4"
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
                </div>
              );
            })
          )}
        </div>
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

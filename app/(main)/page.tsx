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

async function HomeContent() {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  const [
    { count: memberCount },
    { data: upcomingRaces },
    { count: upcomingCount },
    { data: recentRecords },
  ] = await Promise.all([
    supabase
      .from("member")
      .select("*", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("competition")
      .select("id, title, start_date, location, sport, event_types")
      .gte("start_date", today)
      .order("start_date", { ascending: true })
      .limit(2),
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
          {(upcomingRaces ?? []).length === 0 ? (
            <p className="rounded-2xl border-[1.5px] border-dashed border-border py-8 text-center text-sm text-muted-foreground">
              예정된 대회가 없습니다
            </p>
          ) : (
            (upcomingRaces ?? []).map((race) => (
              <div
                key={race.id}
                className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-border p-4"
              >
                <div className="flex items-start justify-between">
                  <span className="text-[15px] font-semibold text-foreground">
                    {race.title}
                  </span>
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

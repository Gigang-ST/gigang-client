import { Skeleton } from "@/components/ui/skeleton";
import { H1 } from "@/components/common/typography";
import { createClient as createPublicClient } from "@supabase/supabase-js";
import { todayKST } from "@/lib/dayjs";
import { unstable_cache } from "next/cache";
import { Suspense } from "react";
import { RaceListView } from "@/components/races/race-list-view";
import type { Competition } from "@/components/races/types";

const supabase = createPublicClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);

const cacheOptions = { revalidate: 86400, tags: ["competitions"] };

const getUpcomingCompetitions = unstable_cache(
  async () => {
    const today = todayKST();
    const endOfYear = `${today.slice(0, 4)}-12-31`;
    const { data } = await supabase
      .from("competition")
      .select(
        "id, external_id, sport, title, start_date, end_date, location, event_types, source_url",
      )
      .gte("start_date", today)
      .lte("start_date", endOfYear)
      .order("start_date", { ascending: true });
    return { competitions: (data ?? []) as Competition[], today };
  },
  ["competitions-upcoming"],
  cacheOptions,
);

const getGigangCompetitions = unstable_cache(
  async () => {
    const today = todayKST();
    const endOfYear = `${today.slice(0, 4)}-12-31`;
    const { data } = await supabase
      .from("competition")
      .select(
        "id, external_id, sport, title, start_date, end_date, location, event_types, source_url, competition_registration!inner(id)",
      )
      .gte("start_date", today)
      .lte("start_date", endOfYear)
      .order("start_date", { ascending: true });

    // competition_registration 필드를 제거하고 Competition 타입으로 반환
    const competitions = (data ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ competition_registration, ...rest }) => rest,
    ) as Competition[];

    // 중복 제거 (같은 대회에 여러 등록이 있으면 중복 반환됨)
    const seen = new Set<string>();
    const unique = competitions.filter(c => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
    return unique;
  },
  ["competitions-gigang"],
  cacheOptions,
);

async function RacesContent() {
  const [{ competitions }, gigangCompetitions] = await Promise.all([
    getUpcomingCompetitions(),
    getGigangCompetitions(),
  ]);

  return (
    <RaceListView
      allCompetitions={competitions}
      gigangCompetitions={gigangCompetitions}
      initialMemberStatus={{ status: "loading" }}
      initialRegistrationsByCompetitionId={{}}
      initialRegCounts={{}}
    />
  );
}

function RacesSkeleton() {
  return (
    <>
      <div className="flex gap-0 px-6">
        <Skeleton className="h-9 flex-1 rounded-lg" />
        <Skeleton className="h-9 flex-1 rounded-lg" />
      </div>
      <div className="flex flex-col gap-4 px-6 pt-4 pb-6">
        <Skeleton className="h-5 w-24 rounded" />
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
      </div>
    </>
  );
}

export default function RacesPage() {
  return (
    <div className="flex flex-col gap-0">
      <div className="flex h-14 items-center px-6">
        <H1 className="font-semibold">대회</H1>
      </div>
      <Suspense fallback={<RacesSkeleton />}>
        <RacesContent />
      </Suspense>
    </div>
  );
}

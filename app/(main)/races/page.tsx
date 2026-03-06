import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { Suspense } from "react";
import { RaceListView } from "@/components/races/race-list-view";
import type { Competition } from "@/components/races/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);

const getUpcomingCompetitions = unstable_cache(
  async () => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const endOfYear = `${now.getFullYear()}-12-31`;
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
  { revalidate: 86400, tags: ["competitions"] },
);

async function RacesContent() {
  const { competitions, today } = await getUpcomingCompetitions();
  return <RaceListView upcomingCompetitions={competitions} today={today} />;
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
        <h1 className="text-[28px] font-semibold tracking-tight text-foreground">
          대회
        </h1>
      </div>
      <Suspense fallback={<RacesSkeleton />}>
        <RacesContent />
      </Suspense>
    </div>
  );
}

import { Skeleton } from "@/components/ui/skeleton";
import { H1 } from "@/components/common/typography";
import { createClient as createPublicClient } from "@supabase/supabase-js";
import { todayKST } from "@/lib/dayjs";
import { unstable_cache } from "next/cache";
import { Suspense } from "react";
import { RaceListView } from "@/components/races/race-list-view";
import type { Competition } from "@/components/races/types";
import { env } from "@/lib/env";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import type { Database } from "@/lib/supabase/database.types";

const supabase = createPublicClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

const cacheOptions = { revalidate: 86400, tags: ["competitions"] };

const getUpcomingCompetitions = unstable_cache(
  async () => {
    const today = todayKST();
    const endOfYear = `${today.slice(0, 4)}-12-31`;
    const { data } = await supabase
      .from("comp_mst")
      .select(
        "comp_id, ext_id, comp_sprt_cd, comp_nm, stt_dt, end_dt, loc_nm, src_url, comp_evt_cfg(comp_evt_cd)",
      )
      .eq("vers", 0)
      .eq("del_yn", false)
      .gte("stt_dt", today)
      .lte("stt_dt", endOfYear)
      .order("stt_dt", { ascending: true });
    const competitions: Competition[] = (data ?? []).map((row) => ({
      id: row.comp_id,
      external_id: row.ext_id ?? "",
      sport: row.comp_sprt_cd,
      title: row.comp_nm,
      start_date: row.stt_dt,
      end_date: row.end_dt,
      location: row.loc_nm,
      event_types: (row.comp_evt_cfg ?? []).map((e) => e.comp_evt_cd?.toUpperCase()).filter(Boolean) as string[],
      source_url: row.src_url,
    }));
    return { competitions, today };
  },
  ["competitions-upcoming"],
  cacheOptions,
);

const getTeamCompetitions = unstable_cache(
  async (teamId: string) => {
    const today = todayKST();
    const endOfYear = `${today.slice(0, 4)}-12-31`;
    const { data } = await supabase.rpc("get_public_team_competitions", {
      p_team_id: teamId,
      p_start: today,
      p_end: endOfYear,
    });

    const rows = (data ?? []) as Database["public"]["Functions"]["get_public_team_competitions"]["Returns"];
    const competitions = rows
      .filter((row) => (row.reg_count ?? 0) > 0)
      .map((row) => {
      return {
        id: row.comp_id,
        external_id: row.ext_id ?? "",
        sport: row.comp_sprt_cd,
        title: row.comp_nm,
        start_date: row.stt_dt,
        end_date: row.end_dt,
        location: row.loc_nm,
        event_types: (row.comp_evt_cds ?? []).map((e) => e?.toUpperCase()).filter(Boolean),
        source_url: row.src_url,
      } as Competition;
    });
    return competitions;
  },
  ["competitions-team"],
  cacheOptions,
);

async function RacesContent() {
  const { teamId } = await getRequestTeamContext();
  const [{ competitions }, gigangCompetitions] = await Promise.all([
    getUpcomingCompetitions(),
    getTeamCompetitions(teamId),
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

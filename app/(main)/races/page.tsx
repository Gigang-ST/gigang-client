import { Skeleton } from "@/components/ui/skeleton";
import { H1 } from "@/components/common/typography";
import { createClient as createPublicClient } from "@supabase/supabase-js";
import { todayKST } from "@/lib/dayjs";
import { unstable_cache } from "next/cache";
import { Suspense } from "react";
import { RaceListView } from "@/components/races/race-list-view";
import type { Competition } from "@/components/races/types";
import { env } from "@/lib/env";

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
        "comp_id, ext_id, comp_sprt_cd, comp_nm, stt_dt, end_dt, loc_nm, src_url, comp_evt_cfg(evt_cd)",
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
      event_types: (row.comp_evt_cfg ?? []).map((e) => e.evt_cd?.toUpperCase()).filter(Boolean) as string[],
      source_url: row.src_url,
    }));
    return { competitions, today };
  },
  ["competitions-upcoming"],
  cacheOptions,
);

const getGigangCompetitions = unstable_cache(
  async () => {
    const today = todayKST();
    const endOfYear = `${today.slice(0, 4)}-12-31`;
    const { data } = await supabase
      .from("team_comp_plan_rel")
      .select(
        "team_comp_id, comp_mst!inner(comp_id, ext_id, comp_sprt_cd, comp_nm, stt_dt, end_dt, loc_nm, src_url, comp_evt_cfg(evt_cd)), comp_reg_rel!inner(comp_reg_id)",
      )
      .eq("vers", 0)
      .eq("del_yn", false)
      .gte("comp_mst.stt_dt", today)
      .lte("comp_mst.stt_dt", endOfYear)
      .order("stt_dt", { foreignTable: "comp_mst", ascending: true });

    const competitions = (data ?? []).map((row) => {
      const comp = Array.isArray(row.comp_mst) ? row.comp_mst[0] : row.comp_mst;
      return {
        id: comp.comp_id,
        external_id: comp.ext_id ?? "",
        sport: comp.comp_sprt_cd,
        title: comp.comp_nm,
        start_date: comp.stt_dt,
        end_date: comp.end_dt,
        location: comp.loc_nm,
        event_types: (comp.comp_evt_cfg ?? []).map((e) => e.evt_cd?.toUpperCase()).filter(Boolean),
        source_url: comp.src_url,
      } as Competition;
    });

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

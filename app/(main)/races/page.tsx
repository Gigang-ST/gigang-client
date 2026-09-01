import type { Metadata } from "next";
import { Skeleton } from "@/components/ui/skeleton";
import { H1 } from "@/components/common/typography";
import { createClient as createPublicClient } from "@supabase/supabase-js";
import { todayKST } from "@/lib/dayjs";
import { unstable_cache } from "next/cache";
import { Suspense } from "react";
import { RaceListView } from "@/components/races/race-list-view";
import type { Competition } from "@/components/races/types";
import { env } from "@/lib/env";
import { getCachedCmmCdRows } from "@/lib/queries/cmm-cd-cached";
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
        "comp_id, short_id, crt_by, ext_id, comp_sprt_cd, comp_nm, stt_dt, end_dt, loc_nm, src_url, comp_evt_cfg(comp_evt_type)",
      )
      .eq("vers", 0)
      .eq("del_yn", false)
      .gte("stt_dt", today)
      .lte("stt_dt", endOfYear)
      .order("stt_dt", { ascending: true });
    const competitions: Competition[] = (data ?? []).map((row) => ({
      id: row.comp_id,
      // 공유 링크가 이걸 쓴다 — 안 실으면 상세 다이얼로그가 uuid로 폴백한다
      short_id: row.short_id ?? null,
      crt_by: row.crt_by ?? null,
      external_id: row.ext_id ?? "",
      sport: row.comp_sprt_cd,
      title: row.comp_nm,
      start_date: row.stt_dt,
      end_date: row.end_dt,
      location: row.loc_nm,
      event_types: (row.comp_evt_cfg ?? []).map((e) => e.comp_evt_type?.toUpperCase()).filter(Boolean) as string[],
      source_url: row.src_url,
    }));
    return { competitions, today };
  },
  // ⚠️ 페이로드 모양을 바꾸면 **키를 올린다**(`-v2`, `-v3`…). 안 올리면 배포 직후에도
  // 옛 캐시가 새 필드 없이 돌아와(revalidate 24시간) 고친 게 하루 동안 안 보인다 —
  // short_id를 넣은 게 정확히 그 경우였다.
  ["competitions-upcoming-v2"],
  cacheOptions,
);

async function fetchTeamCompetitionsForTeam(teamId: string) {
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
        short_id: row.short_id ?? null,
        crt_by: row.crt_by ?? null,
        external_id: row.ext_id ?? "",
        sport: row.comp_sprt_cd,
        title: row.comp_nm,
        start_date: row.stt_dt,
        end_date: row.end_dt,
        location: row.loc_nm,
        event_types: (row.comp_evt_types ?? []).map((e) => e?.toUpperCase()).filter(Boolean),
        source_url: row.src_url,
      } as Competition;
    });

  const regCounts: Record<string, number> = {};
  rows.forEach((row) => {
    if (!row.comp_id) return;
    regCounts[row.comp_id] = Number(row.reg_count ?? 0);
  });

  return { competitions, regCounts };
}

async function RacesContent() {
  const { teamId } = await getRequestTeamContext();
  const [{ competitions }, gigangData, cmmCdRows] = await Promise.all([
    getUpcomingCompetitions(),
    fetchTeamCompetitionsForTeam(teamId),
    getCachedCmmCdRows(),
  ]);

  return (
    <RaceListView
      cmmCdRows={cmmCdRows}
      teamId={teamId}
      allCompetitions={competitions}

      initialMemberStatus={{ status: "loading" }}
      initialRegistrationsByCompetitionId={{}}
      initialRegCounts={gigangData.regCounts}
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

export const metadata: Metadata = {
  title: "참가 대회",
  description: "기강 러닝크루가 함께 나가는 마라톤·대회 일정과 크루원 참가 현황.",
  alternates: { canonical: "/races" },
};

export default function RacesPage() {
  void getRequestTeamContext();

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

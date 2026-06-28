import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";

import { gridDateRange } from "@/lib/dayjs";
import { createAdminClient } from "@/lib/supabase/admin";

/** 홈 캘린더 공개 데이터 캐시 태그 */
export const HOME_CALENDAR_CACHE_TAG = "home-calendar";

async function loadHomeCalendar(teamId: string, year: number, month: number) {
  const supabase = createAdminClient();
  const { end: gridEnd, fetchStart } = gridDateRange(year, month);

  const [
    { data: comps, error: compErr },
    { data: schPosts, error: schErr },
    { data: gatherings, error: gthrErr },
  ] = await Promise.all([
    supabase.rpc("get_public_team_competitions", {
      p_team_id: teamId,
      p_start: fetchStart,
      p_end: gridEnd,
    }),
    supabase.rpc("get_public_team_sch_posts", {
      p_team_id: teamId,
      p_start: fetchStart,
      p_end: gridEnd,
    }),
    supabase.rpc("get_public_team_gatherings", {
      p_team_id: teamId,
      p_start: fetchStart,
      p_end: gridEnd,
      // p_mem_id 미전달 — 공개 데이터만 캐싱
    }),
  ]);

  if (compErr || schErr || gthrErr) {
    const err = compErr ?? schErr ?? gthrErr;
    console.error("홈 캘린더 공개 데이터 조회 실패:", err);
    throw new Error("홈 캘린더 데이터 조회에 실패했습니다.", { cause: err });
  }

  return {
    comps: comps ?? [],
    schPosts: schPosts ?? [],
    gatherings: gatherings ?? [],
  };
}

function createCachedHomeCalendar(teamId: string, year: number, month: number) {
  return unstable_cache(
    () => loadHomeCalendar(teamId, year, month),
    [`home-calendar-${teamId}-${year}-${month}`],
    { tags: [HOME_CALENDAR_CACHE_TAG] },
  );
}

/**
 * 홈 캘린더 공개 데이터 (대회·일정포스트·모임) 캐시 조회.
 * - `unstable_cache`: 요청 간 Next.js 데이터 캐시 (on-demand revalidation 전용)
 * - `cache()`: 동일 렌더 내 중복 호출 제거
 */
export const getCachedHomeCalendar = cache(
  async (teamId: string, year: number, month: number) =>
    createCachedHomeCalendar(teamId, year, month)(),
);

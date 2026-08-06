import "server-only";

import { unstable_cache } from "next/cache";

import { gridFetchRange } from "@/lib/dayjs";
import { createAdminClient } from "@/lib/supabase/admin";

/** 홈 캘린더 공개 데이터 캐시 태그 */
export const HOME_CALENDAR_CACHE_TAG = "home-calendar";

async function loadHomeCalendar(teamId: string, year: number, month: number) {
  const supabase = createAdminClient();
  // 시작 요일은 회원별 설정이지만 이 캐시는 **팀 공용**이라, 범위를 두 시작 요일의
  // 합집합으로 잡아 엔트리 하나가 둘 다 서빙하게 한다(§lib/dayjs gridFetchRange).
  // 범위 밖 행은 각 화면이 자기 gridDateRange로 거른다.
  const { end: gridEnd, fetchStart } = gridFetchRange(year, month);

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
    // v2: 조회 범위를 시작 요일 합집합으로 넓힌 버전. **키를 안 올리면** 배포 직후 남아 있는
    // 옛 좁은 범위 엔트리가 그대로 서빙돼, 월요일 시작을 켠 회원의 가장자리 일정이
    // 만료(1시간)까지 조용히 빈다. 범위·페이로드 모양을 바꾸면 반드시 함께 올린다.
    [`home-calendar-v2-${teamId}-${year}-${month}`],
    // revalidate: 무효화 주경로는 DB 트리거 웹훅(revalidateTag)이고,
    // 시간 만료는 웹훅 유실 시 영구 stale을 막는 안전망 (stale-while-revalidate라 대기 유저 없음)
    { tags: [HOME_CALENDAR_CACHE_TAG], revalidate: 3600 },
  );
}

/**
 * 홈 캘린더 공개 데이터 (대회·일정포스트·모임) 캐시 조회.
 * `unstable_cache`: 요청 간 Next.js 데이터 캐시 (웹훅 태그 무효화 + 1시간 만료 안전망)
 */
export async function getCachedHomeCalendar(teamId: string, year: number, month: number) {
  return createCachedHomeCalendar(teamId, year, month)();
}

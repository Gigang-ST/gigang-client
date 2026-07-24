import "server-only";

import { unstable_cache } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { isRequestAbortError } from "@/lib/supabase/is-abort-error";

/** 한 주(월요일 시작, KST)의 크루 합계 */
export type TeamWeek = {
  /** 주 시작일 YYYY-MM-DD */
  w_start: string;
  gthr_cnt: number;
  /** 참석 연인원 */
  attd_cnt: number;
  rec_cnt: number;
};

export type TeamOverview = {
  /** 활동 회원 수 */
  mem_cnt: number;
  /** 최근 8주. **마지막 원소가 이번 주(지금까지)** — 기상 판정의 기준이 된다 */
  weeks: TeamWeek[];
};

const EMPTY_OVERVIEW: TeamOverview = { mem_cnt: 0, weeks: [] };

/**
 * 크루 오버뷰 조회 — 회원 수 + 최근 8주 활동량.
 *
 * 전부 공개 집계라 사용자별로 갈라지지 않는다. 주 단위 수치라 1시간 캐시로 충분하고,
 * 모임·기록 태그로도 무효화해 새 활동이 그날 안에 반영되게 한다.
 */
export function getTeamOverview(teamId: string): Promise<TeamOverview> {
  return unstable_cache(
    async () => {
      const supabase = createAdminClient();
      const { data, error } = await supabase.rpc("get_team_overview", {
        p_team_id: teamId,
      });

      if (error) {
        if (!isRequestAbortError(error)) {
          console.error("[getTeamOverview] 오버뷰 조회 실패", error);
        }
        return EMPTY_OVERVIEW;
      }

      // RPC가 아직 배포 안 된 환경에서도 화면이 터지지 않게 기본값 위에 덮는다.
      return { ...EMPTY_OVERVIEW, ...((data as Partial<TeamOverview> | null) ?? {}) };
    },
    ["team-overview", teamId],
    { tags: ["team-overview", "gatherings", "records"], revalidate: 3600 },
  )();
}

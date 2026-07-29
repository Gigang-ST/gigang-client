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

/** 한 달(1일 시작, KST)의 크루 합계 */
export type TeamMonth = {
  /** 달 시작일 YYYY-MM-DD */
  m_start: string;
  gthr_cnt: number;
  /** 참석 연인원 */
  attd_cnt: number;
  /** 대회 기록 + 기강이야기 기록 자랑 */
  rec_cnt: number;
};

export type TeamOverview = {
  /** 활동 회원 수 */
  mem_cnt: number;
  /**
   * 최근 8주. **마지막 원소가 이번 주** — 팀 심박수(Team Pulse) 판정의 기준이 된다.
   * 화면 수치는 `months`가 담당하지만, 판정은 "이번 주 vs 직전 4주"라 주 배열이 따로 필요하다.
   *
   * 각 주는 **이번 주와 같은 요일 경과 시점까지만** 누적한 값이다(RPC가 잘라 준다) —
   * 월요일에 이번 주만 누적 0이라 심박이 죽는 톱니를 없애려고, 과거 4주도 같은 시점으로 맞춘다.
   * 그래서 이 `attd_cnt`/`rec_cnt`는 "그 주 전체 합계"가 아니라 "같은 시점까지 합계"다.
   */
  weeks: TeamWeek[];
  /** 최근 6개월. **마지막 원소가 이번 달(지금까지)** — 화면 수치 격자가 읽는 값 */
  months: TeamMonth[];
};

const EMPTY_OVERVIEW: TeamOverview = { mem_cnt: 0, weeks: [], months: [] };

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
      // 스프레드만으로는 부족하다 — 키가 있는데 값이 null이거나(옛 RPC), 캐시에 남은
      // 옛 payload가 통째로 덮어쓰면 배열이 undefined가 된다. 배열 필드는 개별로 되살린다.
      const raw = (data as Partial<TeamOverview> | null) ?? {};
      return {
        ...EMPTY_OVERVIEW,
        ...raw,
        weeks: raw.weeks ?? [],
        months: raw.months ?? [],
      };
    },
    ["team-overview", teamId],
    { tags: ["team-overview", "gatherings", "records"], revalidate: 3600 },
  )();
}

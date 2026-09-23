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
 * 전부 공개 집계라 사용자별로 갈라지지 않는다. 주 단위 수치라 1시간 캐시로 충분하다.
 *
 * ⚠️ **이 캐시를 터는 코드는 지금 하나도 없다**(2026-09-23 전수 확인). 태그는
 * `team-overview`·`records`인데 `team-overview`를 부르는 곳이 없고, `records`는
 * `personal_best`·`utmb_profile` 변경 때만 털린다(`/api/revalidate`). 정작 수치를 만드는 건
 * `team_mem_rel`(mem_cnt)·`gthr_mst`(gthr_cnt)·`gthr_attd_rel`(attd_cnt)·
 * `rec_race_hist`+`post_mst`(rec_cnt)라 **갱신 경로는 사실상 이 TTL 하나뿐이다.**
 * (대회기록은 `save-race-record`가 `records:${teamId}` 스코프 태그만 털어 여기 안 닿는다.)
 *
 * 그래서 **TTL을 늘리려면 무효화를 먼저 붙여야 한다** — `revalidateHomeCalendar()`에
 * `revalidateTag("team-overview", "max")` 한 줄이면 모임·참석이 함께 잡힌다
 * (`HOME_TABLES`가 `gthr_mst`·`gthr_attd_rel`를 이미 포함). 심박(`lib/team-pulse`)의 분자는
 * `attd_cnt × 1 + rec_cnt × 0.25`라 **모임 수는 심박을 움직이지 않는다** — 참석·기록이 움직인다.
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
        // 여기서 폴백을 `return`하면 unstable_cache가 "갱신 성공"으로 보고
        // (`.then` → `cacheNewResult`) 직전 정상값을 이 빈 값으로 **덮어쓴다**.
        // 그러면 DB가 복구돼도 TTL이 끝날 때까지 빈 화면이 남는다(2026-09-23 장애).
        // `throw`하면 `.catch`로 빠져 캐시에 아무것도 쓰지 않아 직전 값이 유지된다 —
        // 화면 폴백은 캐시 **바깥**의 catch가 맡는다(그 값은 캐시에 남지 않는다).
        throw error;
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
    // `gatherings`는 뺐다 — 터는 쪽이 없어 한 번도 무효화된 적이 없다.
    // 주 단위 집계라 1시간 TTL로 충분하다.
    { tags: ["team-overview", "records"], revalidate: 3600 },
  )().catch(() => EMPTY_OVERVIEW);
}

import "server-only";

import { unstable_cache } from "next/cache";

import { arrangeGhosts } from "@/lib/ghost-members";
import { createAdminClient } from "@/lib/supabase/admin";
import { isRequestAbortError } from "@/lib/supabase/is-abort-error";

/** 수동·관리자 무효화 통로. 시간 만료(24h)가 주 경로라 평소엔 안 쓴다 */
export const GHOST_MEMBERS_CACHE_TAG = "ghost-members";

/** 현상수배 대상 — 오래 안 나온 활동 멤버 한 명 */
export type GhostMember = {
  mem_id: string;
  mem_nm: string;
  avatar_url: string | null;
  /** 마지막 활동일 YYYY-MM-DD (활동 이력이 없으면 가입일) */
  last_actv_dt: string;
  /** 오늘까지 며칠째 잠수인지 */
  days_ago: number;
  /**
   * 한 번도 활동 이력이 없는 멤버 — `last_actv_dt`가 활동일이 아니라 **가입일**이다.
   * 카드 문구를 가르는 데 쓴다(가입일을 "최종 목격"이라 적으면 거짓말이 된다).
   */
  never_actv: boolean;
};

/**
 * 유령회원 **후보 명단** 조회 — 24시간 캐시.
 *
 * 마지막 활동일(모임 참석일 + 대회 기록일의 max)이 100일 이전인 활동 멤버, 그리고 활동
 * 이력이 아예 없는 멤버는 **가입 30~100일**인 경우만 — 100일이 넘으면 기록이 없는 게 아니라
 * 기록할 페이지가 없던 시절 가입자라 잠수의 근거가 못 된다.
 * 프로필 카드의 "실종" 컨디션과 같은 결이다 — 전광판 하단 현상수배존에 쓴다.
 *
 * **시드는 빈 문자열로 고정**한다. 시드는 `ORDER BY`에만 쓰여 *누가 후보인가*와 무관한데,
 * 진입마다 다른 값을 넣으면 캐시 키가 매번 달라져 캐시 자체가 성립하지 않는다.
 * 순서는 `arrangeGhosts`가 정한다.
 *
 * ⚠️ **인자를 생략하지 말 것.** `get_team_ghost_members`에는 `(uuid)` 오버로드가 남아 있고,
 * 그건 상한 8명 · 오래된 순 · **`never_actv` 필드가 없는 옛 버전**이다. `p_seed`를 빼면
 * 그쪽이 걸려 화면이 가입일을 "최종 목격"이라 찍는다(주석이 경계하던 바로 그 거짓말).
 * 오버로드는 별도 마이그레이션으로 지우지만, **지워지기 전에도 안전하도록** 명시한다.
 *
 * ⚠️ **예전 주석의 근거 두 개가 프로덕션에서 무효였다**(2026-09-18 실측):
 * ① "실측 2.5ms라 매 요청 읽어도 부담 없다" → **평균 395ms · 호출 11,458회 · 누적 1.26시간**
 *    으로 RPC 중 2위였다. min은 여전히 2.4ms라 당시 측정이 틀린 게 아니라, 인스턴스가
 *    부풀린 값이 실전 평균이 된 것이다(§.claude/docs/perf/2026-09-18-performance-audit.md).
 * ② "대상이 30명 상한보다 많아 순서가 곧 누가 뜨느냐" → **후보 27명**으로 상한에 안 걸린다.
 *    전원이 매번 뜨고 시드가 정하는 건 *순서*뿐이다.
 * 장식용 존 하나 때문에 홈에 들어오는 전원이 그 시간을 기다리고 있었다.
 *
 * 24시간은 **안전망**이다(§home-calendar와 같은 규약). 만료돼도 stale-while-revalidate라
 * 기다리는 사람이 없고, 후보가 "100일 이상 안 나온 사람"이라 하루 묵어도 한두 명 차이다.
 * `gatherings`·`records` 태그는 달지 않았다 — 전자는 **터는 쪽이 없는 죽은 태그**이고,
 * 후자는 유령 판정과 관계가 약하다.
 */
function getGhostCandidates(teamId: string): Promise<GhostMember[]> {
  return unstable_cache(
    async () => {
      const supabase = createAdminClient();
      const { data, error } = await supabase.rpc("get_team_ghost_members", {
        p_team_id: teamId,
        p_seed: "",
      });

      if (error) {
        // abort(dev 렌더 재시작·요청 취소)는 코드 결함이 아니므로 로그에서 제외한다.
        if (!isRequestAbortError(error)) {
          console.error("[getGhostCandidates] 유령회원 조회 실패", error);
        }
        return [];
      }

      return (data as GhostMember[] | null) ?? [];
    },
    ["ghost-members", teamId],
    { tags: [GHOST_MEMBERS_CACHE_TAG], revalidate: 86400 },
  )();
}

/**
 * 현상수배 존에 세울 명단 — 캐시된 후보를 이 진입의 시드로 섞어 돌려준다.
 *
 * `seed`는 진입마다 서버가 뽑아(`pickGhostSeed`) 넘긴다. 오래된 순으로 두면 최고참만
 * 영구 박제되므로 매번 조합을 새로 뽑되, **같은 시드면 같은 순서**라 한 진입 안에서
 * 재조회가 나도 가로 스크롤 도중 얼굴이 바뀌지 않는다(그 성질이 필요해서 DB `random()`을
 * 안 쓰는 것이었고, 셔플이 JS로 옮겨온 지금도 그대로다).
 */
export async function getGhostMembers(
  teamId: string,
  seed: string,
): Promise<GhostMember[]> {
  const candidates = await getGhostCandidates(teamId);
  return arrangeGhosts(candidates, seed);
}

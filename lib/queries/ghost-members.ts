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
  /** 마지막 흔적일 YYYY-MM-DD (흔적이 없으면 세기 시작한 날 — `since_join` 참고) */
  last_actv_dt: string;
  /** 오늘까지 며칠째 잠수인지 */
  days_ago: number;
  /**
   * 이 팀에 들어온 뒤 흔적이 하나도 없는 멤버 — `last_actv_dt`가 흔적이 아니라 **세기 시작한 날**이다.
   * 카드 문구를 가르는 데 쓴다(그 날을 "최종 목격"이라 적으면 거짓말이 된다).
   */
  never_actv: boolean;
  /**
   * 흔적이 없을 때 세기 시작한 날이 **팀 가입일**인가. 아니면 앱에 참석 기록이 생긴 날(2026-06-30) —
   * 그보다 먼저 들어온 기강 회원이라 「가입 N일째」라고 쓰면 틀린다.
   * **옛 함수(마이그레이션 20261127110000 전)는 이 칸이 없다** — 그때 흔적 없는 행의 날짜는 늘 계정 생성일이라
   * 예전 화면처럼 「가입」으로 읽는다(없으면 true). 배포와 마이그레이션 사이에 옛 함수 결과가 와도 말이 안 바뀐다.
   */
  since_join?: boolean;
};

/**
 * 유령회원 **후보 명단** 조회 — 24시간 캐시.
 *
 * **팀 가입일 기준이다**(마이그레이션 20261127110000). 흔적 = 이 팀에 들어온 뒤의 **이 팀 모임 참석 +
 * 이 팀 대회 참가(지난 대회)** — 대회 기록 등록은 세지 않는다(기록용이지 참석이 아니다).
 * 마지막 흔적이 100일 이전이면 「실종」, 흔적이 없으면 세기 시작한 날(팀 가입일, 그보다 앞서면
 * 앱 참석 기록 시작일)에서 30일이 지나면 「무소식」. 팀 가입일이 아직 안 온 사람은 판정하지 않는다.
 * 전광판 하단 현상수배존에 쓴다.
 *
 * 프로필 카드 컨디션과는 **흔적·출발점이 같고 문턱이 다르다.** 카드는 최근 90일 활동이 0이면 「N일째 실종」,
 * 여기는 100일(흔적 있음)·30일(흔적 없음)이다 — 마지막 활동이 95일 전인 사람은 카드엔 「실종」, 이 명단엔 없다.
 * 카드는 그 사람의 상태를, 이 명단은 「찾으러 갈 사람」을 말해서 일부러 문턱을 높게 둔다.
 *
 * 참석·대회 참가 저장 때 이 캐시를 털지 않는다 — 다시 나온 사람이 하루까지 포스터에 남는다. 장식 존이라 받아들인
 * 지연이다(털려면 참석·참가 저장 경로마다 `revalidateTag(GHOST_MEMBERS_CACHE_TAG)`를 붙여야 하고, 그 경로가 여럿이다).
 *
 * **RPC는 "누가 후보인가"만 돌려준다** — 정렬도 상한도 없다(마이그레이션 20260918160000).
 * 그래야 시드와 무관해져 캐시할 수 있다. 순서와 30명 상한은 `arrangeGhosts`가 정한다.
 *
 * ⚠️ **RPC 안에 `LIMIT`을 되살리지 말 것.** 시드를 ''로 고정한 채 RPC가 자르면 **캐시에
 * 담기는 30명이 고정된다** — 후보가 30을 넘는 순간 시드가 *누가 뜨는지*를 못 바꾸고
 * *그 30명 안의 순서*만 바꾸게 되어, 시드를 도입한 이유였던 "최고참 영구 박제"가
 * 그대로 되살아난다(prd 27명이라 가려져 있지만 dev는 이미 30명을 넘었다).
 *
 * ⚠️ **`p_seed` 인자를 생략하지 말 것.** `(uuid)` 오버로드가 남아 있는 환경에선 그쪽이
 * 걸리고, 그건 **`never_actv`가 없는 옛 버전**이라 화면이 가입일을 "최종 목격"이라 찍는다.
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

      // ⚠️ **여기서 빈 배열로 폴백하면 안 된다.** `unstable_cache`는 콜백이 돌려준 값을
      // 그대로 캐시하므로, 일시적 오류 한 번이 **빈 현상수배존을 24시간 고정**시킨다
      // (태그를 터는 곳도 없어 스스로 못 빠져나온다). 던지면 캐시에 안 담기고
      // 다음 요청이 다시 시도한다 — 폴백은 호출부(`getGhostMembers`)가 맡는다.
      if (error) throw error;

      return (data as GhostMember[] | null) ?? [];
    },
    // 판정 기준을 바꾸면 키를 올린다 — 안 올리면 옛 명단이 최대 하루 남는다(v2: 팀 가입일 기준)
    ["ghost-members", "v2", teamId],
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
  try {
    const candidates = await getGhostCandidates(teamId);
    return arrangeGhosts(candidates, seed);
  } catch (error) {
    // 폴백은 **캐시 바깥**에서 한다(§getGhostCandidates) — 빈 결과가 24시간 굳지 않게.
    // abort(dev 렌더 재시작·요청 취소)는 코드 결함이 아니므로 로그에서 제외한다.
    if (!isRequestAbortError(error)) {
      console.error("[getGhostMembers] 유령회원 조회 실패", error);
    }
    return [];
  }
}

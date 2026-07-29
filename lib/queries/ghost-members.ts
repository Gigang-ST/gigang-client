import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { isRequestAbortError } from "@/lib/supabase/is-abort-error";

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
 * 유령회원(현상수배) 조회.
 *
 * 마지막 활동일(모임 참석일 + 대회 기록일의 max)이 100일 이전인 활동 멤버, 그리고 활동
 * 이력이 아예 없는 멤버는 **가입 30~100일**인 경우만 — 100일이 넘으면 기록이 없는 게 아니라
 * 기록할 페이지가 없던 시절 가입자라 잠수의 근거가 못 된다. 최대 30명을 시드 랜덤 순으로.
 * 프로필 카드의 "실종" 컨디션과 같은 결이다(오래 안 나온 사람) — 전광판 하단 현상수배존에 쓴다.
 *
 * `seed`는 진입마다 서버가 뽑아(`pickGhostSeed`) 넘긴다 — 대상이 30명 상한보다 많아 순서가
 * 곧 "누가 뜨느냐"라, 오래된 순으로 두면 최고참만 영구 박제된다. 자세한 배경은 그 헬퍼 주석에.
 *
 * 캐시하지 않는다 — 30명 짜리 가벼운 조회라(실측 2.5ms, 전량 버퍼 히트) 매 요청 최신값을
 * 읽어도 부담이 없고, 캐시를 걸면 로직을 고쳐도 옛 결과가 남아 화면과 DB가 어긋난다
 * (실제로 그 혼란을 겪었다). 시드 랜덤도 매 진입 새 조합이 나오려면 캐시가 없어야 한다.
 */
export async function getGhostMembers(
  teamId: string,
  seed: string,
): Promise<GhostMember[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("get_team_ghost_members", {
    p_team_id: teamId,
    p_seed: seed,
  });

  if (error) {
    // abort(dev 렌더 재시작·요청 취소)는 코드 결함이 아니므로 로그에서 제외한다.
    if (!isRequestAbortError(error)) {
      console.error("[getGhostMembers] 유령회원 조회 실패", error);
    }
    return [];
  }

  return (data as GhostMember[] | null) ?? [];
}

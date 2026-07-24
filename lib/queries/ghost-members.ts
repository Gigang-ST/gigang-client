import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { isRequestAbortError } from "@/lib/supabase/is-abort-error";

/** 현상수배 대상 — 오래 안 나온 활동 멤버 한 명 */
export type GhostMember = {
  mem_id: string;
  mem_nm: string;
  avatar_url: string | null;
  /** 마지막 활동일 YYYY-MM-DD (원장 없으면 가입일) */
  last_actv_dt: string;
  /** 오늘까지 며칠째 잠수인지 */
  days_ago: number;
};

/**
 * 유령회원(현상수배) 조회.
 *
 * 마지막 활동일(`pt_txn_hist` 적립일, 없으면 가입일)이 60일 이전인 활동 멤버 8명을 오래된 순으로.
 * 프로필 카드의 "실종" 컨디션과 같은 결이다(오래 안 나온 사람) — 전광판 하단 현상수배존에 쓴다.
 *
 * 캐시하지 않는다 — 유령회원은 8명 짜리 가벼운 조회라 매 요청 최신값을 읽어도 부담이 없고,
 * 캐시를 걸면 로직을 고쳐도 옛 결과가 남아 화면과 DB가 어긋난다(실제로 그 혼란을 겪었다).
 */
export async function getGhostMembers(teamId: string): Promise<GhostMember[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("get_team_ghost_members", {
    p_team_id: teamId,
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

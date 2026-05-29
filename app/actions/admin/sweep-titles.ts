"use server";

import { verifyAdmin } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";
import { sweepEvaluateAndGrant } from "@/lib/titles/engine";

/**
 * 팀 전체 멤버를 대상으로 자동 칭호를 일괄 재평가한다.
 *
 * 관리자 페이지의 "칭호 일괄 재계산" 버튼에서 호출한다.
 * 새 칭호를 추가하거나 조건을 수정했을 때 기존 멤버에게 소급 적용할 때 사용한다.
 *
 * 성능: 멤버·칭호 수에 무관하게 DB 쿼리 약 7번 고정.
 * 멤버 전체 데이터를 한 번에 로드 후 메모리 내에서 평가한다.
 */
export async function sweepAllTitles(): Promise<{
  ok: boolean;
  message: string | null;
  granted: number;
  revoked: number;
}> {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다.", granted: 0, revoked: 0 };

  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();

  const { data: members, error } = await db
    .from("team_mem_rel")
    .select("team_mem_id")
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .eq("mem_st_cd", "active");

  if (error) return { ok: false, message: "멤버 조회에 실패했습니다.", granted: 0, revoked: 0 };
  if (!members || members.length === 0) {
    return { ok: true, message: "활성 멤버가 없습니다.", granted: 0, revoked: 0 };
  }

  const teamMemIds = members.map((m) => m.team_mem_id);
  const { granted, revoked } = await sweepEvaluateAndGrant(teamId, teamMemIds);

  return {
    ok: true,
    message: `${members.length}명 평가 완료. 신규 부여 ${granted}개, 자동 회수 ${revoked}개.`,
    granted,
    revoked,
  };
}
